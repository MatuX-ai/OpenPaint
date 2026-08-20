//! OpenPaint application entry point (binary).
//!
//! The actual logic lives in the `openpaint` library crate (lib.rs).
//! This binary simply delegates to `openpaint::run()` so the same code
//! is reused by the main app and the auxiliary `openpaint-mcp` binary.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    openpaint::run();
}
