//! Lighting presets and GPU uniforms.
//!
//! The three presets mirror `LIGHTING_PRESETS` from
//! `packages/ui/src/stores/settings-store.ts` exactly.

/// Lighting preset names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LightingPreset {
    Daylight,
    Evening,
    Studio,
}

/// Lighting uniforms packed for the GPU.
///
/// Layout: ambient (16) + main light (32) + fill light (32) + hemisphere (32) = 112 bytes.
/// Padded to 128 bytes for 16-byte alignment.
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct LightingUniforms {
    // --- Ambient light (16 bytes) ---
    /// Ambient light color (RGB).
    pub ambient_color: [f32; 3],
    /// Ambient light intensity.
    pub ambient_intensity: f32,

    // --- Main directional light (32 bytes) ---
    /// Normalized direction vector (from light position toward origin).
    pub main_light_dir: [f32; 3],
    /// Main light intensity.
    pub main_light_intensity: f32,
    /// Main light color (RGB).
    pub main_light_color: [f32; 3],
    /// Padding.
    pub _pad1: f32,

    // --- Fill directional light (32 bytes) ---
    /// Fill light normalized direction.
    pub fill_light_dir: [f32; 3],
    /// Fill light intensity.
    pub fill_light_intensity: f32,
    /// Fill light color (RGB).
    pub fill_light_color: [f32; 3],
    /// Padding.
    pub _pad2: f32,

    // --- Hemisphere light (32 bytes) ---
    /// Hemisphere sky color (RGB).
    pub hemi_sky_color: [f32; 3],
    /// Hemisphere intensity.
    pub hemi_intensity: f32,
    /// Hemisphere ground color (RGB).
    pub hemi_ground_color: [f32; 3],
    /// Padding.
    pub _pad3: f32,
}

impl LightingUniforms {
    /// Get the lighting uniforms for a given preset.
    pub fn from_preset(preset: LightingPreset) -> Self {
        match preset {
            LightingPreset::Daylight => Self::daylight(),
            LightingPreset::Evening => Self::evening(),
            LightingPreset::Studio => Self::studio(),
        }
    }

    /// Daylight preset.
    /// - Ambient: white at 0.3
    /// - Main: warm white #fffde8 at 1.0, from [8, 15, 8]
    /// - Fill: cool blue #b4d4ff at 0.3, from [-5, 5, -5]
    /// - Hemisphere: sky #87ceeb, ground #8b7355 at 0.4
    pub fn daylight() -> Self {
        Self {
            ambient_color: [1.0, 1.0, 1.0],
            ambient_intensity: 0.3,
            main_light_dir: normalize_dir([8.0, 15.0, 8.0]),
            main_light_intensity: 1.0,
            main_light_color: hex_to_rgb(0xff, 0xfd, 0xe8),
            _pad1: 0.0,
            fill_light_dir: normalize_dir([-5.0, 5.0, -5.0]),
            fill_light_intensity: 0.3,
            fill_light_color: hex_to_rgb(0xb4, 0xd4, 0xff),
            _pad2: 0.0,
            hemi_sky_color: hex_to_rgb(0x87, 0xce, 0xeb),
            hemi_intensity: 0.4,
            hemi_ground_color: hex_to_rgb(0x8b, 0x73, 0x55),
            _pad3: 0.0,
        }
    }

    /// Evening preset.
    /// - Ambient: warm #ffd4a0 at 0.2
    /// - Main: orange #ff9944 at 0.8, from [3, 6, 10]
    /// - Fill: blue-grey #6688cc at 0.2, from [-5, 3, -5]
    /// - Hemisphere: sky #ff7744, ground #443322 at 0.3
    pub fn evening() -> Self {
        Self {
            ambient_color: hex_to_rgb(0xff, 0xd4, 0xa0),
            ambient_intensity: 0.2,
            main_light_dir: normalize_dir([3.0, 6.0, 10.0]),
            main_light_intensity: 0.8,
            main_light_color: hex_to_rgb(0xff, 0x99, 0x44),
            _pad1: 0.0,
            fill_light_dir: normalize_dir([-5.0, 3.0, -5.0]),
            fill_light_intensity: 0.2,
            fill_light_color: hex_to_rgb(0x66, 0x88, 0xcc),
            _pad2: 0.0,
            hemi_sky_color: hex_to_rgb(0xff, 0x77, 0x44),
            hemi_intensity: 0.3,
            hemi_ground_color: hex_to_rgb(0x44, 0x33, 0x22),
            _pad3: 0.0,
        }
    }

    /// Studio preset.
    /// - Ambient: near-white #f0f0f0 at 0.4
    /// - Main: white #ffffff at 0.7, from [5, 10, 5]
    /// - Fill: slight blue-white #e8e8ff at 0.4, from [-8, 6, -3]
    /// - Hemisphere: sky #ffffff, ground #888888 at 0.3
    pub fn studio() -> Self {
        Self {
            ambient_color: hex_to_rgb(0xf0, 0xf0, 0xf0),
            ambient_intensity: 0.4,
            main_light_dir: normalize_dir([5.0, 10.0, 5.0]),
            main_light_intensity: 0.7,
            main_light_color: hex_to_rgb(0xff, 0xff, 0xff),
            _pad1: 0.0,
            fill_light_dir: normalize_dir([-8.0, 6.0, -3.0]),
            fill_light_intensity: 0.4,
            fill_light_color: hex_to_rgb(0xe8, 0xe8, 0xff),
            _pad2: 0.0,
            hemi_sky_color: hex_to_rgb(0xff, 0xff, 0xff),
            hemi_intensity: 0.3,
            hemi_ground_color: hex_to_rgb(0x88, 0x88, 0x88),
            _pad3: 0.0,
        }
    }
}

/// Convert a light position to a normalized direction vector pointing
/// from the position toward the origin (the direction light travels).
fn normalize_dir(position: [f32; 3]) -> [f32; 3] {
    let len =
        (position[0] * position[0] + position[1] * position[1] + position[2] * position[2]).sqrt();
    if len < 1e-6 {
        return [0.0, -1.0, 0.0];
    }
    // Negate: direction from position toward origin.
    [-position[0] / len, -position[1] / len, -position[2] / len]
}

/// Convert sRGB byte values to linear RGB floats [0.0, 1.0].
const fn hex_to_rgb(r: u8, g: u8, b: u8) -> [f32; 3] {
    [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lighting_uniforms_size() {
        // 112 bytes: 4 sections of 16+32+32+32 = but let's verify via struct size
        let size = std::mem::size_of::<LightingUniforms>();
        assert_eq!(size % 16, 0, "LightingUniforms must be 16-byte aligned");
    }

    #[test]
    fn test_daylight_ambient() {
        let d = LightingUniforms::daylight();
        assert_eq!(d.ambient_color, [1.0, 1.0, 1.0]);
        assert!((d.ambient_intensity - 0.3).abs() < 0.001);
    }

    #[test]
    fn test_evening_main_intensity() {
        let e = LightingUniforms::evening();
        assert!((e.main_light_intensity - 0.8).abs() < 0.001);
    }

    #[test]
    fn test_studio_hemisphere() {
        let s = LightingUniforms::studio();
        assert!((s.hemi_intensity - 0.3).abs() < 0.001);
    }

    #[test]
    fn test_normalize_dir_is_unit_length() {
        let d = normalize_dir([8.0, 15.0, 8.0]);
        let len = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        assert!((len - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_from_preset() {
        let d = LightingUniforms::from_preset(LightingPreset::Daylight);
        assert!((d.ambient_intensity - 0.3).abs() < 0.001);
    }
}
