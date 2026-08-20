//! 画布原子工具（M-08，W3 实施）
//!
//! 提供 4 个核心原子工具供 AI Agent 调用：
//! - `get_canvas_selection`  提取当前选区为 Base64 PNG
//! - `get_selection_bounds`  获取选区边界信息
//! - `paste_image_to_layer`  将 Base64 PNG 粘贴到指定图层
//! - `get_layer_info`        获取所有图层元数据

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::canvas::CanvasRenderer;
use crate::state::AppState;

/// 选区边界信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionBounds {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub has_selection: bool,
}

/// 图层信息（精简版，供 AI 使用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerInfo {
    pub id: String,
    pub name: String,
    pub opacity: f32,
    pub blend_mode: String,
    pub visible: bool,
    pub locked: bool,
    pub width: u32,
    pub height: u32,
    pub offset_x: i32,
    pub offset_y: i32,
    pub is_active: bool,
}

/// 1. 提取当前选区为 Base64 PNG
#[tauri::command]
pub async fn get_canvas_selection(state: State<'_, AppState>) -> Result<String, String> {
    let canvas = state.canvas.read();
    let selection = canvas
        .selection
        .clone()
        .ok_or_else(|| "No active selection".to_string())?;
    CanvasRenderer::extract_selection(&canvas, &selection)
        .map_err(|e| format!("extract_selection failed: {}", e))
}

/// 2. 获取选区边界信息（不含像素）
#[tauri::command]
pub async fn get_selection_bounds(state: State<'_, AppState>) -> Result<SelectionBounds, String> {
    let canvas = state.canvas.read();
    match &canvas.selection {
        Some(sel) => Ok(SelectionBounds {
            x: sel.x,
            y: sel.y,
            width: sel.width,
            height: sel.height,
            has_selection: true,
        }),
        None => Ok(SelectionBounds {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            has_selection: false,
        }),
    }
}

/// 3. 将 Base64 PNG 粘贴到指定图层
#[tauri::command]
pub async fn paste_image_to_layer(
    state: State<'_, AppState>,
    image_data: String,
    layer_id: Option<String>,
) -> Result<String, String> {
    let mut canvas = state.canvas.write();
    canvas.push_history("paste_image_to_layer");

    // 默认粘贴到活动图层
    let target_id = match layer_id.and_then(|s| Uuid::parse_str(&s).ok()) {
        Some(id) => id,
        None => canvas.active_layer_id,
    };

    CanvasRenderer::paste_image_to_layer(&mut canvas, target_id, &image_data)
        .map_err(|e| format!("paste_image_to_layer failed: {}", e))?;

    Ok(target_id.to_string())
}

/// 4. 获取所有图层元数据
#[tauri::command]
pub async fn get_layer_info(state: State<'_, AppState>) -> Result<Vec<LayerInfo>, String> {
    let canvas = state.canvas.read();
    let infos: Vec<LayerInfo> = canvas
        .layers
        .iter()
        .map(|l| LayerInfo {
            id: l.id.to_string(),
            name: l.name.clone(),
            opacity: l.opacity,
            blend_mode: format!("{:?}", l.blend_mode),
            visible: l.visible,
            locked: l.locked,
            width: l.width,
            height: l.height,
            offset_x: l.offset_x,
            offset_y: l.offset_y,
            is_active: l.id == canvas.active_layer_id,
        })
        .collect();
    Ok(infos)
}
