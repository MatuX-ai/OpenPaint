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