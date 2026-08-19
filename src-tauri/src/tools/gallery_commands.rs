//! 图库 Tauri 命令（M-06/M-10，W3 实施）
//!
//! 提供 5 个图库相关命令：
//! - `save_to_gallery`    保存 PNG 到图库
//! - `list_gallery`       列出最近条目
//! - `search_gallery`     按标签/文本搜索
//! - `delete_gallery_item` 删除条目
//! - `get_gallery_image`  获取条目详情（含原始 PNG）

use base64::Engine;
use serde::Serialize;
use tauri::State;

use crate::gallery::{GalleryItem, GallerySearchParams, GallerySearchResult};
use crate::state::AppState;

/// 保存参数
#[derive(Debug, serde::Deserialize)]
pub struct SaveToGalleryArgs {
    pub image_data: String,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub tags: Vec<String>,
    pub group_id: Option<String>,
    pub source: Option<String>,
}

/// 保存响应
#[derive(Debug, Serialize)]
pub struct SaveResponse {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub thumbnail_path: String,
}

/// 1. 保存 PNG 到图库
#[tauri::command]
pub async fn save_to_gallery(
    state: State<'_, AppState>,
    args: SaveToGalleryArgs,
) -> Result<SaveResponse, String> {
    let engine = state.gallery_engine.read();
    let source = args.source.unwrap_or_else(|| "ai_generated".to_string());
    let item = engine
        .save(
            &args.image_data,
            args.prompt,
            args.model,
            args.tags,
            args.group_id,
            &source,
        )
        .map_err(|e| format!("save_to_gallery: {}", e))?;

    Ok(SaveResponse {
        id: item.id,
        width: item.width,
        height: item.height,
        thumbnail_path: item.thumbnail_path,
    })
}

/// 2. 列出最近条目
#[tauri::command]
pub async fn list_gallery(
    state: State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<GalleryItem>, String> {
    let engine = state.gallery_engine.read();
    let db = engine.db();
    let db = db.read();
    db.list(limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| format!("list_gallery: {}", e))
}

/// 3. 按标签/文本搜索
#[tauri::command]
pub async fn search_gallery(
    state: State<'_, AppState>,
    params: GallerySearchParams,
) -> Result<GallerySearchResult, String> {
    let engine = state.gallery_engine.read();
    let db = engine.db();
    let db = db.read();
    let limit = params.limit.unwrap_or(50);
    let items = if let Some(tag) = &params.tag {
        db.search_by_tag(tag, limit)
    } else if let Some(q) = &params.query {
        db.search(q, limit)
    } else {
        db.list(limit as u32, params.offset.unwrap_or(0) as u32)
    }
    .map_err(|e| format!("search_gallery: {}", e))?;

    let total = db.count().map_err(|e| e.to_string())?;
    Ok(GallerySearchResult { items, total })
}

/// 4. 删除条目
#[tauri::command]
pub async fn delete_gallery_item(
    state: State<'_, AppState>,
    record_id: String,
) -> Result<bool, String> {
    let engine = state.gallery_engine.read();
    let db = engine.db();
    let deleted = db
        .write()
        .delete(&record_id)
        .map_err(|e| format!("delete: {}", e))?;
    Ok(deleted)
}

/// 5. 获取条目详情（含 Base64 原始 PNG）
#[derive(Debug, Serialize)]
pub struct GalleryImageResponse {
    pub item: GalleryItem,
    pub png_base64: Option<String>,
}

#[tauri::command]
pub async fn get_gallery_image(
    state: State<'_, AppState>,
    record_id: String,
) -> Result<GalleryImageResponse, String> {
    let engine = state.gallery_engine.read();
    let db = engine.db();
    let db_lock = db.read();
    let item = db_lock
        .get(&record_id)
        .map_err(|e| format!("get: {}", e))?
        .ok_or_else(|| format!("Item not found: {}", record_id))?;

    let png_base64 = if let Some(path) = &item.full_size_path {
        let bytes = std::fs::read(path).map_err(|e| format!("read: {}", e))?;
        Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
    } else {
        None
    };

    Ok(GalleryImageResponse { item, png_base64 })
}