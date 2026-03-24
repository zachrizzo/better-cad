//! Grid uniform type matching the `GridUniforms` struct in `shaders/grid.wgsl`.

use crate::camera::CameraState;

/// GPU-side grid uniforms for the infinite grid shader.
///
/// Layout must exactly match the WGSL struct in `grid.wgsl`:
/// ```text
/// struct GridUniforms {
///     view_proj: mat4x4<f32>,
///     inv_view_proj: mat4x4<f32>,
///     camera_position: vec3<f32>,
///     grid_elevation: f32,
///     cell_size: f32,
///     section_size: f32,
///     cell_color: vec4<f32>,
///     section_color: vec4<f32>,
///     fade_distance: f32,
///     fade_strength: f32,
///     cell_thickness: f32,
///     section_thickness: f32,
/// };
/// ```
///
/// Size: 208 bytes (16-byte aligned).
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct GridUniforms {
    /// Combined view-projection matrix.
    pub view_proj: [[f32; 4]; 4],
    /// Inverse view-projection matrix (used to unproject screen coords to world).
    pub inv_view_proj: [[f32; 4]; 4],
    /// Camera world-space position.
    pub camera_position: [f32; 3],
    /// Y elevation of the grid plane.
    pub grid_elevation: f32,
    /// Size of fine grid cells (in world units).
    pub cell_size: f32,
    /// Size of coarse section lines (in world units, typically N * cell_size).
    pub section_size: f32,
    /// Padding to align `cell_color` to 16-byte boundary (WGSL vec4 alignment).
    pub _pad0: [f32; 2],
    /// Fine grid line color (RGBA).
    pub cell_color: [f32; 4],
    /// Coarse section line color (RGBA).
    pub section_color: [f32; 4],
    /// Distance at which the grid fades out completely.
    pub fade_distance: f32,
    /// Exponent controlling the fade curve.
    pub fade_strength: f32,
    /// Thickness multiplier for fine cell lines.
    pub cell_thickness: f32,
    /// Thickness multiplier for coarse section lines.
    pub section_thickness: f32,
}

impl GridUniforms {
    /// Create grid uniforms with sensible defaults for a dark theme.
    pub fn default_dark(camera: &CameraState) -> Self {
        let vp = camera.view_projection_matrix();
        let inv_vp = vp.inverse();
        Self {
            view_proj: vp.to_cols_array_2d(),
            inv_view_proj: inv_vp.to_cols_array_2d(),
            camera_position: camera.position.to_array(),
            grid_elevation: 0.0,
            cell_size: 1.0,
            section_size: 5.0,
            _pad0: [0.0; 2],
            cell_color: [0.3, 0.3, 0.4, 0.3],
            section_color: [0.4, 0.4, 0.55, 0.5],
            fade_distance: 100.0,
            fade_strength: 2.0,
            cell_thickness: 1.5,
            section_thickness: 2.0,
        }
    }

    /// Create grid uniforms with sensible defaults for a light theme.
    pub fn default_light(camera: &CameraState) -> Self {
        let vp = camera.view_projection_matrix();
        let inv_vp = vp.inverse();
        Self {
            view_proj: vp.to_cols_array_2d(),
            inv_view_proj: inv_vp.to_cols_array_2d(),
            camera_position: camera.position.to_array(),
            grid_elevation: 0.0,
            cell_size: 1.0,
            section_size: 5.0,
            _pad0: [0.0; 2],
            cell_color: [0.6, 0.6, 0.6, 0.25],
            section_color: [0.4, 0.4, 0.4, 0.4],
            fade_distance: 100.0,
            fade_strength: 2.0,
            cell_thickness: 1.5,
            section_thickness: 2.0,
        }
    }

    /// Update the camera-dependent matrices (call each frame if camera moved).
    pub fn update_camera(&mut self, camera: &CameraState) {
        let vp = camera.view_projection_matrix();
        let inv_vp = vp.inverse();
        self.view_proj = vp.to_cols_array_2d();
        self.inv_view_proj = inv_vp.to_cols_array_2d();
        self.camera_position = camera.position.to_array();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_uniforms_size() {
        let size = std::mem::size_of::<GridUniforms>();
        assert_eq!(size, 208, "GridUniforms must be 208 bytes");
        assert_eq!(size % 16, 0, "GridUniforms must be 16-byte aligned");
    }

    #[test]
    fn test_grid_uniforms_offsets() {
        // Verify that key fields are at the expected byte offsets
        // to match the WGSL struct layout.
        use std::mem;

        let base = mem::offset_of!(GridUniforms, view_proj);
        assert_eq!(base, 0);

        let inv_vp = mem::offset_of!(GridUniforms, inv_view_proj);
        assert_eq!(inv_vp, 64);

        let cam_pos = mem::offset_of!(GridUniforms, camera_position);
        assert_eq!(cam_pos, 128);

        let grid_elev = mem::offset_of!(GridUniforms, grid_elevation);
        assert_eq!(grid_elev, 140);

        let cell_sz = mem::offset_of!(GridUniforms, cell_size);
        assert_eq!(cell_sz, 144);

        let section_sz = mem::offset_of!(GridUniforms, section_size);
        assert_eq!(section_sz, 148);

        let cell_color = mem::offset_of!(GridUniforms, cell_color);
        assert_eq!(
            cell_color, 160,
            "cell_color must be at offset 160 (16-byte aligned for vec4)"
        );

        let section_color = mem::offset_of!(GridUniforms, section_color);
        assert_eq!(section_color, 176);

        let fade_dist = mem::offset_of!(GridUniforms, fade_distance);
        assert_eq!(fade_dist, 192);
    }
}
