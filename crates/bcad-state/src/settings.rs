//! Settings state replacing `settings-store.ts`.
//!
//! All fields are persisted to TOML. Defaults match the TypeScript store exactly.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// LengthUnit
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LengthUnit {
    Mm,
    Cm,
    M,
    In,
    Ft,
}

impl Default for LengthUnit {
    fn default() -> Self {
        Self::M
    }
}

// ---------------------------------------------------------------------------
// LightingPreset
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LightingPreset {
    Daylight,
    Evening,
    Studio,
}

impl Default for LightingPreset {
    fn default() -> Self {
        Self::Daylight
    }
}

// ---------------------------------------------------------------------------
// MeasurementSnapSettings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeasurementSnapSettings {
    pub measure: MeasurementSnapModeSettings,
    pub dimension: MeasurementSnapModeSettings,
}

impl Default for MeasurementSnapSettings {
    fn default() -> Self {
        Self {
            measure: MeasurementSnapModeSettings::default(),
            dimension: MeasurementSnapModeSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeasurementSnapModeSettings {
    pub endpoint: bool,
    pub midpoint: bool,
    pub intersection: bool,
    pub center: bool,
    pub nearest: bool,
}

impl Default for MeasurementSnapModeSettings {
    fn default() -> Self {
        Self {
            endpoint: true,
            midpoint: true,
            intersection: true,
            center: true,
            nearest: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeasurementSnapMode {
    Endpoint,
    Midpoint,
    Intersection,
    Center,
    Nearest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeasurementSnapTool {
    Measure,
    Dimension,
}

// ---------------------------------------------------------------------------
// DimensionStyleId
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DimensionStyleId {
    Aia,
    Iso,
    Custom,
}

impl Default for DimensionStyleId {
    fn default() -> Self {
        Self::Aia
    }
}

// ---------------------------------------------------------------------------
// WallFace (wall reference mode)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WallFace {
    Centerline,
    StudInner,
    StudOuter,
    FinishInner,
    FinishOuter,
}

impl Default for WallFace {
    fn default() -> Self {
        Self::Centerline
    }
}

// ---------------------------------------------------------------------------
// SettingsState  (the composite struct)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsState {
    pub length_unit: LengthUnit,
    pub lighting_preset: LightingPreset,
    pub measurement_snap_settings: MeasurementSnapSettings,
    pub walls_visible: bool,
    pub default_dimension_style: DimensionStyleId,
    pub dimension_precision: u8,
    pub dimension_fractional: bool,
    pub wall_reference_mode: WallFace,
    pub wall_finish_thickness: f64,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            length_unit: LengthUnit::M,
            lighting_preset: LightingPreset::Daylight,
            measurement_snap_settings: MeasurementSnapSettings::default(),
            walls_visible: true,
            default_dimension_style: DimensionStyleId::Aia,
            dimension_precision: 2,
            dimension_fractional: false,
            wall_reference_mode: WallFace::Centerline,
            wall_finish_thickness: 0.013,
        }
    }
}

/// Update a specific snap mode for a given tool.
pub fn update_measurement_snap_mode(
    settings: &mut MeasurementSnapSettings,
    tool: MeasurementSnapTool,
    mode: MeasurementSnapMode,
    enabled: bool,
) {
    let target = match tool {
        MeasurementSnapTool::Measure => &mut settings.measure,
        MeasurementSnapTool::Dimension => &mut settings.dimension,
    };
    match mode {
        MeasurementSnapMode::Endpoint => target.endpoint = enabled,
        MeasurementSnapMode::Midpoint => target.midpoint = enabled,
        MeasurementSnapMode::Intersection => target.intersection = enabled,
        MeasurementSnapMode::Center => target.center = enabled,
        MeasurementSnapMode::Nearest => target.nearest = enabled,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_unit_default_is_m() {
        assert_eq!(LengthUnit::default(), LengthUnit::M);
    }

    #[test]
    fn lighting_preset_default_is_daylight() {
        assert_eq!(LightingPreset::default(), LightingPreset::Daylight);
    }

    #[test]
    fn measurement_snap_mode_settings_all_true_by_default() {
        let s = MeasurementSnapModeSettings::default();
        assert!(s.endpoint);
        assert!(s.midpoint);
        assert!(s.intersection);
        assert!(s.center);
        assert!(s.nearest);
    }

    #[test]
    fn settings_state_defaults() {
        let s = SettingsState::default();
        assert_eq!(s.length_unit, LengthUnit::M);
        assert_eq!(s.lighting_preset, LightingPreset::Daylight);
        assert!(s.walls_visible);
        assert_eq!(s.default_dimension_style, DimensionStyleId::Aia);
        assert_eq!(s.dimension_precision, 2);
        assert!(!s.dimension_fractional);
        assert_eq!(s.wall_reference_mode, WallFace::Centerline);
        assert!((s.wall_finish_thickness - 0.013).abs() < f64::EPSILON);
    }

    #[test]
    fn update_snap_mode_measure_endpoint() {
        let mut snap = MeasurementSnapSettings::default();
        assert!(snap.measure.endpoint);
        update_measurement_snap_mode(
            &mut snap,
            MeasurementSnapTool::Measure,
            MeasurementSnapMode::Endpoint,
            false,
        );
        assert!(!snap.measure.endpoint);
        // Dimension tool should be unaffected
        assert!(snap.dimension.endpoint);
    }

    #[test]
    fn update_snap_mode_dimension_center() {
        let mut snap = MeasurementSnapSettings::default();
        assert!(snap.dimension.center);
        update_measurement_snap_mode(
            &mut snap,
            MeasurementSnapTool::Dimension,
            MeasurementSnapMode::Center,
            false,
        );
        assert!(!snap.dimension.center);
        // Measure tool should be unaffected
        assert!(snap.measure.center);
    }
}
