//! View state replacing `view-store.ts`.
//!
//! Saved section and elevation views with camera state.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// SavedViewType
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SavedViewType {
    Section,
    Elevation,
}

// ---------------------------------------------------------------------------
// CardinalDirection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardinalDirection {
    North,
    South,
    East,
    West,
}

// ---------------------------------------------------------------------------
// SavedView
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedView {
    pub id: String,
    pub name: String,
    pub view_type: SavedViewType,
    /// Section: cut line start on plan.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cut_line_start: Option<[f64; 2]>,
    /// Section: cut line end on plan.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cut_line_end: Option<[f64; 2]>,
    /// Elevation: cardinal direction.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<CardinalDirection>,
    /// Camera position when the view was created.
    pub camera_position: [f64; 3],
    /// Camera target when the view was created.
    pub camera_target: [f64; 3],
}

/// Patch struct for partial SavedView updates.
#[derive(Debug, Clone, Default)]
pub struct SavedViewPatch {
    pub name: Option<String>,
    pub cut_line_start: Option<[f64; 2]>,
    pub cut_line_end: Option<[f64; 2]>,
    pub direction: Option<CardinalDirection>,
    pub camera_position: Option<[f64; 3]>,
    pub camera_target: Option<[f64; 3]>,
}

// ---------------------------------------------------------------------------
// ViewState
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ViewState {
    pub views: HashMap<String, SavedView>,
    pub active_view_id: Option<String>,
}
