//! The main snap engine that tools use to query snap candidates.
//!
//! The engine owns a [`SpatialHashGrid`] and provides methods to rebuild the
//! index from document elements and to query for the nearest snap candidate.

use bcad_domain::Element;

use crate::snap_collector::{collect_all_snaps, collect_element_snaps};
use crate::snap_types::{SnapModeFilter, SnapResult};
use crate::spatial_hash::SpatialHashGrid;

/// The snap engine holds all candidates in a spatial index and provides fast
/// nearest-neighbor queries for the tool system.
pub struct SnapEngine {
    grid: SpatialHashGrid,
    snap_radius: f64,
}

impl SnapEngine {
    /// Create a new snap engine.
    ///
    /// `snap_radius` controls both the default query radius and the spatial
    /// hash cell size. A value of ~0.5 is reasonable for architectural models
    /// measured in meters.
    pub fn new(snap_radius: f64) -> Self {
        let radius = if snap_radius <= 0.0 { 0.5 } else { snap_radius };
        Self {
            grid: SpatialHashGrid::new(radius),
            snap_radius: radius,
        }
    }

    /// Rebuild the snap index from a full set of elements.
    ///
    /// This clears the existing index and re-collects candidates from all
    /// elements, including wall-wall intersection points.
    pub fn rebuild(&mut self, elements: &[Element]) {
        let candidates = collect_all_snaps(elements);
        self.grid.rebuild(candidates);
    }

    /// Incrementally add snap candidates for a single element.
    ///
    /// This does **not** remove old candidates for the same element; for a
    /// true incremental update, call `rebuild` or implement candidate
    /// removal by element ID (future enhancement).
    pub fn update_element(&mut self, element: &Element) {
        let candidates = collect_element_snaps(element);
        for c in candidates {
            self.grid.insert(c);
        }
    }

    /// Find the nearest snap candidate to `cursor` within the engine's snap
    /// radius, subject to the given mode filter.
    pub fn find_nearest(&self, cursor: [f64; 2], filter: &SnapModeFilter) -> Option<SnapResult> {
        self.grid.query_nearest(cursor, self.snap_radius, filter)
    }

    /// Find the nearest snap candidate to `cursor` within a custom radius,
    /// subject to the given mode filter.
    pub fn find_nearest_with_radius(
        &self,
        cursor: [f64; 2],
        radius: f64,
        filter: &SnapModeFilter,
    ) -> Option<SnapResult> {
        self.grid.query_nearest(cursor, radius, filter)
    }

    /// Find the nearest snap candidate that originated from a specific element.
    ///
    /// Searches all candidates within the snap radius and returns the closest
    /// one whose `source_element_id` matches.
    pub fn find_nearest_on_element(
        &self,
        cursor: [f64; 2],
        element_id: &str,
    ) -> Option<SnapResult> {
        let nearby = self.grid.query_all_in_radius(cursor, self.snap_radius);

        let mut best_dist_sq = f64::INFINITY;
        let mut best = None;

        for candidate in nearby {
            if candidate.source_element_id.as_deref() != Some(element_id) {
                continue;
            }

            let dx = cursor[0] - candidate.point[0];
            let dy = cursor[1] - candidate.point[1];
            let dist_sq = dx * dx + dy * dy;

            if dist_sq < best_dist_sq {
                best_dist_sq = dist_sq;
                best = Some(SnapResult {
                    point: candidate.point,
                    snap_type: candidate.snap_type,
                    source_element_id: candidate.source_element_id.clone(),
                    distance: dist_sq.sqrt(),
                });
            }
        }

        best
    }

    /// Get the snap radius.
    pub fn snap_radius(&self) -> f64 {
        self.snap_radius
    }

    /// Set a new snap radius. This also resizes the spatial hash cells.
    /// You should call `rebuild` after changing the radius if there are
    /// existing candidates, since the cell size affects spatial hashing.
    pub fn set_snap_radius(&mut self, radius: f64) {
        let radius = if radius <= 0.0 { 0.5 } else { radius };
        self.snap_radius = radius;
        // Rebuild the spatial hash with new cell size
        let candidates: Vec<_> = self.grid.candidates().to_vec();
        self.grid = SpatialHashGrid::new(radius);
        self.grid.rebuild(candidates);
    }

    /// Number of candidates in the index.
    pub fn candidate_count(&self) -> usize {
        self.grid.len()
    }

    /// Whether the index is empty.
    pub fn is_empty(&self) -> bool {
        self.grid.is_empty()
    }

    /// Clear all candidates.
    pub fn clear(&mut self) {
        self.grid.clear();
    }

    /// Return all candidates currently indexed in the engine.
    ///
    /// This is useful for building a full `SnapContext` that tools can query
    /// using their own threshold and filter logic.
    pub fn all_candidates(&self) -> &[crate::snap_types::SnapCandidate] {
        self.grid.candidates()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::{ColumnElement, Element, ElementMeta, WallElement};

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

    fn sample_elements() -> Vec<Element> {
        vec![
            Element::Wall(WallElement {
                meta: make_meta("w1"),
                start: [0.0, 0.0],
                end: [4.0, 0.0],
                height: 3.0,
                thickness: 0.2,
                arc: None,
                arc_segments: 24,
            }),
            Element::Column(ColumnElement {
                meta: make_meta("c1"),
                center: [2.0, 2.0],
                width: 0.4,
                depth: 0.4,
                height: 3.0,
                diameter: None,
                column_segments: 24,
            }),
        ]
    }

    #[test]
    fn test_rebuild_and_find_nearest() {
        let mut engine = SnapEngine::new(1.0);
        engine.rebuild(&sample_elements());

        let filter = SnapModeFilter::all_enabled();

        // Near wall start
        let result = engine.find_nearest([0.1, 0.0], &filter);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.point, [0.0, 0.0]);

        // Near column center
        let result = engine.find_nearest([2.0, 2.1], &filter);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.point, [2.0, 2.0]);
    }

    #[test]
    fn test_find_nearest_on_element() {
        let mut engine = SnapEngine::new(1.0);
        engine.rebuild(&sample_elements());

        // Query near column center, filtering by column element ID
        let result = engine.find_nearest_on_element([2.0, 2.1], "c1");
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.point, [2.0, 2.0]);
        assert_eq!(r.source_element_id.as_deref(), Some("c1"));

        // Query near column but filter by wall ID - should find wall midpoint (2,0)
        let result = engine.find_nearest_on_element([2.0, 0.5], "w1");
        assert!(result.is_some());
    }

    #[test]
    fn test_empty_engine() {
        let engine = SnapEngine::new(1.0);
        assert!(engine.is_empty());
        assert_eq!(engine.candidate_count(), 0);

        let filter = SnapModeFilter::all_enabled();
        assert!(engine.find_nearest([0.0, 0.0], &filter).is_none());
    }

    #[test]
    fn test_clear() {
        let mut engine = SnapEngine::new(1.0);
        engine.rebuild(&sample_elements());
        assert!(!engine.is_empty());

        engine.clear();
        assert!(engine.is_empty());
    }

    #[test]
    fn test_update_element_adds_candidates() {
        let mut engine = SnapEngine::new(1.0);
        assert!(engine.is_empty());

        let wall = Element::Wall(WallElement {
            meta: make_meta("w2"),
            start: [10.0, 10.0],
            end: [14.0, 10.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        });
        engine.update_element(&wall);
        assert_eq!(engine.candidate_count(), 16); // 3 centerline + 4 corners + 9 edge quarter pts
    }
}
