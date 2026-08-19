//! AI 助理模块（M-09，W4 实施）
//!
//! 职责：
//! - 启动/管理 Hermes Agent 子进程
//! - 通过 stdio 进行 JSON-RPC 通信
//! - 维护 MCP 工具注册表

pub mod manager;
pub mod mcp;

pub use manager::AgentManager;

/// Agent 命令请求
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentCommand {
    pub id: String,
    pub method: String,
    pub params: serde_json::Value,
}

/// Agent 响应
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentResponse {
    pub id: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<AgentError>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentError {
    pub code: i32,
    pub message: String,
}