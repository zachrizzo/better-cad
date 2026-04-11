//! Wall outline computation for 2D plan views.
//!
//! Given a wall segment (start point, end point, thickness), compute the
//! four-corner outline polygon.  When multiple walls join at intersections,
//! the clipping algorithm removes the portions of each wall edge that fall
//! inside a neighbouring wall footprint so that only the externally visible
//! edges remain.
//!
//! This is a direct Rust port of
//! `packages/ui/src/utils/wall-outline.ts`.

use crate::primitives::SymbolPrimitive;
use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

const EPS: f64 = 1e-8;
const MIN_SEGMENT: f64 = 1e-5;

/// A door or window opening in a wall, as parametric fractions (0..1) of wall length.
#[derive(Debug, Clone)]
pub struct WallOpening {
    /// Start of opening along the wall centerline (0 = wall start, 1 = wall end).
    pub t_start: f64,
    /// End of opening along the wall centerline.
    pub t_end: f64,
}

/// A wall segment defined by two endpoints and a thickness.
#[derive(Debug, Clone)]
pub struct WallSegment {
    pub id: String,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub thickness: f64,
    /// Doors/windows that cut through this wall (parametric 0..1 along the centerline).
    pub openings: Vec<WallOpening>,
}

/// An outline edge (start -> end line segment).
#[derive(Debug, Clone)]
pub struct OutlineLine {
    pub start: [f64; 2],
    pub end: [f64; 2],
}

/// Internal footprint for a wall.
struct Footprint {
    id: String,
    /// Convex quad corners (CCW order).
    corners: [[f64; 2]; 4],
    /// The two side edges (outer face, inner face) — openings clip these.
    side_edges: Vec<OutlineLine>,
    /// The end-cap edges (only present when no wall joins at that end).
    cap_edges: Vec<OutlineLine>,
    /// Openings carried through for side-edge clipping.
    openings: Vec<WallOpening>,
}

// ---------------------------------------------------------------------------
// Core geometry
// ---------------------------------------------------------------------------

/// Compute the four corners of a straight wall outline.
pub fn wall_outline_corners(wall: &WallSegment) -> Option<[[f64; 2]; 4]> {
    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < EPS || wall.thickness <= EPS {
        return None;
    }
    let nx = (-dy / len) * (wall.thickness / 2.0);
    let ny = (dx / len) * (wall.thickness / 2.0);

    Some([
        [wall.start[0] + nx, wall.start[1] + ny], // sPlus
        [wall.end[0] + nx, wall.end[1] + ny],     // ePlus
        [wall.end[0] - nx, wall.end[1] - ny],     // eMinus
        [wall.start[0] - nx, wall.start[1] - ny], // sMinus
    ])
}

/// Convenience: produce a simple closed polyline for a single wall (no
/// intersection clipping).
pub fn wall_outline_polyline(wall: &WallSegment) -> Option<Vec<StyledPrimitive>> {
    let corners = wall_outline_corners(wall)?;
    let pts = vec![corners[0], corners[1], corners[2], corners[3]];
    Some(vec![StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: pts,
            closed: true,
        },
        SymbolLineClass::Cut,
        DomainColor::Architectural,
    )])
}

// ---------------------------------------------------------------------------
// Multi-wall visible outline computation
// ---------------------------------------------------------------------------

fn build_footprint(wall: &WallSegment) -> Option<Footprint> {
    let corners = wall_outline_corners(wall)?;
    let side_edges = vec![
        OutlineLine { start: corners[0], end: corners[1] },
        OutlineLine { start: corners[3], end: corners[2] },
    ];
    let cap_edges = vec![
        OutlineLine { start: corners[0], end: corners[3] },
        OutlineLine { start: corners[1], end: corners[2] },
    ];
    Some(Footprint {
        id: wall.id.clone(),
        corners,
        side_edges,
        cap_edges,
        openings: wall.openings.clone(),
    })
}

/// Build footprints with mitered corners at junctions.
/// When two walls share an endpoint, their outer edges are extended to meet,
/// producing a larger footprint that fills the corner solid.
fn build_mitered_footprint(wall: &WallSegment, all_walls: &[WallSegment]) -> Option<Footprint> {
    let mut corners = wall_outline_corners(wall)?;

    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < EPS {
        return build_footprint(wall);
    }
    let ux = dx / len;
    let uy = dy / len;
    let nx = -uy;
    let ny = ux;
    let half_t = wall.thickness / 2.0;
    let this_left_pt = [wall.start[0] + nx * half_t, wall.start[1] + ny * half_t];
    let this_right_pt = [wall.start[0] - nx * half_t, wall.start[1] - ny * half_t];
    let this_dir = [ux, uy];

    let eps_dist = 0.01;

    for other in all_walls {
        if other.id == wall.id {
            continue;
        }
        let odx = other.end[0] - other.start[0];
        let ody = other.end[1] - other.start[1];
        let olen = (odx * odx + ody * ody).sqrt();
        if olen < EPS { continue; }
        let oux = odx / olen;
        let ouy = ody / olen;

        // Skip parallel walls
        let cross_val = ux * ouy - uy * oux;
        if cross_val.abs() < 0.05 { continue; }

        let onx = -ouy;
        let ony = oux;
        let other_half_t = other.thickness / 2.0;
        let other_left_pt = [other.start[0] + onx * other_half_t, other.start[1] + ony * other_half_t];
        let other_right_pt = [other.start[0] - onx * other_half_t, other.start[1] - ony * other_half_t];
        let other_dir = [oux, ouy];

        // Check start endpoint
        let ds_s = ((other.start[0] - wall.start[0]).powi(2) + (other.start[1] - wall.start[1]).powi(2)).sqrt();
        let ds_e = ((other.end[0] - wall.start[0]).powi(2) + (other.end[1] - wall.start[1]).powi(2)).sqrt();
        if ds_s < eps_dist || ds_e < eps_dist {
            let max_dist = (wall.thickness + other.thickness) * 2.0;
            if let Some(lc) = ll_intersect(this_left_pt, this_dir, other_left_pt, other_dir) {
                let d = ((lc[0] - wall.start[0]).powi(2) + (lc[1] - wall.start[1]).powi(2)).sqrt();
                if d < max_dist { corners[0] = lc; } // sPlus
            }
            if let Some(rc) = ll_intersect(this_right_pt, this_dir, other_right_pt, other_dir) {
                let d = ((rc[0] - wall.start[0]).powi(2) + (rc[1] - wall.start[1]).powi(2)).sqrt();
                if d < max_dist { corners[3] = rc; } // sMinus
            }
        }

        // Check end endpoint
        let de_s = ((other.start[0] - wall.end[0]).powi(2) + (other.start[1] - wall.end[1]).powi(2)).sqrt();
        let de_e = ((other.end[0] - wall.end[0]).powi(2) + (other.end[1] - wall.end[1]).powi(2)).sqrt();
        if de_s < eps_dist || de_e < eps_dist {
            let max_dist = (wall.thickness + other.thickness) * 2.0;
            if let Some(lc) = ll_intersect(this_left_pt, this_dir, other_left_pt, other_dir) {
                let d = ((lc[0] - wall.end[0]).powi(2) + (lc[1] - wall.end[1]).powi(2)).sqrt();
                if d < max_dist { corners[1] = lc; } // ePlus
            }
            if let Some(rc) = ll_intersect(this_right_pt, this_dir, other_right_pt, other_dir) {
                let d = ((rc[0] - wall.end[0]).powi(2) + (rc[1] - wall.end[1]).powi(2)).sqrt();
                if d < max_dist { corners[2] = rc; } // eMinus
            }
        }
    }

    // Determine which endpoints have junctions (so we suppress end-cap edges there)
    let has_start_junction = all_walls.iter().any(|o| {
        if o.id == wall.id { return false; }
        let ds_s = ((o.start[0] - wall.start[0]).powi(2) + (o.start[1] - wall.start[1]).powi(2)).sqrt();
        let ds_e = ((o.end[0] - wall.start[0]).powi(2) + (o.end[1] - wall.start[1]).powi(2)).sqrt();
        ds_s < eps_dist || ds_e < eps_dist
    });
    let has_end_junction = all_walls.iter().any(|o| {
        if o.id == wall.id { return false; }
        let de_s = ((o.start[0] - wall.end[0]).powi(2) + (o.start[1] - wall.end[1]).powi(2)).sqrt();
        let de_e = ((o.end[0] - wall.end[0]).powi(2) + (o.end[1] - wall.end[1]).powi(2)).sqrt();
        de_s < eps_dist || de_e < eps_dist
    });

    let side_edges = vec![
        OutlineLine { start: corners[0], end: corners[1] }, // outer face
        OutlineLine { start: corners[3], end: corners[2] }, // inner face
    ];
    let mut cap_edges = Vec::new();
    if !has_start_junction {
        cap_edges.push(OutlineLine { start: corners[0], end: corners[3] });
    }
    if !has_end_junction {
        cap_edges.push(OutlineLine { start: corners[1], end: corners[2] });
    }
    Some(Footprint { id: wall.id.clone(), corners, side_edges, cap_edges, openings: wall.openings.clone() })
}

/// 2D line-line intersection (point + direction form).
fn ll_intersect(p1: [f64; 2], d1: [f64; 2], p2: [f64; 2], d2: [f64; 2]) -> Option<[f64; 2]> {
    let denom = d1[0] * d2[1] - d1[1] * d2[0];
    if denom.abs() < 1e-10 { return None; }
    let t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / denom;
    Some([p1[0] + t * d1[0], p1[1] + t * d1[1]])
}

fn cross2(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    ax * by - ay * bx
}

/// Compute the parametric interval `[t_enter, t_exit]` of a segment that
/// lies inside a convex polygon.  Returns `None` if there is no overlap.
fn interval_inside_convex(
    seg_start: [f64; 2],
    seg_end: [f64; 2],
    polygon: &[[f64; 2]; 4],
) -> Option<(f64, f64)> {
    let dx = seg_end[0] - seg_start[0];
    let dy = seg_end[1] - seg_start[1];
    let mut t_enter: f64 = 0.0;
    let mut t_exit: f64 = 1.0;

    for i in 0..4 {
        let a = polygon[i];
        let b = polygon[(i + 1) % 4];
        let ex = b[0] - a[0];
        let ey = b[1] - a[1];

        let base = cross2(ex, ey, seg_start[0] - a[0], seg_start[1] - a[1]);
        let slope = cross2(ex, ey, dx, dy);

        if slope.abs() < EPS {
            if base < -EPS {
                return None;
            }
            continue;
        }

        let t = (-EPS - base) / slope;
        if slope > 0.0 {
            t_enter = t_enter.max(t);
        } else {
            t_exit = t_exit.min(t);
        }
        if t_enter > t_exit {
            return None;
        }
    }

    let start = t_enter.max(0.0);
    let end = t_exit.min(1.0);
    if end - start <= EPS {
        return None;
    }
    Some((start, end))
}

fn subtract_interval(visible: &[(f64, f64)], cut: (f64, f64)) -> Vec<(f64, f64)> {
    let mut result = Vec::new();
    for &(start, end) in visible {
        if cut.1 <= start + EPS || cut.0 >= end - EPS {
            result.push((start, end));
            continue;
        }
        if cut.0 > start + EPS {
            result.push((start, cut.0.min(end)));
        }
        if cut.1 < end - EPS {
            result.push((cut.1.max(start), end));
        }
    }
    result
}

fn interpolate(seg: &OutlineLine, t: f64) -> [f64; 2] {
    [
        seg.start[0] + (seg.end[0] - seg.start[0]) * t,
        seg.start[1] + (seg.end[1] - seg.start[1]) * t,
    ]
}

/// Build the visible wall outline edges for a set of walls, clipping away
/// portions that fall inside neighbouring wall footprints and at openings.
///
/// Returns a list of [`OutlineLine`] segments.
pub fn build_visible_wall_outlines(walls: &[WallSegment]) -> Vec<OutlineLine> {
    let footprints: Vec<Footprint> = walls
        .iter()
        .filter_map(|w| build_mitered_footprint(w, walls))
        .collect();

    let mut lines = Vec::new();

    for fp in &footprints {
        // Side edges: clip by neighbouring footprints AND by openings.
        for edge in &fp.side_edges {
            let mut visible: Vec<(f64, f64)> = vec![(0.0, 1.0)];

            for other in &footprints {
                if other.id == fp.id {
                    continue;
                }
                if let Some(cut) = interval_inside_convex(edge.start, edge.end, &other.corners) {
                    visible = subtract_interval(&visible, cut);
                    if visible.is_empty() {
                        break;
                    }
                }
            }

            // Subtract opening intervals (these are parametric along the wall centerline,
            // which closely matches the parametric position along the side edge).
            for opening in &fp.openings {
                visible = subtract_interval(&visible, (opening.t_start, opening.t_end));
            }

            for (start_t, end_t) in visible {
                let s = interpolate(edge, start_t);
                let e = interpolate(edge, end_t);
                let dx = e[0] - s[0];
                let dy = e[1] - s[1];
                if (dx * dx + dy * dy).sqrt() < MIN_SEGMENT {
                    continue;
                }
                lines.push(OutlineLine { start: s, end: e });
            }
        }

        // Cap edges: only clip by neighbouring footprints (no opening clipping here).
        for edge in &fp.cap_edges {
            let mut visible: Vec<(f64, f64)> = vec![(0.0, 1.0)];

            for other in &footprints {
                if other.id == fp.id {
                    continue;
                }
                if let Some(cut) = interval_inside_convex(edge.start, edge.end, &other.corners) {
                    visible = subtract_interval(&visible, cut);
                    if visible.is_empty() {
                        break;
                    }
                }
            }

            for (start_t, end_t) in visible {
                let s = interpolate(edge, start_t);
                let e = interpolate(edge, end_t);
                let dx = e[0] - s[0];
                let dy = e[1] - s[1];
                if (dx * dx + dy * dy).sqrt() < MIN_SEGMENT {
                    continue;
                }
                lines.push(OutlineLine { start: s, end: e });
            }
        }
    }

    lines
}

fn lerp2(a: [f64; 2], b: [f64; 2], t: f64) -> [f64; 2] {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/// Build filled wall quads for all walls, split at openings.
///
/// Each entry is a convex polygon (4 points) representing a solid wall section.
/// Use these for drawing the filled wall cross-section under the outline edges.
pub fn build_wall_fill_quads(walls: &[WallSegment]) -> Vec<Vec<[f64; 2]>> {
    let footprints: Vec<Footprint> = walls
        .iter()
        .filter_map(|w| build_mitered_footprint(w, walls))
        .collect();

    let mut result = Vec::new();

    for fp in &footprints {
        // corners[0]=outer-start, corners[1]=outer-end, corners[2]=inner-end, corners[3]=inner-start
        let outer_s = fp.corners[0];
        let outer_e = fp.corners[1];
        let inner_s = fp.corners[3];
        let inner_e = fp.corners[2];

        // Compute which intervals of the wall (0..1) should be filled.
        let mut fill_intervals: Vec<(f64, f64)> = vec![(0.0, 1.0)];
        let mut sorted_openings = fp.openings.clone();
        sorted_openings.sort_by(|a, b| a.t_start.partial_cmp(&b.t_start).unwrap_or(std::cmp::Ordering::Equal));
        for opening in &sorted_openings {
            let clamped = (opening.t_start.max(0.0), opening.t_end.min(1.0));
            if clamped.1 > clamped.0 + EPS {
                fill_intervals = subtract_interval(&fill_intervals, clamped);
            }
        }

        for (t_a, t_b) in fill_intervals {
            if t_b - t_a < MIN_SEGMENT {
                continue;
            }
            let p0 = lerp2(outer_s, outer_e, t_a);
            let p1 = lerp2(outer_s, outer_e, t_b);
            let p2 = lerp2(inner_s, inner_e, t_b);
            let p3 = lerp2(inner_s, inner_e, t_a);
            result.push(vec![p0, p1, p2, p3]);
        }
    }

    result
}

/// Build diagonal hatch lines inside the wall fill areas (45-degree lines).
///
/// `hatch_spacing` is the perpendicular distance between hatch lines in world units.
/// A value of ~0.06 (60mm) works well for walls at 1:100 scale.
pub fn build_wall_hatch_lines(walls: &[WallSegment], hatch_spacing: f64) -> Vec<OutlineLine> {
    let quads = build_wall_fill_quads(walls);
    let mut lines = Vec::new();

    for quad in &quads {
        if quad.len() < 4 {
            continue;
        }
        // Compute AABB of the quad.
        let mut min_x = f64::MAX;
        let mut max_x = f64::MIN;
        let mut min_y = f64::MAX;
        let mut max_y = f64::MIN;
        for p in quad {
            min_x = min_x.min(p[0]);
            max_x = max_x.max(p[0]);
            min_y = min_y.min(p[1]);
            max_y = max_y.max(p[1]);
        }

        // Hatch lines at 45°: y - x = k  =>  k = y - x.
        let diag = ((max_x - min_x) + (max_y - min_y)) * 2.0;
        let k_min = (min_y - max_x) - diag;
        let k_max = (max_y - min_x) + diag;

        let step = hatch_spacing * std::f64::consts::SQRT_2;
        let mut k = k_min;
        while k <= k_max {
            // The line y - x = k, parameterised: start at x=min_x-diag, end at x=max_x+diag.
            let x0 = min_x - diag;
            let y0 = k + x0;
            let x1 = max_x + diag;
            let y1 = k + x1;

            // Clip the line segment to the quad polygon.
            if let Some((t0, t1)) = clip_segment_to_polygon(&[x0, y0], &[x1, y1], quad) {
                let len = ((x1 - x0).powi(2) + (y1 - y0).powi(2)).sqrt();
                if len < EPS {
                    k += step;
                    continue;
                }
                let sx = x0 + (x1 - x0) * t0;
                let sy = y0 + (y1 - y0) * t0;
                let ex = x0 + (x1 - x0) * t1;
                let ey = y0 + (y1 - y0) * t1;
                let seg_len = ((ex - sx).powi(2) + (ey - sy).powi(2)).sqrt();
                if seg_len >= MIN_SEGMENT {
                    lines.push(OutlineLine { start: [sx, sy], end: [ex, ey] });
                }
            }
            k += step;
        }
    }

    lines
}

/// Clip a line segment [p0..p1] against a convex polygon.
/// Returns parametric interval [t0, t1] of the visible portion, or None.
fn clip_segment_to_polygon(p0: &[f64; 2], p1: &[f64; 2], poly: &[[f64; 2]]) -> Option<(f64, f64)> {
    let dx = p1[0] - p0[0];
    let dy = p1[1] - p0[1];
    let mut t_enter = 0.0f64;
    let mut t_exit = 1.0f64;
    let n = poly.len();

    for i in 0..n {
        let a = poly[i];
        let b = poly[(i + 1) % n];
        let ex = b[0] - a[0];
        let ey = b[1] - a[1];
        let base = cross2(ex, ey, p0[0] - a[0], p0[1] - a[1]);
        let slope = cross2(ex, ey, dx, dy);

        if slope.abs() < EPS {
            if base < -EPS {
                return None;
            }
            continue;
        }
        let t = -base / slope;
        if slope > 0.0 {
            t_enter = t_enter.max(t);
        } else {
            t_exit = t_exit.min(t);
        }
        if t_enter > t_exit + EPS {
            return None;
        }
    }

    let t0 = t_enter.max(0.0);
    let t1 = t_exit.min(1.0);
    if t1 - t0 <= EPS {
        return None;
    }
    Some((t0, t1))
}

/// Convenience: convert visible outline lines into `StyledPrimitive` values
/// ready for rendering.
pub fn build_visible_wall_styled_lines(walls: &[WallSegment]) -> Vec<StyledPrimitive> {
    build_visible_wall_outlines(walls)
        .into_iter()
        .map(|line| {
            StyledPrimitive::new(
                SymbolPrimitive::Polyline {
                    points: vec![line.start, line.end],
                    closed: false,
                },
                SymbolLineClass::Cut,
                DomainColor::Architectural,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_wall_has_four_edges() {
        let wall = WallSegment {
            id: "w1".into(),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            thickness: 0.15,
            openings: vec![],
        };
        let lines = build_visible_wall_outlines(&[wall]);
        assert_eq!(lines.len(), 4, "single wall should produce 4 outline edges");
    }

    #[test]
    fn t_junction_clips_overlapping_edges() {
        let w1 = WallSegment {
            id: "w1".into(),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            thickness: 0.15,
            openings: vec![],
        };
        let w2 = WallSegment {
            id: "w2".into(),
            start: [2.5, -2.0],
            end: [2.5, 0.0],
            thickness: 0.15,
            openings: vec![],
        };
        let lines = build_visible_wall_outlines(&[w1, w2]);
        assert!(!lines.is_empty());
    }

    #[test]
    fn zero_thickness_wall_returns_nothing() {
        let wall = WallSegment {
            id: "w0".into(),
            start: [0.0, 0.0],
            end: [1.0, 0.0],
            thickness: 0.0,
            openings: vec![],
        };
        let lines = build_visible_wall_outlines(&[wall]);
        assert!(lines.is_empty());
    }

    #[test]
    fn wall_outline_corners_horizontal() {
        let wall = WallSegment {
            id: "w1".into(),
            start: [0.0, 0.0],
            end: [4.0, 0.0],
            thickness: 0.2,
            openings: vec![],
        };
        let corners = wall_outline_corners(&wall).unwrap();
        assert!((corners[0][1] - 0.1).abs() < EPS);
        assert!((corners[3][1] - (-0.1)).abs() < EPS);
    }

    #[test]
    fn opening_cuts_side_edges() {
        let wall = WallSegment {
            id: "w1".into(),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            thickness: 0.2,
            openings: vec![WallOpening { t_start: 0.4, t_end: 0.6 }],
        };
        let lines = build_visible_wall_outlines(&[wall]);
        // 2 side edges each split into 2 = 4, plus 2 end caps = 6 total
        assert_eq!(lines.len(), 6, "opening should split each side edge into 2 segments");
    }

    #[test]
    fn fill_quads_split_at_opening() {
        let wall = WallSegment {
            id: "w1".into(),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            thickness: 0.2,
            openings: vec![WallOpening { t_start: 0.3, t_end: 0.7 }],
        };
        let quads = build_wall_fill_quads(&[wall]);
        // One opening → two fill quads (before and after)
        assert_eq!(quads.len(), 2);
    }
}
