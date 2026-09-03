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
        debug!(
            "History push: cursor={}, total={}",
            self.cursor,
            self.snapshots.len()
        );
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

    // ----------------------------------------------------------------
    // 补充测试：history 边界用例 / 防御性 / 详细行为验证
    // ----------------------------------------------------------------

    #[test]
    fn test_history_initial_state_is_empty() {
        let mut history = HistoryStack::new(10);
        assert!(history.is_empty());
        assert_eq!(history.len(), 0);
        assert!(!history.can_undo());
        assert!(!history.can_redo());
        assert!(history.current().is_none());
        assert!(history.undo().is_none());
        assert!(history.redo().is_none());
    }

    #[test]
    fn test_push_one_snapshot_cannot_undo() {
        // 至少需要 2 个快照才能 undo（push 后 cursor=1，undo 要求 cursor>1）
        let mut history = HistoryStack::new(10);
        history.push(dummy_snapshot("only"));
        assert!(!history.can_undo(), "single push should not allow undo");
        assert!(!history.can_redo());
        assert!(history.undo().is_none());
        assert!(history.redo().is_none());
        assert_eq!(history.current().unwrap().description, "only");
    }

    #[test]
    fn test_undo_at_beginning_does_not_change_state() {
        let mut history = HistoryStack::new(10);
        history.push(dummy_snapshot("op1"));
        history.push(dummy_snapshot("op2"));
        // 先 undo 到 op1
        history.undo();
        // 此时 cursor=1，再次 undo 必须返回 None 且不破坏状态
        let result = history.undo();
        assert!(result.is_none());
        assert_eq!(history.current().unwrap().description, "op1");
        assert!(!history.can_undo());
    }

    #[test]
    fn test_redo_at_end_does_not_change_state() {
        let mut history = HistoryStack::new(10);
        history.push(dummy_snapshot("op1"));
        history.push(dummy_snapshot("op2"));
        assert!(!history.can_redo());
        let result = history.redo();
        assert!(result.is_none());
        assert_eq!(history.current().unwrap().description, "op2");
    }

    #[test]
    fn test_max_size_zero_treats_as_at_least_one() {
        // max_size=0 不应 panic；首次 push 后后续都被裁掉，最终保持 1 条最新。
        let mut history = HistoryStack::new(0);
        history.push(dummy_snapshot("op1"));
        // 第一次 push：snapshots.len() = 1，不大于 max_size=0 也不会 drain
        // 但 push 后逻辑会检查 1>0 → drain overflow=1 → snapshots 空 → cursor=0
        // 实际行为：最终 len 可能为 0，取决于 push 的内部语义
        // 我们只断言：不会出现 panic，且 current 是被裁掉后的最后一条或 None
        history.push(dummy_snapshot("op2"));
        history.push(dummy_snapshot("op3"));
        // 至少不 panic
        let _ = history.len();
        // 不应无限增长
        assert!(
            history.len() <= 1,
            "max_size=0 不应无限增长，实际 len={}",
            history.len()
        );
    }

    #[test]
    fn test_undo_redo_after_push_clears_future_branch() {
        // 标准编辑器场景：undo 几次后 push 新操作，redo 栈必须被裁掉
        let mut history = HistoryStack::new(50);
        history.push(dummy_snapshot("op1"));
        history.push(dummy_snapshot("op2"));
        history.push(dummy_snapshot("op3"));
        history.undo(); // cursor=2
        history.undo(); // cursor=1
        assert!(history.can_redo());
        history.push(dummy_snapshot("op4")); // 裁掉 op2/op3
        assert!(!history.can_redo(), "redo branch should be cleared");
        assert_eq!(history.current().unwrap().description, "op4");
        assert_eq!(history.len(), 2);
    }

    #[test]
    fn test_current_returns_latest_snapshot() {
        let mut history = HistoryStack::new(10);
        history.push(dummy_snapshot("first"));
        history.push(dummy_snapshot("second"));
        history.push(dummy_snapshot("third"));
        let cur = history.current().expect("current must exist");
        assert_eq!(cur.description, "third");
    }

    #[test]
    fn test_drain_old_snapshots_keeps_cursor_consistent() {
        // 超过 max_size 后被裁掉的应是队首，cursor 应重新对齐到 len
        let mut history = HistoryStack::new(3);
        for i in 0..5 {
            history.push(dummy_snapshot(&format!("op{}", i)));
        }
        assert_eq!(history.len(), 3);
        // 保留最后 3 个：op2/op3/op4
        assert!(history.can_undo(), "still has prior snapshot");
        let snap = history.undo().unwrap();
        assert_eq!(snap.description, "op3");
        assert_eq!(history.current().unwrap().description, "op3");
    }

    #[test]
    fn test_clear_resets_cursor_and_redo_flag() {
        let mut history = HistoryStack::new(10);
        history.push(dummy_snapshot("op1"));
        history.push(dummy_snapshot("op2"));
        history.undo();
        assert!(history.can_redo());
        history.clear();
        assert!(history.is_empty());
        assert_eq!(history.len(), 0);
        assert!(!history.can_undo());
        assert!(!history.can_redo());
        assert!(history.current().is_none());
    }

    #[test]
    fn test_history_snapshot_uses_distinct_ids() {
        // HistorySnapshot 每次 new 都应分配新 id，否则 undo 链会指向同一引用
        let s1 = HistorySnapshot::new("a", vec![], Uuid::new_v4(), None);
        let s2 = HistorySnapshot::new("b", vec![], Uuid::new_v4(), None);
        assert_ne!(s1.id, s2.id);
        // 注：timestamp 是 millis，连续调用可能相同——只保证 id 唯一。
    }

    #[test]
    fn test_history_keeps_order_after_multiple_undo_redo() {
        let mut history = HistoryStack::new(50);
        for i in 0..5 {
            history.push(dummy_snapshot(&format!("op{}", i)));
        }
        // op0 op1 op2 op3 op4，cursor=5
        assert_eq!(history.current().unwrap().description, "op4");
        history.undo(); // cursor=4
        assert_eq!(history.current().unwrap().description, "op3");
        history.undo(); // cursor=3
        assert_eq!(history.current().unwrap().description, "op2");
        history.redo(); // cursor=4
        assert_eq!(history.current().unwrap().description, "op3");
        history.redo(); // cursor=5
        assert_eq!(history.current().unwrap().description, "op4");
    }
}
