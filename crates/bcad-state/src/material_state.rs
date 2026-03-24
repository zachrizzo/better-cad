//! Material state replacing `material-store.ts`.
//!
//! PBR material library and body-to-material assignments.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// PbrMaterial
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PbrMaterial {
    pub id: String,
    pub name: String,
    /// RGBA in 0..1 range.
    pub base_color: [f32; 4],
    pub metallic: f32,
    pub roughness: f32,
}

// ---------------------------------------------------------------------------
// MaterialState
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MaterialState {
    /// Material library: material_id -> PbrMaterial.
    pub materials: HashMap<String, PbrMaterial>,
    /// Body-to-material assignments: body_id -> material_id.
    pub body_materials: HashMap<String, String>,
    /// Currently selected material in the UI.
    pub selected_material_id: Option<String>,
}
