//! 多 LLM Provider 命令（W6 实施）
//!
//! 支持 4 种 Provider：OpenAI / Anthropic / DeepSeek / Ollama
//! 通过配置文件 `~/.openpaint/config.yaml` 管理 API 密钥与端点。

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::state::AppState;

/// LLM Provider 枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LlmProvider {
    Openai,
    Anthropic,
    Deepseek,
    Ollama,
}

impl LlmProvider {
    pub fn id(&self) -> &'static str {
        match self {
            LlmProvider::Openai => "openai",
            LlmProvider::Anthropic => "anthropic",
            LlmProvider::Deepseek => "deepseek",
            LlmProvider::Ollama => "ollama",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            LlmProvider::Openai => "OpenAI",
            LlmProvider::Anthropic => "Anthropic Claude",
            LlmProvider::Deepseek => "DeepSeek",
            LlmProvider::Ollama => "Ollama (本地)",
        }
    }

    pub fn default_endpoint(&self) -> &'static str {
        match self {
            LlmProvider::Openai => "https://api.openai.com/v1",
            LlmProvider::Anthropic => "https://api.anthropic.com/v1",
            LlmProvider::Deepseek => "https://api.deepseek.com/v1",
            LlmProvider::Ollama => "http://localhost:11434",
        }
    }
}

/// Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider: LlmProvider,
    pub api_key: Option<String>,
    pub endpoint: String,
    pub model: String,
}

/// Provider 信息（前端展示用）
#[derive(Debug, Clone, Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub label: String,
    pub default_endpoint: String,
    pub default_model: String,
    pub requires_api_key: bool,
}

/// 1. 列出可用 Provider
#[tauri::command]
pub async fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(vec![
        ProviderInfo {
            id: LlmProvider::Openai.id().into(),
            label: LlmProvider::Openai.label().into(),
            default_endpoint: LlmProvider::Openai.default_endpoint().into(),
            default_model: "gpt-4o".into(),
            requires_api_key: true,
        },
        ProviderInfo {
            id: LlmProvider::Anthropic.id().into(),
            label: LlmProvider::Anthropic.label().into(),
            default_endpoint: LlmProvider::Anthropic.default_endpoint().into(),
            default_model: "claude-3-5-sonnet-20241022".into(),
            requires_api_key: true,
        },
        ProviderInfo {
            id: LlmProvider::Deepseek.id().into(),
            label: LlmProvider::Deepseek.label().into(),
            default_endpoint: LlmProvider::Deepseek.default_endpoint().into(),
            default_model: "deepseek-chat".into(),
            requires_api_key: true,
        },
        ProviderInfo {
            id: LlmProvider::Ollama.id().into(),
            label: LlmProvider::Ollama.label().into(),
            default_endpoint: LlmProvider::Ollama.default_endpoint().into(),
            default_model: "llama3.1".into(),
            requires_api_key: false,
        },
    ])
}

/// 2. 切换活跃 Provider
#[tauri::command]
pub async fn set_provider(state: State<'_, AppState>, provider: LlmProvider) -> Result<(), String> {
    info!("Switching to provider: {}", provider.id());
    let mut config = state.config.write();
    config.llm.provider = provider.id().to_string();
    config.save().map_err(|e| format!("save config: {}", e))?;
    Ok(())
}

/// 3. 获取当前 Provider 配置
#[tauri::command]
pub async fn get_provider_config(state: State<'_, AppState>) -> Result<ProviderConfig, String> {
    let config = state.config.read();
    let provider = match config.llm.provider.as_str() {
        "anthropic" => LlmProvider::Anthropic,
        "deepseek" => LlmProvider::Deepseek,
        "ollama" => LlmProvider::Ollama,
        _ => LlmProvider::Openai,
    };
    let api_key = if config.llm.api_key.is_empty() {
        None
    } else {
        Some(config.llm.api_key.clone())
    };
    let endpoint = config
        .llm
        .base_url
        .clone()
        .unwrap_or_else(|| provider.default_endpoint().to_string());
    let model = if provider == LlmProvider::Ollama {
        config
            .llm
            .local_model
            .clone()
            .unwrap_or_else(|| "llama3.1".to_string())
    } else {
        config.llm.model.clone()
    };
    Ok(ProviderConfig {
        provider,
        api_key,
        endpoint,
        model,
    })
}

/// 4. 设置 API 密钥
#[tauri::command]
pub async fn set_api_key(
    state: State<'_, AppState>,
    provider: LlmProvider,
    api_key: String,
) -> Result<(), String> {
    info!("Setting API key for provider: {}", provider.id());
    let mut config = state.config.write();
    // MVP 简化：仅保存当前 provider 的 key
    config.llm.api_key = api_key;
    config.save().map_err(|e| format!("save: {}", e))?;
    Ok(())
}
