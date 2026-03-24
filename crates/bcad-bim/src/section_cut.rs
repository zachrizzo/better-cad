//! Section cut and elevation view generation.
//!
//! Generates 2D representations by slicing through the building model
//! with a vertical cut plane or projecting onto an elevation plane.

use bcad_domain::{Element, WallElement};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CutLine {
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub element_id: String,
    pub element_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HatchPolygon {
    pub points: Vec<[f64; 2]>,
    pub element_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionViewData {
    pub cut_lines: Vec<CutLine>,
    pub hatch_polygons: Vec<HatchPolygon>,
    pub view_width: f64,
    pub view_height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElevationLine {
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub element_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElevationViewData {
    pub lines: Vec<ElevationLine>,
    pub view_width: f64,
    pub view_height: f64,
}

/// Generate a section cut through the building.
///
/// `cut_start` and `cut_end` define the cut plane in plan (XY).
/// `cut_height` is the Z height of the cut (default 1.2m if 0).
/// Returns lines and hatch polygons in a 2D view coordinate system
/// where X = distance along cut direction, Y = elevation.
pub fn generate_section_cut(
    cut_start: [f64; 2],
    cut_end: [f64; 2],
    cut_height: f64,
    elements: &[Element],
) -> SectionViewData {
    let _cut_height = if cut_height.abs() < 1e-6 {
        1.2
    } else {
        cut_height
    };

    let dx = cut_end[0] - cut_start[0];
    let dy = cut_end[1] - cut_start[1];
    let cut_len = (dx * dx + dy * dy).sqrt();
    if cut_len < 1e-8 {
        return SectionViewData {
            cut_lines: vec![],
            hatch_polygons: vec![],
            view_width: 0.0,
            view_height: 0.0,
        };
    }

    let ux = dx / cut_len;
    let uy = dy / cut_len;
    // Normal to cut plane
    let nx = -uy;
    let ny = ux;

    let mut cut_lines = Vec::new();
    let mut hatch_polygons = Vec::new();
    let mut max_height = 0.0_f64;

    for element in elements {
        match element {
            Element::Wall(wall) => {
                if let Some(result) =
                    intersect_wall_with_cut(wall, cut_start, ux, uy, nx, ny, cut_len)
                {
                    max_height = max_height.max(wall.height);
                    cut_lines.push(CutLine {
                        start: result.segment.0,
                        end: result.segment.1,
                        element_id: wall.meta.id.clone(),
                        element_kind: "wall".to_string(),
                    });
                    hatch_polygons.push(HatchPolygon {
                        points: result.hatch,
                        element_id: wall.meta.id.clone(),
                    });
                }
            }
            Element::Floor(floor) => {
                // Project floor boundary onto cut line
                // Floors are thin horizontal slabs at elevation 0
                if floor.boundary.len() >= 3 {
                    let mut min_u = f64::MAX;
                    let mut max_u = f64::MIN;
                    let mut crosses = false;

                    for pt in &floor.boundary {
                        let u = (pt[0] - cut_start[0]) * ux + (pt[1] - cut_start[1]) * uy;
                        let n = (pt[0] - cut_start[0]) * nx + (pt[1] - cut_start[1]) * ny;
                        min_u = min_u.min(u);
                        max_u = max_u.max(u);
                        if n.abs() < floor.thickness + 1.0 {
                            crosses = true;
                        }
                    }

                    if crosses && max_u > 0.0 && min_u < cut_len {
                        let u_start = min_u.max(0.0);
                        let u_end = max_u.min(cut_len);
                        if u_end > u_start {
                            let hatch = vec![
                                [u_start, -floor.thickness],
                                [u_end, -floor.thickness],
                                [u_end, 0.0],
                                [u_start, 0.0],
                            ];
                            hatch_polygons.push(HatchPolygon {
                                points: hatch,
                                element_id: floor.meta.id.clone(),
                            });
                        }
                    }
                }
            }
            _ => {}
        }
    }

    SectionViewData {
        cut_lines,
        hatch_polygons,
        view_width: cut_len,
        view_height: if max_height > 0.0 {
            max_height + 1.0
        } else {
            5.0
        },
    }
}

/// Result of intersecting a wall with a section cut plane.
struct WallCutResult {
    /// Bounding segment of the cut: (lower-left, upper-right).
    segment: ([f64; 2], [f64; 2]),
    /// Hatch polygon (4-corner rectangle in the section plane).
    hatch: Vec<[f64; 2]>,
}

/// Wall-cut intersection helper.
fn intersect_wall_with_cut(
    wall: &WallElement,
    cut_start: [f64; 2],
    ux: f64,
    uy: f64,
    nx: f64,
    ny: f64,
    cut_len: f64,
) -> Option<WallCutResult> {
    let ws_u = (wall.start[0] - cut_start[0]) * ux + (wall.start[1] - cut_start[1]) * uy;
    let we_u = (wall.end[0] - cut_start[0]) * ux + (wall.end[1] - cut_start[1]) * uy;

    let ws_n = (wall.start[0] - cut_start[0]) * nx + (wall.start[1] - cut_start[1]) * ny;
    let we_n = (wall.end[0] - cut_start[0]) * nx + (wall.end[1] - cut_start[1]) * ny;

    let half_t = wall.thickness * 0.5;

    let min_n = ws_n.min(we_n) - half_t;
    let max_n = ws_n.max(we_n) + half_t;

    // Check if cut plane (n=0) passes through this wall
    if min_n > 0.0 || max_n < 0.0 {
        return None;
    }

    let min_u = ws_u.min(we_u);
    let max_u = ws_u.max(we_u);

    // Wall needs to overlap the cut line range [0, cut_len]
    let u_start = min_u.max(0.0);
    let u_end = max_u.min(cut_len);
    if u_end <= u_start {
        // If the wall is perpendicular and crosses the cut, show its thickness
        // Find the intersection parameter along the wall
        let wall_dx = wall.end[0] - wall.start[0];
        let wall_dy = wall.end[1] - wall.start[1];
        let wall_len = (wall_dx * wall_dx + wall_dy * wall_dy).sqrt();
        if wall_len < 1e-10 {
            return None;
        }

        // Wall direction dotted with cut normal
        let wall_dot_n = (wall_dx / wall_len) * nx + (wall_dy / wall_len) * ny;
        if wall_dot_n.abs() < 1e-10 {
            return None;
        }

        // Find t where wall crosses n=0
        let t = -ws_n / (we_n - ws_n);
        if !(0.0..=1.0).contains(&t) {
            return None;
        }

        let cross_u = ws_u + t * (we_u - ws_u);
        if cross_u < 0.0 || cross_u > cut_len {
            return None;
        }

        let u_lo = (cross_u - half_t).max(0.0);
        let u_hi = (cross_u + half_t).min(cut_len);
        if u_hi <= u_lo {
            return None;
        }

        let hatch = vec![
            [u_lo, 0.0],
            [u_hi, 0.0],
            [u_hi, wall.height],
            [u_lo, wall.height],
        ];
        let segment = ([u_lo, 0.0], [u_hi, wall.height]);
        return Some(WallCutResult { segment, hatch });
    }

    // Parallel wall: show as a rectangle in section
    let hatch = vec![
        [u_start, 0.0],
        [u_end, 0.0],
        [u_end, wall.height],
        [u_start, wall.height],
    ];

    let segment = ([u_start, 0.0], [u_end, wall.height]);
    Some(WallCutResult { segment, hatch })
}

/// Generate an elevation view looking in the given direction.
///
/// `direction`: "north", "south", "east", "west"
pub fn generate_elevation(direction: &str, elements: &[Element]) -> ElevationViewData {
    let (vx, vy) = match direction {
        "north" => (0.0_f64, 1.0_f64),
        "south" => (0.0_f64, -1.0_f64),
        "east" => (1.0_f64, 0.0_f64),
        "west" => (-1.0_f64, 0.0_f64),
        _ => (1.0_f64, 0.0_f64),
    };

    // Horizontal axis of elevation view is perpendicular to view direction
    let hx = -vy;
    let hy = vx;

    let mut lines = Vec::new();
    let mut max_h = 0.0_f64;
    let mut min_w = f64::MAX;
    let mut max_w = f64::MIN;

    for element in elements {
        if let Element::Wall(wall) = element {
            let s_h = wall.start[0] * hx + wall.start[1] * hy;
            let e_h = wall.end[0] * hx + wall.end[1] * hy;
            max_h = max_h.max(wall.height);
            min_w = min_w.min(s_h).min(e_h);
            max_w = max_w.max(s_h).max(e_h);

            // Bottom line
            lines.push(ElevationLine {
                start: [s_h, 0.0],
                end: [e_h, 0.0],
                element_id: wall.meta.id.clone(),
            });
            // Top line
            lines.push(ElevationLine {
                start: [s_h, wall.height],
                end: [e_h, wall.height],
                element_id: wall.meta.id.clone(),
            });
            // Left vertical
            lines.push(ElevationLine {
                start: [s_h, 0.0],
                end: [s_h, wall.height],
                element_id: wall.meta.id.clone(),
            });
            // Right vertical
            lines.push(ElevationLine {
                start: [e_h, 0.0],
                end: [e_h, wall.height],
                element_id: wall.meta.id.clone(),
            });
        }
    }

    let width = if max_w > min_w {
        max_w - min_w + 2.0
    } else {
        4.0
    };
    let height = if max_h > 0.0 { max_h + 1.0 } else { 4.0 };

    // Normalize line coordinates so min_w maps to 1.0
    if min_w.is_finite() && max_w.is_finite() {
        let offset = if min_w < f64::MAX { 1.0 - min_w } else { 0.0 };
        for line in &mut lines {
            line.start[0] += offset;
            line.end[0] += offset;
        }
    }

    ElevationViewData {
        lines,
        view_width: width,
        view_height: height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::{ElementMeta, WallElement};

    fn test_wall(start: [f64; 2], end: [f64; 2]) -> Element {
        Element::Wall(WallElement {
            meta: ElementMeta {
                id: "wall-1".to_string(),
                name: "Wall 1".to_string(),
                level_id: None,
                host_id: None,
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            start,
            end,
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        })
    }

    #[test]
    fn test_section_cut_empty() {
        let data = generate_section_cut([0.0, 0.0], [10.0, 0.0], 1.2, &[]);
        assert!(data.cut_lines.is_empty());
        assert!(data.hatch_polygons.is_empty());
    }

    #[test]
    fn test_section_cut_zero_length() {
        let data = generate_section_cut(
            [0.0, 0.0],
            [0.0, 0.0],
            1.2,
            &[test_wall([0.0, 0.0], [5.0, 0.0])],
        );
        assert_eq!(data.view_width, 0.0);
    }

    #[test]
    fn test_section_cut_parallel_wall() {
        // Cut line along X, wall also along X at y=0
        let wall = test_wall([0.0, 0.0], [5.0, 0.0]);
        let data = generate_section_cut([0.0, 0.0], [10.0, 0.0], 1.2, &[wall]);
        // Wall sits on the cut line, should produce intersection
        assert!(!data.hatch_polygons.is_empty());
    }

    #[test]
    fn test_section_cut_perpendicular_wall() {
        // Cut line along X at y=2, wall goes from (3,0) to (3,5) perpendicular
        let wall = test_wall([3.0, 0.0], [3.0, 5.0]);
        let data = generate_section_cut([0.0, 2.0], [10.0, 2.0], 1.2, &[wall]);
        assert!(!data.hatch_polygons.is_empty());
        // Hatch should show wall thickness in section
        if let Some(hatch) = data.hatch_polygons.first() {
            assert_eq!(hatch.points.len(), 4);
        }
    }

    #[test]
    fn test_section_cut_wall_far_away() {
        // Wall at y=100, cut at y=0 — should not intersect
        let wall = test_wall([0.0, 100.0], [5.0, 100.0]);
        let data = generate_section_cut([0.0, 0.0], [10.0, 0.0], 1.2, &[wall]);
        assert!(data.hatch_polygons.is_empty());
    }

    #[test]
    fn test_elevation_empty() {
        let data = generate_elevation("north", &[]);
        assert!(data.lines.is_empty());
    }

    #[test]
    fn test_elevation_north_wall() {
        let wall = test_wall([0.0, 0.0], [5.0, 0.0]);
        let data = generate_elevation("north", &[wall]);
        // Should produce 4 lines (top, bottom, 2 verticals)
        assert_eq!(data.lines.len(), 4);
        assert!(data.view_height > 3.0);
    }

    #[test]
    fn test_elevation_all_directions() {
        let wall = test_wall([0.0, 0.0], [5.0, 0.0]);
        for dir in &["north", "south", "east", "west"] {
            let data = generate_elevation(dir, &[wall.clone()]);
            assert!(!data.lines.is_empty(), "no lines for direction {}", dir);
        }
    }
}
