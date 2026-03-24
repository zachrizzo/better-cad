use serde::{Deserialize, Serialize};

/// Snap mode categories, matching the TypeScript `MeasurementSnapMode` plus
/// additional geometric modes used by the Rust tool system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapType {
    /// Wall/beam/stair endpoints, boundary polygon vertices.
    Endpoint,
    /// Midpoint of a linear segment.
    Midpoint,
    /// Center of a circle, arc, or column.
    Center,
    /// Intersection of two wall segments (or other line-like elements).
    Intersection,
    /// Nearest point on mesh/edge geometry.
    Nearest,
    /// Foot of a perpendicular from cursor to a segment.
    Perpendicular,
    /// Grid-aligned point.
    Grid,
}

/// A snap candidate is a potential snap target extracted from document elements.
#[derive(Debug, Clone)]
pub struct SnapCandidate {
    /// Position in plan-space (XZ in the 3-D scene, but stored as 2-D).
    pub point: [f64; 2],
    /// The snap type(s) this candidate supports.
    pub snap_type: SnapType,
    /// The element this candidate was derived from, if any.
    pub source_element_id: Option<String>,
    /// Priority weight (lower = higher priority). Used to break ties when
    /// multiple candidates are equidistant. Endpoint = 0, Midpoint = 1, etc.
    pub priority: f64,
}

/// The result of a successful snap query.
#[derive(Debug, Clone)]
pub struct SnapResult {
    /// The snapped-to position.
    pub point: [f64; 2],
    /// The type of snap that matched.
    pub snap_type: SnapType,
    /// The element that produced this snap candidate, if any.
    pub source_element_id: Option<String>,
    /// Distance from the query point to the snap point.
    pub distance: f64,
}

/// Per-snap-type enabled/disabled filter, mirroring the TypeScript
/// `MeasurementSnapModeSettings`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapModeFilter {
    pub endpoint: bool,
    pub midpoint: bool,
    pub center: bool,
    pub intersection: bool,
    pub nearest: bool,
    pub perpendicular: bool,
    pub grid: bool,
}

impl Default for SnapModeFilter {
    fn default() -> Self {
        Self {
            endpoint: true,
            midpoint: true,
            center: true,
            intersection: true,
            nearest: true,
            perpendicular: true,
            grid: true,
        }
    }
}

impl SnapModeFilter {
    /// Create a filter with all modes enabled.
    pub fn all_enabled() -> Self {
        Self::default()
    }

    /// Create a filter with all modes disabled.
    pub fn none_enabled() -> Self {
        Self {
            endpoint: false,
            midpoint: false,
            center: false,
            intersection: false,
            nearest: false,
            perpendicular: false,
            grid: false,
        }
    }

    /// Check whether a given snap type is enabled in this filter.
    pub fn is_enabled(&self, snap_type: SnapType) -> bool {
        match snap_type {
            SnapType::Endpoint => self.endpoint,
            SnapType::Midpoint => self.midpoint,
            SnapType::Center => self.center,
            SnapType::Intersection => self.intersection,
            SnapType::Nearest => self.nearest,
            SnapType::Perpendicular => self.perpendicular,
            SnapType::Grid => self.grid,
        }
    }
}

/// Priority values for snap types (lower = higher priority).
/// Used to break ties when multiple candidates are equidistant.
pub fn snap_type_priority(snap_type: SnapType) -> f64 {
    match snap_type {
        SnapType::Endpoint => 0.0,
        SnapType::Center => 1.0,
        SnapType::Intersection => 2.0,
        SnapType::Midpoint => 3.0,
        SnapType::Perpendicular => 4.0,
        SnapType::Nearest => 5.0,
        SnapType::Grid => 6.0,
    }
}
