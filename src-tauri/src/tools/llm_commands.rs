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
///
/// W12 VDP-MOCK-01：Mock 是 W12 引入的零配置占位 Provider，无需 API Key、
/// 无外网请求，本地规则模板即可应答，主要用于首启引导流和 Web 预览。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LlmProvider {
    /// W12 VDP-MOCK-01：本地规则模板占位。零配置、零费用、零外发。
    Mock,
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
            LlmProvider::Mock => "mock",
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
            LlmProvider::Mock => "模拟模式（零配置演示）",
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
            LlmProvider::Mock => "(本地模板，不发起网络请求)",
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
            LlmProvider::Mock => "mock-v1",
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
    /// Ollama 本地部署无需 API Key，W12 VDP-MOCK-01 Mock 占位亦然。
    pub fn as_info(&self) -> ProviderInfo {
        ProviderInfo {
            id: self.id().into(),
            label: self.label().into(),
            default_endpoint: self.default_endpoint().into(),
            default_model: self.default_model().into(),
            requires_api_key: !matches!(self, LlmProvider::Ollama | LlmProvider::Mock),
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
        // W12 VDP-MOCK-01：模拟模式置顶——零配置即可进入创作。
        LlmProvider::Mock.as_info(),
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 辅助函数：返回全部 Provider，便于穷尽测试。
    fn all_providers() -> Vec<LlmProvider> {
        vec![
            LlmProvider::Mock,
            LlmProvider::Openai,
            LlmProvider::Anthropic,
            LlmProvider::Deepseek,
            LlmProvider::Ollama,
            LlmProvider::Qwen,
            LlmProvider::Zhipu,
            LlmProvider::Moonshot,
            LlmProvider::Doubao,
            LlmProvider::Minimax,
        ]
    }

    /// 每个 Provider 必须映射到非空、稳定的 id。
    #[test]
    fn test_provider_id_is_non_empty_and_unique() {
        let mut ids: Vec<&'static str> = all_providers().iter().map(|p| p.id()).collect();
        let count_before = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), count_before, "Provider id 必须互不重复");
        for id in &ids {
            assert!(!id.is_empty(), "Provider id 不应为空");
            assert!(
                id.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
                "id '{}' 应保持小写 ASCII 风格，便于序列化",
                id
            );
        }
    }

    /// id() 必须等于 serde lowercase 序列化结果。
    #[test]
    fn test_provider_id_matches_serde_lowercase() {
        for p in all_providers() {
            let serialized = serde_json::to_string(&p).unwrap();
            let expected = format!("\"{}\"", p.id());
            assert_eq!(
                serialized, expected,
                "Provider {:?} 的序列化与 id() 必须一致",
                p
            );
        }
    }

    /// 中文 label 至少 2 个字符，非空。
    #[test]
    fn test_provider_label_non_empty() {
        for p in all_providers() {
            let label = p.label();
            assert!(
                !label.trim().is_empty(),
                "Provider {:?} 的 label 不应为空",
                p
            );
            assert!(
                label.chars().count() >= 2,
                "Provider {:?} 的 label 过短: '{}'",
                p,
                label
            );
        }
    }

    /// 海外/国内/本地厂商端点必须落在合理 URL 上，Mock 不应是 URL。
    #[test]
    fn test_provider_default_endpoint_shape() {
        for p in all_providers() {
            let ep = p.default_endpoint();
            match p {
                LlmProvider::Mock => {
                    assert!(!ep.starts_with("http"), "Mock 不应该是 URL: {}", ep);
                }
                _ => {
                    assert!(
                        ep.starts_with("http://") || ep.starts_with("https://"),
                        "Provider {:?} 的端点必须是 http(s): {}",
                        p,
                        ep
                    );
                }
            }
        }
    }

    /// 模型 ID 必须非空且无空白。
    #[test]
    fn test_provider_default_model_non_blank() {
        for p in all_providers() {
            let model = p.default_model();
            assert!(!model.trim().is_empty(), "{:?} 默认模型不能为空", p);
            assert_eq!(
                model,
                model.trim(),
                "{:?} 默认模型不应有空白: '{}'",
                p,
                model
            );
        }
    }

    /// Mock 与 Ollama 不应要求 API Key，其余都要求。
    #[test]
    fn test_as_info_requires_api_key() {
        for p in all_providers() {
            let info = p.as_info();
            match p {
                LlmProvider::Mock | LlmProvider::Ollama => {
                    assert!(
                        !info.requires_api_key,
                        "{:?} 必须为 requires_api_key = false",
                        p
                    );
                }
                _ => {
                    assert!(
                        info.requires_api_key,
                        "{:?} 必须为 requires_api_key = true",
                        p
                    );
                }
            }
        }
    }

    /// ProviderInfo 五个字段必须填齐，且与调用源 Provider 对应。
    #[test]
    fn test_as_info_fields_match_provider() {
        for p in all_providers() {
            let info = p.as_info();
            assert_eq!(info.id, p.id());
            assert_eq!(info.label, p.label());
            assert_eq!(info.default_endpoint, p.default_endpoint());
            assert_eq!(info.default_model, p.default_model());
            assert_eq!(
                info.requires_api_key,
                !matches!(p, LlmProvider::Ollama | LlmProvider::Mock)
            );
        }
    }

    /// ProviderInfo 必须能被序列化为合法 JSON。
    #[test]
    fn test_provider_info_serializable() {
        for p in all_providers() {
            let info = p.as_info();
            let json = serde_json::to_value(&info).unwrap();
            assert_eq!(json["id"], info.id);
            assert_eq!(json["label"], info.label);
            assert_eq!(json["default_endpoint"], info.default_endpoint);
            assert_eq!(json["default_model"], info.default_model);
            assert_eq!(json["requires_api_key"], info.requires_api_key);
            assert_eq!(json.as_object().unwrap().len(), 5);
        }
    }

    /// Serde 反序列化应兼容 lowercase 字符串。
    #[test]
    fn test_provider_deserialize_from_lowercase_string() {
        for p in all_providers() {
            let raw = format!("\"{}\"", p.id());
            let parsed: LlmProvider = serde_json::from_str(&raw).unwrap();
            assert_eq!(parsed, p);
        }
    }

    /// 不认识的字符串必须反序列化失败（不能静默回退到 OpenAI）。
    #[test]
    fn test_provider_deserialize_unknown_rejected() {
        let raw = "\"some_random_provider\"";
        let parsed: Result<LlmProvider, _> = serde_json::from_str(raw);
        assert!(parsed.is_err(), "未知 Provider 应被拒绝，便于类型安全");
    }

    /// list_providers 应返回 10 项，且首位是 Mock（零配置优先），末尾是 Ollama（本地离线压轴）。
    #[tokio::test]
    async fn test_list_providers_order_and_count() {
        let providers = list_providers().await.expect("list_providers 应成功");
        assert_eq!(providers.len(), 10);
        assert_eq!(providers[0].id, "mock", "Mock 应置顶以提示零配置体验");
        assert_eq!(
            providers[providers.len() - 1].id,
            "ollama",
            "本地离线应压轴"
        );
        // 所有 Provider id 都应唯一
        let ids: Vec<&str> = providers.iter().map(|p| p.id.as_str()).collect();
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), ids.len(), "list_providers 不可重复");
    }

    /// list_providers 中国内优先应在海外之前（DeepSeek 等先于 OpenAI / Anthropic）。
    #[tokio::test]
    async fn test_list_providers_priority_domestic_first() {
        let providers = list_providers().await.expect("list_providers 应成功");
        let deepseek_idx = providers.iter().position(|p| p.id == "deepseek").unwrap();
        let openai_idx = providers.iter().position(|p| p.id == "openai").unwrap();
        let anthropic_idx = providers.iter().position(|p| p.id == "anthropic").unwrap();
        let ollama_idx = providers.iter().position(|p| p.id == "ollama").unwrap();
        assert!(deepseek_idx < openai_idx, "DeepSeek 必须在 OpenAI 之前");
        assert!(
            deepseek_idx < anthropic_idx,
            "DeepSeek 必须在 Anthropic 之前"
        );
        assert!(ollama_idx > openai_idx, "Ollama 压轴应在 OpenAI 之后");
    }

    /// 每个列表项都必须包含齐全字段。
    #[tokio::test]
    async fn test_list_providers_fields_complete() {
        let providers = list_providers().await.expect("list_providers 应成功");
        for info in &providers {
            assert!(!info.id.is_empty());
            assert!(!info.label.is_empty());
            assert!(!info.default_endpoint.is_empty());
            assert!(!info.default_model.is_empty());
            // label 必须是字符串
            assert!(info.label.is_ascii() || info.label.chars().count() > 0);
        }
    }

    /// ProviderConfig 必填字段是 provider / endpoint / model，api_key 可选。
    #[test]
    fn test_provider_config_serde_shape() {
        let cfg = ProviderConfig {
            provider: LlmProvider::Mock,
            api_key: None,
            endpoint: "https://example.com".to_string(),
            model: "test-model".to_string(),
        };
        let json = serde_json::to_value(&cfg).unwrap();
        assert_eq!(json["provider"], "mock");
        assert!(json["api_key"].is_null());
        assert_eq!(json["endpoint"], "https://example.com");
        assert_eq!(json["model"], "test-model");
        let round: ProviderConfig = serde_json::from_value(json).unwrap();
        assert_eq!(round.provider, cfg.provider);
        assert_eq!(round.endpoint, cfg.endpoint);
        assert_eq!(round.model, cfg.model);
        assert!(round.api_key.is_none());
    }

    /// ProviderConfig 可以序列化 Some(api_key)。
    #[test]
    fn test_provider_config_with_api_key() {
        let cfg = ProviderConfig {
            provider: LlmProvider::Openai,
            api_key: Some("sk-abc123".to_string()),
            endpoint: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o".to_string(),
        };
        let json = serde_json::to_value(&cfg).unwrap();
        assert_eq!(json["api_key"], "sk-abc123");
    }

    /// 大型 ProviderInfo 列表应能成功 JSON 化，便于前端 fetch。
    #[test]
    fn test_list_payload_serializable_for_frontend() {
        // 模拟 list_providers 的实际返回类型（Vec<ProviderInfo>）
        let infos: Vec<ProviderInfo> = all_providers().iter().map(|p| p.as_info()).collect();
        let json = serde_json::to_string(&infos).unwrap();
        assert!(json.starts_with("["));
        assert!(json.ends_with("]"));
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed.is_array());
        assert_eq!(parsed.as_array().unwrap().len(), 10);
    }

    /// 验证主流海外/国内厂商端点固定为 HTTPS（Ollama 是 http://localhost 例外）。
    #[test]
    fn test_https_for_remote_providers() {
        for p in &[
            LlmProvider::Openai,
            LlmProvider::Anthropic,
            LlmProvider::Deepseek,
            LlmProvider::Qwen,
            LlmProvider::Zhipu,
            LlmProvider::Moonshot,
            LlmProvider::Doubao,
            LlmProvider::Minimax,
        ] {
            assert!(
                p.default_endpoint().starts_with("https://"),
                "{:?} 默认端点应是 HTTPS: {}",
                p,
                p.default_endpoint()
            );
        }
    }

    /// Ollama 是本地服务，必须为 http://。
    #[test]
    fn test_ollama_is_http_localhost() {
        let ep = LlmProvider::Ollama.default_endpoint();
        assert!(
            ep.starts_with("http://localhost"),
            "Ollama 应默认 localhost: {}",
            ep
        );
        assert!(!ep.starts_with("https://"));
    }

    /// 默认端点不能含尾部斜杠以外的脏字符（trim 后不含空白）。
    #[test]
    fn test_default_endpoints_no_surrounding_whitespace() {
        for p in all_providers() {
            let ep = p.default_endpoint();
            assert_eq!(ep, ep.trim(), "{:?} 端点不应带前后空白: '{}'", p, ep);
        }
    }

    /// LlmProvider 必须实现 PartialEq + Clone + Debug，便用于测试断言与日志。
    #[test]
    fn test_provider_marker_traits_compile_time() {
        let a = LlmProvider::Mock;
        let b = a.clone();
        assert_eq!(a, b, "Clone 后必须相等");
        let dbg = format!("{:?}", a);
        assert!(!dbg.is_empty());
    }

    /// 测试 json! 宏构造的 raw 字符串能 round-trip 回 LlmProvider。
    #[test]
    fn test_provider_from_json_macro() {
        let val = json!("qwen");
        let parsed: LlmProvider = serde_json::from_value(val).unwrap();
        assert_eq!(parsed, LlmProvider::Qwen);
    }
}
