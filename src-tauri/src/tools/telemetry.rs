//! 资产库本地遥测（W11-A1）
//!
//! 把关键资产操作记录到 `~/.openpaint/telemetry/assets.json`：
//!   - search_icons 触发次数 + 缓存命中次数
//!   - import_icon 总次数
//!   - palette_applied / gradient_applied / brush_switch 总次数
//!
//! 仅本地追加，不外发。

use std::path::PathBuf;
use std::sync::OnceLock;

use anyhow::{Context as _, Result as AnyhowResult};
use serde::{Deserialize, Serialize};
use tracing::warn;

/// 遥测文件名（位于 `~/.openpaint/telemetry/`）
const TELEMETRY_FILE: &str = "assets.json";

/// 累计计数 + 最后更新时间
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AssetsTelemetry {
    #[serde(default)]
    pub search_icons_total: u64,
    #[serde(default)]
    pub search_icons_cache_hits: u64,
    #[serde(default)]
    pub import_icon_total: u64,
    #[serde(default)]
    pub palette_applied_total: u64,
    #[serde(default)]
    pub gradient_applied_total: u64,
    #[serde(default)]
    pub brush_switch_total: u64,
    /// ISO 8601 字符串，最后一次 `record_event` 的时间。
    #[serde(default)]
    pub last_updated_at: String,
}

impl AssetsTelemetry {
    /// 增加一个事件计数
    pub fn increment(&mut self, event: &str) {
        match event {
            "search_icons" => self.search_icons_total += 1,
            "search_icons_cache_hit" => self.search_icons_cache_hits += 1,
            "import_icon" => self.import_icon_total += 1,
            "apply_palette" => self.palette_applied_total += 1,
            "apply_gradient" => self.gradient_applied_total += 1,
            "brush_switch" => self.brush_switch_total += 1,
            _ => warn!("unknown asset event: {}", event),
        }
        self.last_updated_at = chrono::Utc::now().to_rfc3339();
    }
}

/// 进程内单例
static TELEMETRY: OnceLock<parking_lot::Mutex<AssetsTelemetry>> = OnceLock::new();

fn telemetry_cell() -> &'static parking_lot::Mutex<AssetsTelemetry> {
    TELEMETRY.get_or_init(|| parking_lot::Mutex::new(load_from_disk()))
}

fn telemetry_path() -> AnyhowResult<PathBuf> {
    let dir = crate::config::data_dir().map_err(|e| anyhow::anyhow!("data_dir: {}", e))?;
    let dir = dir.join("telemetry");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).context("create telemetry dir")?;
    }
    Ok(dir.join(TELEMETRY_FILE))
}

fn load_from_disk() -> AssetsTelemetry {
    let path = match telemetry_path() {
        Ok(p) => p,
        Err(_) => return AssetsTelemetry::default(),
    };
    if !path.exists() {
        return AssetsTelemetry::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AssetsTelemetry::default(),
    }
}

fn persist(cell: &AssetsTelemetry) {
    let path = match telemetry_path() {
        Ok(p) => p,
        Err(e) => {
            warn!("telemetry path: {}", e);
            return;
        }
    };
    let content = match serde_json::to_string_pretty(cell) {
        Ok(c) => c,
        Err(e) => {
            warn!("telemetry serialize: {}", e);
            return;
        }
    };
    if let Err(e) = std::fs::write(&path, content) {
        warn!("telemetry write: {}", e);
    }
}

/// 记录一次资产事件 + 落盘（fire-and-forget）
pub fn record_event(event: &str) {
    let mut cell = telemetry_cell().lock();
    cell.increment(event);
    persist(&cell);
}

/// 当前遥测快照（用于前端展示 / 测试断言）
pub fn snapshot() -> AssetsTelemetry {
    telemetry_cell().lock().clone()
}

/// 重置全部计数（仅测试用）
#[cfg(test)]
pub fn reset_for_tests() {
    let mut cell = telemetry_cell().lock();
    *cell = AssetsTelemetry::default();
    persist(&cell);
}

/// IPC 命令：记录一次事件
#[tauri::command]
pub fn record_asset_event(event: String) {
    record_event(&event);
}

/// IPC 命令：读取当前遥测快照
#[tauri::command]
pub fn get_assets_telemetry() -> AssetsTelemetry {
    snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_increment_known_events() {
        let mut t = AssetsTelemetry::default();
        t.increment("search_icons");
        t.increment("search_icons");
        t.increment("search_icons_cache_hit");
        t.increment("import_icon");
        t.increment("apply_palette");
        t.increment("apply_gradient");
        t.increment("brush_switch");
        assert_eq!(t.search_icons_total, 2);
        assert_eq!(t.search_icons_cache_hits, 1);
        assert_eq!(t.import_icon_total, 1);
        assert_eq!(t.palette_applied_total, 1);
        assert_eq!(t.gradient_applied_total, 1);
        assert_eq!(t.brush_switch_total, 1);
        assert!(!t.last_updated_at.is_empty());
    }

    #[test]
    fn test_unknown_event_does_not_panic() {
        let mut t = AssetsTelemetry::default();
        t.increment("__bogus__");
        assert_eq!(t.search_icons_total, 0);
    }

    #[test]
    fn test_snapshot_returns_current_state() {
        record_event("search_icons");
        let s = snapshot();
        assert!(s.search_icons_total >= 1);
    }
}
