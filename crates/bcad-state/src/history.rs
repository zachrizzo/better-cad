//! Undo/redo history stack using command-based approach.
//!
//! Instead of cloning entire element arrays (as the TS store does),
//! each HistoryEntry stores only the forward and inverse Commands,
//! which is far more memory-efficient.

use crate::commands::Command;

/// Maximum undo depth.
pub const MAX_UNDO_DEPTH: usize = 100;

/// A single entry in the undo/redo stack.
#[derive(Debug, Clone)]
pub struct HistoryEntry {
    /// Human-readable label for the action (shown in Edit menu).
    pub label: String,
    /// The inverse command to execute for undo.
    pub inverse: Command,
    /// The forward command to execute for redo.
    pub forward: Command,
    /// Epoch milliseconds when the action was performed.
    pub timestamp: u64,
}

/// Command-based undo/redo stack.
#[derive(Debug, Clone)]
pub struct HistoryStack {
    undo_stack: Vec<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
}

impl Default for HistoryStack {
    fn default() -> Self {
        Self::new()
    }
}

impl HistoryStack {
    pub fn new() -> Self {
        Self {
            undo_stack: Vec::with_capacity(MAX_UNDO_DEPTH),
            redo_stack: Vec::new(),
        }
    }

    /// Push an undoable action. Clears the redo stack.
    pub fn push(&mut self, entry: HistoryEntry) {
        self.redo_stack.clear();
        self.undo_stack.push(entry);
        self.enforce_max_depth();
    }

    /// Pop the most recent undo entry. Returns it so the caller can execute
    /// the inverse command and then push the entry onto the redo stack.
    pub fn pop_undo(&mut self) -> Option<HistoryEntry> {
        self.undo_stack.pop()
    }

    /// Push an entry onto the redo stack (called after executing undo).
    pub fn push_redo(&mut self, entry: HistoryEntry) {
        self.redo_stack.push(entry);
    }

    /// Pop the most recent redo entry. Returns it so the caller can execute
    /// the forward command and push the entry back onto the undo stack.
    pub fn pop_redo(&mut self) -> Option<HistoryEntry> {
        self.redo_stack.pop()
    }

    /// Push an entry back onto the undo stack (called after executing redo).
    pub fn push_undo(&mut self, entry: HistoryEntry) {
        self.undo_stack.push(entry);
        self.enforce_max_depth();
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn undo_label(&self) -> Option<&str> {
        self.undo_stack.last().map(|e| e.label.as_str())
    }

    pub fn redo_label(&self) -> Option<&str> {
        self.redo_stack.last().map(|e| e.label.as_str())
    }

    /// Clear all history (e.g., on project load).
    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }

    /// Current undo depth.
    pub fn undo_depth(&self) -> usize {
        self.undo_stack.len()
    }

    /// Current redo depth.
    pub fn redo_depth(&self) -> usize {
        self.redo_stack.len()
    }

    /// Trim oldest entries if above a size threshold. For now, relies on
    /// MAX_UNDO_DEPTH as the primary limit.
    pub fn trim_if_needed(&mut self, _max_bytes: usize) {
        // Future: implement size estimation per HistoryEntry.
    }

    /// Drop oldest undo entries to stay within MAX_UNDO_DEPTH.
    fn enforce_max_depth(&mut self) {
        if self.undo_stack.len() > MAX_UNDO_DEPTH {
            let excess = self.undo_stack.len() - MAX_UNDO_DEPTH;
            self.undo_stack.drain(0..excess);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a simple HistoryEntry with the given label.
    fn entry(label: &str) -> HistoryEntry {
        HistoryEntry {
            label: label.to_string(),
            inverse: Command::ClearProject,
            forward: Command::ClearProject,
            timestamp: 0,
        }
    }

    #[test]
    fn new_stack_is_empty() {
        let stack = HistoryStack::new();
        assert!(!stack.can_undo());
        assert!(!stack.can_redo());
        assert_eq!(stack.undo_depth(), 0);
        assert_eq!(stack.redo_depth(), 0);
    }

    #[test]
    fn default_stack_is_empty() {
        let stack = HistoryStack::default();
        assert_eq!(stack.undo_depth(), 0);
        assert_eq!(stack.redo_depth(), 0);
    }

    #[test]
    fn push_three_then_undo_and_redo() {
        let mut stack = HistoryStack::new();
        stack.push(entry("action-1"));
        stack.push(entry("action-2"));
        stack.push(entry("action-3"));

        assert_eq!(stack.undo_depth(), 3);
        assert_eq!(stack.redo_depth(), 0);
        assert!(stack.can_undo());
        assert!(!stack.can_redo());
        assert_eq!(stack.undo_label(), Some("action-3"));

        // Undo once
        let undone = stack.pop_undo().unwrap();
        assert_eq!(undone.label, "action-3");
        stack.push_redo(undone);

        assert_eq!(stack.undo_depth(), 2);
        assert_eq!(stack.redo_depth(), 1);
        assert!(stack.can_redo());
        assert_eq!(stack.undo_label(), Some("action-2"));
        assert_eq!(stack.redo_label(), Some("action-3"));

        // Redo once
        let redone = stack.pop_redo().unwrap();
        assert_eq!(redone.label, "action-3");
        stack.push_undo(redone);

        assert_eq!(stack.undo_depth(), 3);
        assert_eq!(stack.redo_depth(), 0);
        assert_eq!(stack.undo_label(), Some("action-3"));
    }

    #[test]
    fn undo_on_empty_stack_returns_none() {
        let mut stack = HistoryStack::new();
        assert!(stack.pop_undo().is_none());
    }

    #[test]
    fn redo_on_empty_stack_returns_none() {
        let mut stack = HistoryStack::new();
        assert!(stack.pop_redo().is_none());
    }

    #[test]
    fn redo_cleared_on_new_push() {
        let mut stack = HistoryStack::new();
        stack.push(entry("action-1"));
        stack.push(entry("action-2"));

        // Undo action-2, moving it to redo
        let undone = stack.pop_undo().unwrap();
        stack.push_redo(undone);
        assert!(stack.can_redo());
        assert_eq!(stack.redo_depth(), 1);

        // Push a new action -- redo should be cleared
        stack.push(entry("action-3"));
        assert!(!stack.can_redo());
        assert_eq!(stack.redo_depth(), 0);
        assert_eq!(stack.undo_depth(), 2); // action-1 and action-3
    }

    #[test]
    fn max_depth_drops_oldest() {
        let mut stack = HistoryStack::new();
        for i in 0..=MAX_UNDO_DEPTH {
            stack.push(entry(&format!("action-{i}")));
        }
        // After pushing 101 entries, only 100 remain
        assert_eq!(stack.undo_depth(), MAX_UNDO_DEPTH);
        // The oldest (action-0) was dropped; action-1 is now the oldest
        // and action-100 is the newest
        assert_eq!(stack.undo_label(), Some("action-100"));
    }

    #[test]
    fn push_undo_also_enforces_max_depth() {
        let mut stack = HistoryStack::new();
        for i in 0..MAX_UNDO_DEPTH {
            stack.push(entry(&format!("action-{i}")));
        }
        assert_eq!(stack.undo_depth(), MAX_UNDO_DEPTH);

        // push_undo (used after redo) should also enforce the limit
        stack.push_undo(entry("extra"));
        assert_eq!(stack.undo_depth(), MAX_UNDO_DEPTH);
    }

    #[test]
    fn clear_empties_both_stacks() {
        let mut stack = HistoryStack::new();
        stack.push(entry("action-1"));
        stack.push(entry("action-2"));
        let undone = stack.pop_undo().unwrap();
        stack.push_redo(undone);

        assert!(stack.can_undo());
        assert!(stack.can_redo());

        stack.clear();
        assert!(!stack.can_undo());
        assert!(!stack.can_redo());
        assert_eq!(stack.undo_depth(), 0);
        assert_eq!(stack.redo_depth(), 0);
    }

    #[test]
    fn labels_return_none_when_stacks_empty() {
        let stack = HistoryStack::new();
        assert_eq!(stack.undo_label(), None);
        assert_eq!(stack.redo_label(), None);
    }

    #[test]
    fn compound_undo_single_entry() {
        // A compound undo is represented as a single HistoryEntry whose
        // inverse is a Command::Compound. Verify we can push/pop it atomically.
        let compound_forward = Command::Compound {
            label: "create wall+door".to_string(),
            commands: vec![Command::ClearProject, Command::ClearProject],
        };
        let compound_inverse = Command::Compound {
            label: "undo wall+door".to_string(),
            commands: vec![Command::ClearProject, Command::ClearProject],
        };
        let mut stack = HistoryStack::new();
        stack.push(HistoryEntry {
            label: "create wall+door".to_string(),
            forward: compound_forward,
            inverse: compound_inverse,
            timestamp: 1234,
        });
        assert_eq!(stack.undo_depth(), 1);

        let undone = stack.pop_undo().unwrap();
        assert_eq!(undone.label, "create wall+door");
        // The inverse should be a Compound with 2 sub-commands
        if let Command::Compound { commands, .. } = &undone.inverse {
            assert_eq!(commands.len(), 2);
        } else {
            panic!("expected Command::Compound for inverse");
        }
    }
}
