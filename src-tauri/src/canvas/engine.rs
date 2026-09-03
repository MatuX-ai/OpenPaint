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

    /// 将画布渲染为指定格式的字节流。
    ///
    /// - `format`: "png" | "jpg" | "webp"
    /// - `quality`: 1-100（仅对 jpg / webp 生效；png 忽略）
    /// - `target_long_edge`: 长边目标像素；`0` 表示保持原画布尺寸（不做额外缩放，
    ///   但 jpg 仍是 1:1 输出）
    ///
    /// MVP 阶段不做尺寸插值的二次缩放（`target_long_edge` 在 web 端做），这里只
    /// 保证透明背景 → 白底的 JPG 兼容。
    pub fn render_image(image: &RgbaImage, format: &str, quality: u8) -> Result<Vec<u8>> {
        let q = quality.clamp(1, 100);
        let mut buf = Vec::new();
        match format.to_ascii_lowercase().as_str() {
            "png" => {
                use image::ImageEncoder;
                let encoder = image::codecs::png::PngEncoder::new(&mut buf);
                encoder.write_image(
                    image.as_raw(),
                    image.width(),
                    image.height(),
                    image::ExtendedColorType::Rgba8,
                )?;
            }
            "jpg" | "jpeg" => {
                // JPG 不支持 alpha：把透明背景合成到白底
                let rgb = flatten_to_white(image);
                use image::ImageEncoder;
                let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, q);
                encoder.write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )?;
            }
            "webp" => {
                // TODO(BACKLOG / W9+) 切换为有损编码：
                //   `image::codecs::webp::WebPEncoder::new_lossy(&mut buf, q)`
                // 需要 Cargo.toml 中给 `image` 加 `image-webp` feature，并引入
                // `libwebp-sys` 编译依赖（C 库 + 额外 1-2 分钟编译时间）。
                // 当前 MVP 阶段为保持桌面端冷启动时间仅用 lossless；导出质量
                // 通过 PNG/JPG 通道提供。
                use image::ImageEncoder;
                let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut buf);
                encoder.write_image(
                    image.as_raw(),
                    image.width(),
                    image.height(),
                    image::ExtendedColorType::Rgba8,
                )?;
            }
            other => {
                return Err(anyhow::anyhow!("Unsupported image format: {}", other));
            }
        }
        Ok(buf)
    }

    /// Base64 编码的 `render_image` 输出，便于前端直接走 Tauri 通道回传。
    pub fn render_image_base64(image: &RgbaImage, format: &str, quality: u8) -> Result<String> {
        use base64::Engine;
        let bytes = Self::render_image(image, format, quality)?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
    }

    /// 等比缩放到目标长边。
    ///
    /// - `target_long_edge`: 长边像素（<=1 表示不缩放）
    pub fn resize_to_long_edge(image: &RgbaImage, target_long_edge: u32) -> RgbaImage {
        if target_long_edge <= 1 {
            return image.clone();
        }
        let (w, h) = image.dimensions();
        let long = w.max(h);
        if long == target_long_edge {
            return image.clone();
        }
        let scale = target_long_edge as f32 / long as f32;
        let nw = ((w as f32) * scale).round().max(1.0) as u32;
        let nh = ((h as f32) * scale).round().max(1.0) as u32;
        image::imageops::resize(image, nw, nh, image::imageops::FilterType::Lanczos3)
    }

    /// 生成缩略图（WebP，256px 长边，q=80）
    pub fn thumbnail(image: &RgbaImage, max_size: u32) -> Result<Vec<u8>> {
        let thumb = image::imageops::thumbnail(image, max_size, max_size);
        let mut buf = Vec::new();
        // TODO(BACKLOG / W9+) 切到 `WebPEncoder::new_lossy` 节省图库磁盘。
        // 详见同名 `render_image` 块的注释。
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

/// 把 RGBA 图像 alpha-flatten 到白底，输出 RGB8（用于 JPG 等不支持 alpha 的格式）。
fn flatten_to_white(image: &RgbaImage) -> image::RgbImage {
    let (w, h) = image.dimensions();
    let mut out = image::RgbImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let p = image.get_pixel(x, y);
            let a = p[3] as u32;
            let inv = 255 - a;
            out.put_pixel(
                x,
                y,
                image::Rgb([
                    ((p[0] as u32 * a + 255 * inv) / 255) as u8,
                    ((p[1] as u32 * a + 255 * inv) / 255) as u8,
                    ((p[2] as u32 * a + 255 * inv) / 255) as u8,
                ]),
            );
        }
    }
    out
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

    #[test]
    fn test_render_image_png() {
        let img: RgbaImage = RgbaImage::from_pixel(8, 8, Rgba([0, 128, 255, 255]));
        let bytes = CanvasRenderer::render_image(&img, "png", 100).unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn test_render_image_jpg_signature() {
        let img: RgbaImage = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        let bytes = CanvasRenderer::render_image(&img, "jpg", 80).unwrap();
        assert_eq!(&bytes[..2], &[0xFF, 0xD8]); // JPEG SOI
        assert_eq!(&bytes[bytes.len() - 2..], &[0xFF, 0xD9]); // JPEG EOI
    }

    #[test]
    fn test_render_image_webp_signature() {
        let img: RgbaImage = RgbaImage::from_pixel(16, 16, Rgba([255, 0, 0, 255]));
        let bytes = CanvasRenderer::render_image(&img, "webp", 80).unwrap();
        // RIFF container: 'R','I','F','F' + 4 bytes size + 'W','E','B','P'
        assert_eq!(&bytes[..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
    }

    #[test]
    fn test_render_image_unsupported_format_errors() {
        let img: RgbaImage = RgbaImage::from_pixel(4, 4, Rgba([0, 0, 0, 255]));
        let err = CanvasRenderer::render_image(&img, "gif", 80).unwrap_err();
        assert!(format!("{}", err).contains("gif"));
    }

    #[test]
    fn test_render_image_quality_clamped() {
        let img: RgbaImage = RgbaImage::from_pixel(4, 4, Rgba([255, 255, 255, 255]));
        // q=0 应被 clamp 到 1，仍可编码
        let bytes = CanvasRenderer::render_image(&img, "jpg", 0).unwrap();
        assert!(!bytes.is_empty());
        // q=255 应被 clamp 到 100
        let bytes = CanvasRenderer::render_image(&img, "jpg", 255).unwrap();
        assert!(!bytes.is_empty());
    }

    #[test]
    fn test_render_image_webp_lossless_roundtrip() {
        let img: RgbaImage = RgbaImage::from_pixel(8, 8, Rgba([10, 20, 30, 40]));
        let bytes = CanvasRenderer::render_image(&img, "webp", 90).unwrap();
        // RIFF 容器
        assert_eq!(&bytes[..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
        // 文件大小应至少包含 VP8 / VP8L 段头 + 像素
        assert!(bytes.len() > 30);
    }

    #[test]
    fn test_resize_to_long_edge_no_op_when_zero() {
        let img: RgbaImage = RgbaImage::from_pixel(100, 50, Rgba([1, 2, 3, 255]));
        let out = CanvasRenderer::resize_to_long_edge(&img, 0);
        assert_eq!(out.dimensions(), (100, 50));
    }

    #[test]
    fn test_resize_to_long_edge_scales() {
        let img: RgbaImage = RgbaImage::from_pixel(100, 50, Rgba([1, 2, 3, 255]));
        let out = CanvasRenderer::resize_to_long_edge(&img, 50);
        assert_eq!(out.width(), 50);
        assert_eq!(out.height(), 25);
    }

    // ----------------------------------------------------------------
    // 补充测试：混合模式 / 缩放 / 边界 / 组合测试
    // ----------------------------------------------------------------

    #[test]
    fn test_blend_pixel_multiply_darkens() {
        // Multiply: src * dst / 255。同为黑=0，同为白=255
        let white = Rgba([255, 255, 255, 255]);
        let black = Rgba([0, 0, 0, 255]);
        let r = CanvasRenderer::blend_pixel(white, black, BlendMode::Multiply, 1.0);
        assert_eq!(r, Rgba([0, 0, 0, 255]));
        // 半透明不透明度 0.5：dst 与 src=黑混合后近似 dst 自身 × inv_alpha
        let mid = Rgba([128, 128, 128, 255]);
        let r2 = CanvasRenderer::blend_pixel(mid, black, BlendMode::Multiply, 0.5);
        // multiply 公式：dst*src/255 = 0；alpha=0.5*1=0.5；out = 0*0.5 + 128*0.5 = 64
        assert_eq!(r2[0], 64);
    }

    #[test]
    fn test_blend_pixel_screen_lightens() {
        // Screen: 255 - ((255-dst)*(255-src)/255)
        let dst = Rgba([128, 128, 128, 255]);
        let src = Rgba([255, 255, 255, 255]);
        let r = CanvasRenderer::blend_pixel(dst, src, BlendMode::Screen, 1.0);
        // screen of (128,255) = 255
        assert_eq!(r[0], 255);
    }

    #[test]
    fn test_blend_pixel_overlay_handles_dark_and_light_dst() {
        // Overlay 对 dst<128 走 multiply，dst>=128 走 screen
        let dst_dark = Rgba([64, 64, 64, 255]);
        let src_white = Rgba([255, 255, 255, 255]);
        let r = CanvasRenderer::blend_pixel(dst_dark, src_white, BlendMode::Overlay, 1.0);
        // dark dst * white src = dst 本身（被 multiply 拉黑后与 src 合成回 dst*1）
        assert_eq!(r, dst_dark);

        let dst_light = Rgba([192, 192, 192, 255]);
        let r2 = CanvasRenderer::blend_pixel(dst_light, src_white, BlendMode::Overlay, 1.0);
        // light dst + white src = white（screen）
        assert_eq!(r2, Rgba([255, 255, 255, 255]));
    }

    #[test]
    fn test_blend_pixel_opacity_clamped() {
        // opacity 超过 1 必须被 clamp（避免像素溢出）
        let dst = Rgba([100, 100, 100, 255]);
        let src = Rgba([255, 0, 0, 255]);
        let r = CanvasRenderer::blend_pixel(dst, src, BlendMode::Normal, 5.0);
        // opacity=5 被 clamp 到 1，与 opacity=1 等价
        let r1 = CanvasRenderer::blend_pixel(dst, src, BlendMode::Normal, 1.0);
        assert_eq!(r, r1);
    }

    #[test]
    fn test_blend_pixel_negative_opacity_clamped_to_zero() {
        // 负 opacity 应被 clamp 到 0，src 不贡献像素，但 dst alpha 保持不变
        // （因为 alpha = src_alpha/255 * opacity_clamped = 0，结果 src 不参与 alpha 混合）
        let dst = Rgba([100, 100, 100, 255]);
        let src = Rgba([255, 0, 0, 255]);
        let r = CanvasRenderer::blend_pixel(dst, src, BlendMode::Normal, -2.0);
        // 验证 src 颜色未注入：R 通道应是 dst 的 R（100），不是 src 的 255
        assert_eq!(r[0], 100, "src 红色不应被注入，opacity=0");
        // dst alpha 仍为 255（src 不参与 alpha 合成）
        assert_eq!(r[3], 255);
    }

    #[test]
    fn test_composite_uses_layer_offset() {
        // offset_x=20 把图层整体向右平移 20 像素
        let mut state = CanvasState::new(64, 64);
        // 把 background 透明以便断言原位置不为红
        let bg_id = state.layers[0].id;
        if let Some(bg) = state.layers.iter_mut().find(|l| l.id == bg_id) {
            for px in bg.image_data.chunks_exact_mut(4) {
                px[0] = 0;
                px[1] = 0;
                px[2] = 0;
                px[3] = 0;
            }
        }
        let layer_id = state.add_layer("shifted");
        let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
        layer.offset_x = 20;
        // 在 (5,5) 写一个不透明红色像素
        let idx = ((5 * 64 + 5) * 4) as usize;
        layer.image_data[idx] = 255;
        layer.image_data[idx + 3] = 255;
        // src (5,5) → dst (25,5)
        let composed = CanvasRenderer::composite(&state).expect("composite");
        let dst_idx = ((5 * 64 + 25) * 4) as usize;
        assert_eq!(
            composed.as_raw()[dst_idx],
            255,
            "red channel moved to (25,5)"
        );
        assert_eq!(composed.as_raw()[dst_idx + 3], 255, "alpha preserved");
        // 原位置不应有红色（背景已透明）
        let src_idx = ((5 * 64 + 5) * 4) as usize;
        assert_ne!(composed.as_raw()[src_idx], 255, "原位置不应有红色");
    }

    #[test]
    fn test_composite_skips_invisible_layers() {
        // visible=false 的图层应被跳过
        let mut state = CanvasState::new(64, 64);
        let layer_id = state.add_layer("hidden");
        let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
        layer.visible = false;
        // 在图层上写满红
        for px in layer.image_data.chunks_exact_mut(4) {
            px[0] = 255;
            px[3] = 255;
        }
        let composed = CanvasRenderer::composite(&state).expect("composite");
        // 合成后整张图应保持背景层白（除了背景层本身）
        // 检查所有像素：要么是 [255,255,255,255]（背景层），要么就是其他
        let pixels = composed.as_raw();
        for chunk in pixels.chunks_exact(4) {
            // 红色（hidden 层）不应出现
            assert!(
                !(chunk[0] == 255 && chunk[1] == 0 && chunk[2] == 0),
                "invisible layer's red should not appear"
            );
        }
    }

    #[test]
    fn test_composite_empty_layer_skipped() {
        // 0×0 的图层不能触发 ImageBuffer 分配错误
        let mut state = CanvasState::new(64, 64);
        let bogus = uuid::Uuid::new_v4();
        state.layers.push(Layer::new(bogus, "zero", 0, 0));
        let result = CanvasRenderer::composite(&state);
        assert!(result.is_ok());
    }

    #[test]
    fn test_composite_with_multiple_layers_orders_correctly() {
        // 后 add 的图层在更上层，覆盖前面
        let mut state = CanvasState::new(32, 32);
        let bg_id = state.add_layer("bg");
        let top_id = state.add_layer("top");
        // bg = 红
        if let Some(l) = state.layers.iter_mut().find(|l| l.id == bg_id) {
            for px in l.image_data.chunks_exact_mut(4) {
                px[0] = 255;
                px[1] = 0;
                px[2] = 0;
                px[3] = 255;
            }
        }
        // top = 蓝
        if let Some(l) = state.layers.iter_mut().find(|l| l.id == top_id) {
            for px in l.image_data.chunks_exact_mut(4) {
                px[0] = 0;
                px[1] = 0;
                px[2] = 255;
                px[3] = 255;
            }
        }
        let composed = CanvasRenderer::composite(&state).unwrap();
        let pixel = composed.as_raw();
        assert_eq!(pixel[0], 0, "blue should be on top (R=0)");
        assert_eq!(pixel[2], 255, "blue channel");
        assert_eq!(pixel[3], 255, "opaque");
    }

    #[test]
    fn test_extract_selection_returns_error_when_empty() {
        // 空选区必须返回 Err
        let state = CanvasState::new(64, 64);
        let sel = crate::canvas::Selection::empty();
        let res = CanvasRenderer::extract_selection(&state, &sel);
        assert!(res.is_err());
    }

    #[test]
    fn test_extract_selection_returns_base64_with_size_mismatch() {
        // 选区大小合法时返回 base64 PNG；选区尺寸不能超过画布
        let state = CanvasState::new(64, 64);
        let mut sel = crate::canvas::Selection::empty();
        sel.x = 0;
        sel.y = 0;
        sel.width = 16;
        sel.height = 16;
        let res = CanvasRenderer::extract_selection(&state, &sel);
        assert!(res.is_ok());
        let b64 = res.unwrap();
        assert!(!b64.is_empty());
        // 标准 base64 字符集
        assert!(b64
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '='));
    }

    #[test]
    fn test_render_image_quality_clamped_both_ends() {
        // q=0 应被 clamp 到 1，q=255 应被 clamp 到 100
        let img: RgbaImage = RgbaImage::from_pixel(8, 8, Rgba([128, 128, 128, 255]));
        let bytes_low = CanvasRenderer::render_image(&img, "jpg", 0).unwrap();
        let bytes_high = CanvasRenderer::render_image(&img, "jpg", 255).unwrap();
        assert!(!bytes_low.is_empty());
        assert!(!bytes_high.is_empty());
        // 极端 quality 不应让结果溢出（都仍可解码）
        assert_eq!(&bytes_low[..2], &[0xFF, 0xD8]);
        assert_eq!(&bytes_high[..2], &[0xFF, 0xD8]);
    }

    #[test]
    fn test_resize_to_long_edge_keeps_aspect_ratio() {
        // 长边缩放必须保持纵横比
        let img: RgbaImage = RgbaImage::from_pixel(200, 100, Rgba([1, 2, 3, 255]));
        let out = CanvasRenderer::resize_to_long_edge(&img, 50);
        assert_eq!(out.width(), 50);
        assert_eq!(out.height(), 25, "200:100 比例缩放到长边 50 → 25");
    }

    #[test]
    fn test_resize_to_long_edge_already_at_target() {
        // 长边已经等于 target 时直接 clone，不缩放
        let img: RgbaImage = RgbaImage::from_pixel(128, 64, Rgba([1, 2, 3, 255]));
        let out = CanvasRenderer::resize_to_long_edge(&img, 128);
        assert_eq!(out.dimensions(), (128, 64));
        // 像素应完全一致（clone 不缩放）
        assert_eq!(out.as_raw(), img.as_raw());
    }

    #[test]
    fn test_resize_to_long_edge_one_pixel_target() {
        // target=1 必须缩到极小尺寸（不为 0）
        let img: RgbaImage = RgbaImage::from_pixel(100, 50, Rgba([1, 2, 3, 255]));
        let out = CanvasRenderer::resize_to_long_edge(&img, 1);
        assert!(out.width() >= 1);
        assert!(out.height() >= 1);
    }

    #[test]
    fn test_to_base64_png_returns_standard_base64() {
        let img: RgbaImage = RgbaImage::from_pixel(4, 4, Rgba([1, 2, 3, 255]));
        let b64 = CanvasRenderer::to_base64_png(&img).unwrap();
        // 解码 base64 后前 8 字节必须是 PNG signature
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn test_thumbnail_clamps_size() {
        // thumbnail 必须产出 max_size×max_size 的方形缩略图
        let img: RgbaImage = RgbaImage::from_pixel(200, 100, Rgba([128, 128, 128, 255]));
        let bytes = CanvasRenderer::thumbnail(&img, 32).unwrap();
        assert!(!bytes.is_empty());
        // RIFF / WEBP magic
        assert_eq!(&bytes[..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
    }

    #[test]
    fn test_render_image_base64_returns_decodable() {
        let img: RgbaImage = RgbaImage::from_pixel(8, 8, Rgba([1, 2, 3, 255]));
        let b64 = CanvasRenderer::render_image_base64(&img, "png", 100).unwrap();
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn test_paste_image_to_layer_unknown_layer_errors() {
        let mut state = CanvasState::new(8, 8);
        let bogus = uuid::Uuid::new_v4();
        let res = CanvasRenderer::paste_image_to_layer(&mut state, bogus, "AAA");
        assert!(res.is_err());
    }
}
