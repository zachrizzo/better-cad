//! Room detection via planar graph face extraction.
//!
//! Given a set of wall centerline segments, this module builds an adjacency
//! graph, sorts edges by angle at each node, and traverses minimal faces
//! (using the "next counter-clockwise edge" rule) to identify enclosed rooms.
//!
//! Ported from `packages/ui/src/services/room-detection.ts`.

use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A detected room (minimal face in the wall graph).
#[derive(Debug, Clone)]
pub struct DetectedRoom {
    /// Boundary polygon vertices in CCW winding order.
    pub boundary: Vec<[f64; 2]>,
    /// Absolute area of the room polygon.
    pub area: f64,
    /// Perimeter of the room polygon.
    pub perimeter: f64,
    /// Simple centroid (average of boundary vertices).
    pub centroid: [f64; 2],
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const SNAP_PRECISION: f64 = 0.01;

/// Round a coordinate to the snap grid to handle near-miss endpoints.
fn snap(v: f64) -> f64 {
    (v / SNAP_PRECISION).round() * SNAP_PRECISION
}

/// Build a canonical string key for a snapped 2D point.
fn pt_key(x: f64, y: f64) -> String {
    format!("{},{}", snap(x), snap(y))
}

/// Delegates to `bcad_domain::polygon_signed_area`.
fn signed_area(pts: &[[f64; 2]]) -> f64 {
    bcad_domain::polygon_signed_area(pts)
}

/// Delegates to `bcad_domain::polygon_perimeter`.
fn perimeter(pts: &[[f64; 2]]) -> f64 {
    bcad_domain::polygon_perimeter(pts)
}

/// Delegates to `bcad_domain::polygon_centroid`.
pub fn polygon_centroid(pts: &[[f64; 2]]) -> [f64; 2] {
    bcad_domain::polygon_centroid(pts)
}

// ---------------------------------------------------------------------------
// Graph edge type
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct HalfEdge {
    to: String,
    #[allow(dead_code)]
    to_coord: [f64; 2],
    angle: f64,
    used: bool,
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------

/// Detect enclosed rooms formed by wall centerline segments.
///
/// Each wall is represented as `(id, start, end)`.
///
/// Algorithm:
/// 1. Build a planar graph from wall centerlines (snap endpoints to grid).
/// 2. At each node, sort outgoing edges by angle.
/// 3. Traverse using the "next counter-clockwise edge" rule to find minimal faces.
/// 4. Discard the outer (unbounded) face (largest absolute area) and degenerate faces.
pub fn detect_rooms(walls: &[(String, [f64; 2], [f64; 2])]) -> Vec<DetectedRoom> {
    if walls.is_empty() {
        return Vec::new();
    }

    // --- 1. Build adjacency graph ---
    let mut adj: HashMap<String, Vec<HalfEdge>> = HashMap::new();
    let mut node_coord: HashMap<String, [f64; 2]> = HashMap::new();

    // Helper: ensure a node exists for the given coordinate, return its key.
    fn ensure_node(
        x: f64,
        y: f64,
        node_coord: &mut HashMap<String, [f64; 2]>,
        adj: &mut HashMap<String, Vec<HalfEdge>>,
    ) -> String {
        let key = pt_key(x, y);
        node_coord.entry(key.clone()).or_insert([snap(x), snap(y)]);
        adj.entry(key.clone()).or_default();
        key
    }

    for (_id, start, end) in walls {
        let key_a = ensure_node(start[0], start[1], &mut node_coord, &mut adj);
        let key_b = ensure_node(end[0], end[1], &mut node_coord, &mut adj);
        if key_a == key_b {
            continue; // degenerate wall
        }

        let [ax, ay] = node_coord[&key_a];
        let [bx, by] = node_coord[&key_b];

        let angle_ab = (by - ay).atan2(bx - ax);
        let angle_ba = (ay - by).atan2(ax - bx);

        adj.get_mut(&key_a).unwrap().push(HalfEdge {
            to: key_b.clone(),
            to_coord: [bx, by],
            angle: angle_ab,
            used: false,
        });
        adj.get_mut(&key_b).unwrap().push(HalfEdge {
            to: key_a.clone(),
            to_coord: [ax, ay],
            angle: angle_ba,
            used: false,
        });
    }

    // --- 2. Sort edges at each node by angle ---
    for edges in adj.values_mut() {
        edges.sort_by(|a, b| {
            a.angle
                .partial_cmp(&b.angle)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    // --- 3. Traverse minimal faces ---
    let faces = extract_faces(&mut adj, &node_coord);

    if faces.is_empty() {
        return Vec::new();
    }

    // --- 4. Compute areas and filter ---
    let mut max_abs_area: f64 = 0.0;
    let mut max_idx: Option<usize> = None;

    for (i, face) in faces.iter().enumerate() {
        let sa = signed_area(face);
        let abs_area = sa.abs();
        if abs_area > max_abs_area {
            max_abs_area = abs_area;
            max_idx = Some(i);
        }
    }

    let mut rooms = Vec::new();
    for (i, face) in faces.iter().enumerate() {
        if Some(i) == max_idx {
            continue; // skip outer boundary
        }
        let sa = signed_area(face);
        let abs_area = sa.abs();
        if abs_area < 0.01 {
            continue; // too small -- noise
        }

        // Ensure CCW winding
        let boundary: Vec<[f64; 2]> = if sa < 0.0 {
            face.iter().copied().rev().collect()
        } else {
            face.clone()
        };

        let centroid = polygon_centroid(&boundary);

        rooms.push(DetectedRoom {
            area: abs_area,
            perimeter: perimeter(&boundary),
            centroid,
            boundary,
        });
    }

    rooms
}

/// Extract all minimal faces from the planar graph.
///
/// For each directed half-edge that hasn't been used, follow the "next edge" rule:
/// arriving at node B from A, find the reverse half-edge (B->A) in B's adjacency list,
/// then take the previous edge in cyclic sorted order. This is the standard planar
/// subdivision face traversal.
fn extract_faces(
    adj: &mut HashMap<String, Vec<HalfEdge>>,
    node_coord: &HashMap<String, [f64; 2]>,
) -> Vec<Vec<[f64; 2]>> {
    let mut faces: Vec<Vec<[f64; 2]>> = Vec::new();

    // Collect node keys for deterministic iteration
    let node_keys: Vec<String> = adj.keys().cloned().collect();

    for start_key in &node_keys {
        let edge_count = adj.get(start_key).map_or(0, |e| e.len());
        for start_edge_idx in 0..edge_count {
            // Check if already used
            if adj[start_key][start_edge_idx].used {
                continue;
            }

            let mut polygon: Vec<[f64; 2]> = Vec::new();
            let mut cur_key = start_key.clone();
            let mut cur_edge_idx = start_edge_idx;
            let mut safe = 0usize;

            loop {
                if safe >= 10_000 {
                    break;
                }
                safe += 1;

                // Mark current edge as used
                adj.get_mut(&cur_key).unwrap()[cur_edge_idx].used = true;

                // Record the current node coordinate
                polygon.push(node_coord[&cur_key]);

                let next_key = adj[&cur_key][cur_edge_idx].to.clone();
                let next_edges = &adj[&next_key];

                // Find the reverse half-edge (next_key -> cur_key) in the adjacency list.
                // Then pick the edge just before it in cyclic order (this gives the
                // standard "next CW" traversal for minimal face extraction).
                let reverse_idx = next_edges.iter().position(|e| e.to == cur_key).unwrap_or(0);

                // Previous edge in cyclic order
                let next_edge_idx = if reverse_idx == 0 {
                    next_edges.len() - 1
                } else {
                    reverse_idx - 1
                };

                cur_key = next_key;
                cur_edge_idx = next_edge_idx;

                // Check termination: back to start
                if cur_key == *start_key && cur_edge_idx == start_edge_idx {
                    break;
                }
            }

            if polygon.len() >= 3 {
                faces.push(polygon);
            }
        }
    }

    faces
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_wall_tuple(id: &str, start: [f64; 2], end: [f64; 2]) -> (String, [f64; 2], [f64; 2]) {
        (id.to_string(), start, end)
    }

    // --- Geometry helpers ---

    #[test]
    fn test_signed_area_ccw_square() {
        // CCW square with side 2 => area = 4
        let pts = vec![[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]];
        let sa = signed_area(&pts);
        assert!((sa - 4.0).abs() < 1e-9);
    }

    #[test]
    fn test_signed_area_cw_square() {
        // CW square => negative area
        let pts = vec![[0.0, 0.0], [0.0, 2.0], [2.0, 2.0], [2.0, 0.0]];
        let sa = signed_area(&pts);
        assert!((sa - (-4.0)).abs() < 1e-9);
    }

    #[test]
    fn test_perimeter_square() {
        let pts = vec![[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]];
        let p = perimeter(&pts);
        assert!((p - 8.0).abs() < 1e-9);
    }

    #[test]
    fn test_polygon_centroid_square() {
        let pts = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]];
        let c = polygon_centroid(&pts);
        assert!((c[0] - 2.0).abs() < 1e-9);
        assert!((c[1] - 2.0).abs() < 1e-9);
    }

    #[test]
    fn test_polygon_centroid_empty() {
        let c = polygon_centroid(&[]);
        assert!((c[0]).abs() < 1e-9);
        assert!((c[1]).abs() < 1e-9);
    }

    // --- Room detection ---

    #[test]
    fn test_simple_rectangle_4_walls() {
        // A 4x3 rectangle
        let walls = vec![
            make_wall_tuple("w1", [0.0, 0.0], [4.0, 0.0]),
            make_wall_tuple("w2", [4.0, 0.0], [4.0, 3.0]),
            make_wall_tuple("w3", [4.0, 3.0], [0.0, 3.0]),
            make_wall_tuple("w4", [0.0, 3.0], [0.0, 0.0]),
        ];
        let rooms = detect_rooms(&walls);
        assert_eq!(rooms.len(), 1);
        assert!((rooms[0].area - 12.0).abs() < 0.1);
        assert!((rooms[0].perimeter - 14.0).abs() < 0.1);
    }

    #[test]
    fn test_two_rooms_with_divider() {
        // Two rooms side by side: (0,0)-(2,0)-(2,2)-(0,2) and (2,0)-(4,0)-(4,2)-(2,2).
        // Walls must share endpoints at the divider intersections (as would happen
        // after wall-cleanup T-junction splitting).
        let walls = vec![
            // Bottom split at divider
            make_wall_tuple("w1a", [0.0, 0.0], [2.0, 0.0]),
            make_wall_tuple("w1b", [2.0, 0.0], [4.0, 0.0]),
            // Right
            make_wall_tuple("w2", [4.0, 0.0], [4.0, 2.0]),
            // Top split at divider
            make_wall_tuple("w3a", [4.0, 2.0], [2.0, 2.0]),
            make_wall_tuple("w3b", [2.0, 2.0], [0.0, 2.0]),
            // Left
            make_wall_tuple("w4", [0.0, 2.0], [0.0, 0.0]),
            // Interior divider
            make_wall_tuple("w5", [2.0, 0.0], [2.0, 2.0]),
        ];
        let rooms = detect_rooms(&walls);
        // Should detect 2 rooms
        assert_eq!(rooms.len(), 2);

        // Each room should be 2x2 = area 4
        let mut areas: Vec<f64> = rooms.iter().map(|r| r.area).collect();
        areas.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((areas[0] - 4.0).abs() < 0.1);
        assert!((areas[1] - 4.0).abs() < 0.1);
    }

    #[test]
    fn test_no_rooms_open_ended_walls() {
        // Three walls forming an open U-shape -- no enclosed room
        let walls = vec![
            make_wall_tuple("w1", [0.0, 0.0], [4.0, 0.0]),
            make_wall_tuple("w2", [0.0, 0.0], [0.0, 3.0]),
            make_wall_tuple("w3", [4.0, 0.0], [4.0, 3.0]),
        ];
        let rooms = detect_rooms(&walls);
        assert!(rooms.is_empty());
    }

    #[test]
    fn test_no_rooms_single_wall() {
        let walls = vec![make_wall_tuple("w1", [0.0, 0.0], [4.0, 0.0])];
        let rooms = detect_rooms(&walls);
        assert!(rooms.is_empty());
    }

    #[test]
    fn test_no_rooms_empty() {
        let rooms = detect_rooms(&[]);
        assert!(rooms.is_empty());
    }

    #[test]
    fn test_degenerate_wall_ignored() {
        // A zero-length wall among normal walls forming a rectangle
        let walls = vec![
            make_wall_tuple("w1", [0.0, 0.0], [4.0, 0.0]),
            make_wall_tuple("w2", [4.0, 0.0], [4.0, 3.0]),
            make_wall_tuple("w3", [4.0, 3.0], [0.0, 3.0]),
            make_wall_tuple("w4", [0.0, 3.0], [0.0, 0.0]),
            make_wall_tuple("degen", [2.0, 2.0], [2.0, 2.0]), // zero-length
        ];
        let rooms = detect_rooms(&walls);
        assert_eq!(rooms.len(), 1);
        assert!((rooms[0].area - 12.0).abs() < 0.1);
    }

    #[test]
    fn test_room_has_ccw_winding() {
        let walls = vec![
            make_wall_tuple("w1", [0.0, 0.0], [2.0, 0.0]),
            make_wall_tuple("w2", [2.0, 0.0], [2.0, 2.0]),
            make_wall_tuple("w3", [2.0, 2.0], [0.0, 2.0]),
            make_wall_tuple("w4", [0.0, 2.0], [0.0, 0.0]),
        ];
        let rooms = detect_rooms(&walls);
        assert_eq!(rooms.len(), 1);
        // CCW winding means positive signed area
        let sa = signed_area(&rooms[0].boundary);
        assert!(sa > 0.0);
    }

    #[test]
    fn test_centroid_computed_correctly() {
        let walls = vec![
            make_wall_tuple("w1", [0.0, 0.0], [4.0, 0.0]),
            make_wall_tuple("w2", [4.0, 0.0], [4.0, 2.0]),
            make_wall_tuple("w3", [4.0, 2.0], [0.0, 2.0]),
            make_wall_tuple("w4", [0.0, 2.0], [0.0, 0.0]),
        ];
        let rooms = detect_rooms(&walls);
        assert_eq!(rooms.len(), 1);
        assert!((rooms[0].centroid[0] - 2.0).abs() < 0.1);
        assert!((rooms[0].centroid[1] - 1.0).abs() < 0.1);
    }

    #[test]
    fn test_three_rooms_grid() {
        // 3-room grid: 3 rooms in a row
        // (0,0)--(2,0)--(4,0)--(6,0)
        //   |      |      |      |
        // (0,2)--(2,2)--(4,2)--(6,2)
        let walls = vec![
            // Bottom
            make_wall_tuple("b1", [0.0, 0.0], [2.0, 0.0]),
            make_wall_tuple("b2", [2.0, 0.0], [4.0, 0.0]),
            make_wall_tuple("b3", [4.0, 0.0], [6.0, 0.0]),
            // Top
            make_wall_tuple("t1", [0.0, 2.0], [2.0, 2.0]),
            make_wall_tuple("t2", [2.0, 2.0], [4.0, 2.0]),
            make_wall_tuple("t3", [4.0, 2.0], [6.0, 2.0]),
            // Left
            make_wall_tuple("l", [0.0, 0.0], [0.0, 2.0]),
            // Right
            make_wall_tuple("r", [6.0, 0.0], [6.0, 2.0]),
            // Dividers
            make_wall_tuple("d1", [2.0, 0.0], [2.0, 2.0]),
            make_wall_tuple("d2", [4.0, 0.0], [4.0, 2.0]),
        ];
        let rooms = detect_rooms(&walls);
        assert_eq!(rooms.len(), 3);
        for room in &rooms {
            assert!((room.area - 4.0).abs() < 0.1);
        }
    }
}
