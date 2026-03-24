//! Uniform buffer types for camera and per-object data.
//!
//! All types are `repr(C)`, `Pod`, `Zeroable`, and 16-byte aligned
//! for use with wgpu uniform/dynamic-uniform buffers.

/// Camera uniforms uploaded once per frame per viewport.
///
/// Size: 3 * 64 (matrices) + 16 (position + pad) = 208 bytes.
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct CameraUniforms {
    /// View matrix (world -> camera space).
    pub view: [[f32; 4]; 4],
    /// Projection matrix (camera -> clip space).
    pub projection: [[f32; 4]; 4],
    /// Combined view-projection matrix.
    pub view_proj: [[f32; 4]; 4],
    /// Camera world-space position.
    pub view_pos: [f32; 3],
    /// Padding to maintain 16-byte alignment.
    pub _pad: f32,
}

impl CameraUniforms {
    /// Build camera uniforms from a `CameraState`.
    pub fn from_camera(camera: &crate::camera::CameraState) -> Self {
        let view = camera.view_matrix();
        let proj = camera.projection_matrix();
        let view_proj = proj * view;
        Self {
            view: view.to_cols_array_2d(),
            projection: proj.to_cols_array_2d(),
            view_proj: view_proj.to_cols_array_2d(),
            view_pos: camera.position.to_array(),
            _pad: 0.0,
        }
    }
}

/// Per-object uniforms stored in a dynamic uniform buffer.
///
/// Size: 64 (model) + 12 (emissive) + 4 (emissive_intensity) + 4 (opacity) + 4 (entity_id) + 8 (pad) = 96 bytes.
/// Must be aligned to `min_uniform_buffer_offset_alignment` (typically 256 bytes) when
/// used with dynamic offsets -- the buffer stride handles this at upload time.
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ObjectUniforms {
    /// Model matrix (local -> world space), including elevation offset.
    pub model_matrix: [[f32; 4]; 4],
    /// Emissive color override (for selection/hover highlight).
    pub emissive_color: [f32; 3],
    /// Emissive intensity (0.0 = none, 0.2 = hover, 0.4 = selected).
    pub emissive_intensity: f32,
    /// Opacity (1.0 = fully opaque, 0.25 = ghosted level).
    pub opacity: f32,
    /// Entity ID for GPU picking (encoded as u32, read back from pick buffer).
    pub entity_id: u32,
    /// Padding to reach 96 bytes (multiple of 16).
    pub _pad: [f32; 2],
}

impl ObjectUniforms {
    /// Create object uniforms with an identity transform, no emissive, full opacity.
    pub fn identity(entity_id: u32) -> Self {
        Self {
            model_matrix: glam::Mat4::IDENTITY.to_cols_array_2d(),
            emissive_color: [0.0, 0.0, 0.0],
            emissive_intensity: 0.0,
            opacity: 1.0,
            entity_id,
            _pad: [0.0; 2],
        }
    }

    /// Create object uniforms with a specific model matrix.
    pub fn with_transform(model: glam::Mat4, entity_id: u32) -> Self {
        Self {
            model_matrix: model.to_cols_array_2d(),
            emissive_color: [0.0, 0.0, 0.0],
            emissive_intensity: 0.0,
            opacity: 1.0,
            entity_id,
            _pad: [0.0; 2],
        }
    }

    /// Set the selection highlight (blue emissive).
    pub fn with_selected(mut self) -> Self {
        // #3a6aff -> rgb(0.227, 0.416, 1.0)
        self.emissive_color = [0.227, 0.416, 1.0];
        self.emissive_intensity = 0.4;
        self
    }

    /// Set the hover highlight (darker blue emissive).
    pub fn with_hovered(mut self) -> Self {
        // #2a4aaa -> rgb(0.165, 0.290, 0.667)
        self.emissive_color = [0.165, 0.290, 0.667];
        self.emissive_intensity = 0.2;
        self
    }

    /// Set opacity for level ghosting.
    pub fn with_opacity(mut self, opacity: f32) -> Self {
        self.opacity = opacity;
        self
    }
}

/// The required stride (in bytes) for dynamic uniform buffer offsets.
/// This must be at least `min_uniform_buffer_offset_alignment` (typically 256).
pub const OBJECT_UNIFORM_STRIDE: u64 = 256;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camera_uniforms_size() {
        let size = std::mem::size_of::<CameraUniforms>();
        assert_eq!(size, 208);
        assert_eq!(size % 16, 0);
    }

    #[test]
    fn test_object_uniforms_size() {
        let size = std::mem::size_of::<ObjectUniforms>();
        assert_eq!(size, 96);
        assert_eq!(size % 16, 0);
    }

    #[test]
    fn test_object_uniforms_fits_in_stride() {
        assert!(
            std::mem::size_of::<ObjectUniforms>() as u64 <= OBJECT_UNIFORM_STRIDE,
            "ObjectUniforms must fit within the dynamic offset stride"
        );
    }

    #[test]
    fn test_identity_uniforms() {
        let u = ObjectUniforms::identity(42);
        assert_eq!(u.entity_id, 42);
        assert!((u.opacity - 1.0).abs() < 0.001);
        assert!((u.emissive_intensity - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_selection_highlight() {
        let u = ObjectUniforms::identity(1).with_selected();
        assert!((u.emissive_intensity - 0.4).abs() < 0.001);
        assert!((u.emissive_color[2] - 1.0).abs() < 0.001); // blue channel
    }
}
