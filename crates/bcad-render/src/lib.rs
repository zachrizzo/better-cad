//! BetterCAD native GPU rendering engine.
//!
//! This crate replaces the Three.js / React Three Fiber rendering stack with
//! a native wgpu-based renderer. It consumes `TessellatedMesh` from
//! `bcad-kernel::tessellation` and `PbrMaterial` from `bcad-kernel::materials`,
//! providing a complete CAD viewport with PBR rendering, grid, and camera controls.

pub mod camera;
pub mod gpu;
pub mod grid;
pub mod lighting;
pub mod material;
pub mod mesh;
pub mod pipeline;
pub mod surface;
pub mod uniforms;
pub mod viewport;

// Shader sources are embedded as string constants.
pub mod shaders {
    /// PBR vertex + fragment shader (Cook-Torrance).
    pub const PBR_WGSL: &str = include_str!("shaders/pbr.wgsl");
    /// Infinite grid shader.
    pub const GRID_WGSL: &str = include_str!("shaders/grid.wgsl");
}

// Re-exports for convenience.
pub use camera::CameraState;
pub use gpu::GpuContext;
pub use grid::GridUniforms;
pub use lighting::{LightingPreset, LightingUniforms};
pub use material::MaterialUniforms;
pub use mesh::gpu_mesh::GpuMesh;
pub use mesh::vertex::MeshVertex;
pub use pipeline::Pipelines;
pub use surface::RenderSurface;
pub use uniforms::{CameraUniforms, ObjectUniforms, OBJECT_UNIFORM_STRIDE};
pub use viewport::{ViewMode, ViewportLayout, ViewportRect};
