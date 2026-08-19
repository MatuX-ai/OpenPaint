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

pub mod app;
pub mod placeholder;
pub mod canvas_commands;
pub mod canvas_tools;
pub mod ai_commands;
pub mod gallery_commands;
pub mod llm_commands;

#[cfg(feature = "mcp-server")]
pub mod ai_tools;
#[cfg(feature = "mcp-server")]
pub mod gallery_tools;