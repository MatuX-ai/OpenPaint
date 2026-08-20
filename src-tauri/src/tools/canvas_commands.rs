//! 画布命令集（前端 IPC 入口）
//!
//! 提供完整画布操作：
//! - 视图渲染（composite → PNG/Base64）
//! - 工具应用（画笔、橡皮、选区、移动、填充）
//! - Undo/Redo
//! - 图层管理（增删改查）
//! - 选区操作

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::canvas::{
    BlendMode, BrushTool, CanvasRenderer, CanvasTool, EraserTool, FillTool, Layer, MoveTool,
    RectSelectTool, ToolInput,
};
use crate::state::AppState;

/// 画笔笔触输入（前端调用）
#[derive(Debug, Clone, Deserialize)]
pub struct StrokeArgs {
    pub layer_id: String,
    pub points: Vec<(i32, i32)>,
    pub radius: u32,
    pub color: String, // hex
}

/// 矩形选区输入
#[derive(Debug, Clone, Deserialize)]
pub struct RectSelectArgs {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// 移动图层输入
#[derive(Debug, Clone, Deserialize)]
pub struct MoveLayerArgs {
    pub layer_id: String,
    pub dx: i32,
    pub dy: i32,
}

/// 填充图层输入
#[derive(Debug, Clone, Deserialize)]
pub struct FillLayerArgs {
    pub layer_id: String,
    pub color: String, // hex
}

/// 图层精简信息（前端展示）
#[derive(Debug, Clone, Serialize)]
pub struct LayerMeta {
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

/// 画布状态摘要（前端同步用）
#[derive(Debug, Clone, Serialize)]
pub struct CanvasSummary {
    pub width: u32,
    pub height: u32,
    pub active_layer_id: String,
    pub layers: Vec<LayerMeta>,
    pub has_selection: bool,
    pub can_undo: bool,
    pub can_redo: bool,
}

/// 获取画布当前状态摘要
#[tauri::command]
pub async fn get_canvas_summary(state: State<'_, AppState>) -> Result<CanvasSummary, String> {
    let canvas = state.canvas.read();
    Ok(CanvasSummary {
        width: canvas.width,
        height: canvas.height,
        active_layer_id: canvas.active_layer_id.to_string(),
        layers: canvas
            .layers
            .iter()
            .map(|l| LayerMeta {
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
            .collect(),
        has_selection: canvas.selection.is_some(),
        can_undo: canvas.history.can_undo(),
        can_redo: canvas.history.can_redo(),
    })
}

/// 将画布合成为 PNG Base64
#[tauri::command]
pub async fn render_canvas_png(state: State<'_, AppState>) -> Result<String, String> {
    let canvas = state.canvas.read();
    let img = CanvasRenderer::composite(&canvas).map_err(|e| format!("composite failed: {}", e))?;
    CanvasRenderer::to_base64_png(&img).map_err(|e| format!("encode failed: {}", e))
}

/// 应用画笔笔触
#[tauri::command]
pub async fn apply_brush_stroke(
    state: State<'_, AppState>,
    args: StrokeArgs,
) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let color = crate::canvas::Color::from_hex(&args.color)
        .ok_or_else(|| format!("Invalid hex color: {}", args.color))?;
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;

    canvas.push_history("brush_stroke");
    BrushTool
        .apply(
            &mut canvas,
            ToolInput::Stroke {
                layer_id,
                points: args.points,
                radius: args.radius,
                color,
            },
        )
        .map_err(|e| format!("brush apply: {}", e))
}

/// 应用橡皮笔触
#[tauri::command]
pub async fn apply_eraser_stroke(
    state: State<'_, AppState>,
    args: StrokeArgs,
) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let color =
        crate::canvas::Color::from_hex(&args.color).unwrap_or(crate::canvas::Color::TRANSPARENT);
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;

    canvas.push_history("eraser_stroke");
    EraserTool
        .apply(
            &mut canvas,
            ToolInput::Stroke {
                layer_id,
                points: args.points,
                radius: args.radius,
                color,
            },
        )
        .map_err(|e| format!("eraser apply: {}", e))
}

/// 设置矩形选区
#[tauri::command]
pub async fn set_rect_selection(
    state: State<'_, AppState>,
    args: RectSelectArgs,
) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    canvas.push_history("set_selection");
    RectSelectTool
        .apply(
            &mut canvas,
            ToolInput::RectSelect {
                x: args.x,
                y: args.y,
                width: args.width,
                height: args.height,
            },
        )
        .map_err(|e| format!("rect_select: {}", e))
}

/// 清除选区
#[tauri::command]
pub async fn clear_selection(state: State<'_, AppState>) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    canvas.selection = None;
    Ok(())
}

/// 移动图层
#[tauri::command]
pub async fn move_layer(state: State<'_, AppState>, args: MoveLayerArgs) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    canvas.push_history("move_layer");
    MoveTool
        .apply(
            &mut canvas,
            ToolInput::MoveLayer {
                layer_id,
                dx: args.dx,
                dy: args.dy,
            },
        )
        .map_err(|e| format!("move_layer: {}", e))
}

/// 填充图层
#[tauri::command]
pub async fn fill_layer(state: State<'_, AppState>, args: FillLayerArgs) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let color = crate::canvas::Color::from_hex(&args.color)
        .ok_or_else(|| format!("Invalid hex color: {}", args.color))?;
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    canvas.push_history("fill_layer");
    FillTool
        .apply(&mut canvas, ToolInput::FillLayer { layer_id, color })
        .map_err(|e| format!("fill_layer: {}", e))
}

/// Undo
#[tauri::command]
pub async fn undo_canvas(state: State<'_, AppState>) -> Result<bool, String> {
    let mut canvas = state.canvas.write();
    // 必须先把历史快照拆出来（clone 出 owned 数据），否则 history 字段的不可变借用
    // 会与 canvas.layers / canvas.active_layer_id / canvas.selection 的可变借用冲突。
    let snap_owned = canvas.history.undo().map(|s| HistorySnapshotOwned {
        layers: s.layers.clone(),
        active_layer_id: s.active_layer_id,
        selection: s.selection.clone(),
    });
    if let Some(snap) = snap_owned {
        canvas.layers = snap.layers;
        canvas.active_layer_id = snap.active_layer_id;
        canvas.selection = snap.selection;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Redo
#[tauri::command]
pub async fn redo_canvas(state: State<'_, AppState>) -> Result<bool, String> {
    let mut canvas = state.canvas.write();
    let snap_owned = canvas.history.redo().map(|s| HistorySnapshotOwned {
        layers: s.layers.clone(),
        active_layer_id: s.active_layer_id,
        selection: s.selection.clone(),
    });
    if let Some(snap) = snap_owned {
        canvas.layers = snap.layers;
        canvas.active_layer_id = snap.active_layer_id;
        canvas.selection = snap.selection;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// 历史快照的 owned 视图，用于把 HistoryStack 的不可变借用显式延长到函数结束。
struct HistorySnapshotOwned {
    layers: Vec<crate::canvas::Layer>,
    active_layer_id: uuid::Uuid,
    selection: Option<crate::canvas::Selection>,
}

/// 新增图层
#[tauri::command]
pub async fn add_layer(state: State<'_, AppState>, name: String) -> Result<String, String> {
    let mut canvas = state.canvas.write();
    canvas.push_history(format!("add_layer:{}", name));
    let id = canvas.add_layer(name);
    Ok(id.to_string())
}

/// 删除活动图层
#[tauri::command]
pub async fn remove_active_layer(state: State<'_, AppState>) -> Result<bool, String> {
    let mut canvas = state.canvas.write();
    canvas.push_history("remove_layer");
    Ok(canvas.remove_active_layer())
}

/// 设置图层可见性
#[tauri::command]
pub async fn set_layer_visibility(
    state: State<'_, AppState>,
    layer_id: String,
    visible: bool,
) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let id = Uuid::parse_str(&layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    if let Some(layer) = canvas.layers.iter_mut().find(|l| l.id == id) {
        layer.visible = visible;
        Ok(())
    } else {
        Err(format!("Layer not found: {}", layer_id))
    }
}

/// 设置活动图层
#[tauri::command]
pub async fn set_active_layer(state: State<'_, AppState>, layer_id: String) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let id = Uuid::parse_str(&layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    if canvas.layers.iter().any(|l| l.id == id) {
        canvas.active_layer_id = id;
        Ok(())
    } else {
        Err(format!("Layer not found: {}", layer_id))
    }
}

/// 调整画布尺寸（新建画布）
#[tauri::command]
pub async fn resize_canvas(
    state: State<'_, AppState>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    canvas.width = width;
    canvas.height = height;
    // 调整所有图层尺寸（重新分配缓冲）
    for layer in &mut canvas.layers {
        if layer.width != width || layer.height != height {
            let old = std::mem::replace(
                &mut layer.image_data,
                vec![0; (width * height * 4) as usize],
            );
            // 简化版：丢弃旧数据
            let _ = old;
            layer.width = width;
            layer.height = height;
        }
    }
    Ok(())
}

/// 列出可用工具
#[tauri::command]
pub async fn list_tools() -> Result<Vec<&'static str>, String> {
    Ok(vec![
        "get_canvas_selection",
        "get_selection_bounds",
        "paste_image_to_layer",
        "get_layer_info",
        "apply_brush_stroke",
        "apply_eraser_stroke",
        "set_rect_selection",
        "clear_selection",
        "move_layer",
        "fill_layer",
        "add_layer",
        "remove_active_layer",
        "set_active_layer",
        "set_layer_visibility",
        "render_canvas_png",
        "get_canvas_summary",
        "undo_canvas",
        "redo_canvas",
        "resize_canvas",
    ])
}

// 抑制未使用警告（BlendMode、Layer）
#[allow(dead_code)]
fn _types_used() {
    let _: Option<BlendMode> = None;
    let _: Option<Layer> = None;
}
