//! Atomic tools module.
//!
//! Sub-modules:
//! - app            : Application info (always available)
//! - placeholder    : W1 placeholder commands (IPC smoke test)
//! - canvas_tools   : 4 canvas atomic tools (M-08, W3)
//! - canvas_commands: Full canvas command set (W2-W3)
//! - ai_commands    : AI engine commands (M-09, W4)
//! - gallery_commands: Gallery commands (M-06, W3)
//! - llm_commands   : LLM provider commands (W6)
//! - icon_commands  : Iconify 资产命令（W9：search_icons / render_icon_svg）
//! - brush_commands : 默认画刷命令（W10：list_brushes / list_brush_assets）
//! - palette_commands: 调色板命令（W10：list_palettes / apply_palette）
//! - gradient_commands: 渐变预设命令（W10：list_gradients / apply_gradient）

pub mod ai_commands;
pub mod app;
pub mod brush_commands;
pub mod canvas_commands;
pub mod canvas_tools;
pub mod gallery_commands;
pub mod gradient_commands;
pub mod icon_commands;
pub mod llm_commands;
pub mod palette_commands;
pub mod placeholder;
pub mod telemetry;

#[cfg(feature = "mcp-server")]
pub mod ai_tools;
#[cfg(feature = "mcp-server")]
pub mod gallery_tools;
