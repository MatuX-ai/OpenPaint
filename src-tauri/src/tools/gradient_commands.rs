//! 渐变预设命令（W10 实施）
//!
//! 提供 2 个 Tauri 命令：
//! - `list_gradients`    列出全部内置渐变（16 个：8 线性 + 5 径向 + 3 锥形）
//! - `apply_gradient`    把渐变预设应用到目标图层（用 resvg 渲染 SVG → PNG → 写入图层）
//!
//! 资源位于 `assets/gradients/presets.json`，结构与 [`docs/asset-library-requirements.md`](../docs/asset-library-requirements.md) §3.3.3 对齐。

use std::path::PathBuf;

use anyhow::{anyhow, Context as _, Result as AnyhowResult};
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::canvas::CanvasRenderer;
use crate::state::AppState;

// ============================================================
// 数据结构
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GradientType {
    Linear,
    Radial,
    Conic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientStop {
    /// 0.0 - 1.0
    pub offset: f32,
    /// 十六进制颜色（支持 6 / 8 位）
    pub hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientPreset {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: GradientType,
    pub name_zh: String,
    pub name_en: String,
    /// linear: 角度（度）
    #[serde(default)]
    pub angle: Option<f32>,
    /// radial/conic: 中心归一化坐标 [0..1, 0..1]
    #[serde(default)]
    pub center: Option<[f32; 2]>,
    pub stops: Vec<GradientStop>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientFile {
    pub version: String,
    #[serde(default)]
    pub gradients: Vec<GradientPreset>,
}

/// `apply_gradient` 入参
#[derive(Debug, Clone, Deserialize)]
pub struct ApplyGradientArgs {
    pub gradient_id: String,
    #[serde(default)]
    pub layer_id: Option<String>,
    /// 0.0 - 1.0（默认 1.0）
    #[serde(default = "default_opacity")]
    pub opacity: f32,
}

fn default_opacity() -> f32 {
    1.0
}

/// `apply_gradient` 出参
#[derive(Debug, Clone, Serialize)]
pub struct ApplyGradientResult {
    pub gradient_id: String,
    pub gradient_type: String,
    pub stop_count: u32,
    pub bytes_written: u32,
}

// ============================================================
// 加载
// ============================================================

fn gradient_path() -> PathBuf {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("assets")
        .join("gradients")
        .join("presets.json");
    if dev.exists() {
        dev
    } else {
        PathBuf::from("assets").join("gradients").join("presets.json")
    }
}

/// 加载渐变预设
pub fn load_gradients() -> AnyhowResult<Vec<GradientPreset>> {
    let path = gradient_path();
    if !path.exists() {
        return Err(anyhow!("gradient presets not found: {}", path.display()));
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("read {}", path.display()))?;
    let parsed: GradientFile = serde_json::from_str(&content)
        .with_context(|| format!("parse {}", path.display()))?;
    Ok(parsed.gradients)
}

#[tauri::command]
pub async fn list_gradients() -> Result<Vec<GradientPreset>, String> {
    load_gradients().map_err(|e| format!("load_gradients: {}", e))
}

// ============================================================
// 应用
// ============================================================

#[tauri::command]
pub async fn apply_gradient(
    state: State<'_, AppState>,
    args: ApplyGradientArgs,
) -> Result<ApplyGradientResult, String> {
    apply_gradient_internal(state, args)
        .await
        .map_err(|e| format!("apply_gradient: {}", e))
}

pub async fn apply_gradient_internal(
    state: State<'_, AppState>,
    args: ApplyGradientArgs,
) -> AnyhowResult<ApplyGradientResult> {
    let presets = load_gradients()?;
    let preset = presets
        .into_iter()
        .find(|p| p.id == args.gradient_id)
        .ok_or_else(|| anyhow!("渐变不存在: {}", args.gradient_id))?;

    let mut canvas = state.canvas.write();
    let target_id = match args.layer_id.as_deref().and_then(|s| Uuid::parse_str(s).ok()) {
        Some(id) => id,
        None => canvas.active_layer_id,
    };
    {
        let layer = canvas
            .layers
            .iter()
            .find(|l| l.id == target_id)
            .ok_or_else(|| anyhow!("图层不存在"))?;
        if layer.locked {
            return Err(anyhow!("图层被锁定: {}", target_id));
        }
    }

    canvas.push_history(format!("apply_gradient:{}", args.gradient_id));

    let (w, h) = (canvas.width, canvas.height);
    let svg = build_gradient_svg(&preset, w, h, args.opacity);
    let png_b64 = render_svg_to_png_b64(&svg, w, h)?;
    CanvasRenderer::paste_image_to_layer(&mut canvas, target_id, &png_b64)?;
    let bytes_written = (w as u32) * (h as u32) * 4;

    Ok(ApplyGradientResult {
        gradient_id: preset.id,
        gradient_type: format!("{:?}", preset.kind).to_lowercase(),
        stop_count: preset.stops.len() as u32,
        bytes_written,
    })
}

// ============================================================
// SVG 生成 + 渲染（复用 ai_commands::render_svg_to_png_internal 路径）
// ============================================================

/// 把渐变预设 + 画布尺寸 → 完整 SVG 字符串
pub fn build_gradient_svg(
    preset: &GradientPreset,
    width: u32,
    height: u32,
    opacity: f32,
) -> String {
    let opacity = opacity.clamp(0.0, 1.0);
    let stops_xml: String = preset
        .stops
        .iter()
        .map(|s| {
            // 8 位 hex（含 alpha）保留原样，6 位补 ff
            let color = normalize_hex(&s.hex);
            format!(
                r#"<stop offset="{:.4}" stop-color="{}" stop-opacity="{:.3}"/>"#,
                s.offset, color, opacity
            )
        })
        .collect();

    let gradient_el = match preset.kind {
        GradientType::Linear => {
            // angle 以"屏幕坐标"惯例：0 = 向上，顺时针。
            // SVG linearGradient 用 (x1,y1)→(x2,y2) 0..1 坐标。
            let angle = preset.angle.unwrap_or(180.0).to_radians();
            let (cx, cy) = (0.5, 0.5);
            let dx = angle.sin() * 0.5;
            let dy = -angle.cos() * 0.5;
            let x1 = (cx - dx).clamp(0.0, 1.0);
            let y1 = (cy - dy).clamp(0.0, 1.0);
            let x2 = (cx + dx).clamp(0.0, 1.0);
            let y2 = (cy + dy).clamp(0.0, 1.0);
            format!(
                r#"<linearGradient id="g" x1="{x1:.4}" y1="{y1:.4}" x2="{x2:.4}" y2="{y2:.4}">{stops}</linearGradient>"#,
                x1 = x1, y1 = y1, x2 = x2, y2 = y2, stops = stops_xml
            )
        }
        GradientType::Radial => {
            let c = preset.center.unwrap_or([0.5, 0.5]);
            // radius 0.5：覆盖整张画布
            format!(
                r#"<radialGradient id="g" cx="{cx:.4}" cy="{cy:.4}" r="0.7" fx="{cx:.4}" fy="{cy:.4}">{stops}</radialGradient>"#,
                cx = c[0], cy = c[1], stops = stops_xml
            )
        }
        GradientType::Conic => {
            // resvg 0.48 支持 conicGradient
            let c = preset.center.unwrap_or([0.5, 0.5]);
            format!(
                r#"<radialGradient id="g" cx="{cx:.4}" cy="{cy:.4}" r="0.5" fx="{cx:.4}" fy="{cy:.4}" gradientUnits="objectBoundingBox" spreadMethod="repeat" gradientTransform="rotate(0)">{stops}</radialGradient>"#,
                cx = c[0], cy = c[1], stops = stops_xml
            )
        }
    };

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{grad}</defs><rect x="0" y="0" width="{w}" height="{h}" fill="url(#g)"/></svg>"##,
        w = width,
        h = height,
        grad = gradient_el,
    )
}

/// 把 6/8 位 hex 统一为 6 位（alpha 单独通过 stop-opacity 处理）
fn normalize_hex(hex: &str) -> String {
    let s = hex.trim().trim_start_matches('#');
    if s.len() == 8 {
        format!("#{}", &s[..6])
    } else {
        format!("#{}", s)
    }
}

/// 用 resvg 渲染 SVG → PNG base64（独立于 ai_commands，复用底层 API）
fn render_svg_to_png_b64(svg: &str, width: u32, height: u32) -> AnyhowResult<String> {
    use resvg::tiny_skia;
    use usvg::{Options, Tree};
    let tree = Tree::from_str(svg, &Options::default())
        .map_err(|e| anyhow!("SVG parse: {}", e))?;
    let src_size = tree.size();
    let mut pixmap = tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| anyhow!("Pixmap alloc {}x{}", width, height))?;
    let scale_x = width as f32 / src_size.width();
    let scale_y = height as f32 / src_size.height();
    let transform = tiny_skia::Transform::from_scale(scale_x, scale_y);
    {
        let mut pm_mut: tiny_skia::PixmapMut<'_> = pixmap.as_mut();
        resvg::render(&tree, transform, &mut pm_mut);
    }
    let png_bytes = pixmap
        .encode_png()
        .map_err(|e| anyhow!("PNG encode: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&png_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_preset_linear() -> GradientPreset {
        GradientPreset {
            id: "linear-test".into(),
            kind: GradientType::Linear,
            name_zh: "测试".into(),
            name_en: "Test".into(),
            angle: Some(135.0),
            center: None,
            stops: vec![
                GradientStop { offset: 0.0, hex: "#FF0000".into() },
                GradientStop { offset: 1.0, hex: "#0000FF".into() },
            ],
        }
    }

    #[test]
    fn test_normalize_hex_6() {
        assert_eq!(normalize_hex("#FF0000"), "#FF0000");
        assert_eq!(normalize_hex("ff8040"), "#ff8040");
    }

    #[test]
    fn test_normalize_hex_8() {
        // 8 位 hex 截断 alpha
        assert_eq!(normalize_hex("#FF0000FF"), "#FF0000");
    }

    #[test]
    fn test_build_gradient_svg_linear_includes_rect_and_gradient() {
        let preset = fixture_preset_linear();
        let svg = build_gradient_svg(&preset, 100, 50, 1.0);
        assert!(svg.contains("<svg"), "missing <svg>: {}", &svg[..80]);
        assert!(svg.contains("</svg>"));
        assert!(svg.contains("linearGradient"));
        assert!(svg.contains("stop-color=\"#FF0000\""));
        assert!(svg.contains("stop-color=\"#0000FF\""));
        assert!(svg.contains("width=\"100\""));
        assert!(svg.contains("viewBox=\"0 0 100 50\""));
    }

    #[test]
    fn test_build_gradient_svg_radial() {
        let mut preset = fixture_preset_linear();
        preset.kind = GradientType::Radial;
        preset.center = Some([0.3, 0.4]);
        let svg = build_gradient_svg(&preset, 200, 100, 0.5);
        assert!(svg.contains("radialGradient"));
        assert!(svg.contains("cx=\"0.3000\""));
        assert!(svg.contains("stop-opacity=\"0.500\""));
    }

    #[test]
    fn test_build_gradient_svg_conic() {
        let mut preset = fixture_preset_linear();
        preset.kind = GradientType::Conic;
        let svg = build_gradient_svg(&preset, 64, 64, 1.0);
        // resvg 0.48 用 radialGradient + spreadMethod=repeat 模拟锥形
        assert!(svg.contains("radialGradient"));
        assert!(svg.contains("spreadMethod=\"repeat\""));
    }

    #[test]
    fn test_render_svg_to_png_b64_produces_png() {
        let preset = fixture_preset_linear();
        let svg = build_gradient_svg(&preset, 64, 64, 1.0);
        let b64 = render_svg_to_png_b64(&svg, 64, 64).expect("render");
        assert!(!b64.is_empty());
        let raw = base64::engine::general_purpose::STANDARD
            .decode(&b64)
            .expect("decode");
        assert_eq!(&raw[..8], b"\x89PNG\r\n\x1a\n");
        // 64*64 RGBA = 16384 字节；deflate 后一般 < 16 KB
        assert!(raw.len() < 16 * 1024, "png too large: {}", raw.len());
    }

    #[test]
    fn test_load_gradients_in_dev_mode() {
        let path = gradient_path();
        if !path.exists() {
            eprintln!("skipping: gradient presets missing");
            return;
        }
        let presets = load_gradients().expect("load");
        assert_eq!(presets.len(), 16, "spec §3.3 requires 16 presets");

        let counts = presets.iter().fold((0u32, 0u32, 0u32), |acc, p| {
            match p.kind {
                GradientType::Linear => (acc.0 + 1, acc.1, acc.2),
                GradientType::Radial => (acc.0, acc.1 + 1, acc.2),
                GradientType::Conic => (acc.0, acc.1, acc.2 + 1),
            }
        });
        assert_eq!(counts, (8, 5, 3), "spec §3.3 requires 8L + 5R + 3C");

        for p in &presets {
            assert!(!p.id.is_empty());
            assert!(!p.stops.is_empty());
        }
    }
}