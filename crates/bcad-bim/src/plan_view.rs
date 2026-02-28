//! 2D plan-view generation from 3D BIM elements.
//!
//! Projects walls, openings, and slabs onto a horizontal cutting
//! plane to produce a standard architectural floor plan.

use crate::wall::WallParams;
use serde::{Deserialize, Serialize};

/// A 2D line segment in the plan view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanLine {
    pub start: [f64; 2],
    pub end: [f64; 2],
}

/// Data for rendering a 2D floor plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanViewData {
    pub wall_lines: Vec<PlanLine>,
}

/// Generate 2D plan view data from walls.
///
/// Each wall produces 4 lines: inner edge, outer edge, and two end caps.
pub fn generate_plan(walls: &[WallParams]) -> PlanViewData {
    let mut wall_lines = Vec::new();
    for wall in walls {
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-10 {
            continue;
        }
        let nx = -dy / len * wall.thickness / 2.0;
        let ny = dx / len * wall.thickness / 2.0;

        // Inner and outer wall lines
        wall_lines.push(PlanLine {
            start: [wall.start[0] + nx, wall.start[1] + ny],
            end: [wall.end[0] + nx, wall.end[1] + ny],
        });
        wall_lines.push(PlanLine {
            start: [wall.start[0] - nx, wall.start[1] - ny],
            end: [wall.end[0] - nx, wall.end[1] - ny],
        });
        // End caps
        wall_lines.push(PlanLine {
            start: [wall.start[0] + nx, wall.start[1] + ny],
            end: [wall.start[0] - nx, wall.start[1] - ny],
        });
        wall_lines.push(PlanLine {
            start: [wall.end[0] + nx, wall.end[1] + ny],
            end: [wall.end[0] - nx, wall.end[1] - ny],
        });
    }
    PlanViewData { wall_lines }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_view_single_wall() {
        let walls = vec![WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        }];
        let plan = generate_plan(&walls);
        // Each wall produces 4 lines (inner, outer, 2 end caps)
        assert_eq!(plan.wall_lines.len(), 4);
    }

    #[test]
    fn test_plan_view_two_walls() {
        let walls = vec![
            WallParams {
                start: [0.0, 0.0],
                end: [5.0, 0.0],
                height: 3.0,
                thickness: 0.2,
            },
            WallParams {
                start: [5.0, 0.0],
                end: [5.0, 4.0],
                height: 3.0,
                thickness: 0.2,
            },
        ];
        let plan = generate_plan(&walls);
        assert_eq!(plan.wall_lines.len(), 8);
    }

    #[test]
    fn test_plan_view_zero_length_wall_skipped() {
        let walls = vec![WallParams {
            start: [1.0, 1.0],
            end: [1.0, 1.0],
            height: 3.0,
            thickness: 0.2,
        }];
        let plan = generate_plan(&walls);
        assert_eq!(plan.wall_lines.len(), 0);
    }

    #[test]
    fn test_plan_view_empty() {
        let plan = generate_plan(&[]);
        assert_eq!(plan.wall_lines.len(), 0);
    }

    #[test]
    fn test_plan_view_line_offsets() {
        let walls = vec![WallParams {
            start: [0.0, 0.0],
            end: [10.0, 0.0],
            height: 3.0,
            thickness: 1.0,
        }];
        let plan = generate_plan(&walls);
        // Wall along X axis, thickness 1.0, so offset is 0.5 in Y
        // Inner line: y = +0.5
        assert!((plan.wall_lines[0].start[1] - 0.5).abs() < 1e-10);
        assert!((plan.wall_lines[0].end[1] - 0.5).abs() < 1e-10);
        // Outer line: y = -0.5
        assert!((plan.wall_lines[1].start[1] + 0.5).abs() < 1e-10);
        assert!((plan.wall_lines[1].end[1] + 0.5).abs() < 1e-10);
    }
}
