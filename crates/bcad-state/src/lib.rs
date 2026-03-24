//! Unified application state for BetterCAD.
//!
//! Replaces 14 separate Zustand stores with a single `AppState` struct,
//! a `Command` enum for all mutations, and command-based undo/redo.

pub mod bim_defaults;
pub mod camera_state;
pub mod chat_state;
pub mod commands;
pub mod document_state;
pub mod history;
pub mod layer_state;
pub mod level_state;
pub mod material_state;
pub mod measurement_state;
pub mod persistence;
pub mod reactive;
pub mod selection;
pub mod settings;
pub mod sketch_state;
pub mod ui_state;
pub mod view_state;

// Re-export key types at crate root
pub use bim_defaults::BimDefaults;
pub use camera_state::CameraState;
pub use chat_state::ChatState;
pub use commands::Command;
pub use document_state::DocumentState;
pub use history::HistoryStack;
pub use layer_state::LayerState;
pub use level_state::LevelState;
pub use material_state::MaterialState;
pub use measurement_state::MeasurementState;
pub use reactive::ChangeFlags;
pub use selection::SelectionState;
pub use settings::SettingsState;
pub use sketch_state::SketchState;
pub use ui_state::{ToolType, UiState, ViewMode};
pub use view_state::ViewState;

use bcad_domain::Element;
use std::time::Instant;

/// The single source of truth for the entire application.
/// Replaces 14 separate Zustand stores.
pub struct AppState {
    /// Document / entity state (replaces entity-store + document-store)
    pub document: DocumentState,
    /// UI state (replaces ui-store)
    pub ui: UiState,
    /// Settings (replaces settings-store) -- persisted
    pub settings: SettingsState,
    /// BIM tool defaults (replaces bim-store) -- persisted
    pub bim_defaults: BimDefaults,
    /// Levels (replaces level-store) -- persisted
    pub levels: LevelState,
    /// Layers (replaces layer-store)
    pub layers: LayerState,
    /// Sketch session (replaces sketch-store)
    pub sketch: SketchState,
    /// Saved views (replaces view-store) -- persisted
    pub views: ViewState,
    /// Camera (replaces camera-store)
    pub camera: CameraState,
    /// Materials (replaces material-store)
    pub materials: MaterialState,
    /// Measurement (replaces measurement-store)
    pub measurement: MeasurementState,
    /// Chat / AI (replaces chat-store)
    pub chat: ChatState,
    /// Undo/redo history (replaces entity-store undo + history-store)
    pub history: HistoryStack,
    /// Clipboard for copy/paste operations
    pub clipboard: Option<Element>,
    /// Reactive change notification flags
    pub change_flags: ChangeFlags,
    /// Timestamp of last state change
    pub last_change_at: Instant,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            document: DocumentState::default(),
            ui: UiState::default(),
            settings: SettingsState::default(),
            bim_defaults: BimDefaults::default(),
            levels: LevelState::default(),
            layers: LayerState::default(),
            sketch: SketchState::default(),
            views: ViewState::default(),
            camera: CameraState::default(),
            materials: MaterialState::default(),
            measurement: MeasurementState::default(),
            chat: ChatState::default(),
            history: HistoryStack::default(),
            clipboard: None,
            change_flags: ChangeFlags::default(),
            last_change_at: Instant::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_default_creates_valid_state() {
        let state = AppState::default();

        // All sub-states should be initialized to their defaults
        assert_eq!(state.ui.view_mode, ViewMode::TwoD);
        assert_eq!(state.ui.active_tool, ToolType::Select);
        assert_eq!(state.settings.length_unit, settings::LengthUnit::M);
        assert!((state.bim_defaults.wall_height - 3.0).abs() < f64::EPSILON);
        assert!(!state.layers.layers.is_empty());
        assert!(!state.levels.levels.is_empty());
        assert!(!state.history.can_undo());
        assert!(!state.history.can_redo());
        assert_eq!(state.change_flags, ChangeFlags::empty());
    }

    #[test]
    fn document_empty_on_creation() {
        let state = AppState::default();
        assert!(state.document.transaction_log.is_empty());
        assert!(state.document.cad_meshes.is_empty());
    }

    #[test]
    fn history_empty_on_creation() {
        let state = AppState::default();
        assert_eq!(state.history.undo_depth(), 0);
        assert_eq!(state.history.redo_depth(), 0);
    }

    #[test]
    fn chat_initialized_with_one_chat() {
        let state = AppState::default();
        assert_eq!(state.chat.chats.len(), 1);
        assert!(state.chat.active_chat_id.is_some());
        assert!(!state.chat.is_streaming);
    }

    #[test]
    fn views_empty_on_creation() {
        let state = AppState::default();
        assert!(state.views.views.is_empty());
        assert!(state.views.active_view_id.is_none());
    }

    #[test]
    fn materials_empty_on_creation() {
        let state = AppState::default();
        assert!(state.materials.materials.is_empty());
        assert!(state.materials.body_materials.is_empty());
        assert!(state.materials.selected_material_id.is_none());
    }

    #[test]
    fn sketch_inactive_on_creation() {
        let state = AppState::default();
        assert!(!state.sketch.active);
        assert!(state.sketch.points.is_empty());
        assert!(state.sketch.lines.is_empty());
    }

    #[test]
    fn camera_has_sensible_defaults() {
        let state = AppState::default();
        // Position should not be at origin (camera would be inside the model)
        let pos = state.camera.position;
        let magnitude = (pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]).sqrt();
        assert!(magnitude > 1.0, "camera should be away from origin");
    }
}
