//! Declarative keyboard shortcut system.
//!
//! Maps key bindings to actions using a data-driven table (not a switch statement).
//! Supports context-sensitive bindings and extensibility.

use crate::tool_trait::{KeyCode, ToolId};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Modifier key state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct Modifiers {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
}

impl Modifiers {
    pub fn none() -> Self {
        Self::default()
    }
    pub fn ctrl() -> Self {
        Self {
            ctrl: true,
            ..Self::default()
        }
    }
    pub fn shift() -> Self {
        Self {
            shift: true,
            ..Self::default()
        }
    }
    pub fn ctrl_shift() -> Self {
        Self {
            ctrl: true,
            shift: true,
            ..Self::default()
        }
    }
}

/// Context in which a shortcut binding is active.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShortcutContext {
    /// Active in any context.
    Global,
    /// Only when a placement tool is active.
    PlacementTool,
    /// Only when an element is selected.
    Selection,
    /// Only when a measurement tool is active.
    MeasurementTool,
}

/// Action that a shortcut binding triggers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShortcutAction {
    SelectTool(ToolId),
    Save,
    Load,
    Duplicate,
    ArrayDialog,
    RotateSelected,
    RotatePlacementTool,
    DeleteSelected,
    ResetMeasurement,
    Escape,
    Undo,
    Redo,
}

/// A single shortcut binding.
#[derive(Debug, Clone)]
pub struct ShortcutBinding {
    pub key: KeyCode,
    pub modifiers: Modifiers,
    pub action: ShortcutAction,
    pub context: ShortcutContext,
}

// ---------------------------------------------------------------------------
// KeyboardShortcutSystem
// ---------------------------------------------------------------------------

/// The keyboard shortcut system. Holds all bindings and resolves key events
/// to actions based on context.
pub struct KeyboardShortcutSystem {
    bindings: Vec<ShortcutBinding>,
}

impl KeyboardShortcutSystem {
    pub fn new() -> Self {
        Self {
            bindings: default_bindings(),
        }
    }

    /// Process a key-down event and return the matching action, if any.
    pub fn process(
        &self,
        key: KeyCode,
        modifiers: Modifiers,
        active_tool: ToolId,
        has_selection: bool,
    ) -> Option<ShortcutAction> {
        // First try context-specific bindings (higher priority)
        for binding in &self.bindings {
            if binding.key != key || binding.modifiers != modifiers {
                continue;
            }
            match binding.context {
                ShortcutContext::Global => {}
                ShortcutContext::PlacementTool => {
                    if !is_placement_tool(active_tool) {
                        continue;
                    }
                }
                ShortcutContext::Selection => {
                    if !has_selection {
                        continue;
                    }
                }
                ShortcutContext::MeasurementTool => {
                    if !is_measurement_tool(active_tool) {
                        continue;
                    }
                }
            }
            return Some(binding.action.clone());
        }
        None
    }

    /// Handle Escape key with special logic for measurement tools.
    pub fn handle_escape(&self, active_tool: ToolId) -> ShortcutAction {
        if is_measurement_tool(active_tool) {
            ShortcutAction::ResetMeasurement
        } else {
            ShortcutAction::SelectTool(ToolId::Select)
        }
    }

    /// Register a custom binding.
    pub fn register(&mut self, binding: ShortcutBinding) {
        self.bindings.push(binding);
    }

    /// Remove all bindings for a specific action.
    pub fn unbind_action(&mut self, action: &ShortcutAction) {
        self.bindings.retain(|b| &b.action != action);
    }

    /// Get all bindings (for UI display).
    pub fn bindings(&self) -> &[ShortcutBinding] {
        &self.bindings
    }
}

impl Default for KeyboardShortcutSystem {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Default bindings
// ---------------------------------------------------------------------------

fn bind(
    key: KeyCode,
    modifiers: Modifiers,
    action: ShortcutAction,
    context: ShortcutContext,
) -> ShortcutBinding {
    ShortcutBinding {
        key,
        modifiers,
        action,
        context,
    }
}

fn default_bindings() -> Vec<ShortcutBinding> {
    use KeyCode::*;
    use ShortcutAction::*;
    use ShortcutContext::*;
    let none = Modifiers::none();
    let ctrl = Modifiers::ctrl();
    let ctrl_shift = Modifiers::ctrl_shift();

    vec![
        // Ctrl combos
        bind(S, ctrl, Save, Global),
        bind(O, ctrl, Load, Global),
        bind(Z, ctrl, Undo, Global),
        bind(Y, ctrl, Redo, Global),
        bind(D, ctrl, Duplicate, Selection),
        bind(D, ctrl_shift, ArrayDialog, Selection),
        // Tool selection (no modifiers) - sorted by key for readability
        bind(A, none, SelectTool(ToolId::Dimension), Global),
        bind(B, none, SelectTool(ToolId::Beam), Global),
        bind(C, none, SelectTool(ToolId::Column), Global),
        bind(D, none, SelectTool(ToolId::Door), Global),
        bind(E, none, SelectTool(ToolId::Electrical), Global),
        bind(F, none, SelectTool(ToolId::Floor), Global),
        bind(G, none, SelectTool(ToolId::FireSafety), Global),
        bind(H, none, SelectTool(ToolId::Foundation), Global),
        bind(I, none, SelectTool(ToolId::Furniture), Global),
        bind(J, none, SelectTool(ToolId::Cabinet), Global),
        bind(M, none, SelectTool(ToolId::Measure), Global),
        bind(N, none, SelectTool(ToolId::Window), Global),
        bind(KeyCode::O, none, SelectTool(ToolId::Roof), Global),
        bind(P, none, SelectTool(ToolId::Parking), Global),
        bind(KeyCode::S, none, SelectTool(ToolId::Stair), Global),
        bind(T, none, SelectTool(ToolId::Text), Global),
        bind(U, none, SelectTool(ToolId::Plumbing), Global),
        bind(V, none, SelectTool(ToolId::Hvac), Global),
        bind(W, none, SelectTool(ToolId::Wall), Global),
        bind(KeyCode::Y, none, SelectTool(ToolId::Accessibility), Global),
        // Context-sensitive R key
        bind(R, none, RotatePlacementTool, PlacementTool),
        bind(R, none, RotateSelected, Selection),
        // Delete
        bind(Delete, none, DeleteSelected, Selection),
        bind(Backspace, none, DeleteSelected, Selection),
        // Escape
        bind(KeyCode::Escape, none, ShortcutAction::Escape, Global),
    ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn is_placement_tool(tool: ToolId) -> bool {
    matches!(
        tool,
        ToolId::Furniture
            | ToolId::Plumbing
            | ToolId::Electrical
            | ToolId::Hvac
            | ToolId::FireSafety
            | ToolId::Accessibility
            | ToolId::Cabinet
    )
}

fn is_measurement_tool(tool: ToolId) -> bool {
    matches!(
        tool,
        ToolId::Measure | ToolId::MeasurePath | ToolId::MeasureArea | ToolId::MeasureAngle
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wall_shortcut() {
        let system = KeyboardShortcutSystem::new();
        let action = system.process(KeyCode::W, Modifiers::none(), ToolId::Select, false);
        assert_eq!(action, Some(ShortcutAction::SelectTool(ToolId::Wall)));
    }

    #[test]
    fn test_ctrl_s_save() {
        let system = KeyboardShortcutSystem::new();
        let action = system.process(KeyCode::S, Modifiers::ctrl(), ToolId::Select, false);
        assert_eq!(action, Some(ShortcutAction::Save));
    }

    #[test]
    fn test_ctrl_z_undo() {
        let system = KeyboardShortcutSystem::new();
        let action = system.process(KeyCode::Z, Modifiers::ctrl(), ToolId::Wall, false);
        assert_eq!(action, Some(ShortcutAction::Undo));
    }

    #[test]
    fn test_r_rotates_placement_tool() {
        let system = KeyboardShortcutSystem::new();
        let action = system.process(KeyCode::R, Modifiers::none(), ToolId::Furniture, false);
        assert_eq!(action, Some(ShortcutAction::RotatePlacementTool));
    }

    #[test]
    fn test_r_rotates_selected_in_select_mode() {
        let system = KeyboardShortcutSystem::new();
        // With selection
        let action = system.process(KeyCode::R, Modifiers::none(), ToolId::Select, true);
        assert_eq!(action, Some(ShortcutAction::RotateSelected));
    }

    #[test]
    fn test_r_does_nothing_in_wall_mode() {
        let system = KeyboardShortcutSystem::new();
        let action = system.process(KeyCode::R, Modifiers::none(), ToolId::Wall, false);
        assert_eq!(action, None);
    }

    #[test]
    fn test_delete_with_selection() {
        let system = KeyboardShortcutSystem::new();
        let action = system.process(KeyCode::Delete, Modifiers::none(), ToolId::Select, true);
        assert_eq!(action, Some(ShortcutAction::DeleteSelected));
    }

    #[test]
    fn test_delete_without_selection() {
        let system = KeyboardShortcutSystem::new();
        let action = system.process(KeyCode::Delete, Modifiers::none(), ToolId::Select, false);
        assert_eq!(action, None);
    }

    #[test]
    fn test_escape_measurement_tool() {
        let system = KeyboardShortcutSystem::new();
        let action = system.handle_escape(ToolId::Measure);
        assert_eq!(action, ShortcutAction::ResetMeasurement);
    }

    #[test]
    fn test_escape_non_measurement_tool() {
        let system = KeyboardShortcutSystem::new();
        let action = system.handle_escape(ToolId::Wall);
        assert_eq!(action, ShortcutAction::SelectTool(ToolId::Select));
    }

    #[test]
    fn test_custom_binding() {
        let mut system = KeyboardShortcutSystem::new();
        system.register(ShortcutBinding {
            key: KeyCode::F1,
            modifiers: Modifiers::none(),
            action: ShortcutAction::SelectTool(ToolId::Sketch),
            context: ShortcutContext::Global,
        });
        let action = system.process(KeyCode::F1, Modifiers::none(), ToolId::Select, false);
        assert_eq!(action, Some(ShortcutAction::SelectTool(ToolId::Sketch)));
    }

    #[test]
    fn test_unbind_action() {
        let mut system = KeyboardShortcutSystem::new();
        system.unbind_action(&ShortcutAction::Save);
        let action = system.process(KeyCode::S, Modifiers::ctrl(), ToolId::Select, false);
        // After unbinding Save, Ctrl+S should have no match for Save
        assert_ne!(action, Some(ShortcutAction::Save));
    }

    #[test]
    fn test_all_tool_shortcuts_present() {
        let system = KeyboardShortcutSystem::new();
        let tool_shortcuts: Vec<_> = system
            .bindings()
            .iter()
            .filter_map(|b| {
                if let ShortcutAction::SelectTool(id) = &b.action {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect();

        assert!(tool_shortcuts.contains(&ToolId::Wall));
        assert!(tool_shortcuts.contains(&ToolId::Door));
        assert!(tool_shortcuts.contains(&ToolId::Window));
        assert!(tool_shortcuts.contains(&ToolId::Column));
        assert!(tool_shortcuts.contains(&ToolId::Beam));
        assert!(tool_shortcuts.contains(&ToolId::Roof));
        assert!(tool_shortcuts.contains(&ToolId::Stair));
        assert!(tool_shortcuts.contains(&ToolId::Floor));
        assert!(tool_shortcuts.contains(&ToolId::Foundation));
        assert!(tool_shortcuts.contains(&ToolId::Measure));
        assert!(tool_shortcuts.contains(&ToolId::Dimension));
        assert!(tool_shortcuts.contains(&ToolId::Furniture));
        assert!(tool_shortcuts.contains(&ToolId::Plumbing));
        assert!(tool_shortcuts.contains(&ToolId::Electrical));
    }
}
