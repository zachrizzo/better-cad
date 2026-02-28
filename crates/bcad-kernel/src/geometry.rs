//! Geometry primitives and construction helpers.
//!
//! This module will wrap Truck geometry types and provide
//! ergonomic constructors for boxes, cylinders, spheres, etc.

/// Stub: create a box description string.
pub fn create_box(width: f64, height: f64, depth: f64) -> String {
    format!("box_{}x{}x{}", width, height, depth)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_box() {
        assert_eq!(create_box(1.0, 2.0, 3.0), "box_1x2x3");
    }
}
