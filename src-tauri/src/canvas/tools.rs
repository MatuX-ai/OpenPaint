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
    /// 填充整图层
    FillLayer { layer_id: Uuid, color: Color },
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
}
