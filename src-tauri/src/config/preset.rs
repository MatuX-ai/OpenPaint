//! 预设尺寸模板常量
//!
//! 与 `assets/default_config.yaml` 中的预设保持一致。

/// Web 平台图标尺寸
pub const WEB_SIZES: &[u32] = &[16, 32, 48, 180, 192, 512];

/// iOS 平台图标尺寸（含 @1x / @2x / @3x）
pub const IOS_SIZES: &[f32] = &[20.0, 29.0, 40.0, 60.0, 76.0, 83.5, 1024.0];

/// Android 平台图标尺寸（dp）
pub const ANDROID_SIZES: &[u32] = &[48, 72, 96, 144, 192, 512];

/// Favicon 尺寸
pub const FAVICON_SIZES: &[u32] = &[16, 32, 64];