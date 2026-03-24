//! Layer state replacing `layer-store.ts`.
//!
//! AIA standard layers with visibility, locking, presets, and kind-to-layer
//! mapping.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// LayerInfo
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerInfo {
    /// AIA code, e.g. `"A-WALL"`.
    pub id: String,
    pub name: String,
    pub visible: bool,
    /// Hex color string, e.g. `"#000000"`.
    pub color: String,
    pub locked: bool,
}

// ---------------------------------------------------------------------------
// LayerState
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerState {
    pub layers: Vec<LayerInfo>,
    pub active_layer_id: String,
}

impl Default for LayerState {
    fn default() -> Self {
        Self {
            layers: standard_layers(),
            active_layer_id: "A-WALL".to_string(),
        }
    }
}

/// Standard AIA layers matching `layer-store.ts` STANDARD_LAYERS.
pub fn standard_layers() -> Vec<LayerInfo> {
    vec![
        LayerInfo {
            id: "A-WALL".into(),
            name: "Walls".into(),
            visible: true,
            color: "#000000".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-DOOR".into(),
            name: "Doors".into(),
            visible: true,
            color: "#8B4513".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-WIND".into(),
            name: "Windows".into(),
            visible: true,
            color: "#4169E1".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-FLOR".into(),
            name: "Floors".into(),
            visible: true,
            color: "#808080".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-ROOF".into(),
            name: "Roofs".into(),
            visible: true,
            color: "#CD853F".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-STRS".into(),
            name: "Stairs".into(),
            visible: true,
            color: "#696969".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-CLNG".into(),
            name: "Ceilings".into(),
            visible: true,
            color: "#D3D3D3".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-COLS".into(),
            name: "Columns".into(),
            visible: true,
            color: "#2F4F4F".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-BEAM".into(),
            name: "Beams".into(),
            visible: true,
            color: "#4682B4".into(),
            locked: false,
        },
        LayerInfo {
            id: "A-FNDN".into(),
            name: "Foundations".into(),
            visible: true,
            color: "#A0522D".into(),
            locked: false,
        },
        LayerInfo {
            id: "E-POWR".into(),
            name: "Electrical Power".into(),
            visible: true,
            color: "#FF0000".into(),
            locked: false,
        },
        LayerInfo {
            id: "E-LITE".into(),
            name: "Electrical Lighting".into(),
            visible: true,
            color: "#FFD700".into(),
            locked: false,
        },
        LayerInfo {
            id: "P-FIXT".into(),
            name: "Plumbing Fixtures".into(),
            visible: true,
            color: "#0000FF".into(),
            locked: false,
        },
        LayerInfo {
            id: "S-GRID".into(),
            name: "Structural Grid".into(),
            visible: true,
            color: "#FF00FF".into(),
            locked: false,
        },
        LayerInfo {
            id: "F-FURN".into(),
            name: "Furniture".into(),
            visible: true,
            color: "#228B22".into(),
            locked: false,
        },
        LayerInfo {
            id: "L-SITE".into(),
            name: "Site".into(),
            visible: true,
            color: "#006400".into(),
            locked: false,
        },
        LayerInfo {
            id: "G-ANNO".into(),
            name: "Annotations".into(),
            visible: true,
            color: "#333333".into(),
            locked: false,
        },
        LayerInfo {
            id: "G-DIMS".into(),
            name: "Dimensions".into(),
            visible: true,
            color: "#333333".into(),
            locked: false,
        },
        LayerInfo {
            id: "G-TAGS".into(),
            name: "Tags".into(),
            visible: true,
            color: "#333333".into(),
            locked: false,
        },
    ]
}

// ---------------------------------------------------------------------------
// Layer presets
// ---------------------------------------------------------------------------

/// Named layer presets mapping preset name to the layer IDs that should be visible.
pub fn layer_preset(name: &str) -> Option<Vec<&'static str>> {
    match name {
        "Architectural Plan" => Some(vec![
            "A-WALL", "A-DOOR", "A-WIND", "A-FLOR", "A-STRS", "A-COLS", "G-ANNO", "G-DIMS",
            "G-TAGS",
        ]),
        "Electrical Plan" => Some(vec![
            "A-WALL", "A-DOOR", "A-WIND", "E-POWR", "E-LITE", "G-ANNO", "G-DIMS",
        ]),
        "Plumbing Plan" => Some(vec![
            "A-WALL", "A-DOOR", "A-WIND", "P-FIXT", "G-ANNO", "G-DIMS",
        ]),
        "Reflected Ceiling Plan" => Some(vec!["A-WALL", "A-CLNG", "E-LITE", "G-ANNO", "G-DIMS"]),
        "Furniture Plan" => Some(vec![
            "A-WALL", "A-DOOR", "A-WIND", "F-FURN", "G-ANNO", "G-DIMS",
        ]),
        "Site Plan" => Some(vec!["A-WALL", "L-SITE", "G-ANNO", "G-DIMS"]),
        "All Layers" => None, // caller should set all visible
        _ => None,
    }
}

/// List of available preset names.
pub const LAYER_PRESETS: &[&str] = &[
    "Architectural Plan",
    "Electrical Plan",
    "Plumbing Plan",
    "Reflected Ceiling Plan",
    "Furniture Plan",
    "Site Plan",
    "All Layers",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_creates_aia_standard_layers() {
        let state = LayerState::default();
        let ids: Vec<&str> = state.layers.iter().map(|l| l.id.as_str()).collect();
        assert!(ids.contains(&"A-WALL"));
        assert!(ids.contains(&"A-DOOR"));
        assert!(ids.contains(&"A-WIND"));
        assert!(ids.contains(&"A-FLOR"));
        assert!(ids.contains(&"A-ROOF"));
        assert!(ids.contains(&"A-STRS"));
        assert!(ids.contains(&"A-COLS"));
        assert!(ids.contains(&"A-BEAM"));
        assert!(ids.contains(&"E-POWR"));
        assert!(ids.contains(&"P-FIXT"));
        assert!(ids.contains(&"F-FURN"));
        assert!(ids.contains(&"G-ANNO"));
        assert!(ids.contains(&"G-DIMS"));
    }

    #[test]
    fn default_active_layer_is_a_wall() {
        let state = LayerState::default();
        assert_eq!(state.active_layer_id, "A-WALL");
    }

    #[test]
    fn standard_layers_count() {
        let layers = standard_layers();
        assert_eq!(layers.len(), 19);
    }

    #[test]
    fn all_default_layers_visible_and_unlocked() {
        let state = LayerState::default();
        for layer in &state.layers {
            assert!(layer.visible, "layer {} should be visible", layer.id);
            assert!(!layer.locked, "layer {} should be unlocked", layer.id);
        }
    }

    #[test]
    fn architectural_plan_preset() {
        let preset = layer_preset("Architectural Plan").unwrap();
        assert!(preset.contains(&"A-WALL"));
        assert!(preset.contains(&"A-DOOR"));
        assert!(preset.contains(&"G-DIMS"));
        // Should NOT include electrical or plumbing
        assert!(!preset.contains(&"E-POWR"));
        assert!(!preset.contains(&"P-FIXT"));
    }

    #[test]
    fn electrical_plan_preset() {
        let preset = layer_preset("Electrical Plan").unwrap();
        assert!(preset.contains(&"E-POWR"));
        assert!(preset.contains(&"E-LITE"));
        assert!(preset.contains(&"A-WALL"));
    }

    #[test]
    fn all_layers_preset_returns_none() {
        assert!(layer_preset("All Layers").is_none());
    }

    #[test]
    fn unknown_preset_returns_none() {
        assert!(layer_preset("Nonexistent").is_none());
    }

    #[test]
    fn layer_presets_constant_has_seven_entries() {
        assert_eq!(LAYER_PRESETS.len(), 7);
    }
}
