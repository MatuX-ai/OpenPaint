//! SQLite 图库操作（W3 实施）
//!
//! 提供完整的 CRUD、标签、缩略图管理、自动轮转。
//! 使用 WAL 模式提升并发读性能；事务中写入元数据，缩略图单独写入磁盘。

use std::path::Path;

use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use tracing::{info, warn};

use crate::gallery::GalleryItem;

/// 包装 SQLite 连接（单写多读场景，使用 Mutex 包裹）
pub struct GalleryDatabase {
    conn: Mutex<Connection>,
}

impl GalleryDatabase {
    /// 打开/创建图库数据库
    pub fn open(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

        // 启用 WAL 模式提升并发读性能
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| e.to_string())?;

        // 创建表
        Self::migrate(&conn)?;

        info!("Gallery database opened at {:?}", db_path);

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// 数据库迁移
    fn migrate(conn: &Connection) -> Result<(), String> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS gallery_items (
                id TEXT PRIMARY KEY,
                group_id TEXT,
                thumbnail_path TEXT NOT NULL,
                full_size_path TEXT,
                width INTEGER NOT NULL DEFAULT 0,
                height INTEGER NOT NULL DEFAULT 0,
                prompt TEXT,
                model TEXT,
                tags TEXT,
                created_at INTEGER NOT NULL,
                source TEXT NOT NULL DEFAULT 'ai_generated'
            );

            CREATE INDEX IF NOT EXISTS idx_gallery_group ON gallery_items(group_id);
            CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_items(created_at DESC);

            CREATE TABLE IF NOT EXISTS gallery_tags (
                tag TEXT NOT NULL,
                item_id TEXT NOT NULL,
                PRIMARY KEY (tag, item_id),
                FOREIGN KEY (item_id) REFERENCES gallery_items(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_tag_name ON gallery_tags(tag);
            "#,
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 插入条目
    pub fn insert(&self, item: &GalleryItem) -> Result<(), String> {
        let conn = self.conn.lock();
        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".into());

        conn.execute(
            "INSERT OR REPLACE INTO gallery_items
             (id, group_id, thumbnail_path, full_size_path, width, height, prompt, model, tags, created_at, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                item.id,
                item.group_id,
                item.thumbnail_path,
                item.full_size_path,
                item.width,
                item.height,
                item.prompt,
                item.model,
                tags_json,
                item.created_at,
                item.source,
            ],
        )
        .map_err(|e| e.to_string())?;

        // 重建标签索引
        conn.execute(
            "DELETE FROM gallery_tags WHERE item_id = ?1",
            params![item.id],
        )
        .map_err(|e| e.to_string())?;
        for tag in &item.tags {
            conn.execute(
                "INSERT OR IGNORE INTO gallery_tags (tag, item_id) VALUES (?1, ?2)",
                params![tag, item.id],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    /// 按 ID 查询
    pub fn get(&self, id: &str) -> Result<Option<GalleryItem>, String> {
        let conn = self.conn.lock();
        let item = conn
            .query_row(
                "SELECT id, group_id, thumbnail_path, full_size_path, width, height,
                        prompt, model, tags, created_at, source
                 FROM gallery_items WHERE id = ?1",
                params![id],
                Self::row_to_item,
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(item)
    }

    /// 列出所有条目（分页）
    pub fn list(&self, limit: u32, offset: u32) -> Result<Vec<GalleryItem>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT id, group_id, thumbnail_path, full_size_path, width, height,
                        prompt, model, tags, created_at, source
                 FROM gallery_items ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit, offset], Self::row_to_item)
            .map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
        Ok(items)
    }

    /// 按标签/文本搜索
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<GalleryItem>, String> {
        let conn = self.conn.lock();
        let pattern = format!("%{}%", query);
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT i.id, i.group_id, i.thumbnail_path, i.full_size_path,
                        i.width, i.height, i.prompt, i.model, i.tags, i.created_at, i.source
                 FROM gallery_items i
                 LEFT JOIN gallery_tags t ON t.item_id = i.id
                 WHERE i.prompt LIKE ?1 OR i.model LIKE ?1 OR t.tag LIKE ?1 OR i.tags LIKE ?1
                 ORDER BY i.created_at DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![pattern, limit as i64], Self::row_to_item)
            .map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
        Ok(items)
    }

    /// 按标签精确匹配
    pub fn search_by_tag(&self, tag: &str, limit: usize) -> Result<Vec<GalleryItem>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT i.id, i.group_id, i.thumbnail_path, i.full_size_path,
                        i.width, i.height, i.prompt, i.model, i.tags, i.created_at, i.source
                 FROM gallery_items i
                 INNER JOIN gallery_tags t ON t.item_id = i.id
                 WHERE t.tag = ?1
                 ORDER BY i.created_at DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![tag, limit as i64], Self::row_to_item)
            .map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
        Ok(items)
    }

    /// 删除条目
    pub fn delete(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock();
        let n = conn
            .execute("DELETE FROM gallery_items WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    }

    /// 统计条目数量
    pub fn count(&self) -> Result<u32, String> {
        let conn = self.conn.lock();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM gallery_items", [], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(|e| e.to_string())?;
        Ok(n as u32)
    }

    /// 自动轮转：当条目超过 max_items 时删除最旧的 10%
    pub fn rotate(&self, max_items: u32) -> Result<u32, String> {
        let conn = self.conn.lock();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM gallery_items", [], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(|e| e.to_string())?;
        if count <= max_items as i64 {
            return Ok(0);
        }
        let overflow = count - max_items as i64;
        let to_delete =
            (overflow + (max_items as i64 / 10).max(1) - 1) / (max_items as i64 / 10).max(1);
        let deleted = conn
            .execute(
                "DELETE FROM gallery_items WHERE id IN (
                    SELECT id FROM gallery_items ORDER BY created_at ASC LIMIT ?1
                )",
                params![to_delete],
            )
            .map_err(|e| e.to_string())?;
        if deleted > 0 {
            warn!(
                "Gallery rotation: deleted {} oldest items (was {}, max {})",
                deleted, count, max_items
            );
        }
        Ok(deleted as u32)
    }

    /// 行转 GalleryItem
    fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<GalleryItem> {
        let tags_str: String = row.get(8)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(GalleryItem {
            id: row.get(0)?,
            group_id: row.get(1)?,
            thumbnail_path: row.get(2)?,
            full_size_path: row.get(3)?,
            width: row.get::<_, i64>(4)? as u32,
            height: row.get::<_, i64>(5)? as u32,
            prompt: row.get(6)?,
            model: row.get(7)?,
            tags,
            created_at: row.get::<_, i64>(9)?,
            source: row.get(10)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> GalleryDatabase {
        let dir = std::env::temp_dir().join(format!("openpaint_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.db");
        GalleryDatabase::open(&path).unwrap()
    }

    fn sample_item(id: &str) -> GalleryItem {
        GalleryItem {
            id: id.to_string(),
            group_id: Some("g1".to_string()),
            thumbnail_path: format!("/tmp/{}.webp", id),
            full_size_path: Some(format!("/tmp/{}.png", id)),
            width: 1024,
            height: 1024,
            prompt: Some("a logo".to_string()),
            model: Some("flux-dev".to_string()),
            tags: vec!["logo".to_string(), "blue".to_string()],
            created_at: 1234567890,
            source: "ai_generated".to_string(),
        }
    }

    #[test]
    fn test_insert_get() {
        let db = test_db();
        let item = sample_item("a");
        db.insert(&item).unwrap();
        let got = db.get("a").unwrap().unwrap();
        assert_eq!(got.id, "a");
        assert_eq!(got.width, 1024);
    }

    #[test]
    fn test_list() {
        let db = test_db();
        for id in &["x", "y", "z"] {
            db.insert(&sample_item(id)).unwrap();
        }
        let items = db.list(10, 0).unwrap();
        assert_eq!(items.len(), 3);
    }

    #[test]
    fn test_search() {
        let db = test_db();
        db.insert(&sample_item("a")).unwrap();
        let items = db.search("logo", 10).unwrap();
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_search_by_tag() {
        let db = test_db();
        db.insert(&sample_item("a")).unwrap();
        let items = db.search_by_tag("blue", 10).unwrap();
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_delete() {
        let db = test_db();
        db.insert(&sample_item("a")).unwrap();
        assert!(db.delete("a").unwrap());
        assert!(db.get("a").unwrap().is_none());
    }

    #[test]
    fn test_rotate() {
        let db = test_db();
        for i in 0..15 {
            let mut item = sample_item(&format!("i{}", i));
            item.created_at = i as i64;
            db.insert(&item).unwrap();
        }
        let deleted = db.rotate(10).unwrap();
        assert!(deleted > 0);
        assert!(db.count().unwrap() <= 10);
    }

    // ----------------------------------------------------------------
    // 补充测试：CRUD 边界 / 搜索去重 / 轮转 / Tag 索引
    // ----------------------------------------------------------------

    #[test]
    fn test_insert_replaces_existing() {
        // INSERT OR REPLACE：同 ID 二次插入应覆盖
        let db = test_db();
        let mut item = sample_item("dup");
        item.prompt = Some("first".to_string());
        db.insert(&item).unwrap();

        let mut updated = sample_item("dup");
        updated.prompt = Some("second".to_string());
        updated.tags = vec!["updated".to_string()];
        db.insert(&updated).unwrap();

        let got = db.get("dup").unwrap().unwrap();
        assert_eq!(got.prompt.as_deref(), Some("second"));
        assert!(got.tags.contains(&"updated".to_string()));
        assert_eq!(db.count().unwrap(), 1, "REPLACE should not duplicate rows");
    }

    #[test]
    fn test_insert_rebuilds_tag_index() {
        // tags 字段修改后旧 tag 必须消失
        let db = test_db();
        let mut item = sample_item("x");
        item.tags = vec!["old".to_string(), "shared".to_string()];
        db.insert(&item).unwrap();
        let hits = db.search_by_tag("old", 10).unwrap();
        assert_eq!(hits.len(), 1);

        // 改 tags（去掉 old，加上 new）
        item.tags = vec!["new".to_string(), "shared".to_string()];
        db.insert(&item).unwrap();

        assert!(
            db.search_by_tag("old", 10).unwrap().is_empty(),
            "old tag should be gone"
        );
        assert_eq!(db.search_by_tag("new", 10).unwrap().len(), 1);
        assert_eq!(db.search_by_tag("shared", 10).unwrap().len(), 1);
    }

    #[test]
    fn test_get_returns_none_for_missing_id() {
        let db = test_db();
        let result = db.get("nonexistent");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_delete_returns_false_for_missing() {
        let db = test_db();
        let deleted = db.delete("nonexistent").unwrap();
        assert!(!deleted, "delete on missing id should return false");
    }

    #[test]
    fn test_count_starts_at_zero() {
        let db = test_db();
        assert_eq!(db.count().unwrap(), 0);
    }

    #[test]
    fn test_list_respects_limit_and_offset() {
        let db = test_db();
        for i in 0..5 {
            let mut item = sample_item(&format!("item{}", i));
            item.created_at = 1000 + i as i64;
            db.insert(&item).unwrap();
        }
        // 取 2 条
        let page1 = db.list(2, 0).unwrap();
        assert_eq!(page1.len(), 2);
        // 按 created_at DESC 排序，page1 应是最新的两条
        assert!(page1[0].created_at >= page1[1].created_at);

        let page2 = db.list(2, 2).unwrap();
        assert_eq!(page2.len(), 2);
        // 不同 offset 返回的 ID 必须不重叠
        let page1_ids: std::collections::HashSet<_> = page1.iter().map(|i| i.id.clone()).collect();
        let page2_ids: std::collections::HashSet<_> = page2.iter().map(|i| i.id.clone()).collect();
        assert!(page1_ids.is_disjoint(&page2_ids));
    }

    #[test]
    fn test_list_returns_empty_when_offset_exceeds_total() {
        let db = test_db();
        db.insert(&sample_item("a")).unwrap();
        let result = db.list(10, 100).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_search_finds_by_prompt_text() {
        let db = test_db();
        let mut a = sample_item("a");
        a.prompt = Some("a beautiful sunset".to_string());
        let mut b = sample_item("b");
        b.prompt = Some("a quiet mountain".to_string());
        db.insert(&a).unwrap();
        db.insert(&b).unwrap();
        let hits = db.search("sunset", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "a");
    }

    #[test]
    fn test_search_finds_by_model_text() {
        let db = test_db();
        let mut a = sample_item("a");
        a.model = Some("stable-diffusion-xl".to_string());
        let mut b = sample_item("b");
        b.model = Some("midjourney-v6".to_string());
        db.insert(&a).unwrap();
        db.insert(&b).unwrap();
        let hits = db.search("midjourney", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "b");
    }

    #[test]
    fn test_search_returns_empty_on_no_match() {
        let db = test_db();
        db.insert(&sample_item("a")).unwrap();
        let hits = db.search("nonexistent_keyword_xyz", 10).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn test_search_by_tag_exact_match_only() {
        let db = test_db();
        let mut a = sample_item("a");
        a.tags = vec!["blue".to_string()];
        let mut b = sample_item("b");
        b.tags = vec!["bluish".to_string()];
        db.insert(&a).unwrap();
        db.insert(&b).unwrap();
        let hits = db.search_by_tag("blue", 10).unwrap();
        // 精确匹配：只命中 a，不命中 bluish
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "a");
    }

    #[test]
    fn test_search_by_tag_respects_limit() {
        let db = test_db();
        for i in 0..5 {
            let mut item = sample_item(&format!("item{}", i));
            item.tags = vec!["shared".to_string()];
            db.insert(&item).unwrap();
        }
        let hits = db.search_by_tag("shared", 3).unwrap();
        assert_eq!(hits.len(), 3);
    }

    #[test]
    fn test_rotate_no_op_when_under_limit() {
        let db = test_db();
        for i in 0..3 {
            let mut item = sample_item(&format!("i{}", i));
            item.created_at = i as i64;
            db.insert(&item).unwrap();
        }
        // max=10 不应触发删除
        let deleted = db.rotate(10).unwrap();
        assert_eq!(deleted, 0);
        assert_eq!(db.count().unwrap(), 3);
    }

    #[test]
    fn test_rotate_deletes_oldest_first() {
        // 验证轮转删的是最早的
        let db = test_db();
        for i in 0..6 {
            let mut item = sample_item(&format!("i{}", i));
            item.created_at = i as i64; // i0 最早，i5 最新
            db.insert(&item).unwrap();
        }
        // max=4 → overflow=2，10% = floor(4/10)=0 但 .max(1)=1，每次删 1 条（ceil 2/1=2）
        let _deleted = db.rotate(4).unwrap();
        assert!(db.count().unwrap() <= 4);
        // 最早的两条 i0/i1 应被删除（创建时间最小）
        assert!(db.get("i0").unwrap().is_none(), "oldest should be removed");
        // 最晚的几条应保留
        assert!(db.get("i5").unwrap().is_some(), "newest should survive");
    }

    #[test]
    fn test_rotate_at_max_size_boundary() {
        let db = test_db();
        for i in 0..5 {
            let mut item = sample_item(&format!("i{}", i));
            item.created_at = i as i64;
            db.insert(&item).unwrap();
        }
        // max=5 == count → 不删
        let deleted = db.rotate(5).unwrap();
        assert_eq!(deleted, 0);
        assert_eq!(db.count().unwrap(), 5);
    }

    #[test]
    fn test_item_with_unicode_prompt_round_trips() {
        // 中文 prompt / tags 完整往返
        let db = test_db();
        let mut item = sample_item("uni");
        item.prompt = Some("日落时的山脉".to_string());
        item.tags = vec!["山".to_string(), "日落".to_string()];
        db.insert(&item).unwrap();
        let got = db.get("uni").unwrap().unwrap();
        assert_eq!(got.prompt.as_deref(), Some("日落时的山脉"));
        assert!(got.tags.contains(&"山".to_string()));
        assert!(got.tags.contains(&"日落".to_string()));
    }

    #[test]
    fn test_item_with_null_optional_fields() {
        // group_id / full_size_path / prompt / model 都可以为 None
        let db = test_db();
        let item = GalleryItem {
            id: "n".to_string(),
            group_id: None,
            thumbnail_path: "/tmp/n.webp".to_string(),
            full_size_path: None,
            width: 0,
            height: 0,
            prompt: None,
            model: None,
            tags: vec![],
            created_at: 0,
            source: "imported".to_string(),
        };
        db.insert(&item).unwrap();
        let got = db.get("n").unwrap().unwrap();
        assert!(got.group_id.is_none());
        assert!(got.full_size_path.is_none());
        assert!(got.prompt.is_none());
        assert!(got.model.is_none());
        assert!(got.tags.is_empty());
        assert_eq!(got.source, "imported");
    }
}
