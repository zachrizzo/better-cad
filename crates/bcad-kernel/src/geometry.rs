//! Geometry primitives and construction helpers.
//!
//! This module wraps Truck geometry types and provides
//! ergonomic constructors for boxes, cylinders, spheres, etc.

use crate::topology::{Solid, Wire};
use truck_modeling::{builder, Point3, Vector3};

fn point_eq(a: (f64, f64), b: (f64, f64)) -> bool {
    (a.0 - b.0).abs() < 1e-10 && (a.1 - b.1).abs() < 1e-10
}

fn signed_area(points: &[(f64, f64)]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..points.len() {
        let (x0, y0) = points[i];
        let (x1, y1) = points[(i + 1) % points.len()];
        area += x0 * y1 - x1 * y0;
    }
    area * 0.5
}

fn normalize_loop(
    points: &[(f64, f64)],
    ccw: bool,
) -> Result<Vec<(f64, f64)>, crate::error::KernelError> {
    let mut cleaned: Vec<(f64, f64)> = Vec::with_capacity(points.len());
    for &p in points {
        if cleaned.last().is_some_and(|&last| point_eq(last, p)) {
            continue;
        }
        cleaned.push(p);
    }

    if cleaned.len() >= 2 && point_eq(cleaned[0], *cleaned.last().unwrap()) {
        cleaned.pop();
    }

    if cleaned.len() < 3 {
        return Err(crate::error::KernelError::TopologyError(
            "need at least 3 distinct points".into(),
        ));
    }

    let area = signed_area(&cleaned);
    if area.abs() < 1e-12 {
        return Err(crate::error::KernelError::TopologyError(
            "polygon loop is degenerate".into(),
        ));
    }

    let is_ccw = area > 0.0;
    if is_ccw != ccw {
        cleaned.reverse();
    }

    Ok(cleaned)
}

fn wire_from_loop(points: &[(f64, f64)]) -> Wire {
    let vertices: Vec<_> = points
        .iter()
        .map(|&(x, y)| builder::vertex(Point3::new(x, y, 0.0)))
        .collect();

    let n = vertices.len();
    let edges: Vec<_> = (0..n)
        .map(|i| {
            let j = (i + 1) % n;
            builder::line(&vertices[i], &vertices[j])
        })
        .collect();

    edges.into()
}

/// Extrude a 2D polygon with optional interior holes.
///
/// `outer` defines the perimeter of the face and `holes` defines zero or more
/// interior loops to subtract from that face before extrusion.
pub fn extrude_sketch_with_holes(
    outer: &[(f64, f64)],
    holes: &[Vec<(f64, f64)>],
    height: f64,
) -> Result<Solid, crate::error::KernelError> {
    if height <= 0.0 {
        return Err(crate::error::KernelError::TopologyError(
            "height must be positive".into(),
        ));
    }

    let normalized_outer = normalize_loop(outer, true)?;
    let mut wires = Vec::with_capacity(holes.len() + 1);
    wires.push(wire_from_loop(&normalized_outer));

    for hole in holes {
        let normalized_hole = normalize_loop(hole, false)?;
        wires.push(wire_from_loop(&normalized_hole));
    }

    let face = builder::try_attach_plane(&wires).map_err(|e| {
        crate::error::KernelError::TopologyError(format!("failed to attach plane: {e}"))
    })?;

    let solid: Solid = builder::tsweep(&face, Vector3::new(0.0, 0.0, height));
    Ok(solid)
}

/// Extrude a 2D polygon (given as XY points) into a 3D solid by sweeping along Z.
///
/// `points` must be ordered (clockwise or counter-clockwise) and form a closed polygon.
/// The polygon is placed on the Z=0 plane and swept upward by `height`.
pub fn extrude_sketch_points(
    points: &[(f64, f64)],
    height: f64,
) -> Result<Solid, crate::error::KernelError> {
    extrude_sketch_with_holes(points, &[], height)
}

/// Subtract the tool solid from the target solid (boolean difference).
///
/// NOTE: truck-shapeops 0.4 has limited boolean operation support.
/// This is a stub that returns the target solid unchanged.
/// TODO: Implement actual boolean difference when truck-shapeops API stabilizes.
pub fn boolean_cut(_target: Solid, _tool: Solid) -> Result<Solid, crate::error::KernelError> {
    // truck-shapeops 0.4 does not expose a straightforward boolean difference API.
    // Returning Ok with the unmodified target would silently produce wrong geometry.
    // Future: use truck_shapeops boolean operations once the API is stable.
    Err(crate::error::KernelError::BooleanError(
        "boolean difference not yet implemented".into(),
    ))
}

// ---------------------------------------------------------------------------
// Arc / curve tessellation helpers
// ---------------------------------------------------------------------------

/// Tessellate a circular arc into a sequence of 2D points.
///
/// Returns `segments + 1` points evenly spaced from `start_angle` to
/// `end_angle` (both in radians).  The sweep direction is determined by the
/// sign of `end_angle - start_angle`.
pub fn arc_to_points(
    center: (f64, f64),
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    segments: u32,
) -> Vec<(f64, f64)> {
    let segments = segments.max(1);
    let mut pts = Vec::with_capacity(segments as usize + 1);
    for i in 0..=segments {
        let t = i as f64 / segments as f64;
        let angle = start_angle + t * (end_angle - start_angle);
        pts.push((
            center.0 + radius * angle.cos(),
            center.1 + radius * angle.sin(),
        ));
    }
    pts
}

/// Description of a single boundary segment for mixed straight/curved polygons.
///
/// This is a kernel-level type that mirrors `bcad_domain::BoundarySegment`
/// without introducing a dependency on the domain crate.
pub enum CurveSegment {
    /// Straight line to `end`.
    Line { end: (f64, f64) },
    /// Circular arc to `end` with given center, radius, and angle range (radians).
    Arc {
        end: (f64, f64),
        center: (f64, f64),
        radius: f64,
        start_angle: f64,
        end_angle: f64,
    },
}

/// Build a closed polygon from a mixed line/arc boundary description.
///
/// `start` is the first point of the boundary.  Each `CurveSegment`
/// appends its endpoint(s) to the polygon.  Arc segments are tessellated
/// with `arc_segments` subdivisions.
///
/// The returned polygon is suitable for use with `extrude_sketch_points()`.
pub fn tessellate_boundary_segments(
    start: (f64, f64),
    segments: &[CurveSegment],
    arc_segments: u32,
) -> Vec<(f64, f64)> {
    let mut pts: Vec<(f64, f64)> = vec![start];

    for seg in segments {
        match seg {
            CurveSegment::Line { end } => {
                pts.push(*end);
            }
            CurveSegment::Arc {
                end,
                center,
                radius,
                start_angle,
                end_angle,
            } => {
                let arc_pts =
                    arc_to_points(*center, *radius, *start_angle, *end_angle, arc_segments);
                // Skip the first point of the arc (it should coincide with the
                // current last point of `pts`).
                for &p in arc_pts.iter().skip(1) {
                    pts.push(p);
                }
                // Ensure we end exactly at the declared endpoint.
                if let Some(last) = pts.last_mut() {
                    *last = *end;
                }
            }
        }
    }

    pts
}

/// Creates a B-Rep box solid with the given dimensions.
///
/// The box is axis-aligned with one corner at the origin:
///   - X spans `[0, width]`
///   - Y spans `[0, height]`
///   - Z spans `[0, depth]`
///
/// This follows the Truck `tsweep` pattern:
///   vertex -> edge -> face -> solid
pub fn create_box(width: f64, height: f64, depth: f64) -> Result<Solid, crate::error::KernelError> {
    if width <= 0.0 || height <= 0.0 || depth <= 0.0 {
        return Err(crate::error::KernelError::TopologyError(
            "box dimensions must be positive".into(),
        ));
    }

    // Start with a vertex at the origin
    let v = builder::vertex(Point3::new(0.0, 0.0, 0.0));
    // Sweep along X to get an edge
    let edge = builder::tsweep(&v, Vector3::new(width, 0.0, 0.0));
    // Sweep the edge along Y to get a face
    let face = builder::tsweep(&edge, Vector3::new(0.0, height, 0.0));
    // Sweep the face along Z to get a solid
    let solid: Solid = builder::tsweep(&face, Vector3::new(0.0, 0.0, depth));
    Ok(solid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_box_succeeds() {
        let solid = create_box(1.0, 1.0, 1.0);
        assert!(solid.is_ok());
    }

    #[test]
    fn test_create_box_has_six_faces() {
        let solid = create_box(1.0, 1.0, 1.0).unwrap();
        // A box should have exactly 1 boundary shell with 6 faces
        assert_eq!(solid.boundaries().len(), 1);
        assert_eq!(solid.boundaries()[0].len(), 6);
    }

    #[test]
    fn test_create_box_non_unit() {
        let solid = create_box(2.0, 3.0, 4.0).unwrap();
        assert_eq!(solid.boundaries()[0].len(), 6);
    }

    #[test]
    fn test_create_box_rejects_zero_dimensions() {
        assert!(create_box(0.0, 1.0, 1.0).is_err());
        assert!(create_box(1.0, 0.0, 1.0).is_err());
        assert!(create_box(1.0, 1.0, 0.0).is_err());
    }

    #[test]
    fn test_create_box_rejects_negative_dimensions() {
        assert!(create_box(-1.0, 1.0, 1.0).is_err());
    }

    // --- extrude_sketch_points tests ---

    #[test]
    fn test_extrude_square() {
        let points = vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
        let solid = extrude_sketch_points(&points, 2.0).unwrap();
        // Should have exactly 1 boundary shell
        assert_eq!(solid.boundaries().len(), 1);
        // An extruded quad should have 6 faces (4 side walls + top + bottom)
        assert_eq!(solid.boundaries()[0].len(), 6);
        // Tessellate and verify we get a valid mesh
        let mesh = crate::tessellation::tessellate(&solid).unwrap();
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_extrude_triangle() {
        let points = vec![(0.0, 0.0), (2.0, 0.0), (1.0, 1.5)];
        let solid = extrude_sketch_points(&points, 1.0).unwrap();
        assert_eq!(solid.boundaries().len(), 1);
        // An extruded triangle should have 5 faces (3 side walls + top + bottom)
        assert_eq!(solid.boundaries()[0].len(), 5);
    }

    #[test]
    fn test_extrude_rejects_too_few_points() {
        assert!(extrude_sketch_points(&[(0.0, 0.0), (1.0, 0.0)], 1.0).is_err());
        assert!(extrude_sketch_points(&[(0.0, 0.0)], 1.0).is_err());
        assert!(extrude_sketch_points(&[], 1.0).is_err());
    }

    #[test]
    fn test_extrude_rejects_non_positive_height() {
        let points = vec![(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)];
        assert!(extrude_sketch_points(&points, 0.0).is_err());
        assert!(extrude_sketch_points(&points, -1.0).is_err());
    }

    #[test]
    fn test_extrude_with_hole() {
        let outer = vec![(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)];
        let holes = vec![vec![(1.0, 1.0), (1.0, 3.0), (3.0, 3.0), (3.0, 1.0)]];
        let solid = extrude_sketch_with_holes(&outer, &holes, 1.0).unwrap();
        assert_eq!(solid.boundaries().len(), 1);
        // Outer + inner side walls + top + bottom should exceed a plain box face count.
        assert!(solid.boundaries()[0].len() > 6);
        let mesh = crate::tessellation::tessellate(&solid).unwrap();
        assert!(!mesh.indices.is_empty());
    }

    // --- boolean_cut tests ---

    #[test]
    fn test_boolean_cut_returns_not_implemented_error() {
        let target = create_box(2.0, 2.0, 2.0).unwrap();
        let tool = create_box(1.0, 1.0, 1.0).unwrap();
        // Stub returns an explicit error so callers are not silently misled
        let result = boolean_cut(target, tool);
        assert!(result.is_err());
    }
}
