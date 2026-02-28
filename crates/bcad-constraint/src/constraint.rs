//! Geometric and dimensional constraint definitions.

use crate::sketch::{LineId, PointId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Constraint {
    Coincident(PointId, PointId),
    Horizontal(LineId),
    Vertical(LineId),
    Distance(PointId, PointId, f64),
    Fixed(PointId, f64, f64),
    Perpendicular(LineId, LineId),
    Parallel(LineId, LineId),
    Angle(LineId, LineId, f64),
}
