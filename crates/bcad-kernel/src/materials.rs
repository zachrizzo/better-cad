//! PBR material definitions for rendering.

use serde::{Deserialize, Serialize};

/// A physically-based rendering (PBR) material.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PbrMaterial {
    /// Unique identifier for this material.
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// Base color as RGBA, each component in [0.0, 1.0].
    pub base_color: [f32; 4],
    /// Metallic factor in [0.0, 1.0].
    pub metallic: f32,
    /// Roughness factor in [0.0, 1.0].
    pub roughness: f32,
}
