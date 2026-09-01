//! 默认画刷命令（W10 实施）
//!
//! 提供 2 个 Tauri 命令：
//! - `list_brushes`    列出全部内置笔刷（含元数据，不含 PNG 数据）
//! - `list_brush_assets` 列出全部笔刷并附带 PNG base64 缩略图
//!
//! PNG 资源位于 `assets/brushes/{id}.png`，开发模式从工作区根读取，
//! 生产模式从 Tauri bundle 资源读取。缺失时返回错误，前端 UI 自动 fallback。

use anyhow::{anyhow, Context as _, Result as AnyhowResult};
use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;

use crate::canvas::{builtin_brushes, BrushPreset};

/// 笔刷目录解析（开发模式 vs 生产模式）
///
/// 优先级：
/// 1. `CARGO_MANIFEST_DIR/../assets/brushes`（开发模式，仓库根）
/// 2. `assets/brushes/`（生产模式，Tauri 资源目录运行时 cwd）
fn brush_dir() -> PathBuf {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("assets")
        .join("brushes");
    if dev.exists() {
        dev
    } else {
        PathBuf::from("assets").join("brushes")
    }
}

/// 加载单个笔刷 PNG → base64
pub fn load_brush_png_b64(id: &str) -> AnyhowResult<String> {
    let brush = crate::canvas::find_brush(id)
        .ok_or_else(|| anyhow!("unknown brush id: {}", id))?;
    let path = brush_dir().join(&brush.file_name);
    let bytes = std::fs::read(&path)
        .with_context(|| format!("read brush png {}", path.display()))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// 含缩略图的笔刷资源（前端可直接塞进 `<img src="data:image/png;base64,...">`）
#[derive(Debug, Serialize)]
pub struct BrushAsset {
    pub id: String,
    pub name_zh: String,
    pub name_en: String,
    pub category: String,
    pub default_radius: u32,
    pub falloff: f32,
    pub description: String,
    /// Base64 PNG（无 data: 前缀，前端自行拼接 `data:image/png;base64,`）
    pub png_base64: String,
    /// PNG 字节数（调试用）
    pub byte_size: usize,
}

/// `list_brushes` — 仅返回元数据
#[tauri::command]
pub async fn list_brushes() -> Result<Vec<BrushPreset>, String> {
    Ok(builtin_brushes().to_vec())
}

/// `list_brush_assets` — 返回元数据 + base64 PNG
///
/// 单文件最大 ~ 30 KB，8 个总计 ~ 130 KB；前端可在挂载时一次性 fetch。
#[tauri::command]
pub async fn list_brush_assets() -> Result<Vec<BrushAsset>, String> {
    let mut assets = Vec::with_capacity(builtin_brushes().len());
    for brush in builtin_brushes() {
        match load_brush_png_b64(&brush.id) {
            Ok(b64) => {
                let byte_size = (b64.len() * 3) / 4; // 近似解 base64
                assets.push(BrushAsset {
                    id: brush.id.clone(),
                    name_zh: brush.name_zh.clone(),
                    name_en: brush.name_en.clone(),
                    category: brush.category.as_str().to_string(),
                    default_radius: brush.default_radius,
                    falloff: brush.falloff,
                    description: brush.description.clone(),
                    png_base64: b64,
                    byte_size,
                })
            }
            Err(e) => {
                // 单个笔刷缺失不阻塞整体返回；记 warning 让前端 fallback
                tracing::warn!("brush {} load failed: {}", brush.id, e);
            }
        }
    }
    if assets.is_empty() {
        return Err("no brush assets found".to_string());
    }
    Ok(assets)
}

/// `get_brush_asset` — 单个笔刷的资源（按需加载）
#[tauri::command]
pub async fn get_brush_asset(id: String) -> Result<BrushAsset, String> {
    let brush = crate::canvas::find_brush(&id)
        .ok_or_else(|| format!("unknown brush id: {}", id))?;
    let b64 = load_brush_png_b64(&id).map_err(|e| format!("load png: {}", e))?;
    Ok(BrushAsset {
        id: brush.id.clone(),
        name_zh: brush.name_zh.clone(),
        name_en: brush.name_en.clone(),
        category: brush.category.as_str().to_string(),
        default_radius: brush.default_radius,
        falloff: brush.falloff,
        description: brush.description.clone(),
        png_base64: b64,
        byte_size: 0, // 不精确，仅前端不展示
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::canvas::DEFAULT_BRUSH_ID;

    #[test]
    fn test_brush_dir_resolves_to_dev_path() {
        // 在开发模式（Cargo 工作区根目录存在 assets/brushes/）下能解析；
        // CI 跳过（std::env 探测）
        let path = brush_dir();
        if path.exists() {
            // 至少要有 round-hard.png
            assert!(path.join("round-hard.png").exists());
        }
    }

    #[test]
    fn test_load_brush_png_b64_known_id() {
        // 仅开发模式下能跑通
        let dir = brush_dir();
        if !dir.join("round-hard.png").exists() {
            eprintln!("skipping: dev assets dir missing");
            return;
        }
        let b64 = load_brush_png_b64(DEFAULT_BRUSH_ID).expect("load must succeed");
        assert!(!b64.is_empty());
        // 验证是合法的 base64 字符
        assert!(b64.chars().all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '='));
        // 解码后应该是 PNG 签名
        use base64::Engine;
        let raw = base64::engine::general_purpose::STANDARD.decode(&b64).expect("decode");
        assert_eq!(&raw[..8], b"\x89PNG\r\n\x1a\n", "must be PNG file");
    }

    #[test]
    fn test_load_brush_png_b64_unknown_id_errors() {
        let result = load_brush_png_b64("does-not-exist");
        assert!(result.is_err());
        let msg = format!("{}", result.unwrap_err());
        assert!(msg.contains("unknown brush id"), "got: {}", msg);
    }

    #[tokio::test]
    async fn test_list_brushes_returns_all_eight() {
        let list = list_brushes().await.expect("list_brushes");
        assert_eq!(list.len(), 8);
        // ID 顺序与 BUILTIN_BRUSHES 一致
        let ids: Vec<&str> = list.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, vec![
            "round-hard", "round-soft", "chalk", "spray",
            "watercolor", "oil-paint", "marker", "blur",
        ]);
    }

    #[tokio::test]
    async fn test_get_brush_asset_round_hard() {
        let dir = brush_dir();
        if !dir.join("round-hard.png").exists() {
            eprintln!("skipping: dev assets dir missing");
            return;
        }
        let asset = get_brush_asset("round-hard".to_string()).await.expect("get");
        assert_eq!(asset.id, "round-hard");
        assert_eq!(asset.category, "hard");
        assert_eq!(asset.default_radius, 12);
        assert!(!asset.png_base64.is_empty());
    }

    #[tokio::test]
    async fn test_get_brush_asset_unknown_errors() {
        let res = get_brush_asset("nope".to_string()).await;
        assert!(res.is_err());
    }
}