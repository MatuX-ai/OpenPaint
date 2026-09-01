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
