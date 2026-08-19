//! 图库业务引擎（缩略图生成、文件存储、自动轮转）
//!
//! 介于 SQLite 数据库与前端之间的胶水层。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Result;
use base64::Engine;
use chrono::Utc;
use parking_lot::RwLock;
use tracing::{debug};

use crate::canvas::CanvasRenderer;
use crate::gallery::database::GalleryDatabase;
use crate::gallery::GalleryItem;

/// 图库引擎：处理图片落盘 + 缩略图 + 元数据
pub struct GalleryEngine {
    db: Arc<RwLock<GalleryDatabase>>,
    gallery_dir: PathBuf,
}

impl GalleryEngine {
    /// 创建图库引擎
    pub fn new(db: Arc<RwLock<GalleryDatabase>>, gallery_dir: PathBuf) -> Self {
        Self { db, gallery_dir }
    }

    /// 初始化目录结构
    pub fn ensure_dirs(&self) -> Result<()> {
        std::fs::create_dir_all(self.gallery_dir.join("originals"))?;
        std::fs::create_dir_all(self.gallery_dir.join("thumbnails"))?;
        Ok(())
    }

    /// 保存图片到图库
    ///
    /// 输入：PNG base64 数据 + 元数据
    /// 流程：
    /// 1. 解码 PNG → RGBA
    /// 2. 生成缩略图（WebP 256px）
    /// 3. 落盘 originals/{uuid}.png
    /// 4. 落盘 thumbnails/{uuid}.webp
    /// 5. SQLite 写入元数据
    pub fn save(
        &self,
        image_data_b64: &str,
        prompt: Option<String>,
        model: Option<String>,
        tags: Vec<String>,
        group_id: Option<String>,
        source: &str,
    ) -> Result<GalleryItem> {
        let id = uuid::Uuid::new_v4().to_string();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(image_data_b64.trim_start_matches("data:image/png;base64,"))
            .map_err(|e| anyhow::anyhow!("base64 decode failed: {}", e))?;
        let img = image::load_from_memory(&bytes)
            .map_err(|e| anyhow::anyhow!("image decode failed: {}", e))?
            .to_rgba8();
        let (width, height) = (img.width(), img.height());

        // 保存原图
        let original_path = self.gallery_dir.join("originals").join(format!("{}.png", id));
        std::fs::create_dir_all(original_path.parent().unwrap())?;
        img.save(&original_path)?;

        // 生成并保存缩略图
        let thumb_path = self.gallery_dir.join("thumbnails").join(format!("{}.webp", id));
        let thumb_bytes = CanvasRenderer::thumbnail(&img, 256)?;
        std::fs::write(&thumb_path, &thumb_bytes)?;

        // 写入 SQLite
        let item = GalleryItem {
            id: id.clone(),
            group_id,
            thumbnail_path: thumb_path.to_string_lossy().to_string(),
            full_size_path: Some(original_path.to_string_lossy().to_string()),
            width,
            height,
            prompt,
            model,
            tags,
            created_at: Utc::now().timestamp_millis(),
            source: source.to_string(),
        };
        self.db.write().insert(&item).map_err(|e| anyhow::anyhow!("db insert failed: {}", e))?;

        debug!("Gallery saved item {}", id);
        Ok(item)
    }

    /// 自动轮转（条目超过 max_items 时删除最旧的 10%）
    pub fn rotate(&self, max_items: u32) -> Result<u32> {
        let deleted = self.db.read().rotate(max_items).map_err(|e| anyhow::anyhow!("db rotate failed: {}", e))?;
        if deleted > 0 {
            // 删除文件（墓碑记录保留 30 天，此处仅删除文件）
            let items = self.db.read().list(deleted, 0).map_err(|e| anyhow::anyhow!("db list failed: {}", e))?;
            for item in items {
                let _ = std::fs::remove_file(&item.thumbnail_path);
                if let Some(p) = item.full_size_path {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
        Ok(deleted)
    }

    /// 数据库引用
    pub fn db(&self) -> Arc<RwLock<GalleryDatabase>> {
        self.db.clone()
    }

    /// 图库目录
    pub fn gallery_dir(&self) -> &Path {
        &self.gallery_dir
    }

    /// 创建示例条目（W3 烟雾测试用）
    pub fn save_demo_entry(&self) -> Result<GalleryItem> {
        // 创建一个 512x512 的渐变图作为演示
        let mut img = image::RgbaImage::new(512, 512);
        for y in 0..512 {
            for x in 0..512 {
                let r = (x * 255 / 512) as u8;
                let g = (y * 255 / 512) as u8;
                let b = ((x + y) * 128 / 512) as u8;
                img.put_pixel(x, y, image::Rgba([r, g, b, 255]));
            }
        }
        let mut buf = Vec::new();
        // image 0.25: PngEncoder::write_image 来自 ImageEncoder trait，需要 use。
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new(&mut buf).write_image(
            img.as_raw(),
            img.width(),
            img.height(),
            image::ExtendedColorType::Rgba8,
        )?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);

        self.save(
            &b64,
            Some("demo gradient".to_string()),
            Some("demo".to_string()),
            vec!["demo".to_string(), "gradient".to_string()],
            None,
            "ai_generated",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> (GalleryDatabase, PathBuf) {
        let dir = std::env::temp_dir().join(format!("openpaint_engine_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = GalleryDatabase::open(&dir.join("test.db")).unwrap();
        (db, dir)
    }

    #[test]
    fn test_save_demo_entry() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();
        let item = engine.save_demo_entry().unwrap();
        assert_eq!(item.width, 512);
        assert_eq!(item.source, "ai_generated");
    }
}