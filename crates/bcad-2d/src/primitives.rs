//! Core 2D drawing primitives.
//!
//! These are renderer-agnostic geometric descriptions that symbol generators
//! emit.  A downstream renderer turns them into actual pixels or PDF paths.

use serde::{Deserialize, Serialize};

/// Anchor position for text placement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TextAnchor {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    Center,
    MiddleRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

impl Default for TextAnchor {
    fn default() -> Self {
        Self::Center
    }
}

/// A single geometric primitive that can appear in a 2D plan symbol.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SymbolPrimitive {
    /// An open or closed polyline defined by a sequence of 2D points.
    Polyline { points: Vec<[f64; 2]>, closed: bool },
    /// A full circle.
    Circle { center: [f64; 2], radius: f64 },
    /// A circular arc.
    Arc {
        center: [f64; 2],
        radius: f64,
        start_angle: f64,
        end_angle: f64,
    },
    /// A text label.
    Text {
        position: [f64; 2],
        content: String,
        font_size: f64,
        anchor: TextAnchor,
    },
    /// An axis-aligned filled rectangle.
    FilledRect { min: [f64; 2], max: [f64; 2] },
}

// ---------------------------------------------------------------------------
// Geometry helpers used by symbol generators
// ---------------------------------------------------------------------------

/// Rotate a local-space point by `rotation` radians then translate by `center`.
pub fn rotate_and_translate(point: [f64; 2], center: [f64; 2], rotation: f64) -> [f64; 2] {
    let (s, c) = rotation.sin_cos();
    [
        center[0] + point[0] * c - point[1] * s,
        center[1] + point[0] * s + point[1] * c,
    ]
}

/// Apply [`rotate_and_translate`] to every point in a slice.
pub fn transform_points(points: &[[f64; 2]], center: [f64; 2], rotation: f64) -> Vec<[f64; 2]> {
    points
        .iter()
        .map(|p| rotate_and_translate(*p, center, rotation))
        .collect()
}

/// Generate the four corners of an axis-aligned rectangle centered at the origin.
pub fn rect_points(width: f64, depth: f64) -> [[f64; 2]; 4] {
    let hw = width / 2.0;
    let hd = depth / 2.0;
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
}
