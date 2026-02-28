//! Wall element for architectural BIM modeling.

use serde::{Deserialize, Serialize};

/// Parameters that define a straight wall segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallParams {
    /// Start point [x, y] on the floor plan.
    pub start: [f64; 2],
    /// End point [x, y] on the floor plan.
    pub end: [f64; 2],
    /// Wall height.
    pub height: f64,
    /// Wall thickness.
    pub thickness: f64,
}
