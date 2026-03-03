//! 2D plan-view generation from 3D BIM elements.
//!
//! Projects walls, openings, and slabs onto a horizontal cutting
//! plane to produce a standard architectural floor plan.

use crate::wall::WallParams;
use bcad_domain::{DoorSwing, Element};
use serde::{Deserialize, Serialize};

/// A 2D line segment in the plan view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanLine {
    pub start: [f64; 2],
    pub end: [f64; 2],
}

/// A wall cross-section hatch polygon (4 corners of the wall cut).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanHatch {
    pub corners: [[f64; 2]; 4],
    pub element_id: String,
}

/// Symbol type for openings in plan view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlanSymbolType {
    DoorSwing,
    WindowGlazing,
}

/// An opening symbol (door swing arc or window glazing line).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanSymbol {
    pub symbol_type: PlanSymbolType,
    pub center: [f64; 2],
    pub angle: f64,
    pub radius: f64,
    pub element_id: String,
}

/// A room label with centroid, name, and area.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanRoomLabel {
    pub centroid: [f64; 2],
    pub name: String,
    pub area: f64,
}

/// Data for rendering a 2D floor plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanViewData {
    pub wall_lines: Vec<PlanLine>,
    pub wall_hatches: Vec<PlanHatch>,
    pub opening_symbols: Vec<PlanSymbol>,
    pub room_labels: Vec<PlanRoomLabel>,
}

/// Generate 2D plan view data from walls (legacy API).
///
/// Each wall produces 4 lines: inner edge, outer edge, and two end caps.
pub fn generate_plan(walls: &[WallParams]) -> PlanViewData {
    let mut wall_lines = Vec::new();
    let mut wall_hatches = Vec::new();
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

        // Hatch for the wall cross-section
        wall_hatches.push(PlanHatch {
            corners: [
                [wall.start[0] + nx, wall.start[1] + ny],
                [wall.end[0] + nx, wall.end[1] + ny],
                [wall.end[0] - nx, wall.end[1] - ny],
                [wall.start[0] - nx, wall.start[1] - ny],
            ],
            element_id: String::new(),
        });
    }
    PlanViewData {
        wall_lines,
        wall_hatches,
        opening_symbols: Vec::new(),
        room_labels: Vec::new(),
    }
}

/// Generate enriched 2D plan view from domain `Element` list.
///
/// Produces wall lines, wall hatches, door/window symbols, and room labels.
pub fn generate_plan_from_elements(elements: &[Element]) -> PlanViewData {
    let mut wall_lines = Vec::new();
    let mut wall_hatches = Vec::new();
    let mut opening_symbols = Vec::new();
    let mut room_labels = Vec::new();

    // Collect walls for opening resolution
    let walls: Vec<&bcad_domain::WallElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Wall(w) => Some(w),
            _ => None,
        })
        .collect();

    // Generate wall lines + hatches
    for wall in &walls {
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-10 {
            continue;
        }
        let nx = -dy / len * wall.thickness / 2.0;
        let ny = dx / len * wall.thickness / 2.0;

        wall_lines.push(PlanLine {
            start: [wall.start[0] + nx, wall.start[1] + ny],
            end: [wall.end[0] + nx, wall.end[1] + ny],
        });
        wall_lines.push(PlanLine {
            start: [wall.start[0] - nx, wall.start[1] - ny],
            end: [wall.end[0] - nx, wall.end[1] - ny],
        });
        wall_lines.push(PlanLine {
            start: [wall.start[0] + nx, wall.start[1] + ny],
            end: [wall.start[0] - nx, wall.start[1] - ny],
        });
        wall_lines.push(PlanLine {
            start: [wall.end[0] + nx, wall.end[1] + ny],
            end: [wall.end[0] - nx, wall.end[1] - ny],
        });

        wall_hatches.push(PlanHatch {
            corners: [
                [wall.start[0] + nx, wall.start[1] + ny],
                [wall.end[0] + nx, wall.end[1] + ny],
                [wall.end[0] - nx, wall.end[1] - ny],
                [wall.start[0] - nx, wall.start[1] - ny],
            ],
            element_id: wall.meta.id.clone(),
        });
    }

    // Generate opening symbols
    for element in elements {
        match element {
            Element::Door(door) => {
                if let Some(host_wall) = walls.iter().find(|w| w.meta.id == door.wall_id) {
                    let dx = host_wall.end[0] - host_wall.start[0];
                    let dy = host_wall.end[1] - host_wall.start[1];
                    let len = (dx * dx + dy * dy).sqrt();
                    if len < 1e-10 {
                        continue;
                    }
                    let ux = dx / len;
                    let uy = dy / len;
                    // Normal points to "inner" side
                    let _nx = -uy;
                    let _ny = ux;

                    let center_x = host_wall.start[0] + ux * door.position_along_wall * len;
                    let center_y = host_wall.start[1] + uy * door.position_along_wall * len;

                    // Door swing angle: quarter circle from wall direction
                    let base_angle = uy.atan2(ux);
                    let swing_angle = match door.swing {
                        DoorSwing::Right => base_angle + std::f64::consts::FRAC_PI_2,
                        DoorSwing::Left => base_angle - std::f64::consts::FRAC_PI_2,
                    };

                    opening_symbols.push(PlanSymbol {
                        symbol_type: PlanSymbolType::DoorSwing,
                        center: [center_x, center_y],
                        angle: swing_angle,
                        radius: door.width,
                        element_id: door.meta.id.clone(),
                    });
                }
            }
            Element::Window(window) => {
                if let Some(host_wall) = walls.iter().find(|w| w.meta.id == window.wall_id) {
                    let dx = host_wall.end[0] - host_wall.start[0];
                    let dy = host_wall.end[1] - host_wall.start[1];
                    let len = (dx * dx + dy * dy).sqrt();
                    if len < 1e-10 {
                        continue;
                    }
                    let ux = dx / len;
                    let uy = dy / len;

                    let center_x = host_wall.start[0] + ux * window.position_along_wall * len;
                    let center_y = host_wall.start[1] + uy * window.position_along_wall * len;
                    let base_angle = uy.atan2(ux);

                    opening_symbols.push(PlanSymbol {
                        symbol_type: PlanSymbolType::WindowGlazing,
                        center: [center_x, center_y],
                        angle: base_angle,
                        radius: window.width,
                        element_id: window.meta.id.clone(),
                    });
                }
            }
            _ => {}
        }
    }

    // Generate room labels using shoelace formula
    for element in elements {
        if let Element::Room(room) = element {
            if room.boundary.len() < 3 {
                continue;
            }
            let (cx, cy, area) = polygon_centroid_and_area(&room.boundary);
            room_labels.push(PlanRoomLabel {
                centroid: [cx, cy],
                name: room.meta.name.clone(),
                area: area.abs(),
            });
        }
    }

    PlanViewData {
        wall_lines,
        wall_hatches,
        opening_symbols,
        room_labels,
    }
}

/// Compute centroid and signed area of a polygon using the shoelace formula.
fn polygon_centroid_and_area(pts: &[[f64; 2]]) -> (f64, f64, f64) {
    let n = pts.len();
    if n < 3 {
        return (0.0, 0.0, 0.0);
    }
    let mut area = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        let cross = pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
        area += cross;
        cx += (pts[i][0] + pts[j][0]) * cross;
        cy += (pts[i][1] + pts[j][1]) * cross;
    }
    area *= 0.5;
    if area.abs() < 1e-12 {
        // Degenerate polygon — return simple average
        let avg_x = pts.iter().map(|p| p[0]).sum::<f64>() / n as f64;
        let avg_y = pts.iter().map(|p| p[1]).sum::<f64>() / n as f64;
        return (avg_x, avg_y, 0.0);
    }
    cx /= 6.0 * area;
    cy /= 6.0 * area;
    (cx, cy, area)
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

    #[test]
    fn test_polygon_centroid_and_area() {
        // Unit square: (0,0), (1,0), (1,1), (0,1) — area = 1, centroid = (0.5, 0.5)
        let pts = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        let (cx, cy, area) = polygon_centroid_and_area(&pts);
        assert!((area.abs() - 1.0).abs() < 1e-10);
        assert!((cx - 0.5).abs() < 1e-10);
        assert!((cy - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_plan_view_wall_hatches() {
        let walls = vec![WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        }];
        let plan = generate_plan(&walls);
        assert_eq!(plan.wall_hatches.len(), 1);
    }
}
