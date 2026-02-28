//! Tessellation (triangulation) of B-Rep geometry for rendering.
//!
//! Converts Truck solids into indexed triangle meshes suitable
//! for GPU rendering via Three.js / WebGPU.

use serde::{Deserialize, Serialize};

/// A tessellated triangle mesh ready for GPU upload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TessellatedMesh {
    /// Flat array of vertex positions [x, y, z, x, y, z, ...].
    pub positions: Vec<f32>,
    /// Flat array of vertex normals [nx, ny, nz, nx, ny, nz, ...].
    pub normals: Vec<f32>,
    /// Triangle indices into the position/normal arrays.
    pub indices: Vec<u32>,
}
