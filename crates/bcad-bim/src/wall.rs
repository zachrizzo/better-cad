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

impl WallParams {
    /// Convert wall params to a solid using extrude_sketch_points.
    /// The wall is a rectangular cross-section extruded along the wall direction.
    pub fn to_solid(&self) -> Result<bcad_kernel::topology::Solid, bcad_kernel::error::KernelError> {
        // Calculate wall direction and normal
        let dx = self.end[0] - self.start[0];
        let dy = self.end[1] - self.start[1];
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-10 {
            return Err(bcad_kernel::error::KernelError::TopologyError(
                "wall has zero length".into(),
            ));
        }
        // Normal perpendicular to wall direction
        let nx = -dy / len * self.thickness / 2.0;
        let ny = dx / len * self.thickness / 2.0;

        // 4 corners of the wall footprint
        let points = vec![
            (self.start[0] + nx, self.start[1] + ny),
            (self.end[0] + nx, self.end[1] + ny),
            (self.end[0] - nx, self.end[1] - ny),
            (self.start[0] - nx, self.start[1] - ny),
        ];

        bcad_kernel::geometry::extrude_sketch_points(&points, self.height)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wall_to_solid_succeeds() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let solid = wall.to_solid();
        assert!(solid.is_ok());
    }

    #[test]
    fn test_wall_to_solid_has_six_faces() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let solid = wall.to_solid().unwrap();
        assert_eq!(solid.boundaries().len(), 1);
        assert_eq!(solid.boundaries()[0].len(), 6);
    }

    #[test]
    fn test_wall_to_solid_tessellates() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let solid = wall.to_solid().unwrap();
        let mesh = bcad_kernel::tessellation::tessellate(&solid).unwrap();
        assert!(!mesh.indices.is_empty());
        assert!(!mesh.positions.is_empty());
        assert_eq!(mesh.positions.len(), mesh.normals.len());
        assert_eq!(mesh.indices.len() % 3, 0);
    }

    #[test]
    fn test_wall_diagonal() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [3.0, 4.0],
            height: 2.5,
            thickness: 0.15,
        };
        let solid = wall.to_solid();
        assert!(solid.is_ok());
    }

    #[test]
    fn test_wall_zero_length_fails() {
        let wall = WallParams {
            start: [1.0, 1.0],
            end: [1.0, 1.0],
            height: 3.0,
            thickness: 0.2,
        };
        assert!(wall.to_solid().is_err());
    }
}
