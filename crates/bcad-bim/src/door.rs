//! Door element mesh generation.

use bcad_domain::{DoorElement, DoorHardwareType, DoorStyle, WallElement};
use bcad_kernel::error::KernelError;
use bcad_kernel::tessellation::TessellatedMesh;

use crate::{
    centered_hardware_base, combine_meshes, mirrored_feature_pair, offset_along,
    oriented_prism_mesh, INSERT_FACE_OVERHANG,
};

const DOOR_HANDLE_EDGE_CLEARANCE: f64 = 0.10;
const DOOR_HANDLE_PROTRUSION: f64 = 0.035;
const DOOR_HANDLE_CENTER_HEIGHT: f64 = 1.0;
const DOOR_DOUBLE_GAP: f64 = 0.03;
const DOOR_PANEL_FACE_DEPTH: f64 = 0.012;
const DOOR_PANEL_STILE_WIDTH: f64 = 0.10;
const DOOR_PANEL_RAIL_HEIGHT: f64 = 0.18;

/// Input for door mesh generation, bundling the door with its host wall.
pub struct DoorGeometryInput<'a> {
    pub door: &'a DoorElement,
    pub host_wall: &'a WallElement,
}

/// Produce a mesh for a door leaf (thin slab) positioned along the host wall.
pub fn door_mesh(input: &DoorGeometryInput) -> Result<TessellatedMesh, KernelError> {
    let door = input.door;
    let wall = input.host_wall;

    let geom = wall
        .geometry()
        .ok_or_else(|| KernelError::TopologyError("host wall has zero length".into()))?;

    let center = wall.point_along(door.position_along_wall);
    let axis_u = geom.axis_u;
    let axis_v = geom.axis_v;

    // Make the insert slightly proud of the host wall faces so it remains
    // visible in the native renderer until true wall openings are cut.
    let door_thickness = wall.thickness + INSERT_FACE_OVERHANG * 2.0;

    let mut meshes = door_style_meshes(door, center, axis_u, axis_v, door_thickness)?;
    meshes.extend(door_hardware_meshes(
        door,
        center,
        axis_u,
        axis_v,
        door_thickness,
    )?);

    combine_meshes(&meshes).ok_or_else(|| KernelError::TopologyError("door mesh is empty".into()))
}

fn door_style_meshes(
    door: &DoorElement,
    center: [f64; 2],
    axis_u: [f64; 2],
    axis_v: [f64; 2],
    door_thickness: f64,
) -> Result<Vec<TessellatedMesh>, KernelError> {
    match door.style {
        DoorStyle::Flush => Ok(vec![oriented_prism_mesh(
            center,
            axis_u,
            axis_v,
            door.width,
            door_thickness,
            door.height,
            0.0,
        )?]),
        DoorStyle::Double => {
            let gap = DOOR_DOUBLE_GAP.min((door.width * 0.25).max(0.0));
            let leaf_width = ((door.width - gap).max(0.1)) * 0.5;
            let leaf_offset = leaf_width * 0.5 + gap * 0.5;
            Ok(vec![
                oriented_prism_mesh(
                    offset_along(center, axis_u, -leaf_offset),
                    axis_u,
                    axis_v,
                    leaf_width,
                    door_thickness,
                    door.height,
                    0.0,
                )?,
                oriented_prism_mesh(
                    offset_along(center, axis_u, leaf_offset),
                    axis_u,
                    axis_v,
                    leaf_width,
                    door_thickness,
                    door.height,
                    0.0,
                )?,
            ])
        }
        DoorStyle::Panel => {
            let mut meshes = vec![oriented_prism_mesh(
                center,
                axis_u,
                axis_v,
                door.width,
                door_thickness,
                door.height,
                0.0,
            )?];

            let stile_height = (door.height - 0.30).max(0.2);
            let stile_base = centered_hardware_base(door.height, door.height * 0.5, stile_height);
            let stile_offset = (door.width * 0.5 - DOOR_PANEL_STILE_WIDTH).max(0.0);
            for sign in [-1.0, 1.0] {
                meshes.extend(mirrored_feature_pair(
                    offset_along(center, axis_u, sign * stile_offset),
                    axis_u,
                    axis_v,
                    door_thickness,
                    DOOR_PANEL_STILE_WIDTH,
                    DOOR_PANEL_FACE_DEPTH,
                    stile_height,
                    stile_base,
                )?);
            }

            let rail_width = (door.width - DOOR_PANEL_STILE_WIDTH * 2.4).max(0.12);
            let lower_rail_base = 0.18_f64.min((door.height - DOOR_PANEL_RAIL_HEIGHT).max(0.0));
            let upper_rail_base =
                (door.height - DOOR_PANEL_RAIL_HEIGHT - 0.18).max(lower_rail_base);
            for rail_base in [lower_rail_base, upper_rail_base] {
                meshes.extend(mirrored_feature_pair(
                    center,
                    axis_u,
                    axis_v,
                    door_thickness,
                    rail_width,
                    DOOR_PANEL_FACE_DEPTH,
                    DOOR_PANEL_RAIL_HEIGHT,
                    rail_base,
                )?);
            }

            Ok(meshes)
        }
    }
}

fn door_hardware_meshes(
    door: &DoorElement,
    center: [f64; 2],
    axis_u: [f64; 2],
    axis_v: [f64; 2],
    door_thickness: f64,
) -> Result<Vec<TessellatedMesh>, KernelError> {
    let latch_offset = if matches!(door.style, DoorStyle::Double) {
        0.0
    } else {
        let sign = if door.swing.hinge_on_start() {
            1.0
        } else {
            -1.0
        };
        (door.width * 0.5 - DOOR_HANDLE_EDGE_CLEARANCE).max(0.0) * sign
    };
    let latch_center = offset_along(center, axis_u, latch_offset);

    match door.hardware_type {
        DoorHardwareType::None => Ok(Vec::new()),
        DoorHardwareType::Knob => mirrored_feature_pair(
            latch_center,
            axis_u,
            axis_v,
            door_thickness,
            0.045,
            DOOR_HANDLE_PROTRUSION.max(0.03),
            0.045,
            centered_hardware_base(door.height, DOOR_HANDLE_CENTER_HEIGHT, 0.045),
        ),
        DoorHardwareType::Lever => mirrored_feature_pair(
            latch_center,
            axis_u,
            axis_v,
            door_thickness,
            0.12,
            DOOR_HANDLE_PROTRUSION.max(0.025),
            0.025,
            centered_hardware_base(door.height, DOOR_HANDLE_CENTER_HEIGHT, 0.025),
        ),
        DoorHardwareType::PullBar => mirrored_feature_pair(
            latch_center,
            axis_u,
            axis_v,
            door_thickness,
            0.03,
            DOOR_HANDLE_PROTRUSION.max(0.03),
            0.45,
            centered_hardware_base(door.height, DOOR_HANDLE_CENTER_HEIGHT, 0.45),
        ),
    }
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
            arc: None,
            arc_segments: 24,
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
            swing: DoorSwing::OutRight,
            hardware_type: DoorHardwareType::Lever,
            style: DoorStyle::Flush,
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

    #[test]
    fn test_door_mesh_protrudes_past_wall_faces_for_visibility() {
        let wall = test_wall();
        let door = test_door(&wall.meta.id);
        let input = DoorGeometryInput {
            door: &door,
            host_wall: &wall,
        };

        let mesh = door_mesh(&input).unwrap();
        let mut min_y = f32::INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        for vertex in mesh.positions.chunks_exact(3) {
            min_y = min_y.min(vertex[1]);
            max_y = max_y.max(vertex[1]);
        }

        let half_wall_thickness = wall.thickness as f32 * 0.5;
        assert!(min_y < -half_wall_thickness);
        assert!(max_y > half_wall_thickness);
    }

    #[test]
    fn test_door_hardware_adds_extra_geometry() {
        let wall = test_wall();
        let mut door = test_door(&wall.meta.id);
        let without_hardware = door_mesh(&DoorGeometryInput {
            door: &DoorElement {
                hardware_type: DoorHardwareType::None,
                ..door.clone()
            },
            host_wall: &wall,
        })
        .unwrap();

        door.hardware_type = DoorHardwareType::PullBar;
        let with_hardware = door_mesh(&DoorGeometryInput {
            door: &door,
            host_wall: &wall,
        })
        .unwrap();

        assert!(with_hardware.positions.len() > without_hardware.positions.len());
        assert!(with_hardware.indices.len() > without_hardware.indices.len());
    }

    #[test]
    fn test_door_styles_produce_distinct_meshes() {
        let wall = test_wall();
        let mut panel_door = test_door(&wall.meta.id);
        panel_door.style = DoorStyle::Panel;
        let panel_mesh = door_mesh(&DoorGeometryInput {
            door: &panel_door,
            host_wall: &wall,
        })
        .unwrap();

        let mut double_door = test_door(&wall.meta.id);
        double_door.style = DoorStyle::Double;
        let double_mesh = door_mesh(&DoorGeometryInput {
            door: &double_door,
            host_wall: &wall,
        })
        .unwrap();

        let flush_mesh = door_mesh(&DoorGeometryInput {
            door: &test_door(&wall.meta.id),
            host_wall: &wall,
        })
        .unwrap();

        assert!(panel_mesh.positions.len() > flush_mesh.positions.len());
        assert_ne!(double_mesh.positions.len(), flush_mesh.positions.len());
    }
}
