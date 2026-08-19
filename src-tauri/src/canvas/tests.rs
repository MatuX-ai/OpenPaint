//! 画布引擎单元测试（W2 完善）

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layer_creation() {
        let id = uuid::Uuid::new_v4();
        let layer = canvas::Layer::new(id, "Test", 100, 100);

        assert_eq!(layer.id, id);
        assert_eq!(layer.name, "Test");
        assert_eq!(layer.width, 100);
        assert_eq!(layer.height, 100);
        assert_eq!(layer.opacity, 1.0);
        assert!(layer.visible);
        assert!(!layer.locked);
        // RGBA 4 字节
        assert_eq!(layer.image_data.len(), 100 * 100 * 4);
    }

    #[test]
    fn test_canvas_state_default() {
        let state = canvas::CanvasState::default();
        assert_eq!(state.width, 1920);
        assert_eq!(state.height, 1080);
        assert_eq!(state.layers.len(), 1);
        assert_eq!(state.history.max_size(), 50);
    }

    #[test]
    fn test_selection_empty() {
        let sel = canvas::Selection::empty();
        assert_eq!(sel.x, 0);
        assert_eq!(sel.y, 0);
        assert_eq!(sel.width, 0);
        assert_eq!(sel.height, 0);
    }
}