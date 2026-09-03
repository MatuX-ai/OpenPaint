//! 中央画布引擎模块（M-03，W2 实施）
//!
//! 职责：
//! - 管理图层栈（创建、删除、排序、合并）
//! - 提供基础绘图工具（画笔、橡皮、选区、变形）
//! - 维护 Undo/Redo 历史记录（HistoryStack）
//! - 响应原子工具的调用（截图选区、粘贴图片）

pub mod brush;
pub mod engine;
pub mod history;
pub mod layer;
pub mod selection;
pub mod tools;

pub use brush::{builtin_brushes, find_brush, BrushCategory, BrushPreset, DEFAULT_BRUSH_ID};
pub use engine::CanvasRenderer;
pub use history::{HistorySnapshot, HistoryStack};
pub use layer::{BlendMode, Layer};
pub use selection::Selection;
pub use tools::{
    BrushTool, CanvasTool, Color, EraserTool, FillTool, MoveTool, RectSelectTool, RotateTool,
    TextTool, ToolInput,
};

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

    // ----------------------------------------------------------------
    // 补充测试：CanvasState 生命周期 / 图层操作 / 防御性
    // ----------------------------------------------------------------

    #[test]
    fn test_new_canvas_initializes_white_background() {
        // 新建画布背景层应填白
        let state = CanvasState::new(8, 8);
        assert_eq!(state.width, 8);
        assert_eq!(state.height, 8);
        assert_eq!(state.layers.len(), 1);
        // 背景层像素应全为白色
        for chunk in state.layers[0].image_data.chunks_exact(4) {
            assert_eq!(chunk[0], 255);
            assert_eq!(chunk[1], 255);
            assert_eq!(chunk[2], 255);
            assert_eq!(chunk[3], 255);
        }
    }

    #[test]
    fn test_add_layer_makes_it_active() {
        let mut state = CanvasState::default();
        let id1 = state.add_layer("a");
        let id2 = state.add_layer("b");
        // 每次 add 后活动图层应切换
        assert_eq!(state.active_layer_id, id2);
        assert_eq!(state.layers.len(), 3, "1 bg + 2 added");
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_remove_active_layer_keeps_at_least_one() {
        // 至少保留 1 层
        let mut state = CanvasState::default();
        // 起始 1 层：尝试删除应返回 false
        assert!(!state.remove_active_layer());
        assert_eq!(state.layers.len(), 1);
    }

    #[test]
    fn test_remove_active_layer_picks_neighbor() {
        let mut state = CanvasState::default();
        let id_a = state.add_layer("a");
        let id_b = state.add_layer("b");
        let id_c = state.add_layer("c");
        // 当前活动 = id_c；删除后应切换到 b（同位置）
        state.active_layer_id = id_c;
        assert!(state.remove_active_layer());
        assert_eq!(state.active_layer_id, id_b);
        assert_eq!(state.layers.len(), 3);

        // 再删 b，活动应回退到 a
        state.active_layer_id = id_b;
        assert!(state.remove_active_layer());
        assert_eq!(state.active_layer_id, id_a);
    }

    #[test]
    fn test_remove_last_layer_selects_previous_neighbor() {
        // 删末尾层时应回退到上一层
        let mut state = CanvasState::default();
        let _id_a = state.add_layer("a");
        let id_b = state.add_layer("b");
        let _id_c = state.add_layer("c");
        assert_eq!(state.active_layer_id, _id_c);
        assert!(state.remove_active_layer());
        assert_eq!(state.active_layer_id, id_b);
    }

    #[test]
    fn test_remove_active_layer_preserves_layer_dimensions() {
        let mut state = CanvasState::new(64, 32);
        let id = state.add_layer("preserve");
        // 调整图层尺寸（模拟 resize_canvas 行为）
        if let Some(l) = state.layers.iter_mut().find(|l| l.id == id) {
            l.width = 64;
            l.height = 32;
            l.image_data = vec![0; 64 * 32 * 4];
        }
        let layer_id_before = state.active_layer_id;
        assert!(state.remove_active_layer());
        // 删除后剩余图层仍保留原尺寸
        for l in &state.layers {
            assert_eq!(l.width, 64);
            assert_eq!(l.height, 32);
            assert_eq!(l.image_data.len(), 64 * 32 * 4);
        }
        assert_ne!(state.active_layer_id, layer_id_before);
    }

    #[test]
    fn test_active_layer_mut_returns_correct_layer() {
        let mut state = CanvasState::default();
        let id = state.add_layer("target");
        // 切换到非活动图层查询
        let active = state.active_layer_mut().unwrap();
        assert_eq!(active.id, id);
    }

    #[test]
    fn test_active_layer_returns_none_when_id_mismatched() {
        // active_layer_id 指向不存在的图层时应返回 None
        let mut state = CanvasState::default();
        state.active_layer_id = uuid::Uuid::new_v4();
        assert!(state.active_layer().is_none());
        assert!(state.active_layer_mut().is_none());
    }

    #[test]
    fn test_push_history_with_multiple_layer_snapshots() {
        // 推入多次应保留每次的快照
        let mut state = CanvasState::default();
        let id1 = state.add_layer("first");
        state.push_history("after first");
        let id2 = state.add_layer("second");
        state.push_history("after second");
        assert_eq!(state.history.len(), 2);
        assert!(state.history.can_undo());
        // 当前快照应包含两个新图层
        let snap = state.history.current().unwrap();
        assert_eq!(snap.layers.len(), 3, "bg + 2 added");
        assert!(snap.layers.iter().any(|l| l.id == id1));
        assert!(snap.layers.iter().any(|l| l.id == id2));
    }

    #[test]
    fn test_default_state_matches_new_1920x1080() {
        // 默认 vs 显式 new 应等价
        let default_state = CanvasState::default();
        let new_state = CanvasState::new(1920, 1080);
        assert_eq!(default_state.width, new_state.width);
        assert_eq!(default_state.height, new_state.height);
        assert_eq!(default_state.layers.len(), new_state.layers.len());
    }

    #[test]
    fn test_state_modification_does_not_affect_snapshots() {
        // CanvasState 自身不支持 Clone，但 HistoryStack 内的 snapshot 是 owned Vec<Layer>，
        // 推入快照后再修改 state.layers 不应回溯污染历史。
        let mut state = CanvasState::default();
        state.push_history("before");
        let snap_before = state.history.current().cloned();
        let layer_count_before = snap_before.as_ref().unwrap().layers.len();

        // 修改 state：再加一层
        let _id = state.add_layer("delta");
        assert_eq!(state.layers.len(), layer_count_before + 1);

        // 历史快照应保持不变
        let snap_after = state.history.current().cloned();
        assert_eq!(
            snap_after.as_ref().unwrap().layers.len(),
            layer_count_before,
            "快照不应被后续修改污染"
        );
    }
}
