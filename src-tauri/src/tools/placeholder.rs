//! W1 占位命令（验证 IPC 通道正常）
//!
//! 这些命令将在后续阶段被真实实现替换。

use serde::{Deserialize, Serialize};

/// Hello World 烟雾测试
#[tauri::command]
pub fn hello_world() -> String {
    "Hello from OpenPaint Rust backend!".to_string()
}

/// Echo 命令（用于测试双向通信）
#[derive(Debug, Serialize, Deserialize)]
pub struct EchoPayload {
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EchoResponse {
    pub received: String,
    pub length: usize,
    pub timestamp: i64,
}

#[tauri::command]
pub fn echo(payload: EchoPayload) -> EchoResponse {
    let length = payload.message.chars().count();
    EchoResponse {
        received: payload.message,
        length,
        timestamp: chrono::Utc::now().timestamp_millis(),
    }
}

/// W11 占位：`create_brush_from_prompt` stub
///
/// v0.2 仅在 MCP 注册表中声明，实际 AI 画刷合成在 v0.3 实施。
/// 这里返回一个固定结构，供前端 ToolCallCard 展示“未实现”状态。
#[derive(Debug, Serialize)]
pub struct CreateBrushStubResult {
    pub status: &'static str,
    pub message: &'static str,
    pub prompt: String,
    pub name: Option<String>,
}

#[tauri::command]
pub fn create_brush_from_prompt(prompt: String, name: Option<String>) -> CreateBrushStubResult {
    tracing::info!(
        "create_brush_from_prompt stub called (prompt={}, name={:?})",
        prompt,
        name
    );
    CreateBrushStubResult {
        status: "not_implemented",
        message: "AI brush generation available in v0.3",
        prompt,
        name,
    }
}
