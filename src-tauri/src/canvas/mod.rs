//! 中央画布引擎模块（M-03，W2 实施）
//!
//! 职责：
//! - 管理图层栈（创建、删除、排序、合并）
//! - 提供基础绘图工具（画笔、橡皮、选区、变形）
//! - 维护 Undo/Redo 历史记录（HistoryStack）
//! - 响应原子工具的调用（截图选区、粘贴图片）

pub mod engine;
pub mod history;
pub mod layer;
pub mod selection;
pub mod tools;

pub use engine::CanvasRenderer;
pub use history::{HistorySnapshot, HistoryStack};
pub use layer::{BlendMode, Layer};
pub use selection::Selection;
pub use tools::{BrushTool, CanvasTool, Color, EraserTool, FillTool, MoveTool, RectSelectTool, ToolInput};

use uuid::Uuid;

/// 画布全局状态
///
/// 包含图层栈、活动图层、尺寸与历史栈。
/// Tauri 通过 `Arc<RwLock<CanvasState>>` 在多线程间共享。
pub struct CanvasState {
    /// 图层栈（自下而上）
    pub layers: Vec<Layer>,
    /// 当前活动图层
    pub active_layer_id: Uuid,
    /// 画布宽（像素）
    pub width: u32,
    /// 画布高（像素）
    pub height: u32,
    /// 选区
    pub selection: Option<Selection>,
    /// Undo/Redo 历史栈
    pub history: HistoryStack,
}

impl CanvasState {
    /// 构造默认画布（1920×1080，单层白底）
    pub fn new(width: u32, height: u32) -> Self {
        let id = Uuid::new_v4();
        let mut layer = Layer::new(id, "Background", width, height);
        // 背景层填白
        let pixel_count = (width as usize) * (height as usize);
        for i in 0..pixel_count {
            let idx = i * 4;
            layer.image_data[idx] = 255;
            layer.image_data[idx + 1] = 255;
            layer.image_data[idx + 2] = 255;
            layer.image_data[idx + 3] = 255;
        }
        Self {
            layers: vec![layer],
            active_layer_id: id,
            width,
            height,
            selection: None,
            history: HistoryStack::new(50),
        }
    }

    /// 推入当前状态到历史栈
    pub fn push_history(&mut self, description: impl Into<String>) {
        let snapshot = HistorySnapshot::new(
            description,
            self.layers.clone(),
            self.active_layer_id,
            self.selection.clone(),
        );
        self.history.push(snapshot);
    }

    /// 获取活动图层引用
    pub fn active_layer(&self) -> Option<&Layer> {
        self.layers.iter().find(|l| l.id == self.active_layer_id)
    }

    /// 获取活动图层可变引用
    pub fn active_layer_mut(&mut self) -> Option<&mut Layer> {
        self.layers
            .iter_mut()
            .find(|l| l.id == self.active_layer_id)
    }

    /// 新增图层
    pub fn add_layer(&mut self, name: impl Into<String>) -> Uuid {
        let id = Uuid::new_v4();
        let layer = Layer::new(id, name, self.width, self.height);
        self.layers.push(layer);
        self.active_layer_id = id;
        id
    }

    /// 删除活动图层（至少保留 1 层）
    pub fn remove_active_layer(&mut self) -> bool {
        if self.layers.len() <= 1 {
            return false;
        }
        if let Some(pos) = self
            .layers
            .iter()
            .position(|l| l.id == self.active_layer_id)
        {
            self.layers.remove(pos);
            // 选择相邻图层
            let new_pos = if pos >= self.layers.len() {
                self.layers.len() - 1
            } else {
                pos
            };
            self.active_layer_id = self.layers[new_pos].id;
            return true;
        }
        false
    }
}

impl Default for CanvasState {
    fn default() -> Self {
        Self::new(1920, 1080)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_canvas() {
        let state = CanvasState::default();
        assert_eq!(state.width, 1920);
        assert_eq!(state.height, 1080);
        assert_eq!(state.layers.len(), 1);
    }

    #[test]
    fn test_add_remove_layer() {
        let mut state = CanvasState::default();
        let id = state.add_layer("Layer 1");
        assert_eq!(state.layers.len(), 2);
        assert_eq!(state.active_layer_id, id);

        assert!(state.remove_active_layer());
        assert_eq!(state.layers.len(), 1);
    }

    #[test]
    fn test_history_push() {
        let mut state = CanvasState::default();
        state.push_history("test");
        assert_eq!(state.history.len(), 1);
    }
}