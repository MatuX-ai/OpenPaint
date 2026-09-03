//! 画布命令集（前端 IPC 入口）
//!
//! 提供完整画布操作：
//! - 视图渲染（composite → PNG/Base64）
//! - 工具应用（画笔、橡皮、选区、移动、旋转、填充、文字）
//! - Undo/Redo
//! - 图层管理（增删改查）
//! - 选区操作

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::canvas::{
    BlendMode, BrushTool, CanvasRenderer, CanvasTool, EraserTool, FillTool, Layer, MoveTool,
    RectSelectTool, RotateTool, TextTool, ToolInput,
};
use crate::state::AppState;

use super::ai_commands::render_svg_to_png_internal;

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

/// 旋转图层输入
#[derive(Debug, Clone, Deserialize)]
pub struct RotateLayerArgs {
    pub layer_id: String,
    pub degrees: f32,
}

/// 添加文字输入
#[derive(Debug, Clone, Deserialize)]
pub struct AddTextArgs {
    pub layer_id: String,
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub font_size: f32,
    pub color: String, // hex
    pub font_family: Option<String>,
    pub font_weight: Option<String>,
}

/// 添加文字响应（返回实际光栅化的位图尺寸，方便前端同步显示）
#[derive(Debug, Clone, Serialize)]
pub struct AddTextResponse {
    pub bitmap_width: u32,
    pub bitmap_height: u32,
}

/// 文字栅格化输入（应用层注入位图）
#[derive(Debug, Clone, Deserialize)]
pub struct PasteTextBitmapArgs {
    pub layer_id: String,
    /// RGBA 行序 bytes（base64 编码）
    pub bitmap_base64: String,
    pub bitmap_width: u32,
    pub bitmap_height: u32,
    pub x: i32,
    pub y: i32,
}

/// 设置图层混合模式输入
#[derive(Debug, Clone, Deserialize)]
pub struct SetLayerBlendModeArgs {
    pub layer_id: String,
    /// "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
    pub mode: String,
}

/// 设置图层锁定状态输入
#[derive(Debug, Clone, Deserialize)]
pub struct SetLayerLockedArgs {
    pub layer_id: String,
    pub locked: bool,
}

/// 设置图层不透明度输入
#[derive(Debug, Clone, Deserialize)]
pub struct SetLayerOpacityArgs {
    pub layer_id: String,
    /// 0.0 - 1.0；越界会被裁剪
    pub opacity: f32,
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

/// 渲染参数：`format` 支持 png / jpg / webp；`quality` 1-100，png 忽略；
/// `target_long_edge` 长边像素，0 表示保持原画布尺寸。
#[derive(Debug, Clone, Deserialize)]
pub struct RenderImageArgs {
    pub format: String,
    #[serde(default = "default_quality")]
    pub quality: u8,
    #[serde(default)]
    pub target_long_edge: u32,
}

fn default_quality() -> u8 {
    90
}

/// 渲染响应：bytes + base64 + format + mime + width + height
#[derive(Debug, Clone, Serialize)]
pub struct RenderImageResponse {
    pub format: String,
    pub mime: String,
    pub bytes_base64: String,
    pub width: u32,
    pub height: u32,
    pub byte_size: usize,
}

/// 把画布按指定格式渲染为字节流（Base64）。
#[tauri::command]
pub async fn render_canvas_image(
    state: State<'_, AppState>,
    args: RenderImageArgs,
) -> Result<RenderImageResponse, String> {
    let canvas = state.canvas.read();
    let composed =
        CanvasRenderer::composite(&canvas).map_err(|e| format!("composite failed: {}", e))?;
    let resized = CanvasRenderer::resize_to_long_edge(&composed, args.target_long_edge);
    let bytes = CanvasRenderer::render_image(&resized, &args.format, args.quality)
        .map_err(|e| format!("encode failed: {}", e))?;
    let format_lower = args.format.to_ascii_lowercase();
    let mime = match format_lower.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return Err(format!("Unsupported format: {}", args.format)),
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(RenderImageResponse {
        format: format_lower,
        mime: mime.to_string(),
        bytes_base64: b64,
        width: resized.width(),
        height: resized.height(),
        byte_size: bytes.len(),
    })
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

/// 旋转图层（以图层中心为支点，正数=顺时针）
#[tauri::command]
pub async fn rotate_layer(state: State<'_, AppState>, args: RotateLayerArgs) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    if !args.degrees.is_finite() {
        return Err("degrees must be a finite number".to_string());
    }
    canvas.push_history("rotate_layer");
    RotateTool
        .apply(
            &mut canvas,
            ToolInput::RotateLayer {
                layer_id,
                degrees: args.degrees,
            },
        )
        .map_err(|e| format!("rotate_layer: {}", e))
}

/// 在指定图层栅格化并贴入文字
///
/// 实现思路：拼装 SVG `<text>` 元素 → 复用 `render_svg_to_png_internal`
/// 走 usvg / resvg 渲到 RGBA 位图 → 再用 TextTool 源-over 合成到目标图层。
/// 包含多行文本（按 `\n` 拆分），行高 = font_size * 1.2。
#[tauri::command]
pub async fn add_text(
    state: State<'_, AppState>,
    args: AddTextArgs,
) -> Result<AddTextResponse, String> {
    use base64::Engine;
    let font_size = if args.font_size <= 0.0 {
        return Err("font_size must be > 0".to_string());
    } else {
        args.font_size
    };
    let font_family = args
        .font_family
        .clone()
        .unwrap_or_else(|| "sans-serif".to_string());
    let font_weight = args
        .font_weight
        .clone()
        .unwrap_or_else(|| "normal".to_string());

    // 行高 = fontSize * 1.2；根据行数计算画布高；宽按最长行估算
    let lines: Vec<&str> = args.text.split('\n').collect();
    let line_height = font_size * 1.2;
    let canvas_h = (line_height * lines.len() as f32).ceil() as u32 + 8;
    // 宽度估算：ASCII 0.6 / 中日韩 1.0 / 其它 0.55 占比系数
    let est_width = lines
        .iter()
        .map(|l| {
            l.chars()
                .map(|c| {
                    let cp = c as u32;
                    if (0x4E00..=0x9FFF).contains(&cp)              // CJK 统一汉字
                        || (0x3000..=0x303F).contains(&cp)          // CJK 符号
                        || (0xFF00..=0xFFEF).contains(&cp)
                    // 全角
                    {
                        font_size * 1.0
                    } else if cp < 128 {
                        font_size * 0.55
                    } else {
                        font_size * 0.6
                    }
                })
                .sum::<f32>()
        })
        .fold(0.0f32, f32::max)
        + 16.0;
    let canvas_w = est_width.ceil() as u32;

    // 构造 SVG。`xml:space="preserve"` 让多空格 / 缩进被保留
    let safe_family = font_family.replace('"', "&quot;");
    let tspans = lines
        .iter()
        .enumerate()
        .map(|(i, line)| {
            let ly = font_size + (i as f32) * line_height;
            let escaped = line
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;");
            format!(r#"<tspan x="0" y="{:.2}">{}</tspan>"#, ly, escaped)
        })
        .collect::<Vec<_>>()
        .join("");
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><text x="0" y="0" font-family="{family}" font-weight="{weight}" font-size="{size:.2}" fill="{color}" xml:space="preserve">{tspans}</text></svg>"#,
        w = canvas_w,
        h = canvas_h,
        family = safe_family,
        weight = font_weight,
        size = font_size,
        color = args.color,
        tspans = tspans
    );

    // 渲染 SVG → base64 PNG
    let png_b64 = render_svg_to_png_internal(&svg, canvas_w, canvas_h)
        .map_err(|e| format!("render: {}", e))?;
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode(&png_b64)
        .map_err(|e| format!("decode png: {}", e))?;
    let img = ::image::load_from_memory(&png_bytes).map_err(|e| format!("decode image: {}", e))?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let bitmap = rgba.into_raw();

    let mut canvas = state.canvas.write();
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    canvas.push_history("add_text");
    TextTool
        .apply(
            &mut canvas,
            ToolInput::AddText {
                layer_id,
                bitmap,
                bitmap_width: w,
                bitmap_height: h,
                x: args.x,
                y: args.y,
            },
        )
        .map_err(|e| format!("add_text: {}", e))?;
    Ok(AddTextResponse {
        bitmap_width: w,
        bitmap_height: h,
    })
}

/// 将已经栅格化的 RGBA 位图粘贴到图层（测试与高级自定义场景使用）
#[tauri::command]
pub async fn paste_text_bitmap(
    state: State<'_, AppState>,
    args: PasteTextBitmapArgs,
) -> Result<(), String> {
    use base64::Engine;
    if args.bitmap_width == 0 || args.bitmap_height == 0 {
        return Err("bitmap_width / bitmap_height must be > 0".to_string());
    }
    let expected = (args.bitmap_width as usize) * (args.bitmap_height as usize) * 4;
    let bitmap = base64::engine::general_purpose::STANDARD
        .decode(&args.bitmap_base64)
        .map_err(|e| format!("decode base64: {}", e))?;
    if bitmap.len() != expected {
        return Err(format!(
            "bitmap size mismatch: got {} bytes, expected {}",
            bitmap.len(),
            expected
        ));
    }
    let mut canvas = state.canvas.write();
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    canvas.push_history("paste_text_bitmap");
    TextTool
        .apply(
            &mut canvas,
            ToolInput::AddText {
                layer_id,
                bitmap,
                bitmap_width: args.bitmap_width,
                bitmap_height: args.bitmap_height,
                x: args.x,
                y: args.y,
            },
        )
        .map_err(|e| format!("paste_text_bitmap: {}", e))
}

/// 设置图层混合模式
#[tauri::command]
pub async fn set_layer_blend_mode(
    state: State<'_, AppState>,
    args: SetLayerBlendModeArgs,
) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    let mode =
        parse_blend_mode(&args.mode).ok_or_else(|| format!("Unknown blend mode: {}", args.mode))?;
    canvas.push_history("set_layer_blend_mode");
    if let Some(layer) = canvas.layers.iter_mut().find(|l| l.id == layer_id) {
        layer.blend_mode = mode;
        Ok(())
    } else {
        Err(format!("Layer {} not found", args.layer_id))
    }
}

fn parse_blend_mode(s: &str) -> Option<BlendMode> {
    match s.to_ascii_lowercase().as_str() {
        "normal" | "source-over" | "src-over" => Some(BlendMode::Normal),
        "multiply" => Some(BlendMode::Multiply),
        "screen" => Some(BlendMode::Screen),
        "overlay" => Some(BlendMode::Overlay),
        _ => None,
    }
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

/// 设置图层锁定状态
#[tauri::command]
pub async fn set_layer_locked(
    state: State<'_, AppState>,
    args: SetLayerLockedArgs,
) -> Result<(), String> {
    let mut canvas = state.canvas.write();
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    canvas.push_history("set_layer_locked");
    if let Some(layer) = canvas.layers.iter_mut().find(|l| l.id == layer_id) {
        layer.locked = args.locked;
        Ok(())
    } else {
        Err(format!("Layer not found: {}", args.layer_id))
    }
}

/// 设置图层不透明度（0.0 - 1.0，越界裁剪）
#[tauri::command]
pub async fn set_layer_opacity(
    state: State<'_, AppState>,
    args: SetLayerOpacityArgs,
) -> Result<(), String> {
    if !args.opacity.is_finite() {
        return Err("opacity must be a finite number".to_string());
    }
    let clamped = args.opacity.clamp(0.0, 1.0);
    let mut canvas = state.canvas.write();
    let layer_id =
        Uuid::parse_str(&args.layer_id).map_err(|e| format!("Invalid layer id: {}", e))?;
    canvas.push_history("set_layer_opacity");
    if let Some(layer) = canvas.layers.iter_mut().find(|l| l.id == layer_id) {
        layer.opacity = clamped;
        Ok(())
    } else {
        Err(format!("Layer not found: {}", args.layer_id))
    }
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
        "set_layer_locked",
        "set_layer_opacity",
        "set_layer_blend_mode",
        "rotate_layer",
        "add_text",
        "paste_text_bitmap",
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // --------------------------------------------------------------------
    // parse_blend_mode：覆盖正常别名 + 未知回退
    // --------------------------------------------------------------------

    #[test]
    fn test_parse_blend_mode_normal_aliases() {
        assert_eq!(parse_blend_mode("normal"), Some(BlendMode::Normal));
        assert_eq!(parse_blend_mode("Normal"), Some(BlendMode::Normal));
        assert_eq!(parse_blend_mode("NORMAL"), Some(BlendMode::Normal));
        assert_eq!(parse_blend_mode("source-over"), Some(BlendMode::Normal));
        assert_eq!(parse_blend_mode("src-over"), Some(BlendMode::Normal));
    }

    #[test]
    fn test_parse_blend_mode_multiply_screen_overlay() {
        assert_eq!(parse_blend_mode("multiply"), Some(BlendMode::Multiply));
        assert_eq!(parse_blend_mode("screen"), Some(BlendMode::Screen));
        assert_eq!(parse_blend_mode("overlay"), Some(BlendMode::Overlay));
        // 大小写不敏感
        assert_eq!(parse_blend_mode("Multiply"), Some(BlendMode::Multiply));
    }

    #[test]
    fn test_parse_blend_mode_unknown_returns_none() {
        assert_eq!(parse_blend_mode("darken"), None);
        assert_eq!(parse_blend_mode("lighten"), None);
        assert_eq!(parse_blend_mode(""), None);
        assert_eq!(parse_blend_mode("src"), None);
        assert_eq!(parse_blend_mode("foo"), None);
    }

    #[test]
    fn test_parse_blend_mode_trims_whitespace_via_lowercase() {
        // parse_blend_mode 不 trim，但 to_ascii_lowercase 不会去除内部空格
        assert_eq!(parse_blend_mode("multi ply"), None);
    }

    // --------------------------------------------------------------------
    // StrokeArgs / MoveLayerArgs / FillLayerArgs 等 IPC args 反序列化
    // --------------------------------------------------------------------

    #[test]
    fn test_stroke_args_deserialize() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "points": [[0, 0], [10, 10], [20, 5]],
            "radius": 4,
            "color": "#ff0000"
        });
        let args: StrokeArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.radius, 4);
        assert_eq!(args.color, "#ff0000");
        assert_eq!(args.points, vec![(0, 0), (10, 10), (20, 5)]);
    }

    #[test]
    fn test_stroke_args_missing_field_fails() {
        // radius 缺失
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "points": [],
            "color": "#000"
        });
        let r: Result<StrokeArgs, _> = serde_json::from_value(json);
        assert!(r.is_err());
    }

    #[test]
    fn test_rect_select_args_deserialize() {
        let json = json!({"x": 10, "y": 20, "width": 100, "height": 50});
        let args: RectSelectArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.x, 10);
        assert_eq!(args.y, 20);
        assert_eq!(args.width, 100);
        assert_eq!(args.height, 50);
    }

    #[test]
    fn test_move_layer_args_deserialize() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "dx": -5,
            "dy": 7
        });
        let args: MoveLayerArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.dx, -5);
        assert_eq!(args.dy, 7);
    }

    #[test]
    fn test_fill_layer_args_deserialize() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "color": "#aabbcc"
        });
        let args: FillLayerArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.color, "#aabbcc");
    }

    #[test]
    fn test_rotate_layer_args_deserialize() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "degrees": 90.0
        });
        let args: RotateLayerArgs = serde_json::from_value(json).unwrap();
        assert!((args.degrees - 90.0).abs() < 1e-6);
    }

    #[test]
    fn test_rotate_layer_args_negative_degrees() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "degrees": -45.0
        });
        let args: RotateLayerArgs = serde_json::from_value(json).unwrap();
        assert!(args.degrees < 0.0);
    }

    #[test]
    fn test_add_text_args_minimal() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "text": "hello",
            "x": 0,
            "y": 0,
            "font_size": 24.0,
            "color": "#000"
        });
        let args: AddTextArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.text, "hello");
        assert_eq!(args.font_size, 24.0);
        assert!(args.font_family.is_none());
        assert!(args.font_weight.is_none());
    }

    #[test]
    fn test_add_text_args_with_family_weight() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "text": "你好",
            "x": 10,
            "y": 20,
            "font_size": 32.0,
            "color": "#fff",
            "font_family": "Arial",
            "font_weight": "bold"
        });
        let args: AddTextArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.font_family.as_deref(), Some("Arial"));
        assert_eq!(args.font_weight.as_deref(), Some("bold"));
        assert_eq!(args.text, "你好");
    }

    #[test]
    fn test_paste_text_bitmap_args_deserialize() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "bitmap_base64": "AAAA",
            "bitmap_width": 4,
            "bitmap_height": 4,
            "x": 0,
            "y": 0
        });
        let args: PasteTextBitmapArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.bitmap_base64, "AAAA");
        assert_eq!(args.bitmap_width, 4);
    }

    #[test]
    fn test_set_layer_blend_mode_args_deserialize() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "mode": "multiply"
        });
        let args: SetLayerBlendModeArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.mode, "multiply");
    }

    #[test]
    fn test_set_layer_locked_args_deserialize_true() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "locked": true
        });
        let args: SetLayerLockedArgs = serde_json::from_value(json).unwrap();
        assert!(args.locked);
    }

    #[test]
    fn test_set_layer_locked_args_deserialize_false() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "locked": false
        });
        let args: SetLayerLockedArgs = serde_json::from_value(json).unwrap();
        assert!(!args.locked);
    }

    #[test]
    fn test_set_layer_locked_args_missing_field_fails() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000"
        });
        let r: Result<SetLayerLockedArgs, _> = serde_json::from_value(json);
        assert!(r.is_err(), "缺少 locked 字段应反序列化失败");
    }

    #[test]
    fn test_set_layer_opacity_args_deserialize_normal() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "opacity": 0.5
        });
        let args: SetLayerOpacityArgs = serde_json::from_value(json).unwrap();
        assert!((args.opacity - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_set_layer_opacity_args_deserialize_zero_one() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000",
            "opacity": 1.0
        });
        let args: SetLayerOpacityArgs = serde_json::from_value(json).unwrap();
        assert!((args.opacity - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_set_layer_opacity_args_missing_field_fails() {
        let json = json!({
            "layer_id": "550e8400-e29b-41d4-a716-446655440000"
        });
        let r: Result<SetLayerOpacityArgs, _> = serde_json::from_value(json);
        assert!(r.is_err(), "缺少 opacity 字段应反序列化失败");
    }

    #[test]
    fn test_render_image_args_defaults() {
        let json = json!({"format": "png"});
        let args: RenderImageArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.format, "png");
        assert_eq!(args.quality, 90, "quality 默认 90");
        assert_eq!(
            args.target_long_edge, 0,
            "target_long_edge 默认 0 表示保持原尺寸"
        );
    }

    #[test]
    fn test_render_image_args_explicit() {
        let json = json!({
            "format": "webp",
            "quality": 75,
            "target_long_edge": 800
        });
        let args: RenderImageArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.format, "webp");
        assert_eq!(args.quality, 75);
        assert_eq!(args.target_long_edge, 800);
    }

    #[test]
    fn test_render_image_args_quality_zero_uses_default() {
        // serde default 在缺失时才生效；显式 0 会保留。
        let json = json!({"format": "png", "quality": 0});
        let args: RenderImageArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.quality, 0);
    }

    // --------------------------------------------------------------------
    // LayerMeta / CanvasSummary / RenderImageResponse 序列化
    // --------------------------------------------------------------------

    #[test]
    fn test_layer_meta_serializes_all_fields() {
        let meta = LayerMeta {
            id: "abc".to_string(),
            name: "Layer 1".to_string(),
            opacity: 0.5,
            blend_mode: "Normal".to_string(),
            visible: true,
            locked: false,
            width: 100,
            height: 50,
            offset_x: -3,
            offset_y: 7,
            is_active: true,
        };
        let v = serde_json::to_value(&meta).unwrap();
        assert_eq!(v["id"], "abc");
        assert_eq!(v["name"], "Layer 1");
        assert_eq!(v["opacity"], 0.5);
        assert_eq!(v["visible"], true);
        assert_eq!(v["locked"], false);
        assert_eq!(v["is_active"], true);
        assert_eq!(v.as_object().unwrap().len(), 11, "LayerMeta 共 11 个字段");
    }

    #[test]
    fn test_render_image_response_serializes() {
        let r = RenderImageResponse {
            format: "png".into(),
            mime: "image/png".into(),
            bytes_base64: "AAAA".into(),
            width: 32,
            height: 32,
            byte_size: 4,
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["format"], "png");
        assert_eq!(v["mime"], "image/png");
        assert_eq!(v["bytes_base64"], "AAAA");
        assert_eq!(v["width"], 32);
        assert_eq!(v["byte_size"], 4);
    }

    #[test]
    fn test_add_text_response_serializes() {
        let r = AddTextResponse {
            bitmap_width: 64,
            bitmap_height: 32,
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["bitmap_width"], 64);
        assert_eq!(v["bitmap_height"], 32);
    }

    // --------------------------------------------------------------------
    // list_tools 命令：返回全部 IPC 名
    // --------------------------------------------------------------------

    #[tokio::test]
    async fn test_list_tools_returns_expected_names() {
        let tools = list_tools().await.unwrap();
        // 必须包含核心命令
        for required in [
            "apply_brush_stroke",
            "set_rect_selection",
            "add_layer",
            "remove_active_layer",
            "undo_canvas",
            "redo_canvas",
            "render_canvas_png",
            "get_canvas_summary",
            // W13 UX 验收补齐：锁定 / 不透明度 / 混合模式
            "set_layer_locked",
            "set_layer_opacity",
            "set_layer_blend_mode",
            "set_layer_visibility",
            "rotate_layer",
            "add_text",
            "paste_text_bitmap",
        ] {
            assert!(tools.contains(&required), "list_tools 缺少 {}", required);
        }
        assert!(tools.len() >= 15, "工具数量应 >= 15，当前 {}", tools.len());
        // 不应有重复
        let mut sorted = tools.clone();
        sorted.sort();
        let before = sorted.len();
        sorted.dedup();
        assert_eq!(sorted.len(), before, "工具列表不应重复");
    }
}
