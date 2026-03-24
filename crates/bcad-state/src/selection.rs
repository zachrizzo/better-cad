//! Selection state: multi-select with kind and layer filters.
//!
//! Replaces the selection portions of `ui-store.ts` and adds
//! structured multi-select support.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use bcad_domain::Element;

/// Primary selection state.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SelectionState {
    /// Selected element IDs (ordered; first = primary).
    pub element_ids: Vec<String>,
    /// When non-empty, only elements of these kinds are selectable.
    #[serde(default)]
    pub kind_filter: HashSet<String>,
    /// When non-empty, only elements on these layers are selectable.
    #[serde(default)]
    pub layer_filter: HashSet<String>,
}

/// Info returned by `selection_for_property_panel`.
pub enum SelectionInfo<'a> {
    None,
    Single(&'a Element),
    Multi {
        count: usize,
        kinds: HashSet<&'static str>,
    },
}

/// Map element kind to its default AIA layer id.
///
/// Note: a parallel mapping exists in `bcad_pdf::types::kind_to_layer`
/// (returning `&str`). Keep both in sync when adding new element kinds.
pub fn kind_to_layer(kind: &str) -> Option<&'static str> {
    match kind {
        "wall" => Some("A-WALL"),
        "door" => Some("A-DOOR"),
        "window" => Some("A-WIND"),
        "floor" | "room" | "level" => Some("A-FLOR"),
        "roof" => Some("A-ROOF"),
        "stair" => Some("A-STRS"),
        "column" => Some("A-COLS"),
        "beam" => Some("A-BEAM"),
        "foundation" => Some("A-FNDN"),
        "electrical" => Some("E-POWR"),
        "plumbing" => Some("P-FIXT"),
        "furniture" => Some("F-FURN"),
        "site_detail" => Some("L-SITE"),
        "dimension" => Some("G-DIMS"),
        "text_annotation" | "leader_annotation" | "keynote" => Some("G-ANNO"),
        "tag" => Some("G-TAGS"),
        "grid" => Some("S-GRID"),
        _ => None,
    }
}
