//! 画布渲染引擎
//!
//! 负责：
//! - 图层像素合并（支持混合模式）
//! - 缩略图生成
//! - PNG 导出
//! - 选区截图

use anyhow::Result;
use image::{ImageBuffer, ImageEncoder, Rgba, RgbaImage};
use tracing::{debug, warn};

use crate::canvas::{BlendMode, CanvasState, Layer, Selection};

/// 画布渲染引擎
pub struct CanvasRenderer;

impl CanvasRenderer {
    /// 将整个画布合成到一张 RgbaImage
    pub fn composite(state: &CanvasState) -> Result<RgbaImage> {
        let mut canvas: RgbaImage =
            ImageBuffer::from_pixel(state.width, state.height, Rgba([0, 0, 0, 0]));

        // 从下到上叠加图层
        for layer in &state.layers {
            if !layer.visible {
                continue;
            }
            Self::blend_layer(&mut canvas, layer)?;
        }

        Ok(canvas)
    }

    /// 渲染单个图层到目标画布
    fn blend_layer(target: &mut RgbaImage, layer: &Layer) -> Result<()> {
        if layer.width == 0 || layer.height == 0 {
            return Ok(());
        }

        let layer_img = ImageBuffer::from_raw(layer.width, layer.height, layer.image_data.clone())
            .ok_or_else(|| anyhow::anyhow!("Invalid layer image data"))?;

        // 计算目标画布的混合区域
        let (tw, th) = target.dimensions();
        let ox = layer.offset_x.max(0) as u32;
        let oy = layer.offset_y.max(0) as u32;

        // 简化版：忽略负 offset，按 fit_to 缩放后绘制
        // MVP 阶段：1:1 像素绘制
        let copy_w = layer.width.min(tw.saturating_sub(ox));
        let copy_h = layer.height.min(th.saturating_sub(oy));

        for y in 0..copy_h {
            for x in 0..copy_w {
                let src_pixel = layer_img.get_pixel(x, y);
                let tx = x + ox;
                let ty = y + oy;
                if tx >= tw || ty >= th {
                    continue;
                }
                let dst_pixel = target.get_pixel(tx, ty);
                let blended =
                    Self::blend_pixel(*dst_pixel, *src_pixel, layer.blend_mode, layer.opacity);
                target.put_pixel(tx, ty, blended);
            }
        }

        Ok(())
    }

    /// 像素混合
    fn blend_pixel(dst: Rgba<u8>, src: Rgba<u8>, mode: BlendMode, opacity: f32) -> Rgba<u8> {
        // 跳过完全透明的源像素
        if src[3] == 0 {
            return dst;
        }

        let alpha = (src[3] as f32 / 255.0) * opacity.clamp(0.0, 1.0);
        let inv_alpha = 1.0 - alpha;

        let (sr, sg, sb) = match mode {
            BlendMode::Normal => (src[0], src[1], src[2]),
            BlendMode::Multiply => {
                let r = (dst[0] as u16 * src[0] as u16) / 255;
                let g = (dst[1] as u16 * src[1] as u16) / 255;
                let b = (dst[2] as u16 * src[2] as u16) / 255;
                (r as u8, g as u8, b as u8)
            }
            BlendMode::Screen => {
                let r = 255 - (((255 - dst[0] as u16) * (255 - src[0] as u16)) / 255);
                let g = 255 - (((255 - dst[1] as u16) * (255 - src[1] as u16)) / 255);
                let b = 255 - (((255 - dst[2] as u16) * (255 - src[2] as u16)) / 255);
                (r as u8, g as u8, b as u8)
            }
            BlendMode::Overlay => {
                // Overlay = Multiply for dark, Screen for light
                let overlay_channel = |d: u8, s: u8| -> u8 {
                    if d < 128 {
                        ((d as u16 * s as u16) / 255) as u8
                    } else {
                        (255 - (((255 - d as u16) * (255 - s as u16)) / 255)) as u8
                    }
                };
                (
                    overlay_channel(dst[0], src[0]),
                    overlay_channel(dst[1], src[1]),
                    overlay_channel(dst[2], src[2]),
                )
            }
        };

        Rgba([
            (sr as f32 * alpha + dst[0] as f32 * inv_alpha) as u8,
            (sg as f32 * alpha + dst[1] as f32 * inv_alpha) as u8,
            (sb as f32 * alpha + dst[2] as f32 * inv_alpha) as u8,
            (alpha * 255.0 + dst[3] as f32 * inv_alpha) as u8,
        ])
    }

    /// 编码为 PNG 字节流
    pub fn to_png_bytes(image: &RgbaImage) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        // image 0.25 中 PngEncoder::write_image 消费 self，因此直接构造并调用即可。
        image::codecs::png::PngEncoder::new(&mut buf).write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgba8,
        )?;
        Ok(buf)
    }

    /// Base64 编码 PNG
    pub fn to_base64_png(image: &RgbaImage) -> Result<String> {
        use base64::Engine;
        let bytes = Self::to_png_bytes(image)?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
    }

    /// 生成缩略图（WebP，256px 长边，q=80）
    pub fn thumbnail(image: &RgbaImage, max_size: u32) -> Result<Vec<u8>> {
        let thumb = image::imageops::thumbnail(image, max_size, max_size);
        let mut buf = Vec::new();
        // image 0.25 中 save_with_encoder 由 ImageEncoder trait 提供，
        // 需要把 ImageEncoder trait 引入作用域（crate::canvas::engine 顶部未 import 时这里手动 use）。
        use image::ImageEncoder;
        let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut buf);
        encoder.write_image(
            thumb.as_raw(),
            thumb.width(),
            thumb.height(),
            image::ExtendedColorType::Rgba8,
        )?;
        Ok(buf)
    }

    /// 提取选区为 Base64 PNG
    pub fn extract_selection(state: &CanvasState, selection: &Selection) -> Result<String> {
        if selection.width == 0 || selection.height == 0 {
            warn!("Empty selection");
            return Err(anyhow::anyhow!("Selection is empty"));
        }

        let composed = Self::composite(state)?;
        let cropped = image::imageops::crop_imm(
            &composed,
            selection.x,
            selection.y,
            selection.width,
            selection.height,
        )
        .to_image();

        Self::to_base64_png(&cropped)
    }

    /// 将外部 PNG 数据粘贴到指定图层
    pub fn paste_image_to_layer(
        state: &mut CanvasState,
        layer_id: uuid::Uuid,
        image_data_b64: &str,
    ) -> Result<()> {
        use base64::Engine;

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(image_data_b64.trim_start_matches("data:image/png;base64,"))?;
        let img = image::load_from_memory(&bytes)?.to_rgba8();

        let layer = state
            .layers
            .iter_mut()
            .find(|l| l.id == layer_id)
            .ok_or_else(|| anyhow::anyhow!("Layer not found"))?;

        // 等比缩放至图层尺寸
        let resized = if img.width() != layer.width || img.height() != layer.height {
            image::imageops::resize(
                &img,
                layer.width,
                layer.height,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            img
        };

        layer.image_data = resized.into_raw();
        debug!("Pasted image to layer {}", layer_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_composite_empty_canvas() {
        let state = CanvasState::default();
        let result = CanvasRenderer::composite(&state);
        assert!(result.is_ok());
        let img = result.unwrap();
        assert_eq!(img.width(), 1920);
        assert_eq!(img.height(), 1080);
    }

    #[test]
    fn test_blend_pixel_normal() {
        let dst = Rgba([255, 255, 255, 255]);
        let src = Rgba([0, 0, 0, 255]);
        let result = CanvasRenderer::blend_pixel(dst, src, BlendMode::Normal, 1.0);
        // Normal blending with opacity 1.0 should produce pure source
        assert_eq!(result, Rgba([0, 0, 0, 255]));
    }

    #[test]
    fn test_blend_pixel_transparent_source() {
        let dst = Rgba([100, 100, 100, 255]);
        let src = Rgba([0, 0, 0, 0]);
        let result = CanvasRenderer::blend_pixel(dst, src, BlendMode::Normal, 1.0);
        // Transparent source should be no-op
        assert_eq!(result, dst);
    }

    #[test]
    fn test_png_encode_decode_roundtrip() {
        let img: RgbaImage = RgbaImage::from_pixel(10, 10, Rgba([255, 0, 0, 255]));
        let bytes = CanvasRenderer::to_png_bytes(&img).unwrap();
        assert!(!bytes.is_empty());
        // Verify PNG signature
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    }
}
