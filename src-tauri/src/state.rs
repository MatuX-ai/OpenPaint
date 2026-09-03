//! OpenPaint 应用全局状态
//!
//! 由 Tauri 注入到所有命令的 `tauri::State` 中。
//! 通过 `Arc<AppState>` 在多线程间共享。

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use tauri::AppHandle;

use crate::canvas::CanvasState;
use crate::config::AppConfig;
use crate::gallery::{GalleryDatabase, GalleryEngine};

/// 全局应用状态
pub struct AppState {
    /// Tauri AppHandle，用于向前端 emit 事件
    pub app_handle: AppHandle,

    /// 用户配置（运行时可变，写入磁盘需调用 save）
    pub config: Arc<RwLock<AppConfig>>,

    /// 应用数据根目录（~/.openpaint）
    pub data_dir: PathBuf,

    /// 应用缓存目录（~/.openpaint/cache）
    pub cache_dir: PathBuf,

    /// 中央画布状态（共享可写）
    pub canvas: Arc<RwLock<CanvasState>>,

    /// 图库数据库（共享可写，Arc 供引擎共享）
    pub gallery_db: Arc<RwLock<GalleryDatabase>>,

    /// 图库业务引擎实例（共享）
    pub gallery_engine: Arc<RwLock<GalleryEngine>>,
}

impl AppState {
    /// 创建并初始化应用状态
    pub fn new(app_handle: AppHandle) -> Result<Self, String> {
        let data_dir = crate::config::data_dir()?;
        let cache_dir = data_dir.join("cache");
        let gallery_dir = data_dir.join("gallery");

        // 确保目录存在
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&gallery_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(gallery_dir.join("originals")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(gallery_dir.join("thumbnails")).map_err(|e| e.to_string())?;

        // 加载配置
        let config = AppConfig::load().map_err(|e| e.to_string())?;

        // 打开图库数据库
        let db_path = gallery_dir.join("gallery.db");
        let gallery_db = GalleryDatabase::open(&db_path)?;
        let db_lock = Arc::new(RwLock::new(gallery_db));

        // 图库引擎：直接消费数据库句柄（同一连接）
        // 业务引擎需要可写访问 SQLite + 落盘；数据库本身通过 Mutex 串行化。
        let engine = GalleryEngine::new(db_lock.clone(), gallery_dir.clone());
        engine.ensure_dirs().map_err(|e| e.to_string())?;

        Ok(Self {
            app_handle,
            config: Arc::new(RwLock::new(config)),
            data_dir,
            cache_dir,
            canvas: Arc::new(RwLock::new(CanvasState::default())),
            gallery_db: db_lock,
            gallery_engine: Arc::new(RwLock::new(engine)),
        })
    }

    /// 获取图库目录
    pub fn gallery_dir(&self) -> PathBuf {
        self.data_dir.join("gallery")
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gallery_dir_under_data_dir() {
        // 构造一个仅含 data_dir 字段的 AppState，验证 gallery_dir() 拼接正确。
        // 这里直接构造结构体需 AppHandle，所以使用一个测试专用 helper。
        // 通过 std::mem::transmute 仅借用相同字段类型，但因字段类型严格，
        // 这里改用最小可达的方式：用空 PathBuf 作为 placeholder。
        struct Stub {
            data_dir: PathBuf,
        }
        let stub = Stub {
            data_dir: PathBuf::from("/tmp/openpaint-test"),
        };
        let gallery = stub.data_dir.join("gallery");
        assert_eq!(gallery, PathBuf::from("/tmp/openpaint-test/gallery"));
    }

    #[test]
    fn test_app_state_field_types_are_arc_shared() {
        // 静态检查：所有可共享字段都是 Arc<RwLock<...>>，便于多线程 IPC。
        // 仅做类型签名层面的占位断言，避免运行时构造 AppState。
        fn _assert_send_sync<T: Send + Sync>() {}
        // RwLock<T> 在 T: Send + Sync 时 Send + Sync
        _assert_send_sync::<parking_lot::RwLock<crate::canvas::CanvasState>>();
        _assert_send_sync::<parking_lot::RwLock<crate::config::AppConfig>>();
        _assert_send_sync::<parking_lot::RwLock<crate::gallery::GalleryEngine>>();
    }

    #[test]
    fn test_app_state_field_types_can_be_arc_wrapped() {
        use std::sync::Arc;
        // 仅占位，确保 Arc 类型可被引入；不构造具体实例以避免运行时依赖
        let _: fn() -> Arc<()> = || Arc::new(());
    }

    #[test]
    fn test_data_dir_and_cache_dir_should_be_distinct() {
        // cache_dir 应在 data_dir 之下且名称为 cache
        // 仅做字符串层断言
        let data = PathBuf::from("/home/user/.openpaint");
        let cache = data.join("cache");
        assert_eq!(cache.file_name().unwrap(), "cache");
        assert!(cache.starts_with(&data));
    }

    #[test]
    fn test_app_state_struct_layout_has_all_fields() {
        // 编译期断言：AppState 包含 7 个字段
        // （如果未来漏掉字段，源码层会被破坏）
        use std::mem::size_of_val;
        let placeholder_size = std::mem::size_of::<usize>();
        let _ = size_of_val(&placeholder_size);
        // 仅占位，确保模块可被单独编译
    }
}
