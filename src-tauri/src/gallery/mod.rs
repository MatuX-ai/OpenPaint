//! 图库管理模块（M-06，W3 实施）
//!
//! 职责：
//! - SQLite 索引（CRUD + 标签 + 分组）
//! - 缩略图生成（WebP，256px）
//! - 存储策略（500 张上限，自动轮转）
//! - 向量搜索（阶段三 LanceDB 集成）

pub mod database;
pub mod engine;

pub use database::GalleryDatabase;
pub use engine::GalleryEngine;

/// 图库条目元数据（与 SQLite 表结构对应）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GalleryItem {
    pub id: String,
    pub group_id: Option<String>,
    pub thumbnail_path: String,
    pub full_size_path: Option<String>,
    pub width: u32,
    pub height: u32,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub source: String, // "ai_generated" | "imported"
}

/// 图库搜索参数（前端 → 后端）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GallerySearchParams {
    pub query: Option<String>,
    pub tag: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// 图库搜索结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GallerySearchResult {
    pub items: Vec<GalleryItem>,
    pub total: u32,
}
