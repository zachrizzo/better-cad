//! GPU material uniforms derived from `bcad-kernel::materials::PbrMaterial`.

use bcad_kernel::materials::PbrMaterial;

/// GPU-side material representation. Packed for uniform buffer usage.
///
/// Size: 32 bytes (base_color 16 + metallic 4 + roughness 4 + pad 8).
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct MaterialUniforms {
    /// Base color as RGBA.
    pub base_color: [f32; 4],
    /// Metallic factor [0.0, 1.0].
    pub metallic: f32,
    /// Roughness factor [0.0, 1.0].
    pub roughness: f32,
    /// Padding to 32 bytes (reserved for future properties).
    pub _pad: [f32; 2],
}

impl MaterialUniforms {
    /// Create GPU material uniforms from a kernel `PbrMaterial`.
    pub fn from_pbr_material(mat: &PbrMaterial) -> Self {
        Self {
            base_color: mat.base_color,
            metallic: mat.metallic,
            roughness: mat.roughness,
            _pad: [0.0; 2],
        }
    }

    /// Default material: white, non-metallic, moderate roughness.
    pub fn default_material() -> Self {
        Self {
            base_color: [0.8, 0.8, 0.8, 1.0],
            metallic: 0.0,
            roughness: 0.5,
            _pad: [0.0; 2],
        }
    }

    /// Check if this material has transparency (alpha < 1.0).
    pub fn is_transparent(&self) -> bool {
        self.base_color[3] < 0.99
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_material_uniforms_size() {
        assert_eq!(std::mem::size_of::<MaterialUniforms>(), 32);
    }

    #[test]
    fn test_from_pbr_material() {
        let pbr = PbrMaterial::new("Steel", [0.8, 0.8, 0.85, 1.0], 0.95, 0.3);
        let u = MaterialUniforms::from_pbr_material(&pbr);
        assert_eq!(u.base_color, [0.8, 0.8, 0.85, 1.0]);
        assert!((u.metallic - 0.95).abs() < 0.001);
        assert!((u.roughness - 0.3).abs() < 0.001);
    }

    #[test]
    fn test_transparency_detection() {
        let opaque = MaterialUniforms {
            base_color: [1.0, 1.0, 1.0, 1.0],
            metallic: 0.0,
            roughness: 0.5,
            _pad: [0.0; 2],
        };
        assert!(!opaque.is_transparent());

        let glass = MaterialUniforms {
            base_color: [0.8, 0.9, 1.0, 0.3],
            metallic: 0.1,
            roughness: 0.05,
            _pad: [0.0; 2],
        };
        assert!(glass.is_transparent());
    }
}
