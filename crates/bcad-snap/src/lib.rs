//! # bcad-snap
//!
//! Spatial-indexed snap engine for BetterCAD.
//!
//! This crate provides the core snap infrastructure that tools use to find
//! nearby geometric features (endpoints, midpoints, centers, intersections,
//! etc.) and snap the cursor to them during interactive drawing.
//!
//! ## Architecture
//!
//! - **`snap_types`**: Core types (`SnapType`, `SnapCandidate`, `SnapResult`,
//!   `SnapModeFilter`).
//! - **`spatial_hash`**: Grid-based spatial index for O(1) average-case
//!   nearest-neighbor queries.
//! - **`snap_collector`**: Extracts snap candidates from `bcad-domain` element
//!   types, mirroring the logic in the TypeScript `usePlanSnapPoints` hook.
//! - **`snap_engine`**: The high-level `SnapEngine` that tools interact with.
//! - **`grid_snap`**: Grid snapping (quantize to grid intersections).
//! - **`ray_cast`**: Coordinate projection (screen to plan-space) for both
//!   perspective and orthographic cameras.

pub mod grid_snap;
pub mod ray_cast;
pub mod snap_collector;
pub mod snap_engine;
pub mod snap_types;
pub mod spatial_hash;

// Re-export the primary public types for convenience.
pub use grid_snap::{nearest_grid_point, snap_to_grid};
pub use ray_cast::{ray_plane_intersection, screen_to_plan, screen_to_plan_ortho};
pub use snap_collector::{collect_all_snaps, collect_element_snaps};
pub use snap_engine::SnapEngine;
pub use snap_types::{SnapCandidate, SnapModeFilter, SnapResult, SnapType};
pub use spatial_hash::SpatialHashGrid;
