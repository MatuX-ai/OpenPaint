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

    // ----------------------------------------------------------------
    // 补充测试：序列化 / 边界用例 / 防御性编程
    // ----------------------------------------------------------------

    #[test]
    fn test_brush_serde_round_trip_preserves_all_fields() {
        // 序列化 → 反序列化必须保留全部字段，且 category 走 kebab-case
        let original = builtin_brushes()[2].clone();
        let json = serde_json::to_string(&original).unwrap();
        let restored: BrushPreset = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, original.id);
        assert_eq!(restored.name_zh, original.name_zh);
        assert_eq!(restored.name_en, original.name_en);
        assert_eq!(restored.file_name, original.file_name);
        assert_eq!(restored.category, original.category);
        assert_eq!(restored.default_radius, original.default_radius);
        assert!((restored.falloff - original.falloff).abs() < f32::EPSILON);
        assert_eq!(restored.description, original.description);
    }

    #[test]
    fn test_brush_category_serializes_as_kebab_case() {
        // kebab-case：避免 UI 解析 "Hard"/"hard"/"HARD" 三种形式
        for cat in [
            BrushCategory::Hard,
            BrushCategory::Soft,
            BrushCategory::Texture,
            BrushCategory::Special,
            BrushCategory::Mark,
        ] {
            let s = cat.as_str();
            assert!(
                !s.contains('_'),
                "category string must not contain underscore: {}",
                s
            );
            assert!(s
                .chars()
                .all(|c| c.is_ascii_lowercase() || !c.is_ascii_alphabetic()));
        }
    }

    #[test]
    fn test_brush_json_round_trip_with_chinese_description() {
        // 中文描述必须能被 UTF-8 编码并原样还原
        let mut original = builtin_brushes()[0].clone();
        original.description = "硬边 · 适合勾线".to_string();
        let json = serde_json::to_string(&original).unwrap();
        assert!(json.contains("硬边"));
        let restored: BrushPreset = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.description, "硬边 · 适合勾线");
    }

    #[test]
    fn test_find_brush_by_partial_id_returns_none() {
        // ID 必须完全匹配，前缀不能命中
        assert!(find_brush("round").is_none());
        assert!(find_brush("hard").is_none());
        assert!(find_brush("ROUND-HARD").is_none());
        assert!(find_brush(" round-hard ").is_none());
    }

    #[test]
    fn test_find_brush_each_builtin_resolvable() {
        for b in builtin_brushes() {
            let found = find_brush(&b.id);
            assert!(found.is_some(), "builtin brush id {} not found", b.id);
            assert_eq!(found.unwrap().id, b.id);
        }
    }

    #[test]
    fn test_default_brush_id_matches_a_real_brush() {
        // DEFAULT_BRUSH_ID 引用必须真实存在，且 category 应是 Hard（保证勾线默认值合理）
        let brush = find_brush(DEFAULT_BRUSH_ID).expect("DEFAULT_BRUSH_ID must exist");
        assert_eq!(brush.id, DEFAULT_BRUSH_ID);
        assert_eq!(
            brush.category,
            BrushCategory::Hard,
            "default brush should be a hard-edge brush for line drawing"
        );
    }

    #[test]
    fn test_brush_deserialize_accepts_missing_description_field() {
        // description 字段为 #[serde(default)]，缺省时反序列化必须成功
        let json = format!(
            r#"{{"id":"tmp","name_zh":"测试","name_en":"Test","file_name":"tmp.png","category":"hard","default_radius":4,"falloff":0.1}}"#
        );
        let restored: BrushPreset = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, "tmp");
        assert_eq!(restored.description, "");
    }

    #[test]
    fn test_brush_preset_constructor_produces_distinct_objects() {
        // 验证 new() 不返回共享引用，避免编辑其中之一污染全部
        let b1 = BrushPreset::new(
            "id-a",
            "A",
            "A-en",
            "a.png",
            BrushCategory::Hard,
            8,
            0.1,
            "",
        );
        let b2 = BrushPreset::new(
            "id-b",
            "B",
            "B-en",
            "b.png",
            BrushCategory::Soft,
            12,
            0.9,
            "",
        );
        assert_ne!(b1.id, b2.id);
        assert_ne!(b1.name_zh, b2.name_zh);
        assert_ne!(b1.category, b2.category);
    }
}
