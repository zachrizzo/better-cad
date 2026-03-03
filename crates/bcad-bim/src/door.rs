//! Door element mesh generation.

use bcad_domain::{DoorElement, WallElement};
use bcad_kernel::{
    error::KernelError,
    geometry::extrude_sketch_points,
    tessellation::{tessellate, TessellatedMesh},
};

/// Input for door mesh generation, bundling the door with its host wall.
pub struct DoorGeometryInput<'a> {
    pub door: &'a DoorElement,
    pub host_wall: &'a WallElement,
}

/// Produce a mesh for a door leaf (thin slab) positioned along the host wall.
pub fn door_mesh(input: &DoorGeometryInput) -> Result<TessellatedMesh, KernelError> {
    let door = input.door;
    let wall = input.host_wall;

    // Compute door world position along wall
    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let wall_len = (dx * dx + dy * dy).sqrt();
    if wall_len < 1e-8 {
        return Err(KernelError::TopologyError(
            "host wall has zero length".into(),
        ));
    }
    let ux = dx / wall_len;
    let uy = dy / wall_len;

    let door_center_dist = door.position_along_wall * wall_len;
    let hinge_x = wall.start[0] + ux * door_center_dist;
    let hinge_y = wall.start[1] + uy * door_center_dist;

    // Door leaf: thin slab of door.width x 0.05 x door.height
    let door_thickness = 0.05_f64;
    let hw = door.width * 0.5;
    let ht = door_thickness * 0.5;
    // Normal to wall
    let nx = -uy;
    let ny = ux;

    let leaf_points = vec![
        (hinge_x - ux * hw + nx * ht, hinge_y - uy * hw + ny * ht),
        (hinge_x + ux * hw + nx * ht, hinge_y + uy * hw + ny * ht),
        (hinge_x + ux * hw - nx * ht, hinge_y + uy * hw - ny * ht),
        (hinge_x - ux * hw - nx * ht, hinge_y - uy * hw - ny * ht),
    ];

    let solid = extrude_sketch_points(&leaf_points, door.height)?;
    tessellate(&solid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::{DoorSwing, ElementMeta};

    fn test_wall() -> WallElement {
        WallElement {
            meta: ElementMeta::new("Host Wall"),
            start: [0.0, 0.0],
            end: [6.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        }
    }

    fn test_door(wall_id: &str) -> DoorElement {
        DoorElement {
            meta: ElementMeta::new("Test Door"),
            wall_id: wall_id.to_string(),
            position_along_wall: 0.5,
            width: 0.9,
            height: 2.1,
            sill_height: 0.0,
            swing: DoorSwing::Right,
        }
    }

    #[test]
    fn test_door_mesh_non_empty() {
        let wall = test_wall();
        let door = test_door(&wall.meta.id);
        let input = DoorGeometryInput {
            door: &door,
            host_wall: &wall,
        };
        let mesh = door_mesh(&input).unwrap();
        assert!(!mesh.positions.is_empty());
        assert!(!mesh.normals.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_door_mesh_valid_indices() {
        let wall = test_wall();
        let door = test_door(&wall.meta.id);
        let input = DoorGeometryInput {
            door: &door,
            host_wall: &wall,
        };
        let mesh = door_mesh(&input).unwrap();
        assert_eq!(mesh.indices.len() % 3, 0);
        assert_eq!(mesh.positions.len(), mesh.normals.len());
    }
}
