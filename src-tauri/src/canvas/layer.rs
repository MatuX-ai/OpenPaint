//! 图层数据结构

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 图层混合模式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
}

/// 单个图层
#[derive(Debug, Clone)]
pub struct Layer {
    pub id: Uuid,
    pub name: String,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub visible: bool,
    pub locked: bool,
    pub image_data: Vec<u8>, // RGBA 像素数据
    pub width: u32,
    pub height: u32,
    pub offset_x: i32,
    pub offset_y: i32,
}

impl Layer {
    /// 创建空白图层
    pub fn new(id: Uuid, name: impl Into<String>, width: u32, height: u32) -> Self {
        let pixel_count = (width as usize) * (height as usize);
        Self {
            id,
            name: name.into(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            visible: true,
            locked: false,
            image_data: vec![0; pixel_count * 4], // RGBA 全透明
            width,
            height,
            offset_x: 0,
            offset_y: 0,
        }
    }
}
