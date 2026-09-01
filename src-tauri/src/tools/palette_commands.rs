//! 调色板命令（W10 实施）
//!
//! 提供 2 个 Tauri 命令：
//! - `list_palettes`     列出全部内置调色板（4 套：Material / Tailwind / Pastel / Mono）
//! - `apply_palette`     把调色板应用到指定图层（swatch_bar / replace_color 两模式）
//!
//! 资源位于 `assets/palettes/{id}.json`，结构与 [`docs/asset-library-requirements.md`](../docs/asset-library-requirements.md) §3.3.2 对齐。

use std::path::PathBuf;

use anyhow::{anyhow, Context as _, Result as AnyhowResult};
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::canvas::CanvasRenderer;
use crate::state::AppState;

// ============================================================
// 数据结构（与 assets/palettes/*.json 对齐）
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaletteColor {
    pub name: String,
    pub hex: String,
    #[serde(default)]
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Palette {
    pub id: String,
    pub name_zh: String,
    pub name_en: String,
    pub source: String,
    pub license: String,
    pub colors: Vec<PaletteColor>,
}

/// `apply_palette` 入参
#[derive(Debug, Clone, Deserialize)]
pub struct ApplyPaletteArgs {
    /// 调色板 ID（"material" / "tailwind" / "pastel" / "mono"）
    pub palette_id: String,
    /// 可选：目标图层（默认活动图层）
    #[serde(default)]
    pub layer_id: Option<String>,
    /// "swatch_bar"（默认，画在底部色条）| "replace_color"（替换主色）
    #[serde(default = "default_mode")]
    pub mode: String,
    /// replace_color 模式下可选：覆盖色（默认取调色板第一色）
    #[serde(default)]
    pub replace_hex: Option<String>,
}

fn default_mode() -> String {
    "swatch_bar".to_string()
}

/// `apply_palette` 出参
#[derive(Debug, Clone, Serialize)]
pub struct ApplyPaletteResult {
    pub applied_colors: Vec<String>,
    pub stroke_count: u32,
    pub mode: String,
}

// ============================================================
// 调色板加载
// ============================================================

/// 调色板目录解析
fn palette_dir() -> PathBuf {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("assets")
        .join("palettes");
    if dev.exists() {
        dev
    } else {
        PathBuf::from("assets").join("palettes")
    }
}

/// 4 个内置调色板文件 ID（顺序固定）
const BUILTIN_PALETTE_IDS: &[&str] = &["material", "tailwind", "pastel", "mono"];

/// 加载所有调色板 JSON → Vec<Palette>
pub fn load_palettes() -> AnyhowResult<Vec<Palette>> {
    let dir = palette_dir();
    if !dir.exists() {
        return Err(anyhow!("palette dir missing: {}", dir.display()));
    }
    let mut out = Vec::with_capacity(BUILTIN_PALETTE_IDS.len());
    for id in BUILTIN_PALETTE_IDS {
        let path = dir.join(format!("{}.json", id));
        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("read palette {}", path.display()))?;
        let palette: Palette = serde_json::from_str(&content)
            .with_context(|| format!("parse palette {}", path.display()))?;
        out.push(palette);
    }
    Ok(out)
}

/// `list_palettes` Tauri 命令
#[tauri::command]
pub async fn list_palettes() -> Result<Vec<Palette>, String> {
    load_palettes().map_err(|e| format!("load_palettes: {}", e))
}

/// `apply_palette` Tauri 命令
#[tauri::command]
pub async fn apply_palette(
    state: State<'_, AppState>,
    args: ApplyPaletteArgs,
) -> Result<ApplyPaletteResult, String> {
    apply_palette_internal(state, args)
        .await
        .map_err(|e| format!("apply_palette: {}", e))
}

// ============================================================
// 应用实现
// ============================================================

pub async fn apply_palette_internal(
    state: State<'_, AppState>,
    args: ApplyPaletteArgs,
) -> AnyhowResult<ApplyPaletteResult> {
    let palettes = load_palettes()?;
    let palette = palettes
        .into_iter()
        .find(|p| p.id == args.palette_id)
        .ok_or_else(|| anyhow!("调色板不存在: {}", args.palette_id))?;

    let mut canvas = state.canvas.write();

    // 验证目标图层存在 + 未锁定
    let target_id = match args.layer_id.as_deref().and_then(|s| Uuid::parse_str(s).ok()) {
        Some(id) => id,
        None => canvas.active_layer_id,
    };
    let layer = canvas
        .layers
        .iter()
        .find(|l| l.id == target_id)
        .ok_or_else(|| anyhow!("图层不存在: {}", target_id))?;
    if layer.locked {
        return Err(anyhow!("图层被锁定: {}", target_id));
    }

    canvas.push_history(format!("apply_palette:{}", args.palette_id));

    match args.mode.as_str() {
        "swatch_bar" => {
            swatch_bar_mode(&mut canvas, target_id, &palette)?;
            Ok(ApplyPaletteResult {
                applied_colors: palette.colors.iter().map(|c| c.hex.clone()).collect(),
                stroke_count: 1,
                mode: "swatch_bar".into(),
            })
        }
        "replace_color" => {
            let replace_hex = args
                .replace_hex
                .unwrap_or_else(|| palette.colors[0].hex.clone());
            let stroke_count =
                replace_color_mode(&mut canvas, target_id, &palette, &replace_hex)?;
            Ok(ApplyPaletteResult {
                applied_colors: vec![replace_hex],
                stroke_count,
                mode: "replace_color".into(),
            })
        }
        other => Err(anyhow!("未知 mode: {}", other)),
    }
}

/// 在图层底部画一条 32px 高的色条，每色均分宽度
fn swatch_bar_mode(
    canvas: &mut crate::canvas::CanvasState,
    layer_id: Uuid,
    palette: &Palette,
) -> AnyhowResult<()> {
    let layer = canvas
        .layers
        .iter()
        .find(|l| l.id == layer_id)
        .ok_or_else(|| anyhow!("图层不存在"))?;
    let (w, h) = (layer.width, layer.height);

    let color_count = palette.colors.len().max(1) as u32;
    let bar_h = 32u32.min(h);
    let color_w = w / color_count;

    // 计算起始 y（底部对齐）
    let start_y = h.saturating_sub(bar_h);

    let mut canvas_img = image::RgbaImage::new(w, h);
    // 先把当前图层拷进临时画布
    let layer_img = image::RgbaImage::from_raw(w, h, {
        let layer = canvas
            .layers
            .iter()
            .find(|l| l.id == layer_id)
            .ok_or_else(|| anyhow!("图层不存在"))?;
        layer.image_data.clone()
    })
    .ok_or_else(|| anyhow!("图层像素数据非法"))?;
    for y in 0..h {
        for x in 0..w {
            let p = *layer_img.get_pixel(x, y);
            canvas_img.put_pixel(x, y, p);
        }
    }

    // 画色条：忽略 alpha，用调色板颜色覆盖
    for (i, color) in palette.colors.iter().enumerate() {
        let (r, g, b) = parse_hex(&color.hex).unwrap_or((255, 255, 255));
        let x0 = (i as u32 * color_w) as i32;
        let x_end = if i + 1 == palette.colors.len() {
            w as i32
        } else {
            ((i + 1) as u32 * color_w) as i32
        };
        for y in (start_y as i32)..(h as i32) {
            for x in x0..x_end {
                if x < 0 || x >= w as i32 || y < 0 || y >= h as i32 {
                    continue;
                }
                canvas_img.put_pixel(x as u32, y as u32, image::Rgba([r, g, b, 255]));
            }
        }
    }

    // 写回图层
    let layer = canvas
        .layers
        .iter_mut()
        .find(|l| l.id == layer_id)
        .ok_or_else(|| anyhow!("图层不存在"))?;
    layer.image_data = canvas_img.into_raw();
    Ok(())
}

/// 把图层中"主色像素"（出现频率最高的非透明像素）替换为 replace_hex
///
/// 实现策略：
/// 1. 直方图统计图层中 RGB 量化后的出现频率
/// 2. 取最频繁的 RGB（即"主色"），把所有匹配该主色的像素替换为目标色
fn replace_color_mode(
    canvas: &mut crate::canvas::CanvasState,
    layer_id: Uuid,
    _palette: &Palette,
    replace_hex: &str,
) -> AnyhowResult<u32> {
    let (r, g, b) = parse_hex(replace_hex).unwrap_or((255, 255, 255));
    let layer = canvas
        .layers
        .iter()
        .find(|l| l.id == layer_id)
        .ok_or_else(|| anyhow!("图层不存在"))?;
    let data = layer.image_data.clone();

    // 量化到 32 桶，找最高频 RGB 量化值
    let mut hist: std::collections::HashMap<(u8, u8, u8), u32> = std::collections::HashMap::new();
    for chunk in data.chunks_exact(4) {
        let alpha = chunk[3];
        if alpha < 128 {
            continue;
        }
        let key = (chunk[0] / 32, chunk[1] / 32, chunk[2] / 32);
        *hist.entry(key).or_insert(0) += 1;
    }
    let dominant_bucket = hist
        .into_iter()
        .max_by_key(|&(_, count)| count)
        .map(|(k, _)| k);

    // 用真实像素 RGB 找主色精确值（取桶中最常出现的原始 RGB）
    let mut precise: std::collections::HashMap<(u8, u8, u8), u32> =
        std::collections::HashMap::new();
    if let Some(bucket) = dominant_bucket {
        for chunk in data.chunks_exact(4) {
            let alpha = chunk[3];
            if alpha < 128 {
                continue;
            }
            let k = (chunk[0] / 32, chunk[1] / 32, chunk[2] / 32);
            if k == bucket {
                let precise_key = (chunk[0], chunk[1], chunk[2]);
                *precise.entry(precise_key).or_insert(0) += 1;
            }
        }
    }
    let dominant_rgb = precise
        .into_iter()
        .max_by_key(|&(_, count)| count)
        .map(|(rgb, _)| rgb);

    // 把匹配 dominant_rgb 的像素替换为 replace_hex
    let mut new_data = data.clone();
    let mut replaced = 0u32;
    if let Some((dr, dg, db)) = dominant_rgb {
        for chunk in new_data.chunks_exact_mut(4) {
            if chunk[3] < 128 {
                continue;
            }
            if chunk[0] == dr && chunk[1] == dg && chunk[2] == db {
                chunk[0] = r;
                chunk[1] = g;
                chunk[2] = b;
                chunk[3] = 255;
                replaced += 1;
            }
        }
    } else {
        // 主色未找到（图像全透明）：把整个图层刷为目标色（fallback）
        for chunk in new_data.chunks_exact_mut(4) {
            chunk[0] = r;
            chunk[1] = g;
            chunk[2] = b;
            chunk[3] = 255;
            replaced += 1;
        }
    }

    let layer = canvas
        .layers
        .iter_mut()
        .find(|l| l.id == layer_id)
        .ok_or_else(|| anyhow!("图层不存在"))?;
    layer.image_data = new_data;
    Ok(replaced)
}

/// 解析 #RRGGBB / #RGB → (r, g, b)
fn parse_hex(hex: &str) -> Option<(u8, u8, u8)> {
    let s = hex.trim().trim_start_matches('#');
    if s.len() == 6 {
        let r = u8::from_str_radix(&s[0..2], 16).ok()?;
        let g = u8::from_str_radix(&s[2..4], 16).ok()?;
        let b = u8::from_str_radix(&s[4..6], 16).ok()?;
        Some((r, g, b))
    } else if s.len() == 3 {
        let r = u8::from_str_radix(&s[0..1].repeat(2), 16).ok()?;
        let g = u8::from_str_radix(&s[1..2].repeat(2), 16).ok()?;
        let b = u8::from_str_radix(&s[2..3].repeat(2), 16).ok()?;
        Some((r, g, b))
    } else {
        None
    }
}

/// 序列化 helper：把任意 RGBA 像素数据编码为 PNG base64
#[allow(dead_code)]
pub fn png_b64(w: u32, h: u32, rgba: &[u8]) -> AnyhowResult<String> {
    let img = image::RgbaImage::from_raw(w, h, rgba.to_vec())
        .ok_or_else(|| anyhow!("invalid rgba size"))?;
    let bytes = CanvasRenderer::to_png_bytes(&img)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_6() {
        assert_eq!(parse_hex("#FF0000"), Some((255, 0, 0)));
        assert_eq!(parse_hex("00ff00"), Some((0, 255, 0)));
        assert_eq!(parse_hex("  #0000FF"), Some((0, 0, 255)));
    }

    #[test]
    fn test_parse_hex_3() {
        assert_eq!(parse_hex("#fff"), Some((255, 255, 255)));
        assert_eq!(parse_hex("abc"), Some((0xaa, 0xbb, 0xcc)));
    }

    #[test]
    fn test_parse_hex_invalid() {
        assert!(parse_hex("xyz").is_none());
        assert!(parse_hex("#GG0000").is_none());
        assert!(parse_hex("").is_none());
    }

    #[test]
    fn test_load_palettes_in_dev_mode() {
        let dir = palette_dir();
        if !dir.exists() {
            eprintln!("skipping: palette dir missing");
            return;
        }
        let palettes = load_palettes().expect("load_palettes");
        assert_eq!(palettes.len(), 4);
        let ids: Vec<&str> = palettes.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["material", "tailwind", "pastel", "mono"]);
        for p in &palettes {
            assert!(!p.colors.is_empty(), "palette {} has no colors", p.id);
            assert!(
                p.colors.iter().all(|c| c.hex.starts_with('#') && c.hex.len() == 7),
                "palette {} has malformed hex color",
                p.id
            );
        }
    }

    #[test]
    fn test_swatch_bar_changes_bottom_rows() {
        // 构造 100×100 全白图层
        let mut state = crate::canvas::CanvasState::default();
        let layer_id = state.active_layer_id;
        {
            let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
            layer.width = 100;
            layer.height = 100;
            layer.image_data = vec![255u8; 100 * 100 * 4]; // 全白
        }
        let palette = Palette {
            id: "test".into(),
            name_zh: "Test".into(),
            name_en: "Test".into(),
            source: "unit test".into(),
            license: "MIT".into(),
            colors: vec![
                PaletteColor { name: "Red".into(), hex: "#FF0000".into(), role: "primary".into() },
                PaletteColor { name: "Green".into(), hex: "#00FF00".into(), role: "success".into() },
                PaletteColor { name: "Blue".into(), hex: "#0000FF".into(), role: "info".into() },
            ],
        };
        swatch_bar_mode(&mut state, layer_id, &palette).expect("swatch_bar");
        let layer = state.layers.iter().find(|l| l.id == layer_id).unwrap();
        // 顶部行（y=0）仍应全白
        for x in 0..100 {
            let p = &layer.image_data[(x * 4)..(x * 4 + 4)];
            assert_eq!((p[0], p[1], p[2], p[3]), (255, 255, 255, 255), "top row at x={}", x);
        }
        // 底部行（y=99）应有非白像素
        let bottom_sample = &layer.image_data[(99 * 100 + 5) * 4..(99 * 100 + 5) * 4 + 4];
        assert!(bottom_sample[0] < 255 || bottom_sample[1] < 255 || bottom_sample[2] < 255,
            "bottom row must have non-white pixels, got {:?}", bottom_sample);
        // 检查 32px 色条高度确实生效（y=67 应该是色条边界附近）
        let mid_bottom = &layer.image_data[(80 * 100 + 0) * 4..(80 * 100 + 0) * 4 + 4];
        assert!(mid_bottom[0] < 255 || mid_bottom[1] < 255 || mid_bottom[2] < 255);
    }

    #[test]
    fn test_replace_color_replaces_dominant_pixels() {
        // 构造 4×1 图层：[red, red, green, green]
        let mut state = crate::canvas::CanvasState::default();
        let layer_id = state.active_layer_id;
        {
            let layer = state.layers.iter_mut().find(|l| l.id == layer_id).unwrap();
            layer.width = 4;
            layer.height = 1;
            layer.image_data = vec![
                255, 0, 0, 255,   // red
                255, 0, 0, 255,   // red
                0, 255, 0, 255,   // green
                0, 255, 0, 255,   // green
            ];
        }
        let palette = Palette {
            id: "x".into(),
            name_zh: "x".into(),
            name_en: "x".into(),
            source: "test".into(),
            license: "MIT".into(),
            colors: vec![
                PaletteColor { name: "Blue".into(), hex: "#0000FF".into(), role: "".into() },
            ],
        };
        let replaced = replace_color_mode(&mut state, layer_id, &palette, "#0000FF").expect("replace");
        // red 与 green 各 2 像素；直方图取最频繁 → 应该替换其中一组（2 像素）
        assert!(replaced == 2, "expected 2 pixels replaced, got {}", replaced);
    }

    #[test]
    fn test_load_palettes_json_structure_matches_spec() {
        // spec §3.3.2：每套调色板应有 10 色，且 name_zh/name_en 字段存在
        let dir = palette_dir();
        if !dir.exists() {
            return;
        }
        for id in BUILTIN_PALETTE_IDS {
            let path = dir.join(format!("{}.json", id));
            let content = std::fs::read_to_string(&path).expect("read");
            let palette: Palette = serde_json::from_str(&content).expect("parse");
            assert_eq!(palette.id, *id);
            assert!(!palette.name_zh.is_empty());
            assert!(!palette.name_en.is_empty());
            assert!(!palette.source.is_empty());
            assert!(!palette.license.is_empty());
            assert_eq!(palette.colors.len(), 10, "palette {} should have 10 colors", id);
        }
    }
}