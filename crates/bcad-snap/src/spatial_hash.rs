use std::collections::HashMap;

use crate::snap_types::{SnapCandidate, SnapModeFilter, SnapResult};

/// A spatial hash grid for efficient nearest-neighbor queries.
///
/// Candidates are bucketed into cells of `cell_size` in each dimension.
/// Querying for the nearest candidate within a radius only examines the
/// cells that overlap the search circle, yielding O(1) average-case
/// performance when candidates are distributed across many cells.
#[derive(Debug)]
pub struct SpatialHashGrid {
    cell_size: f64,
    inv_cell_size: f64,
    cells: HashMap<(i32, i32), Vec<usize>>,
    candidates: Vec<SnapCandidate>,
}

impl SpatialHashGrid {
    /// Create a new empty spatial hash grid with the given cell size.
    ///
    /// A good default cell size is the snap radius so that a radius query
    /// touches at most 9 cells (a 3x3 neighbourhood).
    pub fn new(cell_size: f64) -> Self {
        let cell_size = if cell_size <= 0.0 { 1.0 } else { cell_size };
        Self {
            cell_size,
            inv_cell_size: 1.0 / cell_size,
            cells: HashMap::new(),
            candidates: Vec::new(),
        }
    }

    /// Insert a candidate into the grid. Returns its index.
    pub fn insert(&mut self, candidate: SnapCandidate) -> usize {
        let idx = self.candidates.len();
        let cell = self.cell_coords(candidate.point);
        self.cells.entry(cell).or_default().push(idx);
        self.candidates.push(candidate);
        idx
    }

    /// Remove all candidates and clear the grid.
    pub fn clear(&mut self) {
        self.cells.clear();
        self.candidates.clear();
    }

    /// Bulk-insert a slice of candidates, replacing any existing contents.
    pub fn rebuild(&mut self, candidates: Vec<SnapCandidate>) {
        self.clear();
        for candidate in candidates {
            self.insert(candidate);
        }
    }

    /// Find the nearest candidate to `point` within `radius` that passes
    /// the snap mode filter. Returns `None` if no candidate is found.
    pub fn query_nearest(
        &self,
        point: [f64; 2],
        radius: f64,
        filter: &SnapModeFilter,
    ) -> Option<SnapResult> {
        let radius_sq = radius * radius;
        let (min_cx, min_cy) = self.cell_coords([point[0] - radius, point[1] - radius]);
        let (max_cx, max_cy) = self.cell_coords([point[0] + radius, point[1] + radius]);

        let mut best_dist_sq = f64::INFINITY;
        let mut best_priority = f64::INFINITY;
        let mut best_idx: Option<usize> = None;

        for cx in min_cx..=max_cx {
            for cy in min_cy..=max_cy {
                if let Some(indices) = self.cells.get(&(cx, cy)) {
                    for &idx in indices {
                        let candidate = &self.candidates[idx];

                        // Skip if filtered out
                        if !filter.is_enabled(candidate.snap_type) {
                            continue;
                        }

                        let dx = point[0] - candidate.point[0];
                        let dy = point[1] - candidate.point[1];
                        let dist_sq = dx * dx + dy * dy;

                        if dist_sq > radius_sq {
                            continue;
                        }

                        // Prefer closer candidates; break ties by priority
                        let dominated = match best_idx {
                            None => true,
                            Some(_) => {
                                dist_sq < best_dist_sq
                                    || (dist_sq == best_dist_sq
                                        && candidate.priority < best_priority)
                            }
                        };

                        if dominated {
                            best_dist_sq = dist_sq;
                            best_priority = candidate.priority;
                            best_idx = Some(idx);
                        }
                    }
                }
            }
        }

        best_idx.map(|idx| {
            let candidate = &self.candidates[idx];
            SnapResult {
                point: candidate.point,
                snap_type: candidate.snap_type,
                source_element_id: candidate.source_element_id.clone(),
                distance: best_dist_sq.sqrt(),
            }
        })
    }

    /// Return all candidates within `radius` of `point` (ignoring filter).
    pub fn query_all_in_radius(&self, point: [f64; 2], radius: f64) -> Vec<&SnapCandidate> {
        let radius_sq = radius * radius;
        let (min_cx, min_cy) = self.cell_coords([point[0] - radius, point[1] - radius]);
        let (max_cx, max_cy) = self.cell_coords([point[0] + radius, point[1] + radius]);

        let mut result = Vec::new();

        for cx in min_cx..=max_cx {
            for cy in min_cy..=max_cy {
                if let Some(indices) = self.cells.get(&(cx, cy)) {
                    for &idx in indices {
                        let candidate = &self.candidates[idx];
                        let dx = point[0] - candidate.point[0];
                        let dy = point[1] - candidate.point[1];
                        let dist_sq = dx * dx + dy * dy;

                        if dist_sq <= radius_sq {
                            result.push(candidate);
                        }
                    }
                }
            }
        }

        result
    }

    /// Number of candidates currently stored.
    pub fn len(&self) -> usize {
        self.candidates.len()
    }

    /// Whether the grid is empty.
    pub fn is_empty(&self) -> bool {
        self.candidates.is_empty()
    }

    /// Get the cell size of this grid.
    pub fn cell_size(&self) -> f64 {
        self.cell_size
    }

    /// Get a reference to all stored candidates.
    pub fn candidates(&self) -> &[SnapCandidate] {
        &self.candidates
    }

    // ---- internal helpers ----

    fn cell_coords(&self, point: [f64; 2]) -> (i32, i32) {
        let cx = (point[0] * self.inv_cell_size).floor() as i32;
        let cy = (point[1] * self.inv_cell_size).floor() as i32;
        (cx, cy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snap_types::{snap_type_priority, SnapType};

    fn make_candidate(x: f64, y: f64, snap_type: SnapType) -> SnapCandidate {
        SnapCandidate {
            point: [x, y],
            snap_type,
            source_element_id: None,
            priority: snap_type_priority(snap_type),
        }
    }

    #[test]
    fn test_insert_and_query_nearest() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(0.0, 0.0, SnapType::Endpoint));
        grid.insert(make_candidate(2.0, 0.0, SnapType::Midpoint));
        grid.insert(make_candidate(5.0, 5.0, SnapType::Center));

        let filter = SnapModeFilter::all_enabled();

        // Should find (0,0) as nearest to (0.1, 0.1)
        let result = grid.query_nearest([0.1, 0.1], 0.5, &filter);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.point, [0.0, 0.0]);
        assert_eq!(r.snap_type, SnapType::Endpoint);
        assert!(r.distance < 0.2);

        // Should find (2,0) as nearest to (1.9, 0.0)
        let result = grid.query_nearest([1.9, 0.0], 0.5, &filter);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.point, [2.0, 0.0]);
        assert_eq!(r.snap_type, SnapType::Midpoint);
    }

    #[test]
    fn test_empty_grid_returns_none() {
        let grid = SpatialHashGrid::new(1.0);
        let filter = SnapModeFilter::all_enabled();
        let result = grid.query_nearest([0.0, 0.0], 10.0, &filter);
        assert!(result.is_none());
    }

    #[test]
    fn test_filter_excludes_types() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(0.0, 0.0, SnapType::Endpoint));
        grid.insert(make_candidate(0.5, 0.0, SnapType::Midpoint));

        let mut filter = SnapModeFilter::none_enabled();
        filter.midpoint = true; // Only midpoints enabled

        let result = grid.query_nearest([0.1, 0.0], 1.0, &filter);
        assert!(result.is_some());
        let r = result.unwrap();
        // Should skip the closer Endpoint and find the Midpoint
        assert_eq!(r.snap_type, SnapType::Midpoint);
        assert_eq!(r.point, [0.5, 0.0]);
    }

    #[test]
    fn test_outside_radius_returns_none() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(10.0, 10.0, SnapType::Endpoint));

        let filter = SnapModeFilter::all_enabled();
        let result = grid.query_nearest([0.0, 0.0], 1.0, &filter);
        assert!(result.is_none());
    }

    #[test]
    fn test_multiple_candidates_same_cell() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(0.3, 0.3, SnapType::Midpoint));
        grid.insert(make_candidate(0.1, 0.1, SnapType::Endpoint));
        grid.insert(make_candidate(0.5, 0.5, SnapType::Center));

        let filter = SnapModeFilter::all_enabled();
        let result = grid.query_nearest([0.0, 0.0], 1.0, &filter);
        assert!(result.is_some());
        let r = result.unwrap();
        // (0.1, 0.1) is the closest
        assert_eq!(r.point, [0.1, 0.1]);
        assert_eq!(r.snap_type, SnapType::Endpoint);
    }

    #[test]
    fn test_query_all_in_radius() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(0.0, 0.0, SnapType::Endpoint));
        grid.insert(make_candidate(0.5, 0.0, SnapType::Midpoint));
        grid.insert(make_candidate(10.0, 10.0, SnapType::Center));

        let results = grid.query_all_in_radius([0.0, 0.0], 1.0);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_clear_removes_all() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(0.0, 0.0, SnapType::Endpoint));
        assert_eq!(grid.len(), 1);
        grid.clear();
        assert_eq!(grid.len(), 0);
        assert!(grid.is_empty());
    }

    #[test]
    fn test_rebuild_replaces_contents() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(0.0, 0.0, SnapType::Endpoint));

        grid.rebuild(vec![
            make_candidate(5.0, 5.0, SnapType::Center),
            make_candidate(6.0, 6.0, SnapType::Midpoint),
        ]);

        assert_eq!(grid.len(), 2);
        let filter = SnapModeFilter::all_enabled();
        let result = grid.query_nearest([0.0, 0.0], 1.0, &filter);
        assert!(result.is_none()); // old point is gone
    }

    #[test]
    fn test_priority_breaks_ties() {
        let mut grid = SpatialHashGrid::new(1.0);
        // Place two candidates at the exact same point
        grid.insert(make_candidate(1.0, 1.0, SnapType::Nearest)); // priority 5
        grid.insert(make_candidate(1.0, 1.0, SnapType::Endpoint)); // priority 0

        let filter = SnapModeFilter::all_enabled();
        let result = grid.query_nearest([1.0, 1.0], 0.5, &filter);
        assert!(result.is_some());
        // Endpoint has lower (better) priority
        assert_eq!(result.unwrap().snap_type, SnapType::Endpoint);
    }

    #[test]
    fn test_negative_coordinates() {
        let mut grid = SpatialHashGrid::new(1.0);
        grid.insert(make_candidate(-3.5, -2.5, SnapType::Endpoint));
        grid.insert(make_candidate(-3.0, -2.0, SnapType::Midpoint));

        let filter = SnapModeFilter::all_enabled();
        let result = grid.query_nearest([-3.4, -2.4], 0.5, &filter);
        assert!(result.is_some());
        assert_eq!(result.unwrap().point, [-3.5, -2.5]);
    }
}
