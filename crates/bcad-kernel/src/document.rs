//! Project / document model.
//!
//! Top-level data structure representing a BetterCAD project
//! with its scene graph, metadata, and settings.

use serde::{Deserialize, Serialize};

/// Top-level project metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// Project name.
    pub name: String,
    /// Unit system (e.g. "mm", "m", "in", "ft").
    pub units: String,
}
