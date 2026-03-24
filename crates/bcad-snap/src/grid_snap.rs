//! Grid snapping utilities.
//!
//! Provides functions to snap a point to the nearest grid intersection and
//! to produce a [`SnapCandidate`] for grid-based snapping.

use crate::snap_types::{snap_type_priority, SnapCandidate, SnapType};

/// Snap a point to the nearest grid intersection.
///
/// `grid_size` is the spacing between grid lines in each axis. If
/// `grid_size` is zero or negative, the point is returned unchanged.
pub fn snap_to_grid(point: [f64; 2], grid_size: f64) -> [f64; 2] {
    if grid_size <= 0.0 {
        return point;
    }
    [
        (point[0] / grid_size).round() * grid_size,
        (point[1] / grid_size).round() * grid_size,
    ]
}

/// Produce a snap candidate for the nearest grid point to the given position.
pub fn nearest_grid_point(point: [f64; 2], grid_size: f64) -> SnapCandidate {
    let snapped = snap_to_grid(point, grid_size);
    SnapCandidate {
        point: snapped,
        snap_type: SnapType::Grid,
        source_element_id: None,
        priority: snap_type_priority(SnapType::Grid),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snap_to_grid_exact() {
        // Point already on grid
        let result = snap_to_grid([2.0, 3.0], 1.0);
        assert!((result[0] - 2.0).abs() < 1e-10);
        assert!((result[1] - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_snap_to_grid_between_points() {
        // Point between grid lines
        let result = snap_to_grid([2.3, 3.7], 1.0);
        assert!((result[0] - 2.0).abs() < 1e-10);
        assert!((result[1] - 4.0).abs() < 1e-10);
    }

    #[test]
    fn test_snap_to_grid_half_meter() {
        let result = snap_to_grid([1.3, 2.8], 0.5);
        assert!((result[0] - 1.5).abs() < 1e-10);
        assert!((result[1] - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_snap_to_grid_negative_coords() {
        let result = snap_to_grid([-1.3, -2.8], 1.0);
        assert!((result[0] - -1.0).abs() < 1e-10);
        assert!((result[1] - -3.0).abs() < 1e-10);
    }

    #[test]
    fn test_snap_to_grid_zero_size_returns_point() {
        let result = snap_to_grid([1.5, 2.5], 0.0);
        assert_eq!(result, [1.5, 2.5]);
    }

    #[test]
    fn test_nearest_grid_point_candidate() {
        let candidate = nearest_grid_point([1.3, 2.7], 1.0);
        assert!((candidate.point[0] - 1.0).abs() < 1e-10);
        assert!((candidate.point[1] - 3.0).abs() < 1e-10);
        assert_eq!(candidate.snap_type, SnapType::Grid);
        assert!(candidate.source_element_id.is_none());
    }

    #[test]
    fn test_snap_to_grid_large_grid() {
        let result = snap_to_grid([3.2, 7.8], 5.0);
        assert!((result[0] - 5.0).abs() < 1e-10);
        assert!((result[1] - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_snap_to_grid_at_midpoint_rounds() {
        // Exactly at 0.5 boundary: round-half-to-even or round-half-up
        let result = snap_to_grid([0.5, 1.5], 1.0);
        // f64 round() does round-half-away-from-zero
        assert!((result[0] - 1.0).abs() < 1e-10);
        assert!((result[1] - 2.0).abs() < 1e-10);
    }
}
