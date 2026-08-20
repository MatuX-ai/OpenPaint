//! OpenPaint MCP 服务器入口（阶段二 W5 实施）
//!
//! 启动方式：
//! ```bash
//! openpaint-mcp serve
//! ```
//!
//! 通过 stdio JSON-RPC 与 Hermes Agent 通信，
//! 暴露 10 个原子工具（AI 3 + Gallery 3 + Canvas 4）。
//!
//! 工具 dispatch 采用同步实现（dispatch_*_tool 返回 Result 而非 async），
//! 避免在独立 stdio 进程中创建 tokio runtime。

use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};

use openpaint::mcp;
#[cfg(feature = "mcp-server")]
use openpaint::tools::{ai_tools, gallery_tools};

/// JSON-RPC 2.0 请求
#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<serde_json::Value>,
    method: String,
    #[serde(default)]
    params: serde_json::Value,
}

/// JSON-RPC 2.0 响应
#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

fn main() -> io::Result<()> {
    eprintln!("OpenPaint MCP server starting (stdio)...");
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<JsonRpcRequest>(&line) {
            Ok(req) => handle_request(req),
            Err(e) => JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id: None,
                result: None,
                error: Some(JsonRpcError {
                    code: -32700,
                    message: format!("Parse error: {}", e),
                }),
            },
        };

        let serialized = serde_json::to_string(&response).unwrap();
        writeln!(stdout, "{}", serialized)?;
        stdout.flush()?;
    }

    Ok(())
}

/// 同步处理 JSON-RPC 请求
fn handle_request(req: JsonRpcRequest) -> JsonRpcResponse {
    match req.method.as_str() {
        "initialize" => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id: req.id,
            result: Some(serde_json::json!({
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "openpaint-mcp",
                    "version": env!("CARGO_PKG_VERSION"),
                },
                "capabilities": {
                    "tools": {}
                }
            })),
            error: None,
        },
        "tools/list" => {
            let tools = mcp::tool_definitions();
            JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id: req.id,
                result: Some(serde_json::json!({ "tools": tools })),
                error: None,
            }
        }
        "tools/call" => {
            // 解析工具名与参数
            let tool_name = req
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_args = req
                .params
                .get("arguments")
                .cloned()
                .unwrap_or(serde_json::json!({}));

            let result = dispatch_tool(&tool_name, tool_args);
            JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id: req.id,
                result: Some(result),
                error: None,
            }
        }
        "ping" => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id: req.id,
            result: Some(serde_json::json!({})),
            error: None,
        },
        _ => JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id: req.id,
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: format!("Method not found: {}", req.method),
            }),
        },
    }
}

/// 同步分派工具调用，返回 MCP 协议规定的 result content 数组
#[cfg_attr(not(feature = "mcp-server"), allow(unused_variables))]
fn dispatch_tool(name: &str, args: serde_json::Value) -> serde_json::Value {
    #[cfg(feature = "mcp-server")]
    {
        // 1. AI 工具（同步实现）
        if ai_tools::list_ai_tools().contains(&name) {
            return match ai_tools::dispatch_ai_tool(name, args) {
                Ok(result) => mcp_result_to_json(&result.content),
                Err(e) => error_to_json(&e),
            };
        }
        // 2. Gallery 工具（同步实现）
        if gallery_tools::list_gallery_tools().contains(&name) {
            return match gallery_tools::dispatch_gallery_tool(name, args) {
                Ok(result) => mcp_result_to_json_gallery(&result.content),
                Err(e) => error_to_json(&e),
            };
        }
        // 3. Canvas 工具（占位：实际路由需 Tauri AppState；返回提示）
        if matches!(
            name,
            "get_canvas_selection"
                | "get_selection_bounds"
                | "paste_image_to_layer"
                | "get_layer_info"
        ) {
            return serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": format!(
                        "[{}] Canvas tools require the running OpenPaint app context. \
                         When invoked from inside OpenPaint, the host Tauri command handles them.",
                        name
                    )
                }],
                "isError": false
            });
        }
    }
    // 默认占位
    let _ = args;
    serde_json::json!({
        "content": [{
            "type": "text",
            "text": format!("Tool '{}' dispatched (no handler)", name)
        }],
        "isError": false
    })
}

#[cfg(feature = "mcp-server")]
fn mcp_result_to_json(content: &[ai_tools::McpContent]) -> serde_json::Value {
    serde_json::json!({
        "content": content.iter().map(|c| match c {
            ai_tools::McpContent::Text { text } => serde_json::json!({"type": "text", "text": text}),
            ai_tools::McpContent::Image { data, mime_type } => {
                serde_json::json!({"type": "image", "data": data, "mimeType": mime_type})
            }
        }).collect::<Vec<_>>(),
        "isError": false
    })
}

#[cfg(feature = "mcp-server")]
fn mcp_result_to_json_gallery(content: &[gallery_tools::McpContent]) -> serde_json::Value {
    serde_json::json!({
        "content": content.iter().map(|c| match c {
            gallery_tools::McpContent::Text { text } => serde_json::json!({"type": "text", "text": text}),
            gallery_tools::McpContent::Image { data, mime_type } => {
                serde_json::json!({"type": "image", "data": data, "mimeType": mime_type})
            }
        }).collect::<Vec<_>>(),
        "isError": false
    })
}

#[cfg(feature = "mcp-server")]
fn error_to_json(e: &str) -> serde_json::Value {
    serde_json::json!({
        "content": [{
            "type": "text",
            "text": format!("Error: {}", e)
        }],
        "isError": true
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_minimal_request() {
        let line = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
        let req: JsonRpcRequest = serde_json::from_str(line).unwrap();
        assert_eq!(req.method, "ping");
        assert_eq!(req.id.unwrap(), serde_json::json!(1));
    }

    #[test]
    fn test_dispatch_unknown_tool_returns_placeholder() {
        let v = dispatch_tool("nope", serde_json::json!({}));
        let arr = v.get("content").unwrap().as_array().unwrap();
        assert!(!arr.is_empty());
    }
}
