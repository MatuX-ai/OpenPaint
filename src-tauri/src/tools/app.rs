//! 应用信息命令

use serde::Serialize;

/// 应用基础信息
#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub stage: &'static str,
}

/// 获取应用信息
#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "OpenPaint",
        version: env!("CARGO_PKG_VERSION"),
        stage: "mvp-scaffold",
    }
}

/// 仅返回版本号
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}