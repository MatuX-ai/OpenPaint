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
    init_tracing();

    info!("OpenPaint starting up...");

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
