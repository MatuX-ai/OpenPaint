//! 图库 MCP 工具集（M-10，W5 实施：真实工具实现）
//!
//! 当启用 `mcp-server` feature 时，
//! 将图库相关命令暴露给 Hermes Agent 作为 MCP 工具。
//!
//! 实现：直接读写 `~/.openpaint/gallery/`（同一文件系统路径），
//! 避免与 Tauri AppState 耦合，使 MCP server 可独立运行。
//!
//! 提供：
//! - `save_to_gallery`    保存 PNG 到图库（生成缩略图 + 写 SQLite）
//! - `search_gallery`     按 tag 或文本搜索
//! - `get_gallery_image`  按 ID 取原图

use anyhow::Result;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::config::AppConfig;
use crate::gallery::{GalleryDatabase, GalleryEngine};

/// 图库 MCP 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalleryMcpResult {
    pub content: Vec<McpContent>,
    #[serde(default)]
    pub is_error: bool,
}

/// MCP 内容类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContent {
    Text { text: String },
    Image { data: String, mime_type: String },
}

/// 图库工具列表（供 `tools/list` 返回）
pub fn list_gallery_tools() -> Vec<&'static str> {
    vec!["save_to_gallery", "search_gallery", "get_gallery_image"]
}

/// 处理图库工具调用（同步版本，供 `bin/mcp.rs` 使用）
pub fn dispatch_gallery_tool(
    name: &str,
    params: serde_json::Value,
) -> Result<GalleryMcpResult, String> {
    match name {
        "save_to_gallery" => {
            let image_data = params
                .get("image_data")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "image_data required".to_string())?;
            let prompt = params
                .get("prompt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let model = params
                .get("model")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let tags: Vec<String> = params
                .get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let group_id = params
                .get("group_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let (engine, _db_path) = open_gallery_engine().map_err(|e| e.to_string())?;
            let item = engine
                .save(image_data, prompt, model, tags, group_id, "ai_generated")
                .map_err(|e| format!("save: {}", e))?;
            Ok(GalleryMcpResult {
                content: vec![McpContent::Text {
                    text: format!(
                        "{{\"id\": \"{}\", \"width\": {}, \"height\": {}, \"thumbnail_path\": \"{}\"}}",
                        item.id, item.width, item.height, item.thumbnail_path
                    ),
                }],
                is_error: false,
            })
        }
        "search_gallery" => {
            let query = params
                .get("query")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let tag = params
                .get("tag")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;

            let (db, _dir) = open_gallery_db().map_err(|e| e.to_string())?;
            let items = if let Some(tag) = tag {
                db.search_by_tag(&tag, limit)
                    .map_err(|e| format!("search: {}", e))?
            } else if let Some(q) = query {
                db.search(&q, limit).map_err(|e| format!("search: {}", e))?
            } else {
                db.list(limit as u32, 0)
                    .map_err(|e| format!("list: {}", e))?
            };
            let total = db.count().map_err(|e| e.to_string())?;
            Ok(GalleryMcpResult {
                content: vec![McpContent::Text {
                    text: format!(
                        "{{\"total\": {}, \"items\": {}}}",
                        total,
                        serde_json::to_string(&items).unwrap_or_else(|_| "[]".into())
                    ),
                }],
                is_error: false,
            })
        }
        "get_gallery_image" => {
            let record_id = params
                .get("record_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "record_id required".to_string())?;

            let (db, _dir) = open_gallery_db().map_err(|e| e.to_string())?;
            let item = db
                .get(record_id)
                .map_err(|e| format!("get: {}", e))?
                .ok_or_else(|| format!("Item not found: {}", record_id))?;

            let png_b64 = if let Some(path) = &item.full_size_path {
                let bytes = std::fs::read(path).map_err(|e| format!("read: {}", e))?;
                base64::engine::general_purpose::STANDARD.encode(&bytes)
            } else {
                String::new()
            };

            Ok(GalleryMcpResult {
                content: vec![
                    McpContent::Text {
                        text: format!(
                            "{{\"id\": \"{}\", \"width\": {}, \"height\": {}, \"tags\": {}}}",
                            item.id,
                            item.width,
                            item.height,
                            serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".into())
                        ),
                    },
                    McpContent::Image {
                        data: png_b64,
                        mime_type: "image/png".into(),
                    },
                ],
                is_error: false,
            })
        }
        _ => Err(format!("Unknown gallery tool: {}", name)),
    }
}

/// 打开图库数据库（独立路径，无 Tauri AppState 依赖）
fn open_gallery_db() -> Result<(GalleryDatabase, std::path::PathBuf), String> {
    let cfg = AppConfig::load().map_err(|e| format!("config: {}", e))?;
    let home = dirs::home_dir().ok_or_else(|| "no home dir".to_string())?;
    // 与 state.rs 中的路径保持一致：~/.openpaint/gallery/gallery.db
    let dir = home.join(".openpaint").join("gallery");
    let db_path = dir.join("gallery.db");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir gallery: {}", e))?;
    std::fs::create_dir_all(dir.join("originals"))
        .map_err(|e| format!("mkdir originals: {}", e))?;
    std::fs::create_dir_all(dir.join("thumbnails")).map_err(|e| format!("mkdir thumbs: {}", e))?;
    let db = GalleryDatabase::open(&db_path).map_err(|e| format!("db open: {}", e))?;
    let _ = cfg; // 当前实现下 cfg 仅用于触发初始化路径
    Ok((db, dir))
}

/// 打开完整图库引擎（save_to_gallery 需要 thumbnails 写入）
fn open_gallery_engine() -> Result<(GalleryEngine, std::path::PathBuf), String> {
    use parking_lot::RwLock;
    use std::sync::Arc;

    let dir = {
        let (_db, dir) = open_gallery_db()?;
        dir
    };
    let db =
        GalleryDatabase::open(&dir.join("gallery.db")).map_err(|e| format!("db open: {}", e))?;
    let engine = GalleryEngine::new(Arc::new(RwLock::new(db)), dir.clone());
    engine
        .ensure_dirs()
        .map_err(|e| format!("ensure_dirs: {}", e))?;
    Ok((engine, dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_gallery_tools() {
        let tools = list_gallery_tools();
        assert_eq!(tools.len(), 3);
        assert!(tools.contains(&"save_to_gallery"));
        assert!(tools.contains(&"search_gallery"));
        assert!(tools.contains(&"get_gallery_image"));
    }

    #[test]
    fn test_dispatch_unknown_tool() {
        let r = dispatch_gallery_tool("not_a_tool", serde_json::json!({}));
        assert!(r.is_err());
    }
}
