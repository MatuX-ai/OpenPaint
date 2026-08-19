//! Undo/Redo 历史管理
//!
//! 维护最多 50 步历史快照，支持前进/后退。

use tracing::debug;
use uuid::Uuid;

use crate::canvas::Layer;

/// 历史快照
#[derive(Debug, Clone)]
pub struct HistorySnapshot {
    /// 快照唯一标识
    pub id: Uuid,
    /// 操作描述
    pub description: String,
    /// 图层栈深拷贝
    pub layers: Vec<Layer>,
    /// 当前活动图层
    pub active_layer_id: Uuid,
    /// 选区（可选）
    pub selection: Option<crate::canvas::Selection>,
    /// 时间戳（毫秒）
    pub timestamp: i64,
}

impl HistorySnapshot {
    /// 创建新快照（必须深拷贝 layers）
    pub fn new(
        description: impl Into<String>,
        layers: Vec<Layer>,
        active_layer_id: Uuid,
        selection: Option<crate::canvas::Selection>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            description: description.into(),
            layers,
            active_layer_id,
            selection,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

/// 历史栈
#[derive(Debug)]
pub struct HistoryStack {
    snapshots: Vec<HistorySnapshot>,
    cursor: usize,
    max_size: usize,
}

impl HistoryStack {
    /// 创建空历史栈
    pub fn new(max_size: usize) -> Self {
        Self {
            snapshots: Vec::new(),
            cursor: 0,
            max_size,
        }
    }

    /// 推入新快照（裁剪 cursor 之后的历史）
    pub fn push(&mut self, snapshot: HistorySnapshot) {
        // 丢弃 cursor 之后的所有快照（避免回退后的分支污染）
        self.snapshots.truncate(self.cursor);

        self.snapshots.push(snapshot);
        self.cursor = self.snapshots.len();

        // 超出最大长度，丢弃最早的快照
        if self.snapshots.len() > self.max_size {
            let overflow = self.snapshots.len() - self.max_size;
            self.snapshots.drain(0..overflow);
            self.cursor = self.snapshots.len();
        }
        debug!("History push: cursor={}, total={}", self.cursor, self.snapshots.len());
    }

    /// 后退一步
    pub fn undo(&mut self) -> Option<&HistorySnapshot> {
        if self.cursor <= 1 {
            return None;
        }
        self.cursor -= 1;
        Some(&self.snapshots[self.cursor - 1])
    }

    /// 前进一步
    pub fn redo(&mut self) -> Option<&HistorySnapshot> {
        if self.cursor >= self.snapshots.len() {
            return None;
        }
        self.cursor += 1;
        Some(&self.snapshots[self.cursor - 1])
    }

    /// 当前快照引用
    pub fn current(&self) -> Option<&HistorySnapshot> {
        if self.cursor == 0 || self.cursor > self.snapshots.len() {
            None
        } else {
            Some(&self.snapshots[self.cursor - 1])
        }
    }

    /// 是否可后退
    pub fn can_undo(&self) -> bool {
        self.cursor > 1
    }

    /// 是否可前进
    pub fn can_redo(&self) -> bool {
        self.cursor < self.snapshots.len()
    }

    /// 清空历史
    pub fn clear(&mut self) {
        self.snapshots.clear();
        self.cursor = 0;
    }

    /// 快照数量
    pub fn len(&self) -> usize {
        self.snapshots.len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.snapshots.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_snapshot(desc: &str) -> HistorySnapshot {
        HistorySnapshot::new(desc, vec![], Uuid::new_v4(), None)
    }

    #[test]
    fn test_push_and_undo() {
        let mut history = HistoryStack::new(50);
        history.push(dummy_snapshot("op1"));
        history.push(dummy_snapshot("op2"));
        history.push(dummy_snapshot("op3"));

        assert_eq!(history.len(), 3);
        assert!(history.can_undo());
        assert!(!history.can_redo());

        history.undo();
        assert!(history.can_redo());
        history.undo();
        history.redo();
        assert_eq!(history.current().unwrap().description, "op2");
    }

    #[test]
    fn test_max_size_enforced() {
        let mut history = HistoryStack::new(3);
        for i in 0..5 {
            history.push(dummy_snapshot(&format!("op{}", i)));
        }
        // 最多保留 3 步
        assert_eq!(history.len(), 3);
    }

    #[test]
    fn test_push_after_undo_clears_future() {
        let mut history = HistoryStack::new(50);
        history.push(dummy_snapshot("op1"));
        history.push(dummy_snapshot("op2"));
        history.push(dummy_snapshot("op3"));
        history.undo(); // cursor -> 2
        history.undo(); // cursor -> 1

        history.push(dummy_snapshot("op4"));
        // cursor=1 means op2/op3 are trimmed; only [op1, op4] remain.
        assert_eq!(history.len(), 2);
        assert_eq!(history.current().unwrap().description, "op4");
    }

    #[test]
    fn test_undo_at_beginning_returns_none() {
        let mut history = HistoryStack::new(50);
        history.push(dummy_snapshot("op1"));
        assert!(history.undo().is_none());
    }

    #[test]
    fn test_clear() {
        let mut history = HistoryStack::new(50);
        history.push(dummy_snapshot("op1"));
        history.clear();
        assert!(history.is_empty());
        assert!(!history.can_undo());
    }
}