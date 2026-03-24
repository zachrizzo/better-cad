//! Wall cleanup algorithms: auto-join endpoints, T-junction detection/splitting,
//! L-junction corner snapping, and parallel wall overlap merging.
//!
//! Ported from `packages/ui/src/services/wall-cleanup.ts`.

use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

/// A wall represented as (id, start, end, height, thickness).
/// Pure data -- no domain references required.
#[derive(Debug, Clone)]
pub struct WallData {
    pub id: String,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub height: f64,
    pub thickness: f64,
}

/// Describes all changes produced by [`cleanup_walls`].
#[derive(Debug, Clone, Default)]
pub struct WallCleanupResult {
    /// Walls whose endpoints were modified (id, new_start, new_end).
    pub modified_walls: Vec<(String, [f64; 2], [f64; 2])>,
    /// Walls that were split into multiple segments.
    pub split_walls: Vec<SplitWall>,
    /// Pairs of overlapping parallel walls that were merged.
    pub merged_walls: Vec<MergedWall>,
}

/// A wall that was split at one or more T-junction points.
#[derive(Debug, Clone)]
pub struct SplitWall {
    pub original_id: String,
    pub segments: Vec<([f64; 2], [f64; 2])>,
}

/// Two overlapping parallel walls merged into one.
#[derive(Debug, Clone)]
pub struct MergedWall {
    pub kept_id: String,
    pub removed_id: String,
    pub new_start: [f64; 2],
    pub new_end: [f64; 2],
}

/// Result of the auto-join endpoints phase.
#[derive(Debug, Clone, Default)]
pub struct AutoJoinResult {
    /// Walls whose endpoints were snapped (id, new_start, new_end).
    pub modified: Vec<(String, [f64; 2], [f64; 2])>,
    /// Number of endpoint pairs joined.
    pub join_count: usize,
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/// Euclidean distance between two 2D points.
fn dist(a: [f64; 2], b: [f64; 2]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

/// Project `point` onto the segment `seg_start`..`seg_end`.
/// Returns (t_clamped, closest_point, distance).
///
/// `t` is clamped to [0, 1] so `closest_point` always lies on the segment.
pub fn project_on_segment(
    point: [f64; 2],
    seg_start: [f64; 2],
    seg_end: [f64; 2],
) -> (f64, [f64; 2], f64) {
    let dx = seg_end[0] - seg_start[0];
    let dy = seg_end[1] - seg_start[1];
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-12 {
        return (0.0, seg_start, dist(point, seg_start));
    }
    let t_raw = ((point[0] - seg_start[0]) * dx + (point[1] - seg_start[1]) * dy) / len_sq;
    let t = t_raw.clamp(0.0, 1.0);
    let projection = [seg_start[0] + t * dx, seg_start[1] + t * dy];
    (t, projection, dist(point, projection))
}

/// Project `point` onto the *infinite* line through `seg_start`..`seg_end`.
/// Returns (t_unclamped, projection).
fn project_on_line(point: [f64; 2], seg_start: [f64; 2], seg_end: [f64; 2]) -> (f64, [f64; 2]) {
    let dx = seg_end[0] - seg_start[0];
    let dy = seg_end[1] - seg_start[1];
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-12 {
        return (0.0, seg_start);
    }
    let t = ((point[0] - seg_start[0]) * dx + (point[1] - seg_start[1]) * dy) / len_sq;
    let projection = [seg_start[0] + t * dx, seg_start[1] + t * dy];
    (t, projection)
}

/// Intersection of two infinite lines defined by point + direction.
/// Returns `None` if the lines are (near) parallel.
pub fn line_line_intersection(
    p1: [f64; 2],
    d1: [f64; 2],
    p2: [f64; 2],
    d2: [f64; 2],
) -> Option<[f64; 2]> {
    let cross = d1[0] * d2[1] - d1[1] * d2[0];
    if cross.abs() < 1e-10 {
        return None;
    }
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    let t = (dx * d2[1] - dy * d2[0]) / cross;
    Some([p1[0] + t * d1[0], p1[1] + t * d1[1]])
}

/// Check if two walls are approximately parallel (cross-product test, ~3 degree tolerance).
pub fn are_parallel(w1: &WallData, w2: &WallData) -> bool {
    let d1 = wall_direction(w1);
    let d2 = wall_direction(w2);
    let len1 = (d1[0] * d1[0] + d1[1] * d1[1]).sqrt();
    let len2 = (d2[0] * d2[0] + d2[1] * d2[1]).sqrt();
    if len1 < 1e-10 || len2 < 1e-10 {
        return false;
    }
    let cross = (d1[0] * d2[1] - d1[1] * d2[0]).abs() / (len1 * len2);
    cross < 0.05 // ~3 degrees
}

/// Perpendicular distance from `point` to the infinite line through a wall.
pub fn perpendicular_distance(point: [f64; 2], w: &WallData) -> f64 {
    let (_, projection) = project_on_line(point, w.start, w.end);
    dist(point, projection)
}

/// Direction vector of a wall (end - start).
fn wall_direction(w: &WallData) -> [f64; 2] {
    [w.end[0] - w.start[0], w.end[1] - w.start[1]]
}

// ---------------------------------------------------------------------------
// T-junction detection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct TJunction {
    /// The wall whose endpoint touches the host.
    incoming_wall_id: String,
    /// Which endpoint of the incoming wall (0 = start, 1 = end).
    incoming_endpoint: usize,
    /// The wall being split.
    host_wall_id: String,
    /// The junction point on the host wall.
    junction_point: [f64; 2],
    /// Parameter t along the host wall.
    t: f64,
}

/// Detect T-junctions: wall endpoints that land in the interior of another wall.
fn detect_t_junctions(walls: &[WallData], threshold: f64) -> Vec<TJunction> {
    let mut junctions = Vec::new();
    let mut seen = HashSet::new();

    for incoming in walls {
        for ep_index in 0..2usize {
            let ep = if ep_index == 0 {
                incoming.start
            } else {
                incoming.end
            };

            for host in walls {
                if host.id == incoming.id {
                    continue;
                }

                // Skip if the endpoint is near an endpoint of the host (that's an L-junction)
                if dist(ep, host.start) < threshold || dist(ep, host.end) < threshold {
                    continue;
                }

                let (t, projection, distance) = project_on_segment(ep, host.start, host.end);
                // Must be interior to the host segment
                if t <= 0.01 || t >= 0.99 {
                    continue;
                }
                if distance > threshold {
                    continue;
                }

                let key = format!("{}:{}:{}", incoming.id, ep_index, host.id);
                if seen.contains(&key) {
                    continue;
                }
                seen.insert(key);

                junctions.push(TJunction {
                    incoming_wall_id: incoming.id.clone(),
                    incoming_endpoint: ep_index,
                    host_wall_id: host.id.clone(),
                    junction_point: projection,
                    t,
                });
            }
        }
    }

    junctions
}

// ---------------------------------------------------------------------------
// L-junction detection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct LJunction {
    wall_a_id: String,
    wall_a_endpoint: usize,
    wall_b_id: String,
    wall_b_endpoint: usize,
    intersection_point: [f64; 2],
}

/// Detect L-junctions: non-parallel wall pairs with close endpoints that can be
/// snapped to the infinite-line intersection of their centerlines.
fn detect_l_junctions(walls: &[WallData], threshold: f64) -> Vec<LJunction> {
    let mut junctions = Vec::new();
    let mut seen = HashSet::new();

    for i in 0..walls.len() {
        for j in (i + 1)..walls.len() {
            let w_a = &walls[i];
            let w_b = &walls[j];

            if are_parallel(w_a, w_b) {
                continue;
            }

            for ep_a in 0..2usize {
                for ep_b in 0..2usize {
                    let pt_a = if ep_a == 0 { w_a.start } else { w_a.end };
                    let pt_b = if ep_b == 0 { w_b.start } else { w_b.end };

                    let d = dist(pt_a, pt_b);
                    if d > threshold {
                        continue;
                    }

                    // Build a canonical key to avoid duplicates
                    let mut parts = [
                        format!("{}:{}", w_a.id, ep_a),
                        format!("{}:{}", w_b.id, ep_b),
                    ];
                    parts.sort();
                    let key = parts.join(":");
                    if seen.contains(&key) {
                        continue;
                    }
                    seen.insert(key);

                    let d_a = wall_direction(w_a);
                    let d_b = wall_direction(w_b);
                    let intersection = match line_line_intersection(w_a.start, d_a, w_b.start, d_b)
                    {
                        Some(p) => p,
                        None => continue,
                    };

                    // Sanity: intersection shouldn't be too far from the endpoints
                    if dist(intersection, pt_a) > threshold * 5.0
                        && dist(intersection, pt_b) > threshold * 5.0
                    {
                        continue;
                    }

                    junctions.push(LJunction {
                        wall_a_id: w_a.id.clone(),
                        wall_a_endpoint: ep_a,
                        wall_b_id: w_b.id.clone(),
                        wall_b_endpoint: ep_b,
                        intersection_point: intersection,
                    });
                }
            }
        }
    }

    junctions
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct OverlapPair {
    wall_a_id: String,
    wall_b_id: String,
}

/// Detect overlapping parallel walls with same thickness and height whose centerlines
/// are within `threshold` perpendicular distance and whose projections overlap.
fn detect_overlaps(walls: &[WallData], threshold: f64) -> Vec<OverlapPair> {
    let mut pairs = Vec::new();
    let mut seen = HashSet::new();

    for i in 0..walls.len() {
        for j in (i + 1)..walls.len() {
            let w_a = &walls[i];
            let w_b = &walls[j];

            if !are_parallel(w_a, w_b) {
                continue;
            }
            if (w_a.thickness - w_b.thickness).abs() > 0.01 {
                continue;
            }
            if (w_a.height - w_b.height).abs() > 0.01 {
                continue;
            }

            let perp_dist = perpendicular_distance(w_b.start, w_a);
            if perp_dist > threshold {
                continue;
            }

            // Check that projections overlap along the wall direction
            let (t_bs, _) = project_on_line(w_b.start, w_a.start, w_a.end);
            let (t_be, _) = project_on_line(w_b.end, w_a.start, w_a.end);
            let min_b = t_bs.min(t_be);
            let max_b = t_bs.max(t_be);

            // Wall A spans t=[0, 1]. Check overlap.
            if max_b < -0.01 || min_b > 1.01 {
                continue;
            }

            let mut key_parts = [w_a.id.clone(), w_b.id.clone()];
            key_parts.sort();
            let key = key_parts.join(":");
            if seen.contains(&key) {
                continue;
            }
            seen.insert(key);

            pairs.push(OverlapPair {
                wall_a_id: w_a.id.clone(),
                wall_b_id: w_b.id.clone(),
            });
        }
    }

    pairs
}

// ---------------------------------------------------------------------------
// Auto-join endpoints
// ---------------------------------------------------------------------------

const DEFAULT_AUTO_JOIN_THRESHOLD: f64 = 0.05; // 5 cm

/// Snap close wall endpoints together (within `threshold` distance).
///
/// Does not merge parallel walls with the same thickness (those are likely
/// intentional double-wall constructions).
///
/// Returns the modified walls and the number of joins performed.
pub fn auto_join_endpoints(walls: &[WallData], threshold: Option<f64>) -> AutoJoinResult {
    let threshold = threshold.unwrap_or(DEFAULT_AUTO_JOIN_THRESHOLD);
    if walls.len() < 2 {
        return AutoJoinResult::default();
    }

    let mut wall_map: HashMap<String, WallData> = HashMap::new();
    for w in walls {
        wall_map.insert(w.id.clone(), w.clone());
    }

    let mut modified_ids = HashSet::new();
    let mut join_count: usize = 0;

    let ids: Vec<String> = walls.iter().map(|w| w.id.clone()).collect();

    for i in 0..ids.len() {
        for j in (i + 1)..ids.len() {
            let wi = wall_map[&ids[i]].clone();
            let wj = wall_map[&ids[j]].clone();

            // Skip parallel walls with same thickness
            if are_parallel(&wi, &wj) && (wi.thickness - wj.thickness).abs() < 0.01 {
                continue;
            }

            // Check all 4 endpoint pairings
            let pairs: [(bool, bool, f64); 4] = [
                (true, true, dist(wi.start, wj.start)), // from=start, to=start
                (true, false, dist(wi.start, wj.end)),  // from=start, to=end
                (false, true, dist(wi.end, wj.start)),  // from=end,   to=start
                (false, false, dist(wi.end, wj.end)),   // from=end,   to=end
            ];

            for &(from_start, to_start, d) in &pairs {
                if d < threshold && d > 0.0 {
                    let target = if from_start { wi.start } else { wi.end };
                    let wj_mut = wall_map.get_mut(&ids[j]).unwrap();
                    if to_start {
                        wj_mut.start = target;
                    } else {
                        wj_mut.end = target;
                    }
                    modified_ids.insert(ids[j].clone());
                    join_count += 1;
                }
            }
        }
    }

    let modified = modified_ids
        .iter()
        .filter_map(|id| wall_map.get(id).map(|w| (w.id.clone(), w.start, w.end)))
        .collect();

    AutoJoinResult {
        modified,
        join_count,
    }
}

// ---------------------------------------------------------------------------
// Full cleanup pipeline
// ---------------------------------------------------------------------------

const DEFAULT_SNAP_THRESHOLD: f64 = 0.15;

/// Run all wall-cleanup phases in order:
/// 1. Auto-join close endpoints
/// 2. T-junction detection and host-wall splitting
/// 3. L-junction corner snapping
/// 4. Parallel overlap merging
///
/// This is a pure function: it takes wall data in and returns a description
/// of the changes. Nothing is mutated in place.
pub fn cleanup_walls(walls: &[WallData], snap_threshold: Option<f64>) -> WallCleanupResult {
    let threshold = snap_threshold.unwrap_or(DEFAULT_SNAP_THRESHOLD);

    if walls.len() < 2 {
        return WallCleanupResult::default();
    }

    // Work on a mutable copy indexed by id
    let mut wall_map: HashMap<String, WallData> = HashMap::new();
    for w in walls {
        wall_map.insert(w.id.clone(), w.clone());
    }

    let mut modified_ids = HashSet::new();
    let mut split_walls_out: Vec<SplitWall> = Vec::new();
    let mut merged_walls_out: Vec<MergedWall> = Vec::new();
    let mut deleted_ids = HashSet::new();
    // Track created wall ids (from splits) so we don't list them as modified
    let mut created_ids = HashSet::new();

    // --- Phase 1: T-junction splits ---
    {
        let current: Vec<WallData> = wall_map.values().cloned().collect();
        let t_junctions = detect_t_junctions(&current, threshold);

        // Group T-junctions by host wall
        let mut splits_by_host: HashMap<String, Vec<TJunction>> = HashMap::new();
        for tj in &t_junctions {
            splits_by_host
                .entry(tj.host_wall_id.clone())
                .or_default()
                .push(tj.clone());
        }

        for (host_id, mut splits) in splits_by_host {
            let host = match wall_map.get(&host_id) {
                Some(h) => h.clone(),
                None => continue,
            };

            // Sort split points by t parameter
            splits.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));

            // Snap incoming wall endpoints to junction points
            for tj in &splits {
                if let Some(incoming) = wall_map.get_mut(&tj.incoming_wall_id) {
                    if tj.incoming_endpoint == 0 {
                        incoming.start = tj.junction_point;
                    } else {
                        incoming.end = tj.junction_point;
                    }
                    modified_ids.insert(tj.incoming_wall_id.clone());
                }
            }

            // Build split segments from the host wall
            let mut points: Vec<[f64; 2]> = vec![host.start];
            for tj in &splits {
                points.push(tj.junction_point);
            }
            points.push(host.end);

            // Record as SplitWall
            let segments: Vec<([f64; 2], [f64; 2])> = (0..points.len() - 1)
                .map(|k| (points[k], points[k + 1]))
                .collect();
            split_walls_out.push(SplitWall {
                original_id: host_id.clone(),
                segments: segments.clone(),
            });

            // First segment reuses the original host wall id
            if let Some(host_mut) = wall_map.get_mut(&host_id) {
                host_mut.start = segments[0].0;
                host_mut.end = segments[0].1;
            }
            modified_ids.insert(host_id.clone());

            // Additional segments get new synthetic ids
            for (k, seg) in segments.iter().enumerate().skip(1) {
                let new_id = format!("{}-split-{}", host_id, k);
                wall_map.insert(
                    new_id.clone(),
                    WallData {
                        id: new_id.clone(),
                        start: seg.0,
                        end: seg.1,
                        height: host.height,
                        thickness: host.thickness,
                    },
                );
                created_ids.insert(new_id);
            }
        }
    }

    // --- Phase 2: L-junction corner trims ---
    {
        let current: Vec<WallData> = wall_map
            .values()
            .filter(|w| !deleted_ids.contains(&w.id))
            .cloned()
            .collect();
        let l_junctions = detect_l_junctions(&current, threshold);

        for lj in &l_junctions {
            if deleted_ids.contains(&lj.wall_a_id) || deleted_ids.contains(&lj.wall_b_id) {
                continue;
            }

            if let Some(w_a) = wall_map.get_mut(&lj.wall_a_id) {
                if lj.wall_a_endpoint == 0 {
                    w_a.start = lj.intersection_point;
                } else {
                    w_a.end = lj.intersection_point;
                }
                modified_ids.insert(lj.wall_a_id.clone());
            }

            if let Some(w_b) = wall_map.get_mut(&lj.wall_b_id) {
                if lj.wall_b_endpoint == 0 {
                    w_b.start = lj.intersection_point;
                } else {
                    w_b.end = lj.intersection_point;
                }
                modified_ids.insert(lj.wall_b_id.clone());
            }
        }
    }

    // --- Phase 3: Overlap merges ---
    {
        let current: Vec<WallData> = wall_map
            .values()
            .filter(|w| !deleted_ids.contains(&w.id))
            .cloned()
            .collect();
        let overlaps = detect_overlaps(&current, threshold);

        for overlap in &overlaps {
            if deleted_ids.contains(&overlap.wall_a_id) || deleted_ids.contains(&overlap.wall_b_id)
            {
                continue;
            }
            let w_a = match wall_map.get(&overlap.wall_a_id) {
                Some(w) => w.clone(),
                None => continue,
            };
            let w_b = match wall_map.get(&overlap.wall_b_id) {
                Some(w) => w.clone(),
                None => continue,
            };

            let dir = wall_direction(&w_a);
            let len = (dir[0] * dir[0] + dir[1] * dir[1]).sqrt();
            if len < 1e-10 {
                continue;
            }

            // Project all four endpoints onto wall A's direction
            let (t_b_start, _) = project_on_line(w_b.start, w_a.start, w_a.end);
            let (t_b_end, _) = project_on_line(w_b.end, w_a.start, w_a.end);

            let mut t_values: Vec<f64> = vec![0.0, 1.0, t_b_start, t_b_end];
            t_values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

            let min_t = t_values[0];
            let max_t = t_values[t_values.len() - 1];

            let merged_start = [w_a.start[0] + min_t * dir[0], w_a.start[1] + min_t * dir[1]];
            let merged_end = [w_a.start[0] + max_t * dir[0], w_a.start[1] + max_t * dir[1]];

            merged_walls_out.push(MergedWall {
                kept_id: overlap.wall_a_id.clone(),
                removed_id: overlap.wall_b_id.clone(),
                new_start: merged_start,
                new_end: merged_end,
            });

            // Update wall A
            if let Some(w_a_mut) = wall_map.get_mut(&overlap.wall_a_id) {
                w_a_mut.start = merged_start;
                w_a_mut.end = merged_end;
            }
            modified_ids.insert(overlap.wall_a_id.clone());

            // Delete wall B
            deleted_ids.insert(overlap.wall_b_id.clone());
            wall_map.remove(&overlap.wall_b_id);
        }
    }

    // Build result: modified walls (excluding deleted and created-in-this-pass)
    let modified_walls: Vec<(String, [f64; 2], [f64; 2])> = modified_ids
        .iter()
        .filter(|id| !deleted_ids.contains(*id) && !created_ids.contains(*id))
        .filter_map(|id| wall_map.get(id).map(|w| (w.id.clone(), w.start, w.end)))
        .collect();

    WallCleanupResult {
        modified_walls,
        split_walls: split_walls_out,
        merged_walls: merged_walls_out,
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_wall(id: &str, start: [f64; 2], end: [f64; 2]) -> WallData {
        WallData {
            id: id.to_string(),
            start,
            end,
            height: 3.0,
            thickness: 0.2,
        }
    }

    fn make_wall_full(
        id: &str,
        start: [f64; 2],
        end: [f64; 2],
        height: f64,
        thickness: f64,
    ) -> WallData {
        WallData {
            id: id.to_string(),
            start,
            end,
            height,
            thickness,
        }
    }

    // --- Geometry helpers ---

    #[test]
    fn test_project_on_segment_midpoint() {
        let (t, proj, d) = project_on_segment([2.0, 1.0], [0.0, 0.0], [4.0, 0.0]);
        assert!((t - 0.5).abs() < 1e-9);
        assert!((proj[0] - 2.0).abs() < 1e-9);
        assert!((proj[1] - 0.0).abs() < 1e-9);
        assert!((d - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_project_on_segment_clamped() {
        let (t, proj, _d) = project_on_segment([-5.0, 0.0], [0.0, 0.0], [4.0, 0.0]);
        assert!((t - 0.0).abs() < 1e-9);
        assert!((proj[0] - 0.0).abs() < 1e-9);
    }

    #[test]
    fn test_project_on_segment_zero_length() {
        let (t, proj, d) = project_on_segment([3.0, 4.0], [1.0, 1.0], [1.0, 1.0]);
        assert!((t - 0.0).abs() < 1e-9);
        assert!((proj[0] - 1.0).abs() < 1e-9);
        assert!((d - dist([3.0, 4.0], [1.0, 1.0])).abs() < 1e-9);
    }

    #[test]
    fn test_line_line_intersection_perpendicular() {
        let result = line_line_intersection([0.0, 0.0], [1.0, 0.0], [2.0, -1.0], [0.0, 1.0]);
        assert!(result.is_some());
        let p = result.unwrap();
        assert!((p[0] - 2.0).abs() < 1e-9);
        assert!((p[1] - 0.0).abs() < 1e-9);
    }

    #[test]
    fn test_line_line_intersection_parallel_returns_none() {
        let result = line_line_intersection([0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 0.0]);
        assert!(result.is_none());
    }

    #[test]
    fn test_are_parallel_same_direction() {
        let w1 = make_wall("a", [0.0, 0.0], [4.0, 0.0]);
        let w2 = make_wall("b", [0.0, 1.0], [4.0, 1.0]);
        assert!(are_parallel(&w1, &w2));
    }

    #[test]
    fn test_are_parallel_perpendicular() {
        let w1 = make_wall("a", [0.0, 0.0], [4.0, 0.0]);
        let w2 = make_wall("b", [2.0, 0.0], [2.0, 4.0]);
        assert!(!are_parallel(&w1, &w2));
    }

    #[test]
    fn test_perpendicular_distance() {
        let w = make_wall("a", [0.0, 0.0], [4.0, 0.0]);
        let d = perpendicular_distance([2.0, 3.0], &w);
        assert!((d - 3.0).abs() < 1e-9);
    }

    // --- T-junction detection ---

    #[test]
    fn test_t_junction_detection() {
        // Horizontal host wall from (0,0) to (4,0)
        // Vertical incoming wall from (2, 0.01) to (2, 3) -- endpoint close to host interior
        let walls = vec![
            make_wall("host", [0.0, 0.0], [4.0, 0.0]),
            make_wall("incoming", [2.0, 0.01], [2.0, 3.0]),
        ];
        let tjs = detect_t_junctions(&walls, 0.15);
        assert_eq!(tjs.len(), 1);
        assert_eq!(tjs[0].host_wall_id, "host");
        assert_eq!(tjs[0].incoming_wall_id, "incoming");
        assert_eq!(tjs[0].incoming_endpoint, 0); // start of incoming
        assert!((tjs[0].t - 0.5).abs() < 0.02);
    }

    #[test]
    fn test_t_junction_at_endpoint_not_detected() {
        // Incoming endpoint is close to the host endpoint -- should NOT be a T-junction
        let walls = vec![
            make_wall("host", [0.0, 0.0], [4.0, 0.0]),
            make_wall("incoming", [0.01, 0.01], [0.0, 3.0]),
        ];
        let tjs = detect_t_junctions(&walls, 0.15);
        assert_eq!(tjs.len(), 0);
    }

    #[test]
    fn test_cleanup_t_junction_splits_host() {
        // Horizontal host, vertical incoming touching at midpoint
        let walls = vec![
            make_wall("host", [0.0, 0.0], [4.0, 0.0]),
            make_wall("incoming", [2.0, 0.05], [2.0, 3.0]),
        ];
        let result = cleanup_walls(&walls, Some(0.15));

        // The host should have been split
        assert!(!result.split_walls.is_empty());
        let split = &result.split_walls[0];
        assert_eq!(split.original_id, "host");
        assert_eq!(split.segments.len(), 2);

        // First segment: (0,0) to ~(2,0)
        assert!((split.segments[0].0[0] - 0.0).abs() < 1e-9);
        assert!((split.segments[0].1[0] - 2.0).abs() < 0.1);

        // Second segment: ~(2,0) to (4,0)
        assert!((split.segments[1].0[0] - 2.0).abs() < 0.1);
        assert!((split.segments[1].1[0] - 4.0).abs() < 1e-9);

        // The incoming wall's start should have been snapped
        let incoming_mod = result
            .modified_walls
            .iter()
            .find(|(id, _, _)| id == "incoming");
        assert!(incoming_mod.is_some());
    }

    // --- L-junction detection ---

    #[test]
    fn test_l_junction_corner_snap() {
        // Two walls meeting at roughly (0,0) but with a small gap
        let walls = vec![
            make_wall("a", [-4.0, 0.0], [0.02, 0.0]),
            make_wall("b", [0.0, 0.03], [0.0, 4.0]),
        ];
        let ljs = detect_l_junctions(&walls, 0.15);
        assert_eq!(ljs.len(), 1);

        // The intersection of the infinite centerlines should be at (0, 0)
        let pt = ljs[0].intersection_point;
        assert!((pt[0] - 0.0).abs() < 1e-6);
        assert!((pt[1] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_cleanup_l_junction_modifies_endpoints() {
        let walls = vec![
            make_wall("a", [-4.0, 0.0], [0.05, 0.0]),
            make_wall("b", [0.0, 0.05], [0.0, 4.0]),
        ];
        let result = cleanup_walls(&walls, Some(0.15));

        // Both walls should be modified
        let mod_a = result.modified_walls.iter().find(|(id, _, _)| id == "a");
        let mod_b = result.modified_walls.iter().find(|(id, _, _)| id == "b");
        assert!(mod_a.is_some());
        assert!(mod_b.is_some());

        // Wall A's end should be snapped to ~ (0,0)
        let (_, _start_a, end_a) = mod_a.unwrap();
        assert!((end_a[0]).abs() < 0.01);
        assert!((end_a[1]).abs() < 0.01);

        // Wall B's start should be snapped to ~ (0,0)
        let (_, start_b, _end_b) = mod_b.unwrap();
        assert!((start_b[0]).abs() < 0.01);
        assert!((start_b[1]).abs() < 0.01);
    }

    // --- Parallel overlap merging ---

    #[test]
    fn test_overlap_detection_direct() {
        // Test detect_overlaps directly (bypassing T/L-junction phases)
        let walls = vec![
            make_wall_full("a", [0.0, 0.0], [3.0, 0.0], 3.0, 0.2),
            make_wall_full("b", [2.0, 0.0], [5.0, 0.0], 3.0, 0.2),
        ];
        let overlaps = detect_overlaps(&walls, 0.15);
        assert_eq!(overlaps.len(), 1);
        assert_eq!(overlaps[0].wall_a_id, "a");
        assert_eq!(overlaps[0].wall_b_id, "b");
    }

    #[test]
    fn test_overlap_merge_full_pipeline() {
        // Two overlapping collinear walls: the full pipeline first splits via
        // T-junction (wall b's start is interior to wall a), then merges the
        // resulting parallel fragments. The net effect is that wall b is removed
        // and the result covers the full span.
        let walls = vec![
            make_wall_full("a", [0.0, 0.0], [3.0, 0.0], 3.0, 0.2),
            make_wall_full("b", [2.0, 0.0], [5.0, 0.0], 3.0, 0.2),
        ];
        let result = cleanup_walls(&walls, Some(0.15));

        // At minimum, wall b should end up removed via merge or the fragments
        // should cover 0..5. Check that there are merged walls.
        assert!(!result.merged_walls.is_empty());
    }

    #[test]
    fn test_no_overlap_different_thickness_direct() {
        // Test detect_overlaps directly: different thickness walls should not overlap
        let walls = vec![
            make_wall_full("a", [0.0, 0.0], [3.0, 0.0], 3.0, 0.2),
            make_wall_full("b", [2.0, 0.0], [5.0, 0.0], 3.0, 0.3),
        ];
        let overlaps = detect_overlaps(&walls, 0.15);
        assert!(overlaps.is_empty());
    }

    #[test]
    fn test_no_overlap_perpendicular_walls() {
        let walls = vec![
            make_wall("a", [0.0, 0.0], [4.0, 0.0]),
            make_wall("b", [2.0, -2.0], [2.0, 2.0]),
        ];
        let result = cleanup_walls(&walls, Some(0.15));
        assert!(result.merged_walls.is_empty());
    }

    // --- Auto-join endpoints ---

    #[test]
    fn test_auto_join_snaps_close_endpoints() {
        let walls = vec![
            make_wall("a", [0.0, 0.0], [4.0, 0.0]),
            make_wall("b", [4.03, 0.0], [4.03, 3.0]),
        ];
        let result = auto_join_endpoints(&walls, Some(0.05));
        assert!(result.join_count > 0);

        // Wall B's start should be snapped to wall A's end
        let mod_b = result.modified.iter().find(|(id, _, _)| id == "b");
        assert!(mod_b.is_some());
        let (_, start_b, _) = mod_b.unwrap();
        assert!((start_b[0] - 4.0).abs() < 1e-9);
        assert!((start_b[1] - 0.0).abs() < 1e-9);
    }

    #[test]
    fn test_auto_join_skips_distant_endpoints() {
        let walls = vec![
            make_wall("a", [0.0, 0.0], [4.0, 0.0]),
            make_wall("b", [5.0, 0.0], [5.0, 3.0]),
        ];
        let result = auto_join_endpoints(&walls, Some(0.05));
        assert_eq!(result.join_count, 0);
        assert!(result.modified.is_empty());
    }

    #[test]
    fn test_auto_join_skips_parallel_same_thickness() {
        // Two parallel walls with same thickness -- should NOT be auto-joined
        let walls = vec![
            make_wall_full("a", [0.0, 0.0], [4.0, 0.0], 3.0, 0.2),
            make_wall_full("b", [0.01, 0.3], [4.0, 0.3], 3.0, 0.2),
        ];
        let result = auto_join_endpoints(&walls, Some(0.5));
        assert_eq!(result.join_count, 0);
    }

    // --- Edge cases ---

    #[test]
    fn test_cleanup_single_wall() {
        let walls = vec![make_wall("a", [0.0, 0.0], [4.0, 0.0])];
        let result = cleanup_walls(&walls, None);
        assert!(result.modified_walls.is_empty());
        assert!(result.split_walls.is_empty());
        assert!(result.merged_walls.is_empty());
    }

    #[test]
    fn test_cleanup_empty() {
        let walls: Vec<WallData> = vec![];
        let result = cleanup_walls(&walls, None);
        assert!(result.modified_walls.is_empty());
    }

    #[test]
    fn test_identical_endpoints_wall() {
        // A degenerate zero-length wall should not cause panics
        let walls = vec![
            make_wall("a", [0.0, 0.0], [0.0, 0.0]),
            make_wall("b", [0.0, 0.0], [4.0, 0.0]),
        ];
        // Should not panic
        let _result = cleanup_walls(&walls, Some(0.15));
    }

    #[test]
    fn test_multiple_t_junctions_on_one_host() {
        // Host wall from (0,0) to (6,0), two incoming walls at x=2 and x=4
        let walls = vec![
            make_wall("host", [0.0, 0.0], [6.0, 0.0]),
            make_wall("inc1", [2.0, 0.05], [2.0, 3.0]),
            make_wall("inc2", [4.0, 0.05], [4.0, 3.0]),
        ];
        let result = cleanup_walls(&walls, Some(0.15));

        // Host should be split into 3 segments
        let split = result.split_walls.iter().find(|s| s.original_id == "host");
        assert!(split.is_some());
        assert_eq!(split.unwrap().segments.len(), 3);
    }
}
