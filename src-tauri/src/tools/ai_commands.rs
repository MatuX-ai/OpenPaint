//! AI 命令（W5 实施：Hermes Agent 集成 + 真实 LLM 接入）
//!
//! 提供 6 个 AI 相关命令：
//! - `send_to_ai_engine` 调用真实 LLM（截图→SVG/PNG）
//! - `render_svg_to_png`  SVG → PNG（resvg 渲染）
//! - `agent_chat`         与 Hermes Agent 对话
//! - `agent_command`      向 Agent 发送结构化命令
//! - `load_scenario`      加载场景 YAML
//! - `list_scenarios`     列出可用场景
//!
//! LLM Provider 路由：
//! - openai     → POST {base_url}/chat/completions
//! - anthropic  → POST {base_url}/messages
//! - deepseek   → POST {base_url}/chat/completions（OpenAI 兼容协议）
//! - ollama     → POST {base_url}/api/chat
//!
//! 输入 image_data 是 Base64 PNG；通过 system prompt 让 LLM 输出 SVG。
//! 默认 1024 tokens 限制；超时 120s。

use anyhow::{anyhow, Result};
use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

use crate::agent::AgentManager;
use crate::config::LlmConfig;
use crate::state::AppState;
use crate::tools::llm_commands::LlmProvider;

/// AI 引擎调用响应
#[derive(Debug, Serialize)]
pub struct AiEngineResponse {
    pub svg: String,
    pub png: String,
    pub model: String,
    pub mode: String, // "real" | "mock"
}

/// SVG 渲染响应
#[derive(Debug, Serialize)]
pub struct SvgRenderResponse {
    pub png_data: String,
    pub width: u32,
    pub height: u32,
}

/// 1. 调用 AI 引擎（真实 LLM）
///
/// 流程：
/// 1. 读取 `state.config.llm`，决定 provider / api_key / endpoint / model
/// 2. 若 Hermes Agent 在运行，优先转发到 Agent（更高质量，可走 MCP 工具链）
/// 3. 否则根据 provider 调用 HTTP：
///    - OpenAI / DeepSeek：OpenAI Chat Completions 协议（data URL 拼到 user content）
///    - Anthropic：Messages API（image 用 base64 source block）
///    - Ollama：/api/chat（images 数组）
/// 4. 从回复抽取 ```svg ... ``` 代码块；用 resvg 渲染为 PNG
/// 5. 失败 / 未配置 api_key → 降级 mock
#[tauri::command]
pub async fn send_to_ai_engine(
    state: State<'_, AppState>,
    image_data: String,
    prompt: String,
) -> Result<AiEngineResponse, String> {
    info!("AI engine called with prompt: {}", prompt);

    let llm = state.config.read().llm.clone();

    // 优先走 Hermes Agent（如果启动）
    let agent = AgentManager::global();
    if agent.is_running().await {
        match agent_call_ai(&llm, &image_data, &prompt).await {
            Ok(svg) => {
                let png = render_svg_to_png_internal(&svg, 512, 512)
                    .map_err(|e| format!("svg render: {}", e))?;
                return Ok(AiEngineResponse {
                    svg,
                    png,
                    model: format!("{} (via Hermes)", llm.model),
                    mode: "real".into(),
                });
            }
            Err(e) => warn!("Hermes AI call failed, falling back to direct HTTP: {}", e),
        }
    }

    // 直接 HTTP 调用 LLM
    match call_llm(&llm, &image_data, &prompt).await {
        Ok(svg) => {
            let png = render_svg_to_png_internal(&svg, 512, 512)
                .map_err(|e| format!("svg render: {}", e))?;
            Ok(AiEngineResponse {
                svg,
                png,
                model: llm.model.clone(),
                mode: "real".into(),
            })
        }
        Err(e) => {
            warn!("LLM call failed ({}), returning mock", e);
            Ok(mock_response(&prompt))
        }
    }
}

/// 2. SVG → PNG（resvg）
#[tauri::command]
pub async fn render_svg_to_png(
    svg: String,
    width: u32,
    height: u32,
) -> Result<SvgRenderResponse, String> {
    let png_data = render_svg_to_png_internal(&svg, width, height)
        .map_err(|e| format!("render_svg_to_png: {}", e))?;
    Ok(SvgRenderResponse {
        png_data,
        width,
        height,
    })
}

/// 3. 与 Hermes Agent 对话
#[tauri::command]
pub async fn agent_chat(state: State<'_, AppState>, message: String) -> Result<String, String> {
    let agent = AgentManager::global();
    agent
        .chat(&state.app_handle, &message)
        .await
        .map_err(|e| format!("agent_chat: {}", e))
}

/// 4. 发送结构化命令
#[tauri::command]
pub async fn agent_command(
    state: State<'_, AppState>,
    command: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let agent = AgentManager::global();
    agent
        .send_command(&state.app_handle, command)
        .await
        .map_err(|e| format!("agent_command: {}", e))
}

/// 5. 加载场景 YAML
#[tauri::command]
pub async fn load_scenario(scenario_name: String) -> Result<Scenario, String> {
    let path = std::path::PathBuf::from("assets/scenarios").join(format!("{}.yaml", scenario_name));
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("scenario not found: {} ({})", path.display(), e))?;
    let scenario: Scenario =
        serde_yaml::from_str(&content).map_err(|e| format!("yaml parse: {}", e))?;
    Ok(scenario)
}

/// 6. 列出可用场景
#[derive(Debug, Serialize)]
pub struct ScenarioListItem {
    pub name: String,
    pub description: String,
}

#[tauri::command]
pub async fn list_scenarios() -> Result<Vec<ScenarioListItem>, String> {
    let dir = std::path::PathBuf::from("assets/scenarios");
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("yaml") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(s) = serde_yaml::from_str::<Scenario>(&content) {
                        out.push(ScenarioListItem {
                            name: s.name,
                            description: s.description,
                        });
                    }
                }
            }
        }
    }
    Ok(out)
}

/// 场景定义（与 YAML 文件结构对应）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scenario {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub steps: Vec<ScenarioStep>,
}

/// 场景步骤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioStep {
    pub tool: String,
    #[serde(default)]
    pub args: serde_json::Value,
}

// ============================================================
// LLM 调用实现（Week 5）
// ============================================================

/// 通过 Hermes Agent 调用 AI（高优先级路径）
async fn agent_call_ai(_llm: &LlmConfig, image_data: &str, prompt: &str) -> Result<String> {
    let agent = AgentManager::global();
    let params = serde_json::json!({
        "image_data": image_data,
        "prompt": prompt,
    });
    let result = agent
        .call_method("ai.generate_svg", params)
        .await
        .map_err(|e| anyhow!("agent.ai.generate_svg failed: {}", e))?;
    // 期望返回 { svg: "..." } 或 { svg_markdown: "..." }
    if let Some(svg) = result.get("svg").and_then(|v| v.as_str()) {
        Ok(svg.to_string())
    } else if let Some(md) = result.get("svg_markdown").and_then(|v| v.as_str()) {
        extract_svg_from_markdown(md).ok_or_else(|| anyhow!("Agent did not return valid SVG"))
    } else if let Some(s) = result.as_str() {
        extract_svg_from_markdown(s).ok_or_else(|| anyhow!("Agent response is not SVG"))
    } else {
        Err(anyhow!("Unexpected agent response shape: {}", result))
    }
}

/// 直接 HTTP 调用 LLM Provider
async fn call_llm(llm: &LlmConfig, image_data: &str, prompt: &str) -> Result<String> {
    let provider = parse_provider(&llm.provider);
    let endpoint = llm
        .base_url
        .clone()
        .unwrap_or_else(|| provider.default_endpoint().to_string());
    let api_key = if llm.api_key.is_empty() {
        None
    } else {
        Some(llm.api_key.clone())
    };
    let model = if provider == LlmProvider::Ollama {
        llm.local_model
            .clone()
            .unwrap_or_else(|| "llama3.1".to_string())
    } else {
        llm.model.clone()
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| anyhow!("http client: {}", e))?;

    match provider {
        LlmProvider::Anthropic => {
            call_anthropic(
                &client,
                &endpoint,
                api_key.as_deref(),
                &model,
                image_data,
                prompt,
            )
            .await
        }
        LlmProvider::Ollama => call_ollama(&client, &endpoint, &model, image_data, prompt).await,
        // OpenAI / DeepSeek 以及国内 OpenAI 兼容厂商（通义千问 DashScope、
        // 智谱 BigModel、月之暗面 Moonshot、火山引擎豆包、MiniMax）均走 Chat Completions 协议。
        LlmProvider::Openai
        | LlmProvider::Deepseek
        | LlmProvider::Qwen
        | LlmProvider::Zhipu
        | LlmProvider::Moonshot
        | LlmProvider::Doubao
        | LlmProvider::Minimax => {
            call_openai_compat(
                &client,
                &endpoint,
                api_key.as_deref(),
                &model,
                image_data,
                prompt,
            )
            .await
        }
    }
}

/// OpenAI Chat Completions 协议（含 DeepSeek）
async fn call_openai_compat(
    client: &Client,
    endpoint: &str,
    api_key: Option<&str>,
    model: &str,
    image_data: &str,
    prompt: &str,
) -> Result<String> {
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let system_prompt = SVG_SYSTEM_PROMPT;
    let user_text = format!(
        "基于以下参考图，生成 SVG。\n\n# 用户描述\n{}\n\n# 输出要求\n仅输出 ```svg ... ``` 代码块，不要任何额外解释。",
        prompt
    );
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "temperature": 0.4,
        "messages": [
            { "role": "system", "content": system_prompt },
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": user_text },
                    { "type": "image_url", "image_url": { "url": format!("data:image/png;base64,{}", image_data) } }
                ]
            }
        ]
    });

    let mut req = client.post(&url).json(&body);
    if let Some(key) = api_key {
        req = req.bearer_auth(key);
    }
    let resp = req.send().await.map_err(|e| anyhow!("send: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("LLM HTTP {}: {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| anyhow!("parse: {}", e))?;
    let content = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("choices[0].message.content missing: {}", json))?;
    extract_svg_from_markdown(content).ok_or_else(|| {
        anyhow!(
            "LLM did not return SVG: {}",
            content.chars().take(200).collect::<String>()
        )
    })
}

/// Anthropic Messages API
async fn call_anthropic(
    client: &Client,
    endpoint: &str,
    api_key: Option<&str>,
    model: &str,
    image_data: &str,
    prompt: &str,
) -> Result<String> {
    let key = api_key.ok_or_else(|| anyhow!("Anthropic requires api_key"))?;
    let url = format!("{}/messages", endpoint.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "system": SVG_SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_data
                        }
                    },
                    {
                        "type": "text",
                        "text": format!("生成 SVG 来满足：{}", prompt)
                    }
                ]
            }
        ]
    });
    let resp = client
        .post(&url)
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow!("send: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Anthropic HTTP {}: {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| anyhow!("parse: {}", e))?;
    let content = json
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("text"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("content[0].text missing: {}", json))?;
    extract_svg_from_markdown(content).ok_or_else(|| {
        anyhow!(
            "Anthropic did not return SVG: {}",
            content.chars().take(200).collect::<String>()
        )
    })
}

/// Ollama /api/chat（本地）
async fn call_ollama(
    client: &Client,
    endpoint: &str,
    model: &str,
    image_data: &str,
    prompt: &str,
) -> Result<String> {
    let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "stream": false,
        "messages": [
            { "role": "system", "content": SVG_SYSTEM_PROMPT },
            {
                "role": "user",
                "content": prompt,
                "images": [image_data]
            }
        ]
    });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow!("send: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Ollama HTTP {}: {}", status, body));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| anyhow!("parse: {}", e))?;
    let content = json
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("message.content missing: {}", json))?;
    extract_svg_from_markdown(content).ok_or_else(|| {
        anyhow!(
            "Ollama did not return SVG: {}",
            content.chars().take(200).collect::<String>()
        )
    })
}

/// LLM SVG 生成系统提示词（W11-A4 扩充资产库触发说明）
///
/// 末尾的《资产库触发指引》告诉 LLM：当用户提到「图标 / 画笔 / 色板 / 渐变」时，
/// 优先调用 MCP 资产库工具（search_icons / apply_palette / apply_gradient 等），
/// 而不是自己用 SVG `<rect>` 手动拼纯色块。这样能复用统一资源 + 本地缓存。
pub const SVG_SYSTEM_PROMPT: &str = "你是一位专业的矢量图标与图形设计师。\n根据用户的需求和参考图，输出可直接渲染的 SVG 矢量图。\n要求：\n1. 使用 <svg xmlns=\"http://www.w3.org/2000/svg\" ...> 包裹\n2. viewBox 推荐 0 0 512 512\n3. 仅使用基础形状（rect/circle/path/polygon/text）、填色与透明度\n4. 完整闭合，无未完成标签\n5. 输出格式必须为 ```svg\\n...\\n``` 代码块\n\n资产库触发指引：\n- 当用户提到「图标 / icon / 搜索图标」 → 调用 search_icons(query=\"中文或英文\")；从返回列表里选一个匹配项 → render_icon_svg(prefix, name)\n- 当用户提到「色板 / 调色板 / Material 色 / 某种风格的颜色」 → 调用 apply_palette(palette_id=\"material|tailwind|pastel|mono\", mode=\"swatch_bar\"或\"replace_color\")\n- 当用户提到「渐变 / gradient / 日落色 / 彩虹 / 光晕」 → 调用 apply_gradient(gradient_id=\"linear-sunset|radial-glow|conic-rainbow|...\")\n- 当用户提到「画刷 / brush / 像羽毛一样的笔刷」 → 调用 create_brush_from_prompt(prompt=\"描述\")（v0.2 返回 stub，前端展示\"AI 笔刷生成 v0.3 上线\"提示）\n- 这些资源都会被本地缓存 + 资产遥测记录，不会重复下载。\n- 如果用户的描述可以命中资产库，优先返回工具调用指令而不是手写 SVG。";

/// 从 LLM 回复抽取 ```svg ... ``` 块
pub fn extract_svg_from_markdown(content: &str) -> Option<String> {
    // 寻找 ```svg ... ``` 围栏
    let start = content.find("```svg")?;
    let after_fence = start + 5;
    // 跳过 ```svg 后可能的换行
    let body_start = content[after_fence..]
        .find('\n')
        .map(|i| after_fence + i + 1)
        .unwrap_or(after_fence);
    let end = content[body_start..].find("```")?;
    let svg = content[body_start..body_start + end].trim();
    if svg.contains("<svg") && svg.contains("</svg>") {
        Some(svg.to_string())
    } else {
        None
    }
}

/// Mock 降级响应
fn mock_response(prompt: &str) -> AiEngineResponse {
    let mock_svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4a90e2"/>
  <circle cx="256" cy="256" r="120" fill="#fff" opacity="0.8"/>
  <text x="256" y="270" font-size="32" text-anchor="middle" fill="#333">{}</text>
</svg>"##,
        prompt.chars().take(8).collect::<String>()
    );
    let png = render_svg_to_png_internal(&mock_svg, 512, 512).unwrap_or_default();
    AiEngineResponse {
        svg: mock_svg,
        png,
        model: "mock-v1".to_string(),
        mode: "mock".into(),
    }
}

fn parse_provider(s: &str) -> LlmProvider {
    match s {
        "anthropic" => LlmProvider::Anthropic,
        "deepseek" => LlmProvider::Deepseek,
        "ollama" => LlmProvider::Ollama,
        "qwen" => LlmProvider::Qwen,
        "zhipu" => LlmProvider::Zhipu,
        "moonshot" => LlmProvider::Moonshot,
        "doubao" => LlmProvider::Doubao,
        "minimax" => LlmProvider::Minimax,
        _ => LlmProvider::Openai,
    }
}

/// 内部 SVG → PNG 实现
pub fn render_svg_to_png_internal(svg: &str, width: u32, height: u32) -> Result<String> {
    use resvg::tiny_skia;
    use usvg::{Options, Tree};

    let tree = Tree::from_str(svg, &Options::default()).map_err(|e| anyhow!("SVG parse: {}", e))?;
    let src_size = tree.size();
    let mut pixmap = tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| anyhow!("Pixmap alloc failed for {}x{}", width, height))?;
    let scale_x = width as f32 / src_size.width();
    let scale_y = height as f32 / src_size.height();
    let transform = tiny_skia::Transform::from_scale(scale_x, scale_y);
    {
        let mut pm_mut: tiny_skia::PixmapMut<'_> = pixmap.as_mut();
        resvg::render(&tree, transform, &mut pm_mut);
    }
    let png_data = pixmap.encode_png()?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&png_data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_svg_from_markdown() {
        let text = "下面是输出：\n```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\"><rect/></svg>\n```\n结束";
        let svg = extract_svg_from_markdown(text).unwrap();
        assert!(svg.contains("<rect"));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn test_extract_svg_missing_returns_none() {
        let text = "no svg here";
        assert!(extract_svg_from_markdown(text).is_none());
    }

    #[test]
    fn test_parse_provider() {
        assert_eq!(parse_provider("openai"), LlmProvider::Openai);
        assert_eq!(parse_provider("deepseek"), LlmProvider::Deepseek);
        assert_eq!(parse_provider("ollama"), LlmProvider::Ollama);
        assert_eq!(parse_provider("anthropic"), LlmProvider::Anthropic);
        assert_eq!(parse_provider("unknown"), LlmProvider::Openai);
    }

    #[test]
    fn test_render_svg_to_png_internal_simple() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>"#;
        let b64 = render_svg_to_png_internal(svg, 64, 64).unwrap();
        assert!(!b64.is_empty());
        // 标准 base64
        assert!(b64
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '='));
    }
}
