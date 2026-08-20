//! 选区数据结构

use serde::{Deserialize, Serialize};

/// 矩形选区
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    /// 选区像素数据（可选，仅在工具需要时填充）
    #[serde(skip)]
    pub data: Option<Vec<u8>>,
}

impl Selection {
    /// 构造空选区
    pub fn empty() -> Self {
        Self {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            data: None,
        }
    }
}
