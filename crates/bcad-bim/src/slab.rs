//! Floor slab / roof slab elements.
//!
//! A slab is defined by a closed 2D boundary (polygon or spline)
//! and a thickness, extruded along the normal of its reference plane.

use bcad_domain::{FloorElement, StairElement, StairType};
use bcad_kernel::error::KernelError;
use bcad_kernel::tessellation::TessellatedMesh;

const EPS: f64 = 1e-9;

fn point_on_segment(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64) -> bool {
    let abx = bx - ax;
    let aby = by - ay;
    let apx = px - ax;
    let apy = py - ay;
    let cross = abx * apy - aby * apx;
    if cross.abs() > 1e-9 {
        return false;
    }

    let dot = apx * abx + apy * aby;
    if dot < -1e-9 {
        return false;
    }
    let len_sq = abx * abx + aby * aby;
    dot <= len_sq + 1e-9
}

fn point_in_polygon_or_edge(boundary: &[[f64; 2]], point: [f64; 2]) -> bool {
    if boundary.len() < 3 {
        return false;
    }

    let px = point[0];
    let py = point[1];
    let mut inside = false;

    for i in 0..boundary.len() {
        let a = boundary[i];
        let b = boundary[(i + 1) % boundary.len()];
        if point_on_segment(px, py, a[0], a[1], b[0], b[1]) {
            return true;
        }

        let intersects = ((a[1] > py) != (b[1] > py))
            && (px < (b[0] - a[0]) * (py - a[1]) / ((b[1] - a[1]) + EPS) + a[0]);
        if intersects {
            inside = !inside;
        }
    }

    inside
}

fn opening_fits_floor(floor_boundary: &[[f64; 2]], opening: &[[f64; 2]]) -> bool {
    opening
        .iter()
        .all(|&point| point_in_polygon_or_edge(floor_boundary, point))
}

/// Tessellate a floor slab without openings.
pub fn floor_mesh(floor: &FloorElement) -> Result<TessellatedMesh, KernelError> {
    floor_mesh_with_openings(floor, &[])
}

/// Tessellate a floor slab and cut interior opening loops.
///
/// Openings that are not fully inside the floor boundary are ignored.
pub fn floor_mesh_with_openings(
    floor: &FloorElement,
    openings: &[Vec<[f64; 2]>],
) -> Result<TessellatedMesh, KernelError> {
    if floor.boundary.len() < 3 {
        return Err(KernelError::TopologyError(
            "floor boundary must have at least 3 points".into(),
        ));
    }
    if floor.thickness <= 0.0 {
        return Err(KernelError::TopologyError(
            "floor thickness must be positive".into(),
        ));
    }

    let outer: Vec<(f64, f64)> = floor.boundary.iter().map(|p| (p[0], p[1])).collect();
    let hole_loops: Vec<Vec<(f64, f64)>> = openings
        .iter()
        .filter(|opening| opening.len() >= 3 && opening_fits_floor(&floor.boundary, opening))
        .map(|opening| opening.iter().map(|p| (p[0], p[1])).collect())
        .collect();

    let solid = if hole_loops.is_empty() {
        bcad_kernel::geometry::extrude_sketch_points(&outer, floor.thickness)?
    } else {
        // If a malformed loop sneaks through, keep the slab visible instead of dropping it.
        match bcad_kernel::geometry::extrude_sketch_with_holes(&outer, &hole_loops, floor.thickness)
        {
            Ok(solid) => solid,
            Err(_) => bcad_kernel::geometry::extrude_sketch_points(&outer, floor.thickness)?,
        }
    };

    bcad_kernel::tessellation::tessellate(&solid)
}

fn normalize_spiral_turns(turns: f64) -> f64 {
    let clamped = turns.clamp(-5.0, 5.0);
    if clamped.abs() < 0.1 {
        if clamped < 0.0 {
            -0.1
        } else {
            0.1
        }
    } else {
        clamped
    }
}

fn annular_sector_points(
    center: [f64; 2],
    inner_radius: f64,
    outer_radius: f64,
    start_angle: f64,
    end_angle: f64,
) -> Vec<[f64; 2]> {
    let sweep = (end_angle - start_angle).abs();
    let segments = ((sweep / (std::f64::consts::PI / 12.0)).ceil() as usize).max(2);
    let mut points: Vec<[f64; 2]> = Vec::with_capacity((segments + 1) * 2);

    for i in 0..=segments {
        let t = i as f64 / segments as f64;
        let angle = start_angle + (end_angle - start_angle) * t;
        points.push([
            center[0] + angle.cos() * outer_radius,
            center[1] + angle.sin() * outer_radius,
        ]);
    }

    for i in (0..=segments).rev() {
        let t = i as f64 / segments as f64;
        let angle = start_angle + (end_angle - start_angle) * t;
        points.push([
            center[0] + angle.cos() * inner_radius,
            center[1] + angle.sin() * inner_radius,
        ]);
    }

    points
}

/// Returns the 2D stairwell opening loop to cut in the floor above this stair.
pub fn stair_opening_boundary(stair: &StairElement) -> Option<Vec<[f64; 2]>> {
    match stair.stair_type {
        StairType::Straight => {
            let dx = stair.end[0] - stair.start[0];
            let dy = stair.end[1] - stair.start[1];
            let len = (dx * dx + dy * dy).sqrt();
            if len < EPS {
                return None;
            }

            let ux = dx / len;
            let uy = dy / len;
            let side_wall = stair.side_wall_thickness.max(0.0);
            let half_span = stair.width.max(0.0) * 0.5 + side_wall;
            if half_span <= EPS {
                return None;
            }

            let nx = -uy * half_span;
            let ny = ux * half_span;

            Some(vec![
                [stair.start[0] + nx, stair.start[1] + ny],
                [stair.end[0] + nx, stair.end[1] + ny],
                [stair.end[0] - nx, stair.end[1] - ny],
                [stair.start[0] - nx, stair.start[1] - ny],
            ])
        }
        StairType::Spiral => {
            let center = stair.start;
            let dx = stair.end[0] - center[0];
            let dy = stair.end[1] - center[1];
            let outer_radius = (dx * dx + dy * dy).sqrt();
            if outer_radius < EPS {
                return None;
            }

            let side_wall = stair.side_wall_thickness.max(0.0);
            let inner_radius_cap = (outer_radius - 0.01).max(0.01);
            let inner_radius = (outer_radius - stair.width).max(0.05).min(inner_radius_cap);
            let opening_outer = outer_radius + side_wall;
            let opening_inner = (inner_radius - side_wall).max(0.01);
            if opening_outer - opening_inner <= EPS {
                return None;
            }

            let start_angle = dy.atan2(dx);
            let total_angle =
                normalize_spiral_turns(stair.spiral_turns) * std::f64::consts::PI * 2.0;
            let end_angle = start_angle + total_angle;
            Some(annular_sector_points(
                center,
                opening_inner,
                opening_outer,
                start_angle,
                end_angle,
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::{ElementMeta, StairType};

    fn make_floor(boundary: Vec<[f64; 2]>) -> FloorElement {
        FloorElement {
            meta: ElementMeta::new("Floor Test"),
            boundary,
            thickness: 0.2,
        }
    }

    #[test]
    fn test_straight_stair_opening_boundary() {
        let stair = StairElement {
            meta: ElementMeta::new("Stair Test"),
            start: [2.0, 2.0],
            end: [2.0, 8.0],
            width: 1.2,
            risers: 16,
            total_height: 3.0,
            stair_type: StairType::Straight,
            spiral_turns: 1.0,
            side_wall_thickness: 0.1,
        };

        let loop_pts = stair_opening_boundary(&stair).unwrap();
        assert_eq!(loop_pts.len(), 4);
        let span = (loop_pts[0][0] - loop_pts[3][0]).abs();
        assert!((span - (stair.width + stair.side_wall_thickness * 2.0)).abs() < 1e-6);
    }

    #[test]
    fn test_floor_mesh_with_opening() {
        let floor = make_floor(vec![[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]);
        let stair = StairElement {
            meta: ElementMeta::new("Stair Test"),
            start: [4.0, 2.0],
            end: [4.0, 8.0],
            width: 1.2,
            risers: 16,
            total_height: 3.0,
            stair_type: StairType::Straight,
            spiral_turns: 1.0,
            side_wall_thickness: 0.1,
        };
        let opening = stair_opening_boundary(&stair).unwrap();

        let solid_mesh = floor_mesh(&floor).unwrap();
        let cut_mesh = floor_mesh_with_openings(&floor, &[opening]).unwrap();
        assert_ne!(solid_mesh.indices.len(), cut_mesh.indices.len());
    }

    #[test]
    fn test_floor_mesh_ignores_outside_opening() {
        let floor = make_floor(vec![[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]]);
        let outside_opening = vec![[6.0, 6.0], [7.0, 6.0], [7.0, 7.0], [6.0, 7.0]];

        let solid_mesh = floor_mesh(&floor).unwrap();
        let mesh_with_outside = floor_mesh_with_openings(&floor, &[outside_opening]).unwrap();
        assert_eq!(solid_mesh.indices.len(), mesh_with_outside.indices.len());
    }
}
