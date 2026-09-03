//! 配置管理模块（M-07）
//!
//! 负责：
//! - 加载/保存 `~/.openpaint/config.yaml`
//! - 首次启动生成默认配置
//! - 解析大模型、图库、MCP 等配置项

pub mod preset;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// 应用根数据目录：~/.openpaint
pub fn data_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    Ok(home.join(".openpaint"))
}

/// 配置文件路径
pub fn config_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("config.yaml"))
}

/// 应用主配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub llm: LlmConfig,
    pub presets: PresetConfig,
    pub gallery: GalleryConfig,
    pub mcp: McpConfig,
    #[serde(default)]
    pub assets: AssetsConfig,
}

/// 资产库配置（W11 引入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetsConfig {
    /// CDN 镜像：`default` / `jsdelivr` / `fastly`
    #[serde(default = "default_cdn_mirror")]
    pub cdn_mirror: String,
    /// 是否已展示过资源署名 toast（防止重复弹）
    #[serde(default)]
    pub attribution_notice_shown: bool,
}

impl Default for AssetsConfig {
    fn default() -> Self {
        Self {
            cdn_mirror: default_cdn_mirror(),
            attribution_notice_shown: false,
        }
    }
}

fn default_cdn_mirror() -> String {
    "default".to_string()
}

/// 大模型配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    /// openai | anthropic | deepseek | ollama
    pub provider: String,

    /// API Key（仅本地存储）
    #[serde(default)]
    pub api_key: String,

    /// 自定义 base_url
    #[serde(default)]
    pub base_url: Option<String>,

    /// 模型名称
    pub model: String,

    /// Ollama 本地模型（仅 provider=ollama 时使用）
    #[serde(default)]
    pub local_model: Option<String>,

    /// Ollama 服务地址
    #[serde(default)]
    pub local_url: Option<String>,
}

/// 预设尺寸模板
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetConfig {
    pub web: Vec<u32>,
    pub ios: Vec<f32>,
    pub android: Vec<u32>,
    pub favicon: Vec<u32>,
}

/// 图库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalleryConfig {
    pub max_items: u32,
    pub thumbnail_size: u32,
    pub storage_path: String,
}

/// MCP 服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    pub servers: Vec<McpServerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub enabled: bool,
}

impl AppConfig {
    /// 从 ~/.openpaint/config.yaml 加载配置
    pub fn load() -> Result<Self, String> {
        let path = config_path()?;
        if !path.exists() {
            Self::generate_default(&path)?;
        }
        let content =
            std::fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
    }

    /// 保存配置到 ~/.openpaint/config.yaml
    pub fn save(&self) -> Result<(), String> {
        let path = config_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let content = serde_yaml::to_string(self).map_err(|e| format!("yaml serialize: {}", e))?;
        std::fs::write(&path, content).map_err(|e| format!("write config: {}", e))?;
        info!("Config saved to {:?}", path);
        Ok(())
    }

    /// W11 — 获取当前 assets 配置（不存在则返回默认）。
    pub fn assets_config(&self) -> AssetsConfig {
        self.assets.clone()
    }

    /// W11 — 写入新的 assets 配置并落盘。
    pub fn set_assets_config(&mut self, cfg: AssetsConfig) -> Result<(), String> {
        self.assets = cfg;
        self.save()
    }

    /// 生成默认配置文件
    fn generate_default(path: &PathBuf) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // 默认配置内嵌（assets/ 位于仓库根目录，相对 src-tauri/src/config/ 是 ../../../assets/）
        let default_yaml = include_str!("../../../assets/default_config.yaml");
        std::fs::write(path, default_yaml).map_err(|e| e.to_string())?;
        info!("Generated default config at {:?}", path);
        Ok(())
    }
}

/// 首次启动初始化入口
pub fn ensure_initialized() -> Result<(), String> {
    let dir = data_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("gallery").join("thumbnails")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("gallery").join("originals")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("logs")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("scenarios")).map_err(|e| e.to_string())?;

    // 强制写入默认场景文件
    let scenarios = dir.join("scenarios");
    for (name, content) in [
        (
            "ios-icons.yaml",
            include_str!("../../../assets/scenarios/ios-icons.yaml"),
        ),
        (
            "web-icons.yaml",
            include_str!("../../../assets/scenarios/web-icons.yaml"),
        ),
    ] {
        let target = scenarios.join(name);
        if !target.exists() {
            if let Err(e) = std::fs::write(&target, content) {
                warn!("Failed to write scenario {}: {}", name, e);
            }
        }
    }

    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_yaml;

    #[test]
    fn test_data_dir_ends_with_openpaint() {
        let p = data_dir().expect("home dir should resolve");
        assert!(p.ends_with(".openpaint"), "{:?}", p);
    }

    #[test]
    fn test_config_path_under_data_dir() {
        let p = config_path().expect("config path should resolve");
        assert!(p.ends_with("config.yaml"));
        let parent = p.parent().expect("config has parent dir");
        assert!(parent.ends_with(".openpaint"));
    }

    #[test]
    fn test_default_cdn_mirror_is_default() {
        assert_eq!(default_cdn_mirror(), "default");
    }

    #[test]
    fn test_assets_config_default() {
        let a = AssetsConfig::default();
        assert_eq!(a.cdn_mirror, "default");
        assert!(!a.attribution_notice_shown);
    }

    #[test]
    fn test_app_config_yaml_round_trip() {
        // 默认 YAML 应能解析 + 序列化回 YAML 后再次解析得到等价结构
        let yaml = include_str!("../../../assets/default_config.yaml");
        let parsed: AppConfig = serde_yaml::from_str(yaml).expect("default YAML parses");
        let serialized = serde_yaml::to_string(&parsed).expect("serialize");
        let re_parsed: AppConfig = serde_yaml::from_str(&serialized).expect("re-parse");
        assert_eq!(re_parsed.llm.provider, parsed.llm.provider);
        assert_eq!(re_parsed.llm.model, parsed.llm.model);
        assert_eq!(re_parsed.gallery.max_items, parsed.gallery.max_items);
        assert_eq!(re_parsed.assets.cdn_mirror, parsed.assets.cdn_mirror);
    }

    #[test]
    fn test_app_config_default_yaml_provider() {
        let yaml = include_str!("../../../assets/default_config.yaml");
        let cfg: AppConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(cfg.llm.provider, "openai");
        assert_eq!(cfg.llm.base_url.as_deref(), Some("https://api.openai.com/v1"));
        assert!(cfg.llm.api_key.is_empty(), "默认 api_key 应为空字符串");
        assert_eq!(cfg.llm.local_model.as_deref(), Some("qwen2.5:7b"));
        assert_eq!(cfg.llm.local_url.as_deref(), Some("http://localhost:11434"));
    }

    #[test]
    fn test_app_config_preset_sizes() {
        let yaml = include_str!("../../../assets/default_config.yaml");
        let cfg: AppConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(cfg.presets.web, vec![16, 32, 48, 180, 192, 512]);
        assert_eq!(cfg.presets.android, vec![48, 72, 96, 144, 192, 512]);
        assert_eq!(cfg.presets.favicon, vec![16, 32, 64]);
        assert_eq!(
            cfg.presets.ios,
            vec![20.0, 29.0, 40.0, 60.0, 76.0, 83.5, 1024.0]
        );
    }

    #[test]
    fn test_app_config_gallery_defaults() {
        let yaml = include_str!("../../../assets/default_config.yaml");
        let cfg: AppConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(cfg.gallery.max_items, 500);
        assert_eq!(cfg.gallery.thumbnail_size, 256);
        assert_eq!(cfg.gallery.storage_path, "~/.openpaint/gallery");
    }

    #[test]
    fn test_app_config_mcp_servers() {
        let yaml = include_str!("../../../assets/default_config.yaml");
        let cfg: AppConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(cfg.mcp.servers.len(), 2);
        assert_eq!(cfg.mcp.servers[0].name, "openpaint-tools");
        assert!(cfg.mcp.servers[0].enabled);
        assert!(!cfg.mcp.servers[1].enabled);
    }

    #[test]
    fn test_assets_config_serde_round_trip() {
        let cfg = AssetsConfig {
            cdn_mirror: "jsdelivr".into(),
            attribution_notice_shown: true,
        };
        let yaml = serde_yaml::to_string(&cfg).unwrap();
        let back: AssetsConfig = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back.cdn_mirror, "jsdelivr");
        assert!(back.attribution_notice_shown);
    }

    #[test]
    fn test_app_config_assets_field_uses_default() {
        // 当 YAML 缺省 assets 字段时，应自动应用 Default
        let yaml = r#"
llm:
  provider: openai
  model: gpt-4o
presets:
  web: []
  ios: []
  android: []
  favicon: []
gallery:
  max_items: 100
  thumbnail_size: 128
  storage_path: /tmp
mcp:
  servers: []
"#;
        let cfg: AppConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(cfg.assets.cdn_mirror, "default");
        assert!(!cfg.assets.attribution_notice_shown);
    }

    #[test]
    fn test_assets_config_accessor_returns_clone() {
        let yaml = include_str!("../../../assets/default_config.yaml");
        let cfg: AppConfig = serde_yaml::from_str(yaml).unwrap();
        let a1 = cfg.assets_config();
        let a2 = cfg.assets_config();
        assert_eq!(a1.cdn_mirror, a2.cdn_mirror);
        // 修改 a1 不应影响 cfg.assets（深 clone）
        let mut a1 = a1;
        a1.cdn_mirror = "jsdelivr".into();
        assert_eq!(cfg.assets.cdn_mirror, "default");
    }

    #[test]
    fn test_llm_config_partial_yaml_defaults() {
        // 缺少 api_key / base_url / local_model / local_url 时应使用 default ""
        let yaml = r#"
provider: ollama
model: llama3.1
"#;
        let cfg: LlmConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(cfg.provider, "ollama");
        assert_eq!(cfg.api_key, "");
        assert!(cfg.base_url.is_none());
        assert!(cfg.local_model.is_none());
        assert!(cfg.local_url.is_none());
    }

    #[test]
    fn test_mcp_server_config_fields() {
        let s = McpServerConfig {
            name: "test".into(),
            enabled: true,
        };
        let yaml = serde_yaml::to_string(&s).unwrap();
        let back: McpServerConfig = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back.name, "test");
        assert!(back.enabled);
    }

    #[test]
    fn test_preset_config_serde() {
        let p = PresetConfig {
            web: vec![16, 32],
            ios: vec![20.0],
            android: vec![48],
            favicon: vec![16, 32, 64],
        };
        let yaml = serde_yaml::to_string(&p).unwrap();
        let back: PresetConfig = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back.web, p.web);
        assert_eq!(back.ios, p.ios);
    }

    #[test]
    fn test_gallery_config_serde() {
        let g = GalleryConfig {
            max_items: 100,
            thumbnail_size: 256,
            storage_path: "/tmp".into(),
        };
        let yaml = serde_yaml::to_string(&g).unwrap();
        let back: GalleryConfig = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back.max_items, 100);
        assert_eq!(back.thumbnail_size, 256);
        assert_eq!(back.storage_path, "/tmp");
    }

    #[test]
    fn test_app_config_clone_is_independent() {
        let yaml = include_str!("../../../assets/default_config.yaml");
        let cfg: AppConfig = serde_yaml::from_str(yaml).unwrap();
        let mut clone = cfg.clone();
        clone.llm.provider = "deepseek".into();
        clone.gallery.max_items = 999;
        assert_eq!(cfg.llm.provider, "openai", "原配置不应被修改");
        assert_eq!(cfg.gallery.max_items, 500);
    }

    #[test]
    fn test_invalid_yaml_returns_err() {
        // 非法 YAML（缩进不一致）
        let bad = "llm: : invalid";
        let r: Result<AppConfig, _> = serde_yaml::from_str(bad);
        assert!(r.is_err(), "非法 YAML 应返回 Err");
    }

    #[test]
    fn test_missing_required_field_returns_err() {
        // 缺少必需字段 model
        let bad = r#"
llm:
  provider: openai
presets:
  web: []
gallery:
  max_items: 1
  thumbnail_size: 1
  storage_path: /tmp
mcp:
  servers: []
"#;
        let r: Result<AppConfig, _> = serde_yaml::from_str(bad);
        assert!(r.is_err(), "缺 model 字段应失败");
    }
}
