//! 多 LLM Provider 命令（W6 实施）
//!
//! 支持 4 种 Provider：OpenAI / Anthropic / DeepSeek / Ollama
//! 通过配置文件 `~/.openpaint/config.yaml` 管理 API 密钥与端点。

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::state::AppState;

/// LLM Provider 枚举
///
/// 涵盖 OpenAI / Anthropic 以及国内主流 OpenAI 兼容服务（DeepSeek、
/// 通义千问 DashScope、智谱 BigModel、月之暗面、火山引擎豆包、MiniMax）。
/// 自定义协议厂商（文心、讯飞、腾讯混元等）暂不接入，需要独立 SDK。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LlmProvider {
    Openai,
    Anthropic,
    Deepseek,
    Ollama,
    /// 阿里云 DashScope / 通义千问 Qwen
    Qwen,
    /// 智谱 BigModel / GLM
    Zhipu,
    /// 月之暗面 Moonshot / Kimi
    Moonshot,
    /// 字节跳动 火山引擎 / 豆包
    Doubao,
    /// MiniMax / MiniMax（API 协议兼容 OpenAI Chat Completions）
    Minimax,
}

impl LlmProvider {
    pub fn id(&self) -> &'static str {
        match self {
            LlmProvider::Openai => "openai",
            LlmProvider::Anthropic => "anthropic",
            LlmProvider::Deepseek => "deepseek",
            LlmProvider::Ollama => "ollama",
            LlmProvider::Qwen => "qwen",
            LlmProvider::Zhipu => "zhipu",
            LlmProvider::Moonshot => "moonshot",
            LlmProvider::Doubao => "doubao",
            LlmProvider::Minimax => "minimax",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            LlmProvider::Openai => "OpenAI",
            LlmProvider::Anthropic => "Anthropic Claude",
            LlmProvider::Deepseek => "DeepSeek",
            LlmProvider::Ollama => "Ollama (本地)",
            LlmProvider::Qwen => "通义千问 (Qwen / 阿里云)",
            LlmProvider::Zhipu => "智谱 GLM",
            LlmProvider::Moonshot => "月之暗面 (Kimi)",
            LlmProvider::Doubao => "豆包 (火山引擎 / 字节)",
            LlmProvider::Minimax => "Minimax (MiniMax)",
        }
    }

    pub fn default_endpoint(&self) -> &'static str {
        match self {
            LlmProvider::Openai => "https://api.openai.com/v1",
            LlmProvider::Anthropic => "https://api.anthropic.com/v1",
            LlmProvider::Deepseek => "https://api.deepseek.com/v1",
            LlmProvider::Ollama => "http://localhost:11434",
            // 国内厂商均提供 OpenAI 兼容端点。
            LlmProvider::Qwen => "https://dashscope.aliyuncs.com/compatible-mode/v1",
            LlmProvider::Zhipu => "https://open.bigmodel.cn/api/paas/v4",
            LlmProvider::Moonshot => "https://api.moonshot.cn/v1",
            LlmProvider::Doubao => "https://ark.cn-beijing.volces.com/api/v3",
            // MiniMax 同时提供国际 (MiniMax.chat) 与国内 (MiniMax.cn) 两个端点，
            // 默认填国际端点；用户可在 UI 里手动改成国内。
            LlmProvider::Minimax => "https://api.minimaxi.chat/v1",
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            LlmProvider::Openai => "gpt-4o",
            LlmProvider::Anthropic => "claude-3-5-sonnet-20241022",
            LlmProvider::Deepseek => "deepseek-chat",
            LlmProvider::Ollama => "llama3.1",
            LlmProvider::Qwen => "qwen-plus",
            LlmProvider::Zhipu => "glm-4-plus",
            LlmProvider::Moonshot => "moonshot-v1-8k",
            LlmProvider::Doubao => "doubao-pro-32k",
            LlmProvider::Minimax => "MiniMax-Text-01",
        }
    }

    /// 汇总该 Provider 对前端展示所需的全部元数据。
    /// Ollama 本地部署无需 API Key，其他云端服务都需要。
    pub fn as_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: self.id().into(),
            label: self.label().into(),
            default_endpoint: self.default_endpoint().into(),
            default_model: self.default_model().into(),
            requires_api_key: !matches!(self, LlmProvider::Ollama),
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
    // 顺序就是用户在设置面板里看到的顺序；以国内大模型优先曝光
    // （DeepSeek / Qwen / Zhipu / Kimi / Doubao / MiniMax），海外大模型
    // （OpenAI / Anthropic）排在其后，本地离线（Ollama）压轴。这样国内用户
    // 开箱就能看到自己熟悉的服务，海外/本地选项放在后面也不脱离金径。
    Ok(vec![
        // 国内优先（OpenAI 兼容接口 / 主流云平台）
        LlmProvider::Deepseek.as_info(),
        LlmProvider::Qwen.as_info(),
        LlmProvider::Zhipu.as_info(),
        LlmProvider::Moonshot.as_info(),
        LlmProvider::Doubao.as_info(),
        LlmProvider::Minimax.as_info(),
        // 海外主流
        LlmProvider::Openai.as_info(),
        LlmProvider::Anthropic.as_info(),
        // 本地离线压轴
        LlmProvider::Ollama.as_info(),
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
        "qwen" => LlmProvider::Qwen,
        "zhipu" => LlmProvider::Zhipu,
        "moonshot" => LlmProvider::Moonshot,
        "doubao" => LlmProvider::Doubao,
        "minimax" => LlmProvider::Minimax,
        _ => LlmProvider::Openai,
    };
    let api_key = if config.llm.api_key.is_empty() {
        None
    } else {
        Some(config.llm.api_key.clone())
    };
    // 配置文件中没有显式 endpoint/base_url 时，回落到该 provider 的官方默认值，
    // 包括新增的国内厂商。这样老用户配置迁移也能直接使用。
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
            .unwrap_or_else(|| provider.default_model().to_string())
    } else {
        if config.llm.model.trim().is_empty() {
            provider.default_model().to_string()
        } else {
            config.llm.model.clone()
        }
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
