//! Openings (doors, windows) that cut through walls.
//!
//! An opening references its host wall and defines the cut-out
//! dimensions, sill height, and optional frame/panel geometry.

use serde::{Deserialize, Serialize};

/// Parameters for a door opening in a wall.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoorParams {
    /// ID of the host wall.
    pub wall_id: String,
    /// Position along the wall centerline (0.0 = start, 1.0 = end).
    pub position_along_wall: f64,
    /// Width of the door opening.
    pub width: f64,
    /// Height of the door opening.
    pub height: f64,
    /// Height of the sill above floor (0.0 for doors).
    pub sill_height: f64,
}

/// Parameters for a window opening in a wall.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowParams {
    /// ID of the host wall.
    pub wall_id: String,
    /// Position along the wall centerline (0.0 = start, 1.0 = end).
    pub position_along_wall: f64,
    /// Width of the window opening.
    pub width: f64,
    /// Height of the window opening.
    pub height: f64,
    /// Height of the sill above floor.
    pub sill_height: f64,
}

/// Stub: cut an opening into a wall solid.
///
/// Boolean operations are limited in truck-shapeops 0.4, so this
/// currently delegates to `bcad_kernel::geometry::boolean_cut`
/// which returns the wall unchanged.
pub fn cut_opening(
    wall_solid: bcad_kernel::topology::Solid,
    _opening_box: bcad_kernel::topology::Solid,
) -> Result<bcad_kernel::topology::Solid, bcad_kernel::error::KernelError> {
    bcad_kernel::geometry::boolean_cut(wall_solid, _opening_box)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_door_params_serialize() {
        let door = DoorParams {
            wall_id: "wall-1".into(),
            position_along_wall: 0.5,
            width: 0.9,
            height: 2.1,
            sill_height: 0.0,
        };
        let json = serde_json::to_string(&door).unwrap();
        assert!(json.contains("wall-1"));
    }

    #[test]
    fn test_window_params_serialize() {
        let window = WindowParams {
            wall_id: "wall-1".into(),
            position_along_wall: 0.3,
            width: 1.2,
            height: 1.0,
            sill_height: 0.9,
        };
        let json = serde_json::to_string(&window).unwrap();
        assert!(json.contains("wall-1"));
    }

    #[test]
    fn test_cut_opening_stub() {
        let wall = crate::wall::WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let wall_solid = wall.to_solid().unwrap();
        let tool = bcad_kernel::geometry::create_box(0.9, 2.1, 0.2).unwrap();
        // boolean_cut is not yet implemented — expect an explicit error rather than wrong geometry
        let result = cut_opening(wall_solid, tool);
        assert!(result.is_err());
    }
}
