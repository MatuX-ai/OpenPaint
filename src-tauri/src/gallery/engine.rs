//! 图库业务引擎（缩略图生成、文件存储、自动轮转）
//!
//! 介于 SQLite 数据库与前端之间的胶水层。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Result;
use base64::Engine;
use chrono::Utc;
use parking_lot::RwLock;
use tracing::debug;

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
        let original_path = self
            .gallery_dir
            .join("originals")
            .join(format!("{}.png", id));
        std::fs::create_dir_all(original_path.parent().unwrap())?;
        img.save(&original_path)?;

        // 生成并保存缩略图
        let thumb_path = self
            .gallery_dir
            .join("thumbnails")
            .join(format!("{}.webp", id));
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
        self.db
            .write()
            .insert(&item)
            .map_err(|e| anyhow::anyhow!("db insert failed: {}", e))?;

        debug!("Gallery saved item {}", id);
        Ok(item)
    }

    /// 自动轮转（条目超过 max_items 时删除最旧的 10%）
    pub fn rotate(&self, max_items: u32) -> Result<u32> {
        let deleted = self
            .db
            .read()
            .rotate(max_items)
            .map_err(|e| anyhow::anyhow!("db rotate failed: {}", e))?;
        if deleted > 0 {
            // 删除文件（墓碑记录保留 30 天，此处仅删除文件）
            let items = self
                .db
                .read()
                .list(deleted, 0)
                .map_err(|e| anyhow::anyhow!("db list failed: {}", e))?;
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
        let dir =
            std::env::temp_dir().join(format!("openpaint_engine_test_{}", uuid::Uuid::new_v4()));
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

    // ----------------------------------------------------------------
    // 补充测试：save / ensure_dirs / rotate / 边界用例
    // ----------------------------------------------------------------

    #[test]
    fn test_ensure_dirs_creates_subdirs() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();
        assert!(dir.join("originals").exists());
        assert!(dir.join("thumbnails").exists());
    }

    #[test]
    fn test_save_creates_thumbnail_and_db_entry() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        // 编码 32x32 红色 PNG
        let img = image::RgbaImage::from_pixel(32, 32, image::Rgba([255, 0, 0, 255]));
        let mut buf = Vec::new();
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new(&mut buf)
            .write_image(
                img.as_raw(),
                img.width(),
                img.height(),
                image::ExtendedColorType::Rgba8,
            )
            .unwrap();
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);

        let item = engine
            .save(
                &b64,
                Some("test red".to_string()),
                Some("test-model".to_string()),
                vec!["red".to_string(), "test".to_string()],
                None,
                "imported",
            )
            .unwrap();

        assert_eq!(item.width, 32);
        assert_eq!(item.height, 32);
        assert_eq!(item.source, "imported");
        assert_eq!(item.prompt.as_deref(), Some("test red"));
        assert_eq!(item.model.as_deref(), Some("test-model"));

        // originals/{id}.png 必须落盘
        let original = dir.join("originals").join(format!("{}.png", item.id));
        assert!(original.exists(), "original png should be persisted");
        // thumbnails/{id}.webp 必须落盘
        let thumb = dir.join("thumbnails").join(format!("{}.webp", item.id));
        assert!(thumb.exists(), "thumbnail webp should be persisted");

        // DB 必须记录 1 条
        assert_eq!(engine.db().read().count().unwrap(), 1);
        let fetched = engine.db().read().get(&item.id).unwrap().unwrap();
        assert_eq!(fetched.id, item.id);
    }

    #[test]
    fn test_save_with_data_url_prefix() {
        // save() 接受 data:image/png;base64, 前缀
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        let img = image::RgbaImage::from_pixel(8, 8, image::Rgba([0, 0, 0, 255]));
        let mut buf = Vec::new();
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new(&mut buf)
            .write_image(
                img.as_raw(),
                img.width(),
                img.height(),
                image::ExtendedColorType::Rgba8,
            )
            .unwrap();
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        let data_url = format!("data:image/png;base64,{}", b64);

        let item = engine
            .save(&data_url, None, None, vec![], None, "ai_generated")
            .unwrap();
        assert_eq!(item.width, 8);
        assert!(item.prompt.is_none());
        assert!(item.model.is_none());
    }

    #[test]
    fn test_save_invalid_base64_errors() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        let res = engine.save(
            "not-valid-base64!!!",
            None,
            None,
            vec![],
            None,
            "ai_generated",
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_save_invalid_image_data_errors() {
        // base64 合法但不是图片 → 应报错
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        let b64 = base64::engine::general_purpose::STANDARD.encode(b"hello world");
        let res = engine.save(&b64, None, None, vec![], None, "ai_generated");
        assert!(res.is_err(), "non-image base64 should fail");
    }

    #[test]
    fn test_rotate_below_limit_no_op() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        let item = engine.save_demo_entry().unwrap();
        // max_items > 当前 → rotate 应返回 0
        let deleted = engine.rotate(100).unwrap();
        assert_eq!(deleted, 0);
        assert!(engine.db().read().get(&item.id).unwrap().is_some());
    }

    #[test]
    fn test_rotate_deletes_oldest_when_over_limit() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        // 插 5 条：created_at 由小到大
        let mut ids = Vec::new();
        for i in 0..5 {
            let mut item = engine.save_demo_entry().unwrap();
            item.created_at = 1000 + i;
            // 直接改 DB 的 created_at（绕开 Utc::now）
            engine.db().write().insert(&item).unwrap();
            ids.push(item.id);
        }
        // max=3 → 应删最早的 2 条
        let deleted = engine.rotate(3).unwrap();
        assert!(deleted > 0);
        assert!(engine.db().read().count().unwrap() <= 3);
        // 最早的应被删
        assert!(engine.db().read().get(&ids[0]).unwrap().is_none());
        // 最新的应保留
        assert!(engine.db().read().get(&ids[4]).unwrap().is_some());
    }

    #[test]
    fn test_rotate_attempts_to_remove_files() {
        // 轮转后应尝试删除磁盘文件（即使文件不存在也不应 panic）
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        // 插 5 条 demo
        for _ in 0..5 {
            let _ = engine.save_demo_entry().unwrap();
        }
        // max=3
        let deleted = engine.rotate(3).unwrap();
        assert!(deleted > 0);
        // 不强制要求所有 thumbnail 文件被删（rotate 是 best-effort 删除），
        // 但调用不应 panic。
    }

    #[test]
    fn test_gallery_dir_accessor() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        assert_eq!(engine.gallery_dir(), dir.as_path());
    }

    #[test]
    fn test_db_accessor_returns_same_arc() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc.clone(), dir.clone());
        let got = engine.db();
        // Arc::ptr_eq 比较两个 Arc 是否指向同一底层对象
        assert!(Arc::ptr_eq(&db_arc, &got));
    }

    #[test]
    fn test_multiple_saves_produce_unique_ids() {
        let (db, dir) = test_db();
        let db_arc = Arc::new(RwLock::new(db));
        let engine = GalleryEngine::new(db_arc, dir.clone());
        engine.ensure_dirs().unwrap();

        let item1 = engine.save_demo_entry().unwrap();
        let item2 = engine.save_demo_entry().unwrap();
        let item3 = engine.save_demo_entry().unwrap();
        assert_ne!(item1.id, item2.id);
        assert_ne!(item2.id, item3.id);
        assert_ne!(item1.id, item3.id);
    }
}
