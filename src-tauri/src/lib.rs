//! OpenPaint shared library.
//!
//! Module organization:
//! - canvas  : Central canvas engine (M-03, W2)
//! - agent   : Hermes Agent integration (M-09, W4)
//! - gallery : Gallery management (M-06, W3)
//! - tools   : Atomic tools (M-08/M-10)
//! - config  : Configuration management (M-07, W1)
//! - state   : Shared application state

pub mod agent;
pub mod canvas;
pub mod config;
pub mod gallery;
pub mod state;
pub mod tools;

pub use agent::mcp;

use std::sync::Arc;

use tauri::Manager;
use tracing::{info, warn};

use crate::state::AppState;

/// Tauri application entry point. Used by `src/main.rs` and unit tests.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 注意：日志系统由 tauri_plugin_log 在下面初始化，
    // 这里不再单独 init tracing 的全局 subscriber，否则会触发
    // "attempted to set a logger after the logging system was already initialized"。
    // tracing 仍然可以通过 log facade 输出（tauri_plugin_log 默认使用 env_logger/log）。

    info!("OpenPaint starting up...");

    // WebView2 Runtime 缺失检测：在 wry 创建 webview 前尽早拦截。
    // 缺失时 wry 会在生成 webview 时静默失败，表现为「黑屏」+ 进程退出。
    // 这里走纯 std（避免新增 windows-sys 依赖）调 PowerShell 弹原生 MessageBox 提示。
    #[cfg(target_os = "windows")]
    {
        if let Err(reason) = check_webview2_runtime() {
            show_fatal_dialog(
                "OpenPaint 需要 WebView2 Runtime 才能启动。\n\n\
                 可能原因：\n\
                 1. 你的 Windows 未安装 Microsoft Edge 浏览器\n\
                 2. IT 策略禁用了 WebView2 自动更新\n\
                 3. WebView2 Runtime 被卸载或损坏\n\n\
                 解决办法：\n\
                 · 安装 Microsoft Edge 浏览器（自带 WebView2 Runtime）\n\
                 · 或从微软官网下载独立 WebView2 安装包：\n\
                   https://developer.microsoft.com/microsoft-edge/webview2/\n\n\
                 诊断详情：",
                &reason,
            );
            std::process::exit(1);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize application state
            let app_state = AppState::new(app.handle().clone())?;
            app.manage(Arc::new(app_state));

            // First-launch initialization (creates ~/.openpaint/ and default config)
            if let Err(e) = config::ensure_initialized() {
                warn!("Failed to initialize config: {}", e);
            }

            // Phase 1 placeholder: log that three-column layout is ready
            info!("OpenPaint scaffold ready. Three-column layout pending.");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Application info (debug)
            tools::app::get_app_info,
            tools::app::get_app_version,
            // W1 placeholders
            tools::placeholder::hello_world,
            tools::placeholder::echo,
            // W2 canvas operations
            tools::canvas_commands::get_canvas_summary,
            tools::canvas_commands::render_canvas_png,
            tools::canvas_commands::render_canvas_image,
            tools::canvas_commands::apply_brush_stroke,
            tools::canvas_commands::apply_eraser_stroke,
            tools::canvas_commands::set_rect_selection,
            tools::canvas_commands::clear_selection,
            tools::canvas_commands::move_layer,
            tools::canvas_commands::fill_layer,
            tools::canvas_commands::undo_canvas,
            tools::canvas_commands::redo_canvas,
            tools::canvas_commands::add_layer,
            tools::canvas_commands::remove_active_layer,
            tools::canvas_commands::set_active_layer,
            tools::canvas_commands::set_layer_visibility,
            tools::canvas_commands::resize_canvas,
            tools::canvas_commands::list_tools,
            // W3 canvas atomic tools (M-08)
            tools::canvas_tools::get_canvas_selection,
            tools::canvas_tools::get_selection_bounds,
            tools::canvas_tools::paste_image_to_layer,
            tools::canvas_tools::get_layer_info,
            // W3 gallery commands (M-06/M-10)
            tools::gallery_commands::save_to_gallery,
            tools::gallery_commands::list_gallery,
            tools::gallery_commands::search_gallery,
            tools::gallery_commands::delete_gallery_item,
            tools::gallery_commands::get_gallery_image,
            // W4 AI commands (M-09/M-10)
            tools::ai_commands::send_to_ai_engine,
            tools::ai_commands::render_svg_to_png,
            tools::ai_commands::agent_chat,
            tools::ai_commands::agent_command,
            tools::ai_commands::load_scenario,
            tools::ai_commands::list_scenarios,
            // W6 multi-LLM provider
            tools::llm_commands::list_providers,
            tools::llm_commands::set_provider,
            tools::llm_commands::get_provider_config,
            // W9 asset library — Iconify icons
            tools::icon_commands::search_icons,
            tools::icon_commands::render_icon_svg,
            // W10 asset library — brushes / palettes / gradients
            tools::brush_commands::list_brushes,
            tools::brush_commands::list_brush_assets,
            tools::brush_commands::get_brush_asset,
            tools::palette_commands::list_palettes,
            tools::palette_commands::apply_palette,
            tools::gradient_commands::list_gradients,
            tools::gradient_commands::apply_gradient,
            // W11 stub + telemetry
            tools::placeholder::create_brush_from_prompt,
            tools::telemetry::record_asset_event,
            tools::telemetry::get_assets_telemetry,
            // W11 在线状态 + 资产配置
            tools::icon_commands::get_asset_state,
            tools::icon_commands::get_assets_config,
            tools::icon_commands::set_assets_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenPaint application");
}

/// Initialize the tracing logging subsystem.
fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,openpaint=debug"));

    fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_level(true)
        .with_ansi(false)
        .init();
}

// =====================================================================
// WebView2 Runtime 检测（仅 Windows）
// =====================================================================
//
// Tauri 2 在 Windows 上走 WebView2 Evergreen Runtime。wry 启动 webview 时
// 会静默依赖系统是否已装 WebView2，未装时表现为「窗口不出现 / 黑屏 / 进程退出」，
// 且 main.ts 不会运行（webview 根本未被创建），全局错误处理器也捕获不到。
// 所以必须在 wry 之前检测并弹原生 MessageBox。
//
// WebView2 安装路径（参考微软官方文档）：
//   - C:\Program Files (x86)\Microsoft\EdgeWebView\Application\
//   - C:\Program Files\Microsoft\EdgeWebView\Application\
// 或注册表：
//   - HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}
//   - HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}
// 其中的 `pv` 值即为当前安装的 WebView2 版本号。

#[cfg(target_os = "windows")]
fn check_webview2_runtime() -> Result<(), String> {
    use std::path::Path;

    // ---- 阶段 A：检测安装路径 ----
    let candidates = [
        r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application",
        r"C:\Program Files\Microsoft\EdgeWebView\Application",
    ];
    for dir in &candidates {
        if Path::new(dir).is_dir() {
            return Ok(());
        }
    }

    // ---- 阶段 B：检测注册表（EdgeUpdate Client） ----
    // `reg query` 调用会产生中文 OS 区域设置下的乱码，但退出码仍可作为可靠信号。
    let reg_paths = [
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    ];
    for reg_path in &reg_paths {
        if let Ok(out) = std::process::Command::new("reg")
            .args(["query", reg_path, "/v", "pv"])
            .output()
        {
            if out.status.success() {
                return Ok(());
            }
        }
    }

    Err(format!(
        "未找到 WebView2 Runtime。\n检查路径：\n  - {}\n  - {}\n检查注册表：\n  - HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}}",
        candidates[0], candidates[1]
    ))
}

#[cfg(target_os = "windows")]
fn show_fatal_dialog(prefix: &str, detail: &str) {
    use std::process::Command;

    // 用 here-string + 单引号转义，将多行文本安全传给 PowerShell。
    let body = format!("{}\n\n{}", prefix, detail);
    // PowerShell 单引号字符串中，单引号需要用 '' 转义；这里没有内嵌单引号，
    // 但为了防御性，统一做 '' 转义。
    let escaped = body.replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName PresentationFramework; \
         $msg = @'\n{}\n'@; \
         [System.Windows.MessageBox]::Show($msg, 'OpenPaint 启动失败', 'OK', 'Error') | Out-Null",
        escaped
    );

    let _ = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .status();
}
