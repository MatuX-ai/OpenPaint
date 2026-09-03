//! 画布工具实现（画笔、橡皮、矩形选区、移动、变形）
//!
//! 工具通过修改图层像素数据工作。
//! 所有工具遵循 `(tool_input) -> Result<()> + HistorySnapshot` 模式，
//! 便于 Undo/Redo 集成。

use anyhow::Result;
use tracing::debug;
use uuid::Uuid;

use crate::canvas::{CanvasState, Layer, Selection};

/// 颜色（RGBA 0-255）
#[derive(Debug, Clone, Copy)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Color {
    pub const TRANSPARENT: Color = Color {
        r: 0,
        g: 0,
        b: 0,
        a: 0,
    };
    pub const BLACK: Color = Color {
        r: 0,
        g: 0,
        b: 0,
        a: 255,
    };
    pub const WHITE: Color = Color {
        r: 255,
        g: 255,
        b: 255,
        a: 255,
    };

    pub fn from_hex(hex: &str) -> Option<Self> {
        let hex = hex.trim_start_matches('#');
        if hex.len() != 6 && hex.len() != 8 {
            return None;
        }
        let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
        let a = if hex.len() == 8 {
            u8::from_str_radix(&hex[6..8], 16).ok()?
        } else {
            255
        };
        Some(Color { r, g, b, a })
    }
}

/// 工具操作输入
#[derive(Debug, Clone)]
pub enum ToolInput {
    /// 画笔/橡皮涂抹一笔
    Stroke {
        layer_id: Uuid,
        points: Vec<(i32, i32)>,
        radius: u32,
        color: Color,
    },
    /// 矩形选区
    RectSelect {
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
    /// 移动图层
    MoveLayer { layer_id: Uuid, dx: i32, dy: i32 },
    /// 旋转图层（以图层中心为支点，正数=顺时针）
    RotateLayer { layer_id: Uuid, degrees: f32 },
    /// 填充整图层
    FillLayer { layer_id: Uuid, color: Color },
    /// 文字栅格化输入（pre-rendered RGBA buffer，0..bitmap_width*bitmap_height*4）
    AddText {
        layer_id: Uuid,
        bitmap: Vec<u8>,
        bitmap_width: u32,
        bitmap_height: u32,
        x: i32,
        y: i32,
    },
}

/// 工具 trait
pub trait CanvasTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()>;
}

/// 画笔工具
pub struct BrushTool;

impl CanvasTool for BrushTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()> {
        if let ToolInput::Stroke {
            layer_id,
            points,
            radius,
            color,
        } = input
        {
            let layer = state
                .layers
                .iter_mut()
                .find(|l| l.id == layer_id)
                .ok_or_else(|| anyhow::anyhow!("Layer not found"))?;

            for &(px, py) in &points {
                Self::draw_brush_dot(layer, px, py, radius, color);
            }
            debug!("BrushTool applied {} points", points.len());
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid input for BrushTool"))
        }
    }
}

impl BrushTool {
    /// 在图层上画一个圆形笔触
    fn draw_brush_dot(layer: &mut Layer, cx: i32, cy: i32, radius: u32, color: Color) {
        let r = radius as i32;
        let r2 = r * r;
        let lw = layer.width as i32;
        let lh = layer.height as i32;

        for dy in -r..=r {
            for dx in -r..=r {
                let dist2 = dx * dx + dy * dy;
                if dist2 > r2 {
                    continue;
                }

                let px = cx + dx;
                let py = cy + dy;
                if px < 0 || py < 0 || px >= lw || py >= lh {
                    continue;
                }

                // 抗锯齿：边缘按距离衰减 alpha
                let edge_alpha = 1.0 - (dist2 as f32 / r2 as f32);
                let a = ((color.a as f32) * edge_alpha).min(255.0) as u8;

                let idx = ((py * lw + px) * 4) as usize;
                if idx + 3 < layer.image_data.len() {
                    layer.image_data[idx] = color.r;
                    layer.image_data[idx + 1] = color.g;
                    layer.image_data[idx + 2] = color.b;
                    layer.image_data[idx + 3] = a;
                }
            }
        }
    }
}

/// 橡皮工具（基于画笔，但颜色为透明）
pub struct EraserTool;

impl CanvasTool for EraserTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()> {
        if let ToolInput::Stroke {
            layer_id,
            points,
            radius,
            ..
        } = input
        {
            let layer = state
                .layers
                .iter_mut()
                .find(|l| l.id == layer_id)
                .ok_or_else(|| anyhow::anyhow!("Layer not found"))?;

            let transparent = Color::TRANSPARENT;
            for &(px, py) in &points {
                BrushTool::draw_brush_dot(layer, px, py, radius, transparent);
            }
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid input for EraserTool"))
        }
    }
}

/// 矩形选区工具
pub struct RectSelectTool;

impl CanvasTool for RectSelectTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()> {
        if let ToolInput::RectSelect {
            x,
            y,
            width,
            height,
        } = input
        {
            // 边界裁剪
            let x = x.min(state.width);
            let y = y.min(state.height);
            let width = width.min(state.width - x);
            let height = height.min(state.height - y);

            let data = if width > 0 && height > 0 {
                let composed = crate::canvas::engine::CanvasRenderer::composite(state)?;
                let cropped = image::imageops::crop_imm(&composed, x, y, width, height).to_image();
                Some(cropped.into_raw())
            } else {
                None
            };

            state.selection = Some(Selection {
                x,
                y,
                width,
                height,
                data,
            });
            debug!("RectSelect set: {}x{} at ({},{})", width, height, x, y);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid input for RectSelectTool"))
        }
    }
}

/// 移动工具
pub struct MoveTool;

impl CanvasTool for MoveTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()> {
        if let ToolInput::MoveLayer { layer_id, dx, dy } = input {
            let layer = state
                .layers
                .iter_mut()
                .find(|l| l.id == layer_id)
                .ok_or_else(|| anyhow::anyhow!("Layer not found"))?;
            layer.offset_x += dx;
            layer.offset_y += dy;
            debug!("MoveLayer {} by ({}, {})", layer_id, dx, dy);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid input for MoveTool"))
        }
    }
}

/// 填充工具
pub struct FillTool;

impl CanvasTool for FillTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()> {
        if let ToolInput::FillLayer { layer_id, color } = input {
            let layer = state
                .layers
                .iter_mut()
                .find(|l| l.id == layer_id)
                .ok_or_else(|| anyhow::anyhow!("Layer not found"))?;
            let pixel_count = (layer.width as usize) * (layer.height as usize);
            layer.image_data = vec![0; pixel_count * 4];
            for i in 0..pixel_count {
                let idx = i * 4;
                layer.image_data[idx] = color.r;
                layer.image_data[idx + 1] = color.g;
                layer.image_data[idx + 2] = color.b;
                layer.image_data[idx + 3] = color.a;
            }
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid input for FillTool"))
        }
    }
}

/// 旋转工具
///
/// 以图层中心为旋转中心，正角度 = 顺时针。实现策略：
///   - 对 90 / 180 / 270 这三个常用整数倍进行交换优化（精确不失真）；
///   - 其他角度走双线性采样，保证输出尺寸与原图层一致（越界部分裁掉）。
///
/// 为什么不调用 `image::imageops::rotate270_in_place` 之类的in-place函数：
/// 它们会调整画布尺寸，而我们要求旋转后画布仍与原图层同尺寸（周边填充透明）。
pub struct RotateTool;

impl CanvasTool for RotateTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()> {
        if let ToolInput::RotateLayer { layer_id, degrees } = input {
            let layer = state
                .layers
                .iter_mut()
                .find(|l| l.id == layer_id)
                .ok_or_else(|| anyhow::anyhow!("Layer not found"))?;
            Self::rotate_in_place(layer, degrees);
            debug!("RotateTool applied {} degrees to layer {}", degrees, layer_id);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid input for RotateTool"))
        }
    }
}

impl RotateTool {
    fn rotate_in_place(layer: &mut Layer, degrees: f32) {
        let w = layer.width as i32;
        let h = layer.height as i32;
        // 归一化到 [0, 360)
        let mut deg = degrees % 360.0;
        if deg < 0.0 {
            deg += 360.0;
        }
        let snap = deg.round() as i32;
        // 快捷路径：90/180/270
        match snap {
            0 => return,
            90 => {
                let rotated = rotate_90(&layer.image_data, w, h);
                layer.image_data = rotated;
                return;
            }
            180 => {
                let rotated = rotate_180(&layer.image_data, w, h);
                layer.image_data = rotated;
                return;
            }
            270 => {
                let rotated = rotate_270(&layer.image_data, w, h);
                layer.image_data = rotated;
                return;
            }
            _ => {}
        }
        // 任意角度：反向映射 + 双线性采样
        let rad = -deg.to_radians(); // 画布上的旋转 vs 坐标变换的方向反向
        let cos_a = rad.cos();
        let sin_a = rad.sin();
        let cx = w as f32 / 2.0;
        let cy = h as f32 / 2.0;
        let src = &layer.image_data;
        let mut dst = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w {
                let dx = x as f32 - cx;
                let dy = y as f32 - cy;
                let sx = cos_a * dx - sin_a * dy + cx;
                let sy = sin_a * dx + cos_a * dy + cy;
                let pixel = bilinear_sample(src, w, h, sx, sy);
                let idx = ((y * w + x) * 4) as usize;
                dst[idx] = pixel[0];
                dst[idx + 1] = pixel[1];
                dst[idx + 2] = pixel[2];
                dst[idx + 3] = pixel[3];
            }
        }
        layer.image_data = dst;
    }
}

/// 顺时针 90° 旋转（保持画布尺寸不变，周边填充透明）。
fn rotate_90(src: &[u8], w: i32, h: i32) -> Vec<u8> {
    let mut dst = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            // (x, y) → dst 的 (h - 1 - y, x) 顺时针
            let nx = h - 1 - y;
            let ny = x;
            if nx >= 0 && nx < w && ny >= 0 && ny < h {
                let s_idx = ((y * w + x) * 4) as usize;
                let d_idx = ((ny * w + nx) * 4) as usize;
                dst[d_idx..d_idx + 4].copy_from_slice(&src[s_idx..s_idx + 4]);
            }
        }
    }
    dst
}

fn rotate_180(src: &[u8], w: i32, h: i32) -> Vec<u8> {
    let mut dst = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let nx = w - 1 - x;
            let ny = h - 1 - y;
            let s_idx = ((y * w + x) * 4) as usize;
            let d_idx = ((ny * w + nx) * 4) as usize;
            dst[d_idx..d_idx + 4].copy_from_slice(&src[s_idx..s_idx + 4]);
        }
    }
    dst
}

fn rotate_270(src: &[u8], w: i32, h: i32) -> Vec<u8> {
    let mut dst = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let nx = y;
            let ny = w - 1 - x;
            if nx >= 0 && nx < w && ny >= 0 && ny < h {
                let s_idx = ((y * w + x) * 4) as usize;
                let d_idx = ((ny * w + nx) * 4) as usize;
                dst[d_idx..d_idx + 4].copy_from_slice(&src[s_idx..s_idx + 4]);
            }
        }
    }
    dst
}

/// 双线性采样（带 alpha 预乘合成，输出非预乘）。越界返回透明。
fn bilinear_sample(src: &[u8], w: i32, h: i32, sx: f32, sy: f32) -> [u8; 4] {
    if sx < 0.0 || sy < 0.0 || sx > (w - 1) as f32 || sy > (h - 1) as f32 {
        return [0, 0, 0, 0];
    }
    let x0 = sx.floor() as i32;
    let y0 = sy.floor() as i32;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);
    let fx = sx - x0 as f32;
    let fy = sy - y0 as f32;
    let p00 = read_pixel(src, w, x0, y0);
    let p10 = read_pixel(src, w, x1, y0);
    let p01 = read_pixel(src, w, x0, y1);
    let p11 = read_pixel(src, w, x1, y1);
    let mut out = [0u8; 4];
    for c in 0..4 {
        let v = p00[c] as f32 * (1.0 - fx) * (1.0 - fy)
            + p10[c] as f32 * fx * (1.0 - fy)
            + p01[c] as f32 * (1.0 - fx) * fy
            + p11[c] as f32 * fx * fy;
        out[c] = v.round().clamp(0.0, 255.0) as u8;
    }
    out
}

#[inline]
fn read_pixel(src: &[u8], w: i32, x: i32, y: i32) -> [u8; 4] {
    let idx = ((y * w + x) * 4) as usize;
    [src[idx], src[idx + 1], src[idx + 2], src[idx + 3]]
}

/// 文字工具
///
/// 接收已栅格化的 RGBA 位图（由 `tools::canvas_commands::add_text` 调
/// `render_svg_to_png_internal` 拼装 SVG `<text>` 后产出），按 `(x, y)` 位置
/// 粘贴到目标图层，越界部分自动裁剪，alpha=0 处不覆盖原像素（保留背景）。
pub struct TextTool;

impl CanvasTool for TextTool {
    fn apply(&self, state: &mut CanvasState, input: ToolInput) -> Result<()> {
        if let ToolInput::AddText {
            layer_id,
            bitmap,
            bitmap_width,
            bitmap_height,
            x,
            y,
        } = input
        {
            let layer = state
                .layers
                .iter_mut()
                .find(|l| l.id == layer_id)
                .ok_or_else(|| anyhow::anyhow!("Layer not found"))?;
            let lw = layer.width as i32;
            let lh = layer.height as i32;
            let bw = bitmap_width as i32;
            let bh = bitmap_height as i32;
            let expected = (bw * bh * 4) as usize;
            if bitmap.len() != expected {
                return Err(anyhow::anyhow!(
                    "Text bitmap size mismatch: got {} bytes, expected {} ({}x{}x4)",
                    bitmap.len(),
                    expected,
                    bw,
                    bh
                ));
            }
            for by in 0..bh {
                let ty = y + by;
                if ty < 0 || ty >= lh {
                    continue;
                }
                for bx in 0..bw {
                    let tx = x + bx;
                    if tx < 0 || tx >= lw {
                        continue;
                    }
                    let s_idx = ((by * bw + bx) * 4) as usize;
                    let a = bitmap[s_idx + 3];
                    if a == 0 {
                        continue;
                    }
                    let d_idx = ((ty * lw + tx) * 4) as usize;
                    // Source-over alpha 合成：保留底色 + 文字颜色按 alpha 混合
                    let sa = a as u32;
                    let da = layer.image_data[d_idx + 3] as u32;
                    let out_a = sa + (da * (255 - sa)) / 255;
                    if out_a == 0 {
                        continue;
                    }
                    for c in 0..3 {
                        let sc = bitmap[s_idx + c] as u32;
                        let dc = layer.image_data[d_idx + c] as u32;
                        let v = (sc * sa + dc * da * (255 - sa) / 255) / out_a;
                        layer.image_data[d_idx + c] = v.min(255) as u8;
                    }
                    layer.image_data[d_idx + 3] = out_a.min(255) as u8;
                }
            }
            debug!(
                "TextTool pasted {}x{} bitmap at ({},{}) into layer {}",
                bw, bh, x, y, layer_id
            );
            Ok(())
        } else {
            Err(anyhow::anyhow!("Invalid input for TextTool"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_color_from_hex() {
        let c = Color::from_hex("#ff8040").unwrap();
        assert_eq!(c.r, 255);
        assert_eq!(c.g, 0x80);
        assert_eq!(c.b, 0x40);
        assert_eq!(c.a, 255);
    }

    #[test]
    fn test_brush_applies() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        let tool = BrushTool;
        let result = tool.apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: vec![(100, 100), (110, 110)],
                radius: 5,
                color: Color::from_hex("#ff0000").unwrap(),
            },
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_rect_select() {
        let mut state = CanvasState::default();
        let tool = RectSelectTool;
        tool.apply(
            &mut state,
            ToolInput::RectSelect {
                x: 10,
                y: 10,
                width: 100,
                height: 100,
            },
        )
        .unwrap();
        assert!(state.selection.is_some());
        assert_eq!(state.selection.as_ref().unwrap().width, 100);
    }

    // ----------------------------------------------------------------
    // 补充测试：Color 解析 / 各工具边界用例 / 防御性编程
    // ----------------------------------------------------------------

    #[test]
    fn test_color_from_hex_invalid_inputs() {
        // 长度不对 / 字符非 16 进制都应返回 None
        assert!(Color::from_hex("").is_none());
        assert!(Color::from_hex("#").is_none());
        assert!(Color::from_hex("#ff").is_none());
        assert!(Color::from_hex("#fffff").is_none()); // 5 位
        assert!(Color::from_hex("#fffffff").is_none()); // 7 位
        assert!(Color::from_hex("#zzzzzz").is_none()); // 非法字符
        // 注：实现使用 trim_start_matches('#')，所以不写 # 也是合法
        assert!(Color::from_hex("ff8040").is_some());
        assert!(Color::from_hex("ff804080").is_some());
        // 0 / O 之类是合法 16 进制数字
        assert!(Color::from_hex("#0f0f0f").is_some());
    }

    #[test]
    fn test_color_from_hex_with_alpha() {
        // 8 位 hex 应正确解析 alpha
        let c = Color::from_hex("#ff804080").unwrap();
        assert_eq!(c.r, 255);
        assert_eq!(c.g, 0x80);
        assert_eq!(c.b, 0x40);
        assert_eq!(c.a, 0x80);
    }

    #[test]
    fn test_color_from_hex_strips_leading_hash() {
        // #abc123 与 abc123 必须等价
        let a = Color::from_hex("#abcdef").unwrap();
        let b = Color::from_hex("abcdef").unwrap();
        assert_eq!((a.r, a.g, a.b, a.a), (b.r, b.g, b.b, b.a));
    }

    #[test]
    fn test_color_constants() {
        assert_eq!((Color::TRANSPARENT.r, Color::TRANSPARENT.g, Color::TRANSPARENT.b, Color::TRANSPARENT.a), (0, 0, 0, 0));
        assert_eq!((Color::BLACK.r, Color::BLACK.g, Color::BLACK.b, Color::BLACK.a), (0, 0, 0, 255));
        assert_eq!((Color::WHITE.r, Color::WHITE.g, Color::WHITE.b, Color::WHITE.a), (255, 255, 255, 255));
    }

    #[test]
    fn test_brush_invalid_input_returns_error() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        // BrushTool 收到非 Stroke 输入应报错
        let res = BrushTool.apply(
            &mut state,
            ToolInput::FillLayer {
                layer_id,
                color: Color::WHITE,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_brush_unknown_layer_errors() {
        let mut state = CanvasState::default();
        let bogus = uuid::Uuid::new_v4();
        let res = BrushTool.apply(
            &mut state,
            ToolInput::Stroke {
                layer_id: bogus,
                points: vec![(10, 10)],
                radius: 4,
                color: Color::BLACK,
            },
        );
        assert!(res.is_err(), "brush on missing layer should error");
    }

    #[test]
    fn test_brush_out_of_bounds_clipped_safely() {
        // 越界点应被裁剪而非 panic
        let mut state = CanvasState::new(32, 32);
        let layer_id = state.active_layer_id;
        BrushTool
            .apply(
                &mut state,
                ToolInput::Stroke {
                    layer_id,
                    points: vec![(-1000, -1000), (1000, 1000), (15, 15)],
                    radius: 3,
                    color: Color::BLACK,
                },
            )
            .expect("out-of-bounds should be clipped");
        // 中心点 (15,15) 应被画上
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        let idx = ((15 * 32 + 15) * 4) as usize;
        assert_eq!(layer.image_data[idx + 3], 255, "center pixel should be opaque");
    }

    #[test]
    fn test_brush_antialiased_edge_has_lower_alpha() {
        // 抗锯齿：边缘像素 alpha 应小于中心
        let mut state = CanvasState::new(32, 32);
        let layer_id = state.add_layer("AA");
        BrushTool
            .apply(
                &mut state,
                ToolInput::Stroke {
                    layer_id,
                    points: vec![(15, 15)],
                    radius: 6,
                    color: Color::BLACK,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        let center_a = layer.image_data[((15 * 32 + 15) * 4 + 3) as usize];
        let edge_a = layer.image_data[((15 * 32 + 21) * 4 + 3) as usize];
        assert!(center_a > edge_a, "edge alpha {} should be less than center {}", edge_a, center_a);
    }

    #[test]
    fn test_eraser_invalid_input_returns_error() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        let res = EraserTool.apply(
            &mut state,
            ToolInput::MoveLayer {
                layer_id,
                dx: 1,
                dy: 1,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_eraser_unknown_layer_errors() {
        let mut state = CanvasState::default();
        let bogus = uuid::Uuid::new_v4();
        let res = EraserTool.apply(
            &mut state,
            ToolInput::Stroke {
                layer_id: bogus,
                points: vec![(0, 0)],
                radius: 4,
                color: Color::TRANSPARENT,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_rect_select_invalid_input_errors() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        let res = RectSelectTool.apply(
            &mut state,
            ToolInput::FillLayer {
                layer_id,
                color: Color::BLACK,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_rect_select_clamps_to_canvas_bounds() {
        // x/y/width/height 越界应被 clamp 到画布内
        let mut state = CanvasState::new(100, 100);
        RectSelectTool
            .apply(
                &mut state,
                ToolInput::RectSelect {
                    x: 80,
                    y: 80,
                    width: 1000,
                    height: 1000,
                },
            )
            .unwrap();
        let sel = state.selection.unwrap();
        // 80 + min(1000, 100-80)=20 = 100，不越界
        assert_eq!(sel.x, 80);
        assert_eq!(sel.y, 80);
        assert!(sel.x + sel.width <= state.width);
        assert!(sel.y + sel.height <= state.height);
    }

    #[test]
    fn test_rect_select_zero_size_yields_no_data() {
        // width=0 或 height=0 → data 为 None，不报 Err
        let mut state = CanvasState::new(64, 64);
        RectSelectTool
            .apply(
                &mut state,
                ToolInput::RectSelect {
                    x: 10,
                    y: 10,
                    width: 0,
                    height: 5,
                },
            )
            .unwrap();
        let sel = state.selection.unwrap();
        assert_eq!(sel.width, 0);
        assert!(sel.data.is_none());
    }

    #[test]
    fn test_move_invalid_input_returns_error() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        let res = MoveTool.apply(
            &mut state,
            ToolInput::FillLayer {
                layer_id,
                color: Color::WHITE,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_move_zero_offset_is_noop() {
        let mut state = CanvasState::new(64, 64);
        let layer_id = state.add_layer("X");
        MoveTool
            .apply(
                &mut state,
                ToolInput::MoveLayer {
                    layer_id,
                    dx: 0,
                    dy: 0,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        assert_eq!(layer.offset_x, 0);
        assert_eq!(layer.offset_y, 0);
    }

    #[test]
    fn test_move_negative_dx_dy_works() {
        let mut state = CanvasState::new(64, 64);
        let layer_id = state.add_layer("N");
        MoveTool
            .apply(
                &mut state,
                ToolInput::MoveLayer {
                    layer_id,
                    dx: -100,
                    dy: -50,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        assert_eq!(layer.offset_x, -100);
        assert_eq!(layer.offset_y, -50);
    }

    #[test]
    fn test_fill_invalid_input_returns_error() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        let res = FillTool.apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: vec![(0, 0)],
                radius: 1,
                color: Color::BLACK,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_fill_with_transparent_color_writes_zero_alpha() {
        // alpha=0 的填充应把所有像素 alpha 设为 0（视觉上透明）
        let mut state = CanvasState::new(8, 8);
        let layer_id = state.add_layer("T");
        FillTool
            .apply(
                &mut state,
                ToolInput::FillLayer {
                    layer_id,
                    color: Color::TRANSPARENT,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        // 每个像素 alpha 应为 0
        for chunk in layer.image_data.chunks_exact(4) {
            assert_eq!(chunk[3], 0);
        }
    }

    #[test]
    fn test_fill_replaces_existing_pixels() {
        // 填充应覆盖已有像素，不是叠加
        let mut state = CanvasState::new(8, 8);
        let layer_id = state.add_layer("R");
        // 先填红
        FillTool
            .apply(
                &mut state,
                ToolInput::FillLayer {
                    layer_id,
                    color: Color { r: 255, g: 0, b: 0, a: 255 },
                },
            )
            .unwrap();
        // 再填蓝
        FillTool
            .apply(
                &mut state,
                ToolInput::FillLayer {
                    layer_id,
                    color: Color { r: 0, g: 0, b: 255, a: 255 },
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        let chunk0 = &layer.image_data[0..4];
        assert_eq!(chunk0[0], 0);
        assert_eq!(chunk0[2], 255);
    }

    #[test]
    fn test_rotate_invalid_input_returns_error() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        let res = RotateTool.apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: vec![(0, 0)],
                radius: 1,
                color: Color::WHITE,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_rotate_zero_degrees_is_noop() {
        let mut state = CanvasState::new(8, 8);
        let layer_id = state.add_layer("R0");
        // 在 (1,1) 写一个不透明红
        let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
        layer.image_data[((1 * 8 + 1) * 4) as usize] = 255;
        layer.image_data[((1 * 8 + 1) * 4 + 3) as usize] = 255;
        RotateTool
            .apply(&mut state, ToolInput::RotateLayer { layer_id, degrees: 0.0 })
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        // 像素位置应不变
        assert_eq!(layer.image_data[((1 * 8 + 1) * 4 + 3) as usize], 255);
    }

    #[test]
    fn test_rotate_negative_degrees_normalized() {
        // 负角度应被归一化到 [0, 360)，行为与正向角度一致
        let mut state = CanvasState::new(8, 8);
        let layer_id = state.add_layer("R-90");
        let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
        layer.image_data[((2 * 8 + 2) * 4) as usize] = 255;
        layer.image_data[((2 * 8 + 2) * 4 + 3) as usize] = 255;
        // -90 应归一化到 270°。根据 rotate_270: src (x=2, y=2) → dst (nx=y=2, ny=w-1-x=5)
        RotateTool
            .apply(
                &mut state,
                ToolInput::RotateLayer {
                    layer_id,
                    degrees: -90.0,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        // 像素应到达 dst (nx=2, ny=5)
        assert_eq!(layer.image_data[((5 * 8 + 2) * 4 + 3) as usize], 255);
    }

    #[test]
    fn test_rotate_360_is_identity() {
        // 360° = identity
        let mut state = CanvasState::new(8, 8);
        let layer_id = state.add_layer("R360");
        let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
        layer.image_data[((3 * 8 + 3) * 4) as usize] = 255;
        layer.image_data[((3 * 8 + 3) * 4 + 3) as usize] = 255;
        RotateTool
            .apply(
                &mut state,
                ToolInput::RotateLayer {
                    layer_id,
                    degrees: 360.0,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        assert_eq!(layer.image_data[((3 * 8 + 3) * 4 + 3) as usize], 255);
    }

    #[test]
    fn test_rotate_720_equivalent_to_identity() {
        // 720° 与 360° 行为一致
        let mut state = CanvasState::new(8, 8);
        let layer_id = state.add_layer("R720");
        let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
        layer.image_data[((4 * 8 + 4) * 4) as usize] = 255;
        layer.image_data[((4 * 8 + 4) * 4 + 3) as usize] = 255;
        RotateTool
            .apply(
                &mut state,
                ToolInput::RotateLayer {
                    layer_id,
                    degrees: 720.0,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        assert_eq!(layer.image_data[((4 * 8 + 4) * 4 + 3) as usize], 255);
    }

    #[test]
    fn test_text_invalid_input_returns_error() {
        let mut state = CanvasState::default();
        let layer_id = state.active_layer_id;
        let res = TextTool.apply(
            &mut state,
            ToolInput::Stroke {
                layer_id,
                points: vec![(0, 0)],
                radius: 1,
                color: Color::WHITE,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_text_unknown_layer_errors() {
        let mut state = CanvasState::default();
        let bogus = uuid::Uuid::new_v4();
        let res = TextTool.apply(
            &mut state,
            ToolInput::AddText {
                layer_id: bogus,
                bitmap: vec![0; 4 * 4 * 4],
                bitmap_width: 4,
                bitmap_height: 4,
                x: 0,
                y: 0,
            },
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_text_size_mismatch_errors() {
        // bitmap 长度与 width*height*4 不一致应报错
        let mut state = CanvasState::default();
        let bogus = state.active_layer_id;
        let res = TextTool.apply(
            &mut state,
            ToolInput::AddText {
                layer_id: bogus,
                bitmap: vec![0; 3 * 3 * 4],
                bitmap_width: 4,
                bitmap_height: 4,
                x: 0,
                y: 0,
            },
        );
        assert!(res.is_err(), "bitmap size mismatch should error");
    }

    #[test]
    fn test_text_alpha_blending_with_background() {
        // 文字位图应与底色做源-over 合成，alpha=255 完全覆盖底色
        let mut state = CanvasState::new(64, 64);
        let layer_id = state.add_layer("T");
        // 底色涂绿
        FillTool
            .apply(
                &mut state,
                ToolInput::FillLayer {
                    layer_id,
                    color: Color { r: 0, g: 255, b: 0, a: 255 },
                },
            )
            .unwrap();
        // 4×4 红色文字位图粘贴到 (10,10)
        let mut bitmap = Vec::with_capacity(4 * 4 * 4);
        for _ in 0..(4 * 4) {
            bitmap.extend_from_slice(&[255, 0, 0, 255]);
        }
        TextTool
            .apply(
                &mut state,
                ToolInput::AddText {
                    layer_id,
                    bitmap,
                    bitmap_width: 4,
                    bitmap_height: 4,
                    x: 10,
                    y: 10,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        let idx = ((11 * 64 + 11) * 4) as usize;
        // alpha=255 完全覆盖，原绿被替换为红
        assert_eq!(layer.image_data[idx], 255, "R channel");
        assert_eq!(layer.image_data[idx + 1], 0, "G channel");
        assert_eq!(layer.image_data[idx + 2], 0, "B channel");
        assert_eq!(layer.image_data[idx + 3], 255, "alpha=255");
    }

    #[test]
    fn test_text_partially_transparent_does_not_clobber_background() {
        // alpha<255 的像素必须与底色合成而非直接覆盖
        let mut state = CanvasState::new(64, 64);
        let layer_id = state.add_layer("PT");
        FillTool
            .apply(
                &mut state,
                ToolInput::FillLayer {
                    layer_id,
                    color: Color::BLACK,
                },
            )
            .unwrap();
        // 半透明红色 4x4
        let mut bitmap = Vec::with_capacity(4 * 4 * 4);
        for _ in 0..(4 * 4) {
            bitmap.extend_from_slice(&[255, 0, 0, 128]);
        }
        TextTool
            .apply(
                &mut state,
                ToolInput::AddText {
                    layer_id,
                    bitmap,
                    bitmap_width: 4,
                    bitmap_height: 4,
                    x: 10,
                    y: 10,
                },
            )
            .unwrap();
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        let idx = ((11 * 64 + 11) * 4) as usize;
        // 合成公式：out_R = (255*128 + 0*255*(255-128)/255) / out_a
        // 不直接断言具体数值，只确认 R 通道小于 255（半透明没完全覆盖）
        assert!(layer.image_data[idx] < 255, "半透明红色像素不应完全覆盖底色");
        assert!(layer.image_data[idx + 3] > 0, "合成后 alpha 仍 > 0");
    }
}
