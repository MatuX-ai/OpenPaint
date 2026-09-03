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
///
/// W12 VDP-MOCK-02：当活跃 Provider 为 mock 时，跳过 Agent / LLM HTTP，
/// 直接返回本地规则模板。这样首启用户和 Web 预览用户即使没配 Key
/// 也能体验完整对话流程，不会被 404 / 401 错误劝退。
#[tauri::command]
pub async fn agent_chat(state: State<'_, AppState>, message: String) -> Result<String, String> {
    let llm = state.config.read().llm.clone();
    if parse_provider(&llm.provider) == LlmProvider::Mock {
        info!("agent_chat: short-circuit to mock template");
        return Ok(mock_chat_reply(&message));
    }
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
    } else if provider == LlmProvider::Mock {
        // W12 VDP-MOCK-01：mock 不需要真实 model，但仍走 local_model 字段
        // 兼容老的 local_model 配置，避免编译器 exhaustive 警告。
        llm.local_model
            .clone()
            .unwrap_or_else(|| "mock-v1".to_string())
    } else {
        llm.model.clone()
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| anyhow!("http client: {}", e))?;

    match provider {
        // W12 VDP-MOCK-01：模拟模式不发起任何网络请求。
        LlmProvider::Mock => Ok(mock_svg_for(prompt)),
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
    let mock_svg = mock_svg_for(prompt);
    let png = render_svg_to_png_internal(&mock_svg, 512, 512).unwrap_or_default();
    AiEngineResponse {
        svg: mock_svg,
        png,
        model: "mock-v1".to_string(),
        mode: "mock".into(),
    }
}

/// W12 VDP-MOCK-01：提取 mock SVG 字符串供 call_llm / send_to_ai_engine 共用。
fn mock_svg_for(prompt: &str) -> String {
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4a90e2"/>
  <circle cx="256" cy="256" r="120" fill="#fff" opacity="0.8"/>
  <text x="256" y="270" font-size="32" text-anchor="middle" fill="#333">{}</text>
</svg>"##,
        prompt.chars().take(8).collect::<String>()
    )
}

/// W12 VDP-MOCK-02：模拟模式聊天规则模板。
///
/// 按关键词匹配返回有教育价值的真实信息，不假装是真人 AI。
/// 兜底回复引导用户了解快捷键 / 画布 / 图标等可演示主题，
/// 或在偏好面板里切换真实大模型。
pub fn mock_chat_reply(message: &str) -> String {
    let raw = message.trim();
    let lower = raw.to_lowercase();

    // 1) 问候
    if lower.starts_with("hi")
        || lower.starts_with("hello")
        || lower.starts_with("hey")
        || raw.contains("你好")
        || raw.contains("您好")
    {
        return "你好！我是 OpenPaint 的 **模拟 AI 助手**。\n\n\
• 不联网、不计费，0 延迟回复\n\
• 可演示：快捷键、画布工具、图标/色板/渐变资产库入口\n\
• 不支持：复杂生成、图像理解、多轮工具调用\n\n\
试试问我「介绍一下快捷键」或「画笔有几种」。要更强能力？在右下角打开**偏好 → AI 模型**切换即可。"
            .into();
    }

    // 2) 快捷键
    if raw.contains("快捷键") || lower.contains("shortcut") || raw.contains("速查") || raw == "?"
    {
        return "**OpenPaint 常用快捷键**\n\n\
| 操作 | Win/Linux | macOS |\n| --- | --- | --- |\n\
| 新建 | Ctrl + N | ⌘ + N |\n\
| 打开 | Ctrl + O | ⌘ + O |\n\
| 保存 | Ctrl + S | ⌘ + S |\n\
| 撤销 | Ctrl + Z | ⌘ + Z |\n\
| 重做 | Ctrl + Shift + Z | ⇧⌘ + Z |\n\
| 速查面板 | ? | ? |\n\n\
随时按 ? 唤起完整速查。"
            .into();
    }

    // 3) 画布
    if raw.contains("画布") || lower.contains("canvas") {
        return "中央画布支持：\n\n\
• **图层**：添加 / 删除 / 重排 / 锁定 / 可见性切换\n\
• **选区**：矩形 / 椭圆 / 套索 / 魔棒\n\
• **工具**：画笔 / 橡皮 / 填充 / 渐变 / 文字\n\
• **历史**：无限撤销，所有操作可还原\n\n\
试试左侧工具栏画一笔，或按 B 切换画笔。"
            .into();
    }

    // 4) 画笔 / 笔刷
    if raw.contains("画笔") || raw.contains("笔刷") || lower.contains("brush") {
        return "**画笔系统（v0.2）**\n\n\
• 9 种内置笔刷：圆头 / 铅笔 / 水彩 / 马克笔 / 喷枪 / 蜡笔 / 钢笔 / 毛笔 / 像素\n\
• 尺寸、硬度、不透明度、流量可调\n\
• 笔刷预设保存到 assets/brushes/\n\n\
AI 笔刷生成（描述一句话自动创建笔刷）将在 v0.3 上线。"
            .into();
    }

    // 5) 图标 / 色板 / 渐变
    if raw.contains("图标") || lower.contains("icon") {
        return "**图标资产库**\n\n\
• 内置 200+ 图标（基于 Iconify 聚合，按 lucide / material / tabler 等集分类）\n\
• 右侧「图标」面板可直接拖入画布\n\
• 模拟模式下无法调用 search_icons 工具；配置真实大模型后可以\"按描述搜图标\"\n\n\
资产路径：`src-web/src/components/iconify/`。"
            .into();
    }
    if raw.contains("色板") || raw.contains("调色板") || lower.contains("palette") {
        return "**色板资产库**\n\n\
• 4 套内置：Material / Tailwind / Pastel / Mono\n\
• 右侧「色板」面板可一键应用到选区或整个图层\n\
• 自定义色板：JSON 放在 assets/palettes/ 即可被自动加载"
            .into();
    }
    if raw.contains("渐变") || lower.contains("gradient") {
        return "**渐变资产库**\n\n\
• 内置 6 种：linear-sunset / radial-glow / conic-rainbow / linear-ocean / radial-mint / mono-step\n\
• 右侧「渐变」面板可填充到形状或文字\n\
• 自定义渐变：YAML 放在 assets/gradients/ 即可"
            .into();
    }

    // 6) 模型 / 配置
    if raw.contains("大模型") || raw.contains("LLM") || raw.contains("AI 模型") {
        return "**支持的 LLM Provider**（共 10 家，模拟模式置顶）\n\n\
• 模拟模式（本对话正在用，零配置）\n\
• 国内：DeepSeek / 通义千问 / 智谱 GLM / 月之暗面 Kimi / 豆包 / MiniMax\n\
• 海外：OpenAI / Anthropic Claude\n\
• 本地：Ollama（完全离线）\n\n\
切换：右下角**偏好 → AI 模型**，自配 API Key 即可。"
            .into();
    }

    // 兜底
    format!(
        "我理解你想了解「{}」。当前是**模拟模式**，我能演示有限的快捷键 / 画布 / 资产库内容。试试：\n\n\
• 「快捷键」 查看速查\n\
• 「画布」 了解工具\n\
• 「图标 / 色板 / 渐变」 看资产库\n\
• 「大模型」 看支持的 Provider\n\n\
要处理更复杂任务，在右下角**偏好 → AI 模型**切到 DeepSeek / 通义千问 / OpenAI 等真实 Provider。",
        raw.chars().take(40).collect::<String>()
    )
}

fn parse_provider(s: &str) -> LlmProvider {
    match s {
        "mock" => LlmProvider::Mock,
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
        assert_eq!(parse_provider("mock"), LlmProvider::Mock);
        assert_eq!(parse_provider("openai"), LlmProvider::Openai);
        assert_eq!(parse_provider("deepseek"), LlmProvider::Deepseek);
        assert_eq!(parse_provider("ollama"), LlmProvider::Ollama);
        assert_eq!(parse_provider("anthropic"), LlmProvider::Anthropic);
        assert_eq!(parse_provider("unknown"), LlmProvider::Openai);
    }

    #[test]
    fn test_mock_svg_for_contains_input() {
        let svg = mock_svg_for("hello world");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("hello wo"));
    }

    #[test]
    fn test_mock_chat_reply_keywords() {
        // 问候
        assert!(mock_chat_reply("你好").contains("模拟"));
        // 快捷键
        assert!(mock_chat_reply("快捷键").contains("Ctrl"));
        // 画布
        assert!(mock_chat_reply("画布").contains("图层"));
        // 画笔
        assert!(mock_chat_reply("画笔").contains("笔刷"));
        // 图标
        assert!(mock_chat_reply("图标").contains("Iconify"));
        // 大模型
        assert!(mock_chat_reply("大模型").contains("Provider"));
        // 兜底
        let fallback = mock_chat_reply("???");
        assert!(fallback.contains("模拟模式"));
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

    // --------------------------------------------------------------------
    // mock_chat_reply 全面覆盖
    // --------------------------------------------------------------------

    #[test]
    fn test_mock_chat_reply_english_greeting() {
        let r = mock_chat_reply("Hi there");
        assert!(r.contains("模拟"));
        assert!(r.contains("OpenPaint"));
    }

    #[test]
    fn test_mock_chat_reply_hello_lowercase() {
        let r = mock_chat_reply("hello");
        assert!(r.contains("模拟"));
    }

    #[test]
    fn test_mock_chat_reply_nihao_with_punct() {
        let r = mock_chat_reply("  你好！");
        assert!(r.contains("模拟"), "前后空格/标点后仍应命中问候");
    }

    #[test]
    fn test_mock_chat_reply_shortcut_keyword_chinese() {
        let r = mock_chat_reply("常用快捷键");
        assert!(r.contains("Ctrl"));
        assert!(r.contains("⌘"));
    }

    #[test]
    fn test_mock_chat_reply_shortcut_english() {
        let r = mock_chat_reply("keyboard shortcut");
        assert!(r.contains("Ctrl"));
    }

    #[test]
    fn test_mock_chat_reply_zhichi_question_mark() {
        let r = mock_chat_reply("?");
        assert!(r.contains("Ctrl"), "单独 ? 应触发速查");
    }

    #[test]
    fn test_mock_chat_reply_canvas_keyword() {
        let r = mock_chat_reply("画布尺寸怎么改");
        assert!(r.contains("图层") || r.contains("选区") || r.contains("工具"));
    }

    #[test]
    fn test_mock_chat_reply_canvas_english() {
        let r = mock_chat_reply("canvas size");
        assert!(r.contains("画布") || r.contains("图层") || r.contains("选区"));
    }

    #[test]
    fn test_mock_chat_reply_brush_chinese() {
        let r = mock_chat_reply("有哪些画笔");
        assert!(r.contains("笔刷"));
    }

    #[test]
    fn test_mock_chat_reply_brush_english() {
        let r = mock_chat_reply("brush type");
        assert!(r.contains("笔刷") || r.contains("画笔"));
    }

    #[test]
    fn test_mock_chat_reply_brush_keyword_uses_keyword() {
        // 直接使用画笔关键词以避开别名歧义
        let r = mock_chat_reply("画笔");
        assert!(r.contains("笔刷"));
    }

    #[test]
    fn test_mock_chat_reply_icon_zh() {
        let r = mock_chat_reply("搜索图标");
        assert!(r.contains("Iconify"));
    }

    #[test]
    fn test_mock_chat_reply_icon_en() {
        let r = mock_chat_reply("find me an icon");
        assert!(r.contains("图标") || r.contains("Iconify"));
    }

    #[test]
    fn test_mock_chat_reply_palette_zh() {
        let r = mock_chat_reply("调色板");
        assert!(r.contains("Material"));
    }

    #[test]
    fn test_mock_chat_reply_palette_en() {
        let r = mock_chat_reply("color palette");
        assert!(r.contains("色板") || r.contains("Material"));
    }

    #[test]
    fn test_mock_chat_reply_gradient_zh() {
        let r = mock_chat_reply("使用渐变");
        assert!(r.contains("linear-sunset"));
    }

    #[test]
    fn test_mock_chat_reply_gradient_en() {
        let r = mock_chat_reply("sunset gradient");
        assert!(r.contains("渐变"));
    }

    #[test]
    fn test_mock_chat_reply_llm_zh() {
        let r = mock_chat_reply("大模型");
        assert!(r.contains("Provider"));
        assert!(r.contains("DeepSeek") || r.contains("通义千问"));
    }

    #[test]
    fn test_mock_chat_reply_llm_en() {
        let r = mock_chat_reply("AI 模型");
        assert!(r.contains("Provider"));
    }

    #[test]
    fn test_mock_chat_reply_unknown_topic_uses_fallback() {
        let r = mock_chat_reply("讲讲量子纠缠");
        assert!(r.contains("模拟模式"));
        assert!(r.contains("偏好"));
    }

    #[test]
    fn test_mock_chat_reply_fallback_truncates_input() {
        // 超过 40 字符的输入应被截断到前 40
        let long = "x".repeat(100);
        let r = mock_chat_reply(&long);
        assert!(r.contains("模拟模式"));
        // 截断串中不能出现 100 个 x 中的字符全段
        assert!(!r.contains(&"x".repeat(60)));
    }

    #[test]
    fn test_mock_chat_reply_empty_input_returns_fallback() {
        let r = mock_chat_reply("");
        assert!(r.contains("模拟模式"));
    }

    #[test]
    fn test_mock_chat_reply_only_whitespace_returns_fallback() {
        let r = mock_chat_reply("   \t\n");
        assert!(r.contains("模拟模式"));
    }

    // --------------------------------------------------------------------
    // extract_svg_from_markdown 边界用例
    // --------------------------------------------------------------------

    #[test]
    fn test_extract_svg_no_fence_returns_none() {
        assert!(extract_svg_from_markdown("纯文本无代码块").is_none());
        assert!(extract_svg_from_markdown("").is_none());
    }

    #[test]
    fn test_extract_svg_html_only_no_fence_returns_none() {
        // 没有 ```svg 围栏即使有 svg 标签也不行，避免误抽取
        let r = extract_svg_from_markdown("<svg xmlns=\"...\"></svg>");
        assert!(r.is_none());
    }

    #[test]
    fn test_extract_svg_unclosed_fence_returns_none() {
        let r = extract_svg_from_markdown("```svg\n<svg></svg>");
        assert!(r.is_none(), "未闭合的围栏应返回 None");
    }

    #[test]
    fn test_extract_svg_no_closing_tag_returns_none() {
        let r = extract_svg_from_markdown("```svg\n<svg><rect/></svg");
        assert!(r.is_none(), "缺少 </svg> 应视为无效");
    }

    #[test]
    fn test_extract_svg_multiple_blocks_returns_first() {
        let text = "```svg\n<svg><rect id=\"first\"/></svg>\n```\n中间\n```svg\n<svg><rect id=\"second\"/></svg>\n```";
        let r = extract_svg_from_markdown(text).unwrap();
        assert!(r.contains("first"));
        assert!(!r.contains("second"));
    }

    #[test]
    fn test_extract_svg_with_surrounding_text() {
        let text = "好的，这是结果：\n```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect/></svg>\n```\n请查收。";
        let r = extract_svg_from_markdown(text).unwrap();
        assert!(r.starts_with("<svg"));
        assert!(r.ends_with("</svg>"));
    }

    // --------------------------------------------------------------------
    // parse_provider 覆盖全部厂商 + 默认回退
    // --------------------------------------------------------------------

    #[test]
    fn test_parse_provider_all_supported() {
        assert_eq!(parse_provider("qwen"), LlmProvider::Qwen);
        assert_eq!(parse_provider("zhipu"), LlmProvider::Zhipu);
        assert_eq!(parse_provider("moonshot"), LlmProvider::Moonshot);
        assert_eq!(parse_provider("doubao"), LlmProvider::Doubao);
        assert_eq!(parse_provider("minimax"), LlmProvider::Minimax);
    }

    #[test]
    fn test_parse_provider_unknown_defaults_to_openai() {
        assert_eq!(parse_provider(""), LlmProvider::Openai);
        assert_eq!(parse_provider("garbage"), LlmProvider::Openai);
        assert_eq!(parse_provider("OPENAI"), LlmProvider::Openai, "大小写敏感");
    }

    // --------------------------------------------------------------------
    // mock_svg_for 渲染参数
    // --------------------------------------------------------------------

    #[test]
    fn test_mock_svg_for_truncates_to_eight_chars() {
        let svg = mock_svg_for("abcdefghijklmnopqrstuvwxyz");
        assert!(svg.contains("abcdefgh"), "应保留前 8 个字符");
        assert!(!svg.contains("tuvwxyz"));
    }

    #[test]
    fn test_mock_svg_for_handles_empty_prompt() {
        let svg = mock_svg_for("");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn test_mock_svg_for_escapes_special_chars_in_text() {
        // 不强制 XML escape，但要保证不会出现 <svg 误闭合
        let svg = mock_svg_for("<<<>>>");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
        assert!(svg.matches("<svg").count() == 1);
    }

    // --------------------------------------------------------------------
    // mock_response 输出 shape
    // --------------------------------------------------------------------

    #[test]
    fn test_mock_response_contains_svg_and_png() {
        let resp = mock_response("测试");
        assert!(resp.svg.contains("<svg"));
        assert!(!resp.png.is_empty(), "mock PNG 应至少为 base64 非空串");
        assert_eq!(resp.mode, "mock");
        assert_eq!(resp.model, "mock-v1");
    }

    // --------------------------------------------------------------------
    // Scenario 数据结构
    // --------------------------------------------------------------------

    #[test]
    fn test_scenario_deserialize_minimal() {
        let yaml = "name: demo\ndescription: demo scene\n";
        let s: Scenario = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(s.name, "demo");
        assert!(s.tools.is_empty());
        assert!(s.steps.is_empty());
    }

    #[test]
    fn test_scenario_deserialize_full() {
        let yaml = r#"
name: full
description: full
tools:
  - search_icons
  - apply_palette
steps:
  - tool: search_icons
    args:
      query: bell
  - tool: apply_palette
"#;
        let s: Scenario = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(s.tools.len(), 2);
        assert_eq!(s.steps.len(), 2);
        assert_eq!(s.steps[0].tool, "search_icons");
        assert_eq!(s.steps[0].args["query"], "bell");
        // 第二步没有 args，应使用 default（Null）
        assert!(s.steps[1].args.is_null());
    }

    #[test]
    fn test_scenario_step_default_args_is_null() {
        let yaml = "tool: foo\n";
        let step: ScenarioStep = serde_yaml::from_str(yaml).unwrap();
        assert!(step.args.is_null());
    }

    // --------------------------------------------------------------------
    // AiEngineResponse / SvgRenderResponse / ScenarioListItem 结构
    // --------------------------------------------------------------------

    #[test]
    fn test_ai_engine_response_serializes() {
        let r = AiEngineResponse {
            svg: "<svg/>".into(),
            png: "AAAA".into(),
            model: "gpt-4o".into(),
            mode: "real".into(),
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["svg"], "<svg/>");
        assert_eq!(v["png"], "AAAA");
        assert_eq!(v["model"], "gpt-4o");
        assert_eq!(v["mode"], "real");
    }

    #[test]
    fn test_svg_render_response_serializes() {
        let r = SvgRenderResponse {
            png_data: "AAAA".into(),
            width: 64,
            height: 64,
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["width"], 64);
        assert_eq!(v["height"], 64);
        assert_eq!(v["png_data"], "AAAA");
    }

    #[test]
    fn test_scenario_list_item_serializes() {
        let item = ScenarioListItem {
            name: "demo".into(),
            description: "description".into(),
        };
        let v = serde_json::to_value(&item).unwrap();
        assert_eq!(v["name"], "demo");
        assert_eq!(v["description"], "description");
    }

    // --------------------------------------------------------------------
    // render_svg_to_png_internal 边界
    // --------------------------------------------------------------------

    #[test]
    fn test_render_svg_to_png_internal_invalid_returns_err() {
        // 非 XML 字符串
        let r = render_svg_to_png_internal("not an svg", 32, 32);
        assert!(r.is_err());
    }

    #[test]
    fn test_render_svg_to_png_internal_empty_returns_err() {
        let r = render_svg_to_png_internal("", 32, 32);
        assert!(r.is_err());
    }

    #[test]
    fn test_render_svg_to_png_internal_decodes() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="green"/></svg>"#;
        let b64 = render_svg_to_png_internal(svg, 32, 32).unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .expect("应为合法 base64");
        // PNG 头 8 字节：\x89 PNG \r \n \x1a \n
        assert_eq!(&bytes[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
    }
}
