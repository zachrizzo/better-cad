//! Camera state replacing `camera-store.ts`.
//!
//! Tracks programmatic camera position, target, revision counter,
//! and an optional viewport screenshot.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraState {
    /// Camera position in world coordinates.
    pub position: [f64; 3],
    /// Camera look-at target in world coordinates.
    pub target: [f64; 3],
    /// Up vector.
    pub up: [f64; 3],
    /// Incremented each time a programmatic camera update is requested.
    pub revision: u64,
    /// Latest viewport screenshot as PNG bytes (runtime-only, not serialized).
    #[serde(skip)]
    pub last_screenshot: Option<Vec<u8>>,
}

impl Default for CameraState {
    fn default() -> Self {
        Self {
            position: [5.0, 5.0, 5.0],
            target: [0.0, 0.0, 0.0],
            up: [0.0, 1.0, 0.0],
            revision: 0,
            last_screenshot: None,
        }
    }
}
