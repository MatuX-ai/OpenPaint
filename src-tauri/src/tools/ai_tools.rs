//! AI MCP 工具集（M-10，W5 实施：真实工具实现）
//!
//! 当启用 `mcp-server` feature 时，
//! 将 AI 相关 Tauri 命令暴露给 Hermes Agent 作为 MCP 工具。
//!
//! 通过 `mcp-server` binary 把 MCP `tools/call` 请求路由到对应实现。
//! AI 工具集实现：
//! - `send_to_ai_engine`  → 调用真实 LLM Provider，输出 SVG
//! - `render_svg_to_png`   → resvg 渲染为 PNG
//! - `get_current_svg`    → 从前端 OpenPencil 视图拉取当前 SVG（通过 Tauri 事件桥）
//!
//! 由于 MCP server 是独立进程（无 Tauri AppHandle / State），
//! 实现里我们用「同步 + 直接 IO」的方式：
//! - SVG 渲染：本地 resvg 完成（无状态依赖）
//! - LLM 调用：直接读 `~/.openpaint/config.yaml`，用 reqwest 同步调用
//! - get_current_svg：通过 stderr 提示（实际数据从 OpenPencil iframe 走 postMessage，
//!   在前端 OpenPencilView.vue 已实现；这里返回 placeholder 让 Agent 走备用路径）

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::config::AppConfig;

/// AI MCP 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMcpResult {
    pub content: Vec<McpContent>,
    #[serde(default)]
    pub is_error: bool,
}

/// MCP 内容类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContent {
    Text { text: String },
    Image { data: String, mime_type: String },
}

/// AI 工具列表（供 `tools/list` 返回）
pub fn list_ai_tools() -> Vec<&'static str> {
    vec!["send_to_ai_engine", "render_svg_to_png", "get_current_svg"]
}

/// 处理 AI 工具调用（同步版本，供 `bin/mcp.rs` 在 tokio runtime 中调用）
///
/// 注：MCP server 没有 Tauri AppHandle，因此走"无状态"路径：
/// - 直接读取磁盘上的 config.yaml
/// - 用 reqwest::blocking 调用 LLM（避免与 bin/mcp.rs 的同步主循环冲突）
pub fn dispatch_ai_tool(name: &str, params: serde_json::Value) -> Result<AiMcpResult, String> {
    match name {
        "send_to_ai_engine" => {
            let image_data = params
                .get("image_data")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "image_data required".to_string())?;
            let prompt = params
                .get("prompt")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "prompt required".to_string())?;

            let cfg = AppConfig::load().map_err(|e| format!("config load: {}", e))?;
            let svg = send_to_ai_engine_sync(&cfg.llm, image_data, prompt)?;
            Ok(AiMcpResult {
                content: vec![McpContent::Text {
                    text: format!("{{\"svg\": \"{}\"}}", escape_json(&svg)),
                }],
                is_error: false,
            })
        }
        "render_svg_to_png" => {
            let svg = params
                .get("svg")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "svg required".to_string())?;
            let width = params.get("width").and_then(|v| v.as_u64()).unwrap_or(512) as u32;
            let height = params.get("height").and_then(|v| v.as_u64()).unwrap_or(512) as u32;

            let png_b64 = crate::tools::ai_commands::render_svg_to_png_internal(svg, width, height)
                .map_err(|e| format!("render_svg: {}", e))?;
            Ok(AiMcpResult {
                content: vec![McpContent::Image {
                    data: png_b64,
                    mime_type: "image/png".into(),
                }],
                is_error: false,
            })
        }
        "get_current_svg" => {
            // 当前 SVG 由前端 OpenPencil iframe 持有；MCP 进程无法直接访问。
            // 返回提示文本，让 Agent 引导用户复制 SVG 或调用 export_svg。
            Ok(AiMcpResult {
                content: vec![McpContent::Text {
                    text: "[get_current_svg] OpenPencil SVG lives in the frontend iframe. \
                           Agent should ask user to paste SVG via save_to_gallery → \
                           send_to_ai_engine chain, or use Hermes's own export_svg command."
                        .into(),
                }],
                is_error: false,
            })
        }
        _ => Err(format!("Unknown AI tool: {}", name)),
    }
}

/// 同步版本的 send_to_ai_engine：仅用于 mcp-server binary。
///
/// 使用 reqwest::blocking（轻量、不会与已有 tokio runtime 冲突），
/// 调用真正的 LLM Provider；失败时返回错误，由 MCP 层标记 is_error=true。
fn send_to_ai_engine_sync(
    llm: &crate::config::LlmConfig,
    image_data: &str,
    prompt: &str,
) -> Result<String, String> {
    use crate::tools::llm_commands::LlmProvider;

    let provider = match llm.provider.as_str() {
        "anthropic" => LlmProvider::Anthropic,
        "deepseek" => LlmProvider::Deepseek,
        "ollama" => LlmProvider::Ollama,
        _ => LlmProvider::Openai,
    };
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

    // 用 reqwest::blocking（在 mcp-server 二进制独立运行时无 Tokio 冲突）
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("http client: {}", e))?;

    match provider {
        LlmProvider::Anthropic => {
            let key = api_key.ok_or_else(|| "Anthropic requires api_key".to_string())?;
            let url = format!("{}/messages", endpoint.trim_end_matches('/'));
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 1024,
                "system": crate::tools::ai_commands::SVG_SYSTEM_PROMPT,
                "messages": [{
                    "role": "user",
                    "content": [
                        { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": image_data } },
                        { "type": "text", "text": format!("生成 SVG 来满足：{}", prompt) }
                    ]
                }]
            });
            let resp = client
                .post(&url)
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send()
                .map_err(|e| format!("anthropic send: {}", e))?;
            if !resp.status().is_success() {
                let s = resp.status();
                let b = resp.text().unwrap_or_default();
                return Err(format!("anthropic HTTP {}: {}", s, b));
            }
            let json: serde_json::Value = resp.json().map_err(|e| format!("parse: {}", e))?;
            let content = json
                .get("content")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("text"))
                .and_then(|v| v.as_str())
                .ok_or_else(|| "anthropic content missing".to_string())?;
            extract_svg_from_markdown(content).ok_or_else(|| {
                format!(
                    "anthropic did not return svg: {}",
                    &content.chars().take(200).collect::<String>()
                )
            })
        }
        LlmProvider::Ollama => {
            let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));
            let body = serde_json::json!({
                "model": model,
                "stream": false,
                "messages": [
                    { "role": "system", "content": crate::tools::ai_commands::SVG_SYSTEM_PROMPT },
                    { "role": "user", "content": prompt, "images": [image_data] }
                ]
            });
            let resp = client
                .post(&url)
                .json(&body)
                .send()
                .map_err(|e| format!("ollama send: {}", e))?;
            if !resp.status().is_success() {
                let s = resp.status();
                let b = resp.text().unwrap_or_default();
                return Err(format!("ollama HTTP {}: {}", s, b));
            }
            let json: serde_json::Value = resp.json().map_err(|e| format!("parse: {}", e))?;
            let content = json
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|v| v.as_str())
                .ok_or_else(|| "ollama message.content missing".to_string())?;
            extract_svg_from_markdown(content).ok_or_else(|| {
                format!(
                    "ollama did not return svg: {}",
                    &content.chars().take(200).collect::<String>()
                )
            })
        }
        LlmProvider::Openai | LlmProvider::Deepseek => {
            let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
            let user_text = format!(
                "基于以下参考图，生成 SVG。\n\n# 用户描述\n{}\n\n# 输出要求\n仅输出 ```svg ... ``` 代码块。",
                prompt
            );
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 1024,
                "temperature": 0.4,
                "messages": [
                    { "role": "system", "content": crate::tools::ai_commands::SVG_SYSTEM_PROMPT },
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
            if let Some(k) = api_key {
                req = req.bearer_auth(k);
            }
            let resp = req.send().map_err(|e| format!("openai send: {}", e))?;
            if !resp.status().is_success() {
                let s = resp.status();
                let b = resp.text().unwrap_or_default();
                return Err(format!("openai HTTP {}: {}", s, b));
            }
            let json: serde_json::Value = resp.json().map_err(|e| format!("parse: {}", e))?;
            let content = json
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|v| v.as_str())
                .ok_or_else(|| "openai choices missing".to_string())?;
            extract_svg_from_markdown(content).ok_or_else(|| {
                format!(
                    "openai did not return svg: {}",
                    &content.chars().take(200).collect::<String>()
                )
            })
        }
    }
}

/// 从 markdown 中抽取 svg 围栏（与 ai_commands::extract_svg_from_markdown 同款）
fn extract_svg_from_markdown(content: &str) -> Option<String> {
    let start = content.find("```svg")?;
    let after_fence = start + 5;
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

/// 转义 JSON 字符串中的换行/引号（用于把 SVG 嵌入到 JSON 文本回复里）
fn escape_json(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_ai_tools() {
        let tools = list_ai_tools();
        assert!(tools.contains(&"send_to_ai_engine"));
        assert!(tools.contains(&"render_svg_to_png"));
        assert!(tools.contains(&"get_current_svg"));
    }

    #[test]
    fn test_dispatch_unknown_tool() {
        let r = dispatch_ai_tool("not_a_tool", serde_json::json!({}));
        assert!(r.is_err());
    }

    #[test]
    fn test_render_svg_to_png_via_mcp() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>"#;
        let r = dispatch_ai_tool(
            "render_svg_to_png",
            serde_json::json!({ "svg": svg, "width": 32, "height": 32 }),
        );
        assert!(r.is_ok(), "render_svg_to_png should succeed: {:?}", r);
        let result = r.unwrap();
        assert!(!result.is_error);
        assert_eq!(result.content.len(), 1);
    }

    #[test]
    fn test_get_current_svg_returns_hint() {
        let r = dispatch_ai_tool("get_current_svg", serde_json::json!({})).unwrap();
        assert!(!r.is_error);
    }

    #[test]
    fn test_extract_svg_from_markdown() {
        let text =
            "前置\n```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\"><circle/></svg>\n```\n后置";
        let svg = extract_svg_from_markdown(text).unwrap();
        assert!(svg.contains("<circle"));
    }

    #[test]
    fn test_escape_json() {
        assert_eq!(escape_json("a\"b"), "a\\\"b");
        assert_eq!(escape_json("a\nb"), "a\\nb");
    }
}
