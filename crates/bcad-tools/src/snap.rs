//! Snap system utilities.
//!
//! The core snap types live in [`crate::tool_trait`] (tool-local variants
//! parallel to those in `bcad-snap`). This module provides helper functions
//! for building snap candidates from element data and performing spatial
//! queries.

use crate::tool_trait::{SnapCandidate, SnapMode};
use bcad_domain::Element;
use glam::Vec2;

/// Push endpoint and midpoint snap candidates for a linear segment.
fn collect_segment_snaps(
    start: [f64; 2],
    end: [f64; 2],
    element_id: &str,
    out: &mut Vec<SnapCandidate>,
) {
    let s = Vec2::new(start[0] as f32, start[1] as f32);
    let e = Vec2::new(end[0] as f32, end[1] as f32);
    let mid = (s + e) * 0.5;
    let id = Some(element_id.to_string());
    out.push(SnapCandidate {
        point: s,
        modes: vec![SnapMode::Endpoint],
        source_element_id: id.clone(),
    });
    out.push(SnapCandidate {
        point: e,
        modes: vec![SnapMode::Endpoint],
        source_element_id: id.clone(),
    });
    out.push(SnapCandidate {
        point: mid,
        modes: vec![SnapMode::Midpoint],
        source_element_id: id,
    });
}

/// Build snap candidates from a list of elements.
pub fn collect_element_snap_candidates(elements: &[Element]) -> Vec<SnapCandidate> {
    let mut candidates = Vec::new();

    for element in elements {
        match element {
            Element::Wall(w) => {
                collect_segment_snaps(w.start, w.end, &w.meta.id, &mut candidates);
            }
            Element::Column(c) => {
                candidates.push(SnapCandidate {
                    point: Vec2::new(c.center[0] as f32, c.center[1] as f32),
                    modes: vec![SnapMode::Center],
                    source_element_id: Some(c.meta.id.clone()),
                });
            }
            Element::Beam(b) => {
                collect_segment_snaps(
                    [b.start[0], b.start[1]],
                    [b.end[0], b.end[1]],
                    &b.meta.id,
                    &mut candidates,
                );
            }
            Element::Foundation(f) => {
                collect_boundary_snaps(
                    &f.boundary,
                    &f.meta.id,
                    &[SnapMode::Endpoint, SnapMode::Foundation],
                    &mut candidates,
                );
            }
            Element::Floor(f) => {
                collect_boundary_snaps(
                    &f.boundary,
                    &f.meta.id,
                    &[SnapMode::Endpoint],
                    &mut candidates,
                );
            }
            Element::Roof(r) => {
                collect_boundary_snaps(
                    &r.boundary,
                    &r.meta.id,
                    &[SnapMode::Endpoint],
                    &mut candidates,
                );
            }
            Element::Stair(s) => {
                collect_segment_snaps(s.start, s.end, &s.meta.id, &mut candidates);
            }
            _ => {}
        }
    }

    candidates
}

/// Extract boundary vertex endpoints and edge midpoints from a closed polygon.
///
/// `vertex_modes` controls which snap modes are assigned to vertex candidates
/// (e.g. `[Endpoint]` for floors/roofs, `[Endpoint, Foundation]` for foundations).
fn collect_boundary_snaps(
    boundary: &[[f64; 2]],
    element_id: &str,
    vertex_modes: &[SnapMode],
    out: &mut Vec<SnapCandidate>,
) {
    for (i, pt) in boundary.iter().enumerate() {
        out.push(SnapCandidate {
            point: Vec2::new(pt[0] as f32, pt[1] as f32),
            modes: vertex_modes.to_vec(),
            source_element_id: Some(element_id.to_string()),
        });
        let next = &boundary[(i + 1) % boundary.len()];
        let mid = Vec2::new(
            (pt[0] + next[0]) as f32 * 0.5,
            (pt[1] + next[1]) as f32 * 0.5,
        );
        out.push(SnapCandidate {
            point: mid,
            modes: vec![SnapMode::Midpoint],
            source_element_id: Some(element_id.to_string()),
        });
    }
}

/// Compute wall-wall intersection points.
pub fn collect_wall_intersections(elements: &[Element]) -> Vec<SnapCandidate> {
    let walls: Vec<_> = elements
        .iter()
        .filter_map(|e| {
            if let Element::Wall(w) = e {
                Some(w)
            } else {
                None
            }
        })
        .collect();

    let mut candidates = Vec::new();
    for i in 0..walls.len() {
        for j in (i + 1)..walls.len() {
            let a0 = Vec2::new(walls[i].start[0] as f32, walls[i].start[1] as f32);
            let a1 = Vec2::new(walls[i].end[0] as f32, walls[i].end[1] as f32);
            let b0 = Vec2::new(walls[j].start[0] as f32, walls[j].start[1] as f32);
            let b1 = Vec2::new(walls[j].end[0] as f32, walls[j].end[1] as f32);
            if let Some(pt) = segment_intersection(a0, a1, b0, b1) {
                candidates.push(SnapCandidate {
                    point: pt,
                    modes: vec![SnapMode::Intersection],
                    source_element_id: None,
                });
            }
        }
    }
    candidates
}

/// Compute segment-segment intersection. Returns `Some(point)` if the segments
/// intersect at a single interior point.
pub fn segment_intersection(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2) -> Option<Vec2> {
    let d1 = a1 - a0;
    let d2 = b1 - b0;
    let cross = d1.x * d2.y - d1.y * d2.x;
    if cross.abs() < 1e-6 {
        return None; // parallel or coincident
    }
    let d = b0 - a0;
    let t = (d.x * d2.y - d.y * d2.x) / cross;
    let u = (d.x * d1.y - d.y * d1.x) / cross;
    if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) {
        Some(a0 + d1 * t)
    } else {
        None
    }
}

/// Project a point onto a line segment, returning the parameter t in [0,1]
/// and the projected point.
pub fn project_point_onto_segment(point: Vec2, seg_start: Vec2, seg_end: Vec2) -> (f32, Vec2) {
    let d = seg_end - seg_start;
    let len_sq = d.length_squared();
    if len_sq < 1e-12 {
        return (0.0, seg_start);
    }
    let t = ((point - seg_start).dot(d) / len_sq).clamp(0.0, 1.0);
    (t, seg_start + d * t)
}
