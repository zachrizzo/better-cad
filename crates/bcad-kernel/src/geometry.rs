//! Geometry primitives and construction helpers.
//!
//! This module wraps Truck geometry types and provides
//! ergonomic constructors for boxes, cylinders, spheres, etc.

use crate::topology::Solid;
use truck_modeling::{builder, Point3, Vector3};

/// Creates a B-Rep box solid with the given dimensions.
///
/// The box is axis-aligned with one corner at the origin:
///   - X spans `[0, width]`
///   - Y spans `[0, height]`
///   - Z spans `[0, depth]`
///
/// This follows the Truck `tsweep` pattern:
///   vertex -> edge -> face -> solid
pub fn create_box(width: f64, height: f64, depth: f64) -> Result<Solid, crate::error::KernelError> {
    if width <= 0.0 || height <= 0.0 || depth <= 0.0 {
        return Err(crate::error::KernelError::TopologyError(
            "box dimensions must be positive".into(),
        ));
    }

    // Start with a vertex at the origin
    let v = builder::vertex(Point3::new(0.0, 0.0, 0.0));
    // Sweep along X to get an edge
    let edge = builder::tsweep(&v, Vector3::new(width, 0.0, 0.0));
    // Sweep the edge along Y to get a face
    let face = builder::tsweep(&edge, Vector3::new(0.0, height, 0.0));
    // Sweep the face along Z to get a solid
    let solid: Solid = builder::tsweep(&face, Vector3::new(0.0, 0.0, depth));
    Ok(solid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_box_succeeds() {
        let solid = create_box(1.0, 1.0, 1.0);
        assert!(solid.is_ok());
    }

    #[test]
    fn test_create_box_has_six_faces() {
        let solid = create_box(1.0, 1.0, 1.0).unwrap();
        // A box should have exactly 1 boundary shell with 6 faces
        assert_eq!(solid.boundaries().len(), 1);
        assert_eq!(solid.boundaries()[0].len(), 6);
    }

    #[test]
    fn test_create_box_non_unit() {
        let solid = create_box(2.0, 3.0, 4.0).unwrap();
        assert_eq!(solid.boundaries()[0].len(), 6);
    }

    #[test]
    fn test_create_box_rejects_zero_dimensions() {
        assert!(create_box(0.0, 1.0, 1.0).is_err());
        assert!(create_box(1.0, 0.0, 1.0).is_err());
        assert!(create_box(1.0, 1.0, 0.0).is_err());
    }

    #[test]
    fn test_create_box_rejects_negative_dimensions() {
        assert!(create_box(-1.0, 1.0, 1.0).is_err());
    }
}
