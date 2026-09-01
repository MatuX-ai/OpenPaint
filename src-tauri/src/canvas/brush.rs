//! 默认画刷数据结构（W10 实施）
//!
//! 笔刷以 PNG stamp 形式提供（`assets/brushes/*.png`），中心 RGB 255 + 边缘
//! alpha 渐变。Rust 端保存元数据，stamp 像素按需通过
//! `brush_commands::load_brush_png` 加载。
//!
//! 关联需求：[`docs/asset-library-requirements.md`](../docs/asset-library-requirements.md) §3.2

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// 笔刷分类（影响 UI 分组与标签）
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BrushCategory {
    /// 硬边（精确勾线、矢量风格）
    Hard,
    /// 软边（柔和涂抹、上色）
    Soft,
    /// 纹理（粉笔、喷枪、水彩、油画）
    Texture,
    /// 特殊用途（模糊、橡皮变体）
    Special,
    /// 平面标记（马克笔、概念设计）
    Mark,
}

impl BrushCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            BrushCategory::Hard => "hard",
            BrushCategory::Soft => "soft",
            BrushCategory::Texture => "texture",
            BrushCategory::Special => "special",
            BrushCategory::Mark => "mark",
        }
    }
}

/// 单个内置笔刷的元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrushPreset {
    /// 唯一 ID（与文件名同步）
    pub id: String,
    /// 中文名
    pub name_zh: String,
    /// 英文名
    pub name_en: String,
    /// 相对于 `assets/brushes/` 的文件名（开发模式可加 ../ 前缀）
    pub file_name: String,
    /// 分类
    pub category: BrushCategory,
    /// 推荐默认半径
    pub default_radius: u32,
    /// 边缘衰减（0.0 = 硬边 → 1.0 = 完全软化）
    pub falloff: f32,
    /// 描述 / 适用场景（中文）
    #[serde(default)]
    pub description: String,
}

impl BrushPreset {
    /// 构造一个笔刷预设。`String` 字段运行时构造，所以 `new` 不是 const fn。
    pub fn new(
        id: &'static str,
        name_zh: &'static str,
        name_en: &'static str,
        file_name: &'static str,
        category: BrushCategory,
        default_radius: u32,
        falloff: f32,
        description: &'static str,
    ) -> Self {
        Self {
            id: id.to_string(),
            name_zh: name_zh.to_string(),
            name_en: name_en.to_string(),
            file_name: file_name.to_string(),
            category,
            default_radius,
            falloff,
            description: description.to_string(),
        }
    }
}

/// 返回 8 个内置笔刷的常量切片（首次调用时构造，后续直接返回缓存）
///
/// ID 必须与 `assets/brushes/{id}.png` 文件名严格一致。
/// 顺序固定：UI 按此顺序展示。
pub fn builtin_brushes() -> &'static [BrushPreset] {
    static CACHE: OnceLock<Box<[BrushPreset]>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Box::new([
            BrushPreset::new(
                "round-hard",
                "硬边圆头",
                "Round Hard",
                "round-hard.png",
                BrushCategory::Hard,
                12,
                0.05,
                "默认画笔，勾线、UI 设计首选",
            ),
            BrushPreset::new(
                "round-soft",
                "软边圆头",
                "Round Soft",
                "round-soft.png",
                BrushCategory::Soft,
                14,
                0.95,
                "通用涂抹、上色、修复",
            ),
            BrushPreset::new(
                "chalk",
                "粉笔",
                "Chalk",
                "chalk.png",
                BrushCategory::Texture,
                16,
                0.6,
                "手写粉笔质感、复古插画",
            ),
            BrushPreset::new(
                "spray",
                "喷枪",
                "Spray",
                "spray.png",
                BrushCategory::Texture,
                24,
                0.5,
                "阴影、噪点、特殊光效",
            ),
            BrushPreset::new(
                "watercolor",
                "水彩",
                "Watercolor",
                "watercolor.png",
                BrushCategory::Texture,
                18,
                0.85,
                "柔和水彩边缘、淡彩渲染",
            ),
            BrushPreset::new(
                "oil-paint",
                "油画厚涂",
                "Oil Paint",
                "oil-paint.png",
                BrushCategory::Texture,
                22,
                0.4,
                "厚涂笔触、艺术化处理",
            ),
            BrushPreset::new(
                "marker",
                "马克笔",
                "Marker",
                "marker.png",
                BrushCategory::Mark,
                14,
                0.7,
                "平面插画、概念设计",
            ),
            BrushPreset::new(
                "blur",
                "模糊",
                "Blur",
                "blur.png",
                BrushCategory::Special,
                20,
                1.0,
                "边缘模糊、橡皮变体",
            ),
        ])
    })
}

/// 按 ID 查找笔刷（找不到返回 None）
pub fn find_brush(id: &str) -> Option<&'static BrushPreset> {
    builtin_brushes().iter().find(|b| b.id == id)
}

/// 默认笔刷 ID（应用首次启动 + 笔刷丢失 fallback）
pub const DEFAULT_BRUSH_ID: &str = "round-hard";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_brushes_count() {
        assert_eq!(builtin_brushes().len(), 8, "spec §3.2 requires 8 brushes");
    }

    #[test]
    fn test_builtin_brushes_ids_unique() {
        let mut ids: Vec<&str> = builtin_brushes().iter().map(|b| b.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(
            ids.len(),
            builtin_brushes().len(),
            "brush IDs must be unique"
        );
    }

    #[test]
    fn test_builtin_brushes_have_all_required_categories() {
        let cats: std::collections::HashSet<_> = builtin_brushes()
            .iter()
            .map(|b| b.category.as_str())
            .collect();
        // 至少要覆盖 Hard + Soft + Texture + Special
        assert!(cats.contains("hard"));
        assert!(cats.contains("soft"));
        assert!(cats.contains("texture"));
        assert!(cats.contains("special"));
    }

    #[test]
    fn test_builtin_brushes_default_radius_in_range() {
        for b in builtin_brushes() {
            assert!(
                b.default_radius >= 4 && b.default_radius <= 64,
                "brush {} radius {} out of [4,64]",
                b.id,
                b.default_radius
            );
        }
    }

    #[test]
    fn test_builtin_brushes_falloff_in_range() {
        for b in builtin_brushes() {
            assert!(
                b.falloff >= 0.0 && b.falloff <= 1.0,
                "brush {} falloff {} out of [0,1]",
                b.id,
                b.falloff
            );
        }
    }

    #[test]
    fn test_find_brush_known_id() {
        let b = find_brush("round-hard").expect("round-hard must exist");
        assert_eq!(b.id, "round-hard");
        assert_eq!(b.category, BrushCategory::Hard);
    }

    #[test]
    fn test_find_brush_unknown_returns_none() {
        assert!(find_brush("does-not-exist").is_none());
    }

    #[test]
    fn test_default_brush_id_is_in_list() {
        assert!(
            find_brush(DEFAULT_BRUSH_ID).is_some(),
            "DEFAULT_BRUSH_ID must reference an existing brush"
        );
    }

    #[test]
    fn test_brush_png_files_exist() {
        // 仅在开发模式（Cargo 工作区根目录存在 assets/brushes/）可跑通；
        // CI / 独立 cargo test 跳过此断言（用 std::env 探测）。
        let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("assets")
            .join("brushes");
        if !dev_path.exists() {
            eprintln!("skipping: dev assets dir not found");
            return;
        }
        for b in builtin_brushes() {
            let p = dev_path.join(&b.file_name);
            assert!(p.exists(), "brush png missing: {}", p.display());
            let metadata = std::fs::metadata(&p).expect("metadata");
            assert!(
                metadata.len() > 100,
                "brush {} too small ({} bytes)",
                b.id,
                metadata.len()
            );
        }
    }

    #[test]
    fn test_brush_category_as_str_round_trip() {
        for cat in [
            BrushCategory::Hard,
            BrushCategory::Soft,
            BrushCategory::Texture,
            BrushCategory::Special,
            BrushCategory::Mark,
        ] {
            let s = cat.as_str();
            assert!(!s.is_empty());
        }
    }
}
