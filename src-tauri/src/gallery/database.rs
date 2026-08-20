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
}
