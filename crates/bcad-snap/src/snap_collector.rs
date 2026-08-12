//! Functions to extract snap candidates from domain elements.
//!
//! Mirrors the TypeScript `collectElementSnapPoints` logic from
//! `usePlanSnapPoints.ts`, producing [`SnapCandidate`] values from
//! each element type.

use bcad_domain::{
    BeamElement, ColumnElement, Element, FloorElement, FoundationElement, GridElement, RoofElement,
    RoomElement, StairElement, WallElement,
};

use crate::snap_types::{snap_type_priority, SnapCandidate, SnapType};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn midpoint(a: [f64; 2], b: [f64; 2]) -> [f64; 2] {
    [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5]
}

fn candidate(point: [f64; 2], snap_type: SnapType, element_id: &str) -> SnapCandidate {
    SnapCandidate {
        point,
        snap_type,
        source_element_id: Some(element_id.to_string()),
        priority: snap_type_priority(snap_type),
    }
}

// ---------------------------------------------------------------------------
// Per-element collectors
// ---------------------------------------------------------------------------

/// Collect snap candidates from a wall element.
///
/// Produces:
/// - Endpoints at `start` and `end`
/// - Midpoint of the straight segment
/// - If the wall has an arc definition: the arc center (as `Center`) and
///   quadrant points that fall within the arc angular range (as `Endpoint`).
pub fn collect_wall_snaps(wall: &WallElement) -> Vec<SnapCandidate> {
    let id = &wall.meta.id;
    let mut out = Vec::with_capacity(12);

    // Centerline endpoints and midpoint
    out.push(candidate(wall.start, SnapType::Endpoint, id));
    out.push(candidate(wall.end, SnapType::Endpoint, id));
    out.push(candidate(
        midpoint(wall.start, wall.end),
        SnapType::Midpoint,
        id,
    ));

    // Wall edge snap points: corners + quarter points along both edges
    // This lets users start new walls from any point along an existing wall face
    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len > 1e-6 {
        let half_t = wall.thickness * 0.5;
        let nx = -dy / len * half_t;
        let ny = dx / len * half_t;

        // Corner points
        out.push(candidate(
            [wall.start[0] + nx, wall.start[1] + ny],
            SnapType::Nearest,
            id,
        ));
        out.push(candidate(
            [wall.start[0] - nx, wall.start[1] - ny],
            SnapType::Nearest,
            id,
        ));
        out.push(candidate(
            [wall.end[0] + nx, wall.end[1] + ny],
            SnapType::Nearest,
            id,
        ));
        out.push(candidate(
            [wall.end[0] - nx, wall.end[1] - ny],
            SnapType::Nearest,
            id,
        ));

        // Points along both wall edges at 25%, 50%, 75% (for snapping to wall face)
        for frac in &[0.25, 0.5, 0.75] {
            let cx = wall.start[0] + dx * frac;
            let cy = wall.start[1] + dy * frac;
            // Left edge point
            out.push(candidate([cx + nx, cy + ny], SnapType::Nearest, id));
            // Right edge point
            out.push(candidate([cx - nx, cy - ny], SnapType::Nearest, id));
            // Centerline point at this fraction
            out.push(candidate([cx, cy], SnapType::Nearest, id));
        }
    }

    // Curved wall: arc center + quadrant snap points
    if let Some(arc) = &wall.arc {
        out.push(candidate(arc.center, SnapType::Center, id));

        let quadrants = [
            0.0,
            std::f64::consts::FRAC_PI_2,
            std::f64::consts::PI,
            3.0 * std::f64::consts::FRAC_PI_2,
        ];
        let min_a = arc.start_angle.min(arc.end_angle);
        let max_a = arc.start_angle.max(arc.end_angle);
        for qa in &quadrants {
            if *qa >= min_a && *qa <= max_a {
                let qx = arc.center[0] + arc.radius * qa.cos();
                let qy = arc.center[1] + arc.radius * qa.sin();
                out.push(candidate([qx, qy], SnapType::Endpoint, id));
            }
        }
    }

    out
}

/// Collect snap candidates from a column element.
///
/// Produces a single `Center` snap at the column center.
pub fn collect_column_snaps(col: &ColumnElement) -> Vec<SnapCandidate> {
    vec![candidate(col.center, SnapType::Center, &col.meta.id)]
}

/// Collect snap candidates from a floor element.
///
/// Produces:
/// - `Endpoint` for each boundary vertex
/// - `Midpoint` for each boundary edge
pub fn collect_floor_snaps(floor: &FloorElement) -> Vec<SnapCandidate> {
    collect_boundary_snaps(&floor.boundary, &floor.meta.id)
}

/// Collect snap candidates from a roof element.
pub fn collect_roof_snaps(roof: &RoofElement) -> Vec<SnapCandidate> {
    collect_boundary_snaps(&roof.boundary, &roof.meta.id)
}

/// Collect snap candidates from a foundation element.
pub fn collect_foundation_snaps(foundation: &FoundationElement) -> Vec<SnapCandidate> {
    collect_boundary_snaps(&foundation.boundary, &foundation.meta.id)
}

/// Collect snap candidates from a room element.
pub fn collect_room_snaps(room: &RoomElement) -> Vec<SnapCandidate> {
    collect_boundary_snaps(&room.boundary, &room.meta.id)
}

/// Collect snap candidates from a beam element.
///
/// Beams use 3-D start/end; we project to XY (the first two components) for
/// plan-view snapping, matching the TypeScript logic.
pub fn collect_beam_snaps(beam: &BeamElement) -> Vec<SnapCandidate> {
    let id = &beam.meta.id;
    let start_2d = [beam.start[0], beam.start[1]];
    let end_2d = [beam.end[0], beam.end[1]];
    vec![
        candidate(start_2d, SnapType::Endpoint, id),
        candidate(end_2d, SnapType::Endpoint, id),
        candidate(midpoint(start_2d, end_2d), SnapType::Midpoint, id),
    ]
}

/// Collect snap candidates from a stair element.
pub fn collect_stair_snaps(stair: &StairElement) -> Vec<SnapCandidate> {
    let id = &stair.meta.id;
    vec![
        candidate(stair.start, SnapType::Endpoint, id),
        candidate(stair.end, SnapType::Endpoint, id),
        candidate(midpoint(stair.start, stair.end), SnapType::Midpoint, id),
    ]
}

/// Collect snap candidates from a grid element.
pub fn collect_grid_snaps(grid_elem: &GridElement) -> Vec<SnapCandidate> {
    let id = &grid_elem.meta.id;
    vec![
        candidate(grid_elem.start, SnapType::Endpoint, id),
        candidate(grid_elem.end, SnapType::Endpoint, id),
        candidate(
            midpoint(grid_elem.start, grid_elem.end),
            SnapType::Midpoint,
            id,
        ),
    ]
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/// Extract snap candidates from a single element by dispatching to the
/// appropriate per-type collector.
pub fn collect_element_snaps(element: &Element) -> Vec<SnapCandidate> {
    match element {
        Element::Wall(w) => collect_wall_snaps(w),
        Element::Column(c) => collect_column_snaps(c),
        Element::Floor(f) => collect_floor_snaps(f),
        Element::Roof(r) => collect_roof_snaps(r),
        Element::Foundation(f) => collect_foundation_snaps(f),
        Element::Room(r) => collect_room_snaps(r),
        Element::Beam(b) => collect_beam_snaps(b),
        Element::Stair(s) => collect_stair_snaps(s),
        Element::Grid(g) => collect_grid_snaps(g),
        // Electrical, Plumbing, Furniture, etc. have position-based snaps
        Element::Electrical(e) => {
            vec![candidate(e.position, SnapType::Nearest, &e.meta.id)]
        }
        Element::Plumbing(p) => {
            vec![candidate(p.position, SnapType::Nearest, &p.meta.id)]
        }
        Element::Furniture(f) => {
            vec![candidate(f.position, SnapType::Nearest, &f.meta.id)]
        }
        Element::Hvac(h) => {
            vec![candidate(h.position, SnapType::Nearest, &h.meta.id)]
        }
        Element::FireSafety(f) => {
            vec![candidate(f.position, SnapType::Nearest, &f.meta.id)]
        }
        Element::Accessibility(a) => {
            vec![candidate(a.position, SnapType::Nearest, &a.meta.id)]
        }
        Element::Cabinet(c) => {
            vec![candidate(c.position, SnapType::Nearest, &c.meta.id)]
        }
        Element::Keynote(k) => {
            vec![candidate(k.position, SnapType::Nearest, &k.meta.id)]
        }
        Element::Tag(t) => {
            vec![candidate(t.position, SnapType::Nearest, &t.meta.id)]
        }
        Element::LeaderAnnotation(la) => {
            let id = &la.meta.id;
            vec![
                candidate(la.start, SnapType::Endpoint, id),
                candidate(la.end, SnapType::Endpoint, id),
                candidate(midpoint(la.start, la.end), SnapType::Midpoint, id),
            ]
        }
        Element::SiteDetail(sd) => {
            let id = &sd.meta.id;
            let mut out = Vec::new();
            for pt in &sd.points {
                out.push(candidate(*pt, SnapType::Endpoint, id));
            }
            out
        }
        // Non-geometric elements produce no snap candidates
        Element::Site(_)
        | Element::Level(_)
        | Element::Door(_)
        | Element::Window(_)
        | Element::View(_)
        | Element::Sheet(_)
        | Element::Material(_)
        | Element::FamilyType(_)
        | Element::Generic(_) => Vec::new(),
    }
}

/// Collect wall-wall intersection snap points.
///
/// For every pair of wall elements, compute the segment-segment intersection
/// and if it exists, add an `Intersection` candidate.
pub fn collect_wall_intersections(walls: &[&WallElement]) -> Vec<SnapCandidate> {
    let mut out = Vec::new();
    for i in 0..walls.len() {
        for j in (i + 1)..walls.len() {
            if let Some(pt) =
                segment_intersection(walls[i].start, walls[i].end, walls[j].start, walls[j].end)
            {
                out.push(SnapCandidate {
                    point: pt,
                    snap_type: SnapType::Intersection,
                    source_element_id: None,
                    priority: snap_type_priority(SnapType::Intersection),
                });
            }
        }
    }
    out
}

/// Collect snap candidates from all elements, including wall-wall
/// intersections.
pub fn collect_all_snaps(elements: &[Element]) -> Vec<SnapCandidate> {
    let mut all = Vec::new();

    // Per-element candidates
    for element in elements {
        all.extend(collect_element_snaps(element));
    }

    // Wall-wall intersections
    let walls: Vec<&WallElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Wall(w) => Some(w),
            _ => None,
        })
        .collect();
    all.extend(collect_wall_intersections(&walls));

    all
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/// Extract boundary vertex endpoints and edge midpoints.
fn collect_boundary_snaps(boundary: &[[f64; 2]], element_id: &str) -> Vec<SnapCandidate> {
    if boundary.is_empty() {
        return Vec::new();
    }
    let n = boundary.len();
    let mut out = Vec::with_capacity(n * 2);
    for i in 0..n {
        out.push(candidate(boundary[i], SnapType::Endpoint, element_id));
        let next = boundary[(i + 1) % n];
        out.push(candidate(
            midpoint(boundary[i], next),
            SnapType::Midpoint,
            element_id,
        ));
    }
    out
}

/// Compute the intersection point of two line segments, if it exists.
///
/// Returns `None` if the segments are parallel or if the intersection lies
/// outside either segment.
fn segment_intersection(
    a1: [f64; 2],
    a2: [f64; 2],
    b1: [f64; 2],
    b2: [f64; 2],
) -> Option<[f64; 2]> {
    let d1x = a2[0] - a1[0];
    let d1y = a2[1] - a1[1];
    let d2x = b2[0] - b1[0];
    let d2y = b2[1] - b1[1];

    let cross = d1x * d2y - d1y * d2x;
    if cross.abs() < 1e-10 {
        return None; // parallel
    }

    let t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / cross;
    let u = ((b1[0] - a1[0]) * d1y - (b1[1] - a1[1]) * d1x) / cross;

    if t < 0.0 || t > 1.0 || u < 0.0 || u > 1.0 {
        return None; // outside segments
    }

    Some([a1[0] + t * d1x, a1[1] + t * d1y])
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::{ColumnElement, ElementMeta, WallElement};

    fn make_meta(name: &str) -> ElementMeta {
        ElementMeta {
            id: name.to_string(),
            name: name.to_string(),
            level_id: None,
            host_id: None,
            type_id: None,
            parent_id: None,
            material_id: None,
            ifc_guid: None,
            classification: None,
            layer: None,
        }
    }

    #[test]
    fn test_wall_endpoints_and_midpoint() {
        let wall = WallElement {
            meta: make_meta("wall-1"),
            start: [0.0, 0.0],
            end: [4.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        };

        let snaps = collect_wall_snaps(&wall);
        assert_eq!(snaps.len(), 16); // 3 centerline + 4 corners + 9 edge/centerline quarter pts

        // Endpoint at start
        assert_eq!(snaps[0].point, [0.0, 0.0]);
        assert_eq!(snaps[0].snap_type, SnapType::Endpoint);

        // Endpoint at end
        assert_eq!(snaps[1].point, [4.0, 0.0]);
        assert_eq!(snaps[1].snap_type, SnapType::Endpoint);

        // Midpoint
        assert_eq!(snaps[2].point, [2.0, 0.0]);
        assert_eq!(snaps[2].snap_type, SnapType::Midpoint);
    }

    #[test]
    fn test_wall_with_arc_center() {
        use bcad_domain::ArcDef;

        let wall = WallElement {
            meta: make_meta("wall-arc"),
            start: [0.0, 0.0],
            end: [4.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: Some(ArcDef {
                center: [2.0, 1.0],
                radius: 2.5,
                start_angle: 0.0,
                end_angle: std::f64::consts::PI,
            }),
            arc_segments: 24,
        };

        let snaps = collect_wall_snaps(&wall);
        // start + end + midpoint + center + quadrant points within [0, pi]
        // Quadrants 0, pi/2, and pi are in [0, pi]
        assert!(snaps.len() >= 6);

        // Check that center is present
        let center_snap = snaps.iter().find(|s| s.snap_type == SnapType::Center);
        assert!(center_snap.is_some());
        assert_eq!(center_snap.unwrap().point, [2.0, 1.0]);
    }

    #[test]
    fn test_column_center_snap() {
        let col = ColumnElement {
            meta: make_meta("col-1"),
            center: [5.0, 3.0],
            width: 0.4,
            depth: 0.4,
            height: 3.0,
            diameter: None,
            column_segments: 24,
        };

        let snaps = collect_column_snaps(&col);
        assert_eq!(snaps.len(), 1);
        assert_eq!(snaps[0].point, [5.0, 3.0]);
        assert_eq!(snaps[0].snap_type, SnapType::Center);
    }

    #[test]
    fn test_floor_boundary_snaps() {
        let floor = FloorElement {
            meta: make_meta("floor-1"),
            boundary: vec![[0.0, 0.0], [4.0, 0.0], [4.0, 3.0], [0.0, 3.0]],
            thickness: 0.2,
            boundary_segments: vec![],
        };

        let snaps = collect_floor_snaps(&floor);
        // 4 vertices (endpoints) + 4 edge midpoints = 8
        assert_eq!(snaps.len(), 8);

        let endpoints: Vec<_> = snaps
            .iter()
            .filter(|s| s.snap_type == SnapType::Endpoint)
            .collect();
        assert_eq!(endpoints.len(), 4);

        let midpoints: Vec<_> = snaps
            .iter()
            .filter(|s| s.snap_type == SnapType::Midpoint)
            .collect();
        assert_eq!(midpoints.len(), 4);
    }

    #[test]
    fn test_segment_intersection() {
        // Crossing segments
        let result = segment_intersection([0.0, 0.0], [2.0, 2.0], [0.0, 2.0], [2.0, 0.0]);
        assert!(result.is_some());
        let pt = result.unwrap();
        assert!((pt[0] - 1.0).abs() < 1e-6);
        assert!((pt[1] - 1.0).abs() < 1e-6);

        // Parallel segments
        let result = segment_intersection([0.0, 0.0], [2.0, 0.0], [0.0, 1.0], [2.0, 1.0]);
        assert!(result.is_none());

        // Non-overlapping segments
        let result = segment_intersection([0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [3.0, 0.0]);
        assert!(result.is_none());
    }

    #[test]
    fn test_collect_all_snaps_with_intersections() {
        let elements = vec![
            Element::Wall(WallElement {
                meta: make_meta("w1"),
                start: [0.0, 0.0],
                end: [4.0, 4.0],
                height: 3.0,
                thickness: 0.2,
                arc: None,
                arc_segments: 24,
            }),
            Element::Wall(WallElement {
                meta: make_meta("w2"),
                start: [0.0, 4.0],
                end: [4.0, 0.0],
                height: 3.0,
                thickness: 0.2,
                arc: None,
                arc_segments: 24,
            }),
        ];

        let all = collect_all_snaps(&elements);
        // Each wall: 16 snaps. Plus 1 intersection. Total: 16 + 16 + 1 = 33
        assert_eq!(all.len(), 33);

        let intersections: Vec<_> = all
            .iter()
            .filter(|s| s.snap_type == SnapType::Intersection)
            .collect();
        assert_eq!(intersections.len(), 1);
        let pt = intersections[0].point;
        assert!((pt[0] - 2.0).abs() < 1e-6);
        assert!((pt[1] - 2.0).abs() < 1e-6);
    }
}
