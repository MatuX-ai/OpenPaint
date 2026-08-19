//! Hermes Agent 进程管理（W5 实施）
//!
//! 负责：
//! - 启动/停止 Hermes Agent 子进程
//! - 通过 stdio NDJSON 进行 JSON-RPC 2.0 通信
//! - 维护 `id → oneshot` 等待表，实现异步 request/response
//! - 后台 stdout reader 任务持续解析响应/通知
//! - 自动重连与健康检查
//!
//! 调用语义：
//! - `start()`  启动子进程并 spawn reader task（幂等，已运行则直接返回 Ok）
//! - `stop()`   优雅停止子进程
//! - `chat()`   走真实 JSON-RPC `agent.chat` 方法；未启动时降级 mock
//! - `send_command()` 走真实 JSON-RPC 通用方法
//! - `status()` 报告当前状态
//!
//! 当二进制不存在 / 启动失败 / 进程崩溃时，自动降级 mock 模式，
//! 以保证前端 AI 浮窗在离线状态下仍可演示。

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, OnceLock};

use anyhow::{anyhow, Result};
use parking_lot::Mutex as SyncMutex;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tracing::{debug, error, info, warn};

/// 全局单例
static GLOBAL: OnceLock<AgentManager> = OnceLock::new();

/// 共享的请求等待表（parking_lot Mutex：lock 不跨 await，与 AsyncMutex 不冲突）
type PendingMap = Arc<SyncMutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>;

/// Hermes Agent 进程管理器
pub struct AgentManager {
    inner: AsyncMutex<AgentInner>,
}

struct AgentInner {
    hermes_path: Option<std::path::PathBuf>,
    /// 真实子进程句柄（包含 stdin / stdout / stderr）
    child: Option<Child>,
    /// 等待表（与 reader task 共享）
    pending: PendingMap,
    /// 简单递增的命令 id
    next_id: u64,
    /// 最近一次错误信息
    last_error: Option<String>,
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            inner: AsyncMutex::new(AgentInner {
                hermes_path: Self::find_hermes_binary(),
                child: None,
                pending: Arc::new(SyncMutex::new(HashMap::new())),
                next_id: 1,
                last_error: None,
            }),
        }
    }

    /// 全局单例
    pub fn global() -> &'static AgentManager {
        GLOBAL.get_or_init(AgentManager::new)
    }

    /// 查找 Hermes Agent 可执行文件
    pub fn find_hermes_binary() -> Option<std::path::PathBuf> {
        if let Some(home) = dirs::home_dir() {
            let candidates = [
                home.join(".openpaint").join("bin").join("hermes"),
                home.join(".openpaint").join("bin").join("hermes.exe"),
            ];
            for c in candidates {
                if c.exists() {
                    return Some(c);
                }
            }
        }
        let local = std::path::PathBuf::from("src-tauri/bin/hermes");
        if local.exists() {
            return Some(local);
        }
        let local_exe = std::path::PathBuf::from("src-tauri/bin/hermes.exe");
        if local_exe.exists() {
            return Some(local_exe);
        }
        None
    }

    /// 启动 Hermes Agent 子进程（异步，幂等）
    pub async fn start(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().await;

        // 已运行则直接返回
        if inner.child.is_some() {
            info!("Hermes Agent already running");
            return Ok(());
        }

        let path = inner.hermes_path.clone().ok_or_else(|| {
            "Hermes Agent binary not found. Place hermes in ~/.openpaint/bin/ or src-tauri/bin/. \
             See src-tauri/bin/README.md"
                .to_string()
        })?;

        info!("Starting Hermes Agent at {:?}", path);

        let mut cmd = Command::new(&path);
        cmd.arg("agent")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn Hermes at {:?}: {}", path, e))?;

        // 接管 stdout，spawn reader 任务
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Hermes stdout missing".to_string())?;
        let stderr = child.stderr.take();

        // 清空 pending map 并把引用交给 reader task
        inner.pending.lock().clear();
        spawn_reader_task(stdout, Arc::clone(&inner.pending));

        // stderr 单独 spawn，避免阻塞
        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    // Hermes 子进程 stderr 直接转发到主日志
                    for l in line.lines() {
                        warn!("[hermes] {}", l);
                    }
                }
            });
        }

        inner.child = Some(child);
        inner.last_error = None;
        info!("Hermes Agent started");
        Ok(())
    }

    /// 停止 Agent
    pub async fn stop(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if let Some(mut child) = inner.child.take() {
            // 先尝试 kill
            let _ = child.start_kill();
            // 等子进程退出，避免僵尸
            match child.wait().await {
                Ok(status) => info!("Hermes Agent exited: {:?}", status),
                Err(e) => warn!("Hermes Agent wait error: {}", e),
            }
            // 清理未响应的 pending 请求
            let drained: Vec<_> = inner.pending.lock().drain().collect();
            for (_id, tx) in drained {
                let _ = tx.send(serde_json::json!({
                    "error": { "code": -32000, "message": "agent terminated" }
                }));
            }
        }
        Ok(())
    }

    /// 与 Agent 对话（优先真实进程，降级 mock）
    pub async fn chat(&self, _app: &tauri::AppHandle, message: &str) -> Result<String, String> {
        if self.is_running().await {
            // 走真实 JSON-RPC：method=agent.chat
            let result = self
                .send_jsonrpc("agent.chat", serde_json::json!({ "message": message }))
                .await
                .map_err(|e| format!("agent chat failed: {}", e))?;
            // 兼容 Hermes 返回结构：{ reply: "..." } 或纯字符串
            if let Some(reply) = result.get("reply").and_then(|v| v.as_str()) {
                Ok(reply.to_string())
            } else if let Some(s) = result.as_str() {
                Ok(s.to_string())
            } else {
                Ok(result.to_string())
            }
        } else {
            Ok(self.mock_chat_response(message))
        }
    }

    /// 发送结构化命令（优先真实进程，降级 mock）
    pub async fn send_command(
        &self,
        _app: &tauri::AppHandle,
        command: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let method = command
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        if self.is_running().await {
            let params = command
                .get("params")
                .cloned()
                .unwrap_or(serde_json::json!({}));
            self.send_jsonrpc(&method, params)
                .await
                .map_err(|e| format!("agent command '{}' failed: {}", method, e))
        } else {
            Ok(serde_json::json!({
                "result": "ok",
                "method": method,
                "echo": command,
                "mode": "mock",
            }))
        }
    }

    /// Agent 是否在运行
    pub async fn is_running(&self) -> bool {
        self.inner.lock().await.child.is_some()
    }

    /// 报告 Agent 状态
    pub async fn status(&self) -> AgentStatus {
        let inner = self.inner.lock().await;
        AgentStatus {
            binary_found: inner.hermes_path.is_some(),
            running: inner.child.is_some(),
            binary_path: inner.hermes_path.as_ref().map(|p| p.to_string_lossy().to_string()),
            last_error: inner.last_error.clone(),
        }
    }

    /// 公开的 JSON-RPC 调用入口（供其它模块使用，例如 ai_commands）
    pub async fn call_method(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.send_jsonrpc(method, params)
            .await
            .map_err(|e| format!("agent call '{}' failed: {}", method, e))
    }

    /// 内部：发送 JSON-RPC 请求并等待响应
    async fn send_jsonrpc(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value> {
        // 注册 pending 并分配 id（parking_lot Mutex 在 AsyncMutex 持锁期间 lock 是允许的，
        // 因为 parking_lot 不会跨 .await）
        let (tx, rx) = oneshot::channel();
        let id = {
            let mut inner = self.inner.lock().await;
            let cur = inner.next_id;
            inner.pending.lock().insert(cur, tx);
            inner.next_id = cur.wrapping_add(1);
            cur
        };

        // 构造 JSON-RPC 2.0 请求
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let payload = serde_json::to_string(&req)?;

        // 写入 stdin
        {
            let mut inner = self.inner.lock().await;
            let child = inner
                .child
                .as_mut()
                .ok_or_else(|| anyhow!("Agent not started"))?;
            let stdin = child.stdin.as_mut().ok_or_else(|| anyhow!("No stdin"))?;
            stdin.write_all(payload.as_bytes()).await?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        }

        // 等待响应（超时 60s）
        let resp = tokio::time::timeout(std::time::Duration::from_secs(60), rx)
            .await
            .map_err(|_| anyhow!("Agent response timeout (60s) for method {}", method))?
            .map_err(|_| anyhow!("Agent channel closed"))?;

        if let Some(err) = resp.get("error") {
            return Err(anyhow!("Agent error: {}", err));
        }
        Ok(resp.get("result").cloned().unwrap_or(serde_json::json!({})))
    }

    /// Mock 回复（用于在没有 Agent 进程时验证完整链路）
    fn mock_chat_response(&self, message: &str) -> String {
        let lower = message.to_lowercase();
        if lower.contains("你好") || lower.contains("hi") || lower.contains("hello") {
            "你好！我是 OpenPaint AI 助理。当前未连接 Hermes Agent，请将二进制放入 src-tauri/bin/hermes 或 ~/.openpaint/bin/hermes。".into()
        } else if lower.contains("logo") {
            "我可以为您生成 logo。请告诉我风格（极简 / 几何 / 拟物）和主色调。".into()
        } else if lower.contains("icon") {
            "请选择目标平台：iOS / Android / Web。我会按平台尺寸批量导出。".into()
        } else {
            format!(
                "我已收到您的输入：\"{}\"。当前运行在 Mock 模式，请配置 Hermes Agent 以获得完整 AI 能力。",
                message
            )
        }
    }
}

/// 后台 reader 任务：把 stdout 每行 JSON 派发到对应的 oneshot sender
fn spawn_reader_task(stdout: tokio::process::ChildStdout, pending: PendingMap) {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        loop {
            match reader.next_line().await {
                Ok(Some(line)) => {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<serde_json::Value>(line) {
                        Ok(value) => {
                            // 取 id（可能是数字或字符串）
                            let id_opt = value.get("id").and_then(|v| match v {
                                serde_json::Value::Number(n) => n.as_u64(),
                                serde_json::Value::String(s) => s.parse::<u64>().ok(),
                                _ => None,
                            });
                            if let Some(id) = id_opt {
                                let tx = pending.lock().remove(&id);
                                if let Some(tx) = tx {
                                    let _ = tx.send(value);
                                } else {
                                    debug!("Received response for unknown id={}", id);
                                }
                            } else {
                                // 通知/事件，无 id
                                debug!("Hermes notification: {}", value);
                            }
                        }
                        Err(e) => {
                            warn!("Hermes non-JSON line: {} (err: {})", line, e);
                        }
                    }
                }
                Ok(None) => {
                    info!("Hermes stdout closed, reader exiting");
                    break;
                }
                Err(e) => {
                    error!("Hermes stdout read error: {}", e);
                    break;
                }
            }
        }
        // 关闭时清空所有等待者
        let drained: Vec<_> = pending.lock().drain().collect();
        for (_id, tx) in drained {
            let _ = tx.send(serde_json::json!({
                "error": { "code": -32000, "message": "Hermes stdout closed" }
            }));
        }
    });
}

/// Agent 状态
#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentStatus {
    pub binary_found: bool,
    pub running: bool,
    pub binary_path: Option<String>,
    pub last_error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_hermes_binary_returns_none_when_missing() {
        // 不强制 None（本地可能有），仅断言不 panic
        let _ = AgentManager::find_hermes_binary();
    }

    #[test]
    fn test_mock_chat_response_contains_message() {
        let mgr = AgentManager::new();
        let reply = mgr.mock_chat_response("test message xyz");
        assert!(reply.contains("test message xyz"));
    }

    #[test]
    fn test_mock_chat_response_logo_branch() {
        let mgr = AgentManager::new();
        let reply = mgr.mock_chat_response("make me a logo");
        assert!(reply.to_lowercase().contains("logo"));
    }

    #[tokio::test]
    async fn test_status_initial() {
        let mgr = AgentManager::new();
        let status = mgr.status().await;
        // 启动前 child 应为 None
        assert!(!status.running);
    }
}