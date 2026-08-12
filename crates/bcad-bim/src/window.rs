//! Window element mesh generation.

use bcad_domain::{WallElement, WindowElement, WindowHardwareType, WindowStyle};
use bcad_kernel::error::KernelError;
use bcad_kernel::tessellation::TessellatedMesh;

use crate::{
    centered_hardware_base, combine_meshes, mirrored_feature_pair, offset_along,
    oriented_prism_mesh, INSERT_FACE_OVERHANG,
};

const WINDOW_HARDWARE_PROTRUSION: f64 = 0.025;
const WINDOW_FRAME_FACE_DEPTH: f64 = 0.014;
const WINDOW_FRAME_WIDTH: f64 = 0.09;
const WINDOW_CENTER_RAIL_HEIGHT: f64 = 0.10;

/// Input for window mesh generation, bundling the window with its host wall.
pub struct WindowGeometryInput<'a> {
    pub window: &'a WindowElement,
    pub host_wall: &'a WallElement,
}

/// Produce a mesh for a window (thin glass pane approximation) positioned along the host wall.
pub fn window_mesh(input: &WindowGeometryInput) -> Result<TessellatedMesh, KernelError> {
    let window = input.window;
    let wall = input.host_wall;

    let geom = wall
        .geometry()
        .ok_or_else(|| KernelError::TopologyError("host wall has zero length".into()))?;

    let center = wall.point_along(window.position_along_wall);
    let axis_u = geom.axis_u;
    let axis_v = geom.axis_v;

    // Make the insert slightly proud of the host wall faces so it remains
    // visible in the native renderer until true wall openings are cut.
    let pane_thickness = wall.thickness + INSERT_FACE_OVERHANG * 2.0;
    let mut meshes = window_style_meshes(window, center, axis_u, axis_v, pane_thickness)?;
    meshes.extend(window_hardware_meshes(
        window,
        center,
        axis_u,
        axis_v,
        pane_thickness,
    )?);

    combine_meshes(&meshes).ok_or_else(|| KernelError::TopologyError("window mesh is empty".into()))
}

fn window_style_meshes(
    window: &WindowElement,
    center: [f64; 2],
    axis_u: [f64; 2],
    axis_v: [f64; 2],
    pane_thickness: f64,
) -> Result<Vec<TessellatedMesh>, KernelError> {
    let mut meshes = vec![oriented_prism_mesh(
        center,
        axis_u,
        axis_v,
        window.width,
        pane_thickness,
        window.height,
        0.0,
    )?];

    if matches!(
        window.style,
        WindowStyle::Casement | WindowStyle::DoubleHung
    ) {
        let stile_height = window.height;
        let stile_offset = (window.width * 0.5 - WINDOW_FRAME_WIDTH * 0.5).max(0.0);
        for sign in [-1.0, 1.0] {
            meshes.extend(mirrored_feature_pair(
                offset_along(center, axis_u, sign * stile_offset),
                axis_u,
                axis_v,
                pane_thickness,
                WINDOW_FRAME_WIDTH,
                WINDOW_FRAME_FACE_DEPTH,
                stile_height,
                0.0,
            )?);
        }
        let rail_width = (window.width - WINDOW_FRAME_WIDTH * 2.0).max(0.12);
        for rail_base in [0.0, (window.height - WINDOW_FRAME_WIDTH).max(0.0)] {
            meshes.extend(mirrored_feature_pair(
                center,
                axis_u,
                axis_v,
                pane_thickness,
                rail_width,
                WINDOW_FRAME_FACE_DEPTH,
                WINDOW_FRAME_WIDTH,
                rail_base,
            )?);
        }
    }

    match window.style {
        WindowStyle::Picture => {}
        WindowStyle::Casement => {
            let muntin_offset = (window.width * 0.18).min((window.width * 0.5 - 0.06).max(0.0));
            meshes.extend(mirrored_feature_pair(
                offset_along(center, axis_u, muntin_offset),
                axis_u,
                axis_v,
                pane_thickness,
                WINDOW_FRAME_WIDTH * 0.75,
                WINDOW_FRAME_FACE_DEPTH,
                (window.height - WINDOW_FRAME_WIDTH * 2.4).max(0.2),
                WINDOW_FRAME_WIDTH * 1.2,
            )?);
        }
        WindowStyle::DoubleHung => {
            meshes.extend(mirrored_feature_pair(
                center,
                axis_u,
                axis_v,
                pane_thickness,
                (window.width - WINDOW_FRAME_WIDTH * 2.2).max(0.12),
                WINDOW_FRAME_FACE_DEPTH,
                WINDOW_CENTER_RAIL_HEIGHT,
                centered_hardware_base(
                    window.height,
                    window.height * 0.5,
                    WINDOW_CENTER_RAIL_HEIGHT,
                ),
            )?);
        }
    }

    Ok(meshes)
}

fn window_hardware_meshes(
    window: &WindowElement,
    center: [f64; 2],
    axis_u: [f64; 2],
    axis_v: [f64; 2],
    pane_thickness: f64,
) -> Result<Vec<TessellatedMesh>, KernelError> {
    match window.hardware_type {
        WindowHardwareType::None => Ok(Vec::new()),
        WindowHardwareType::Latch => mirrored_feature_pair(
            center,
            axis_u,
            axis_v,
            pane_thickness,
            0.12,
            WINDOW_HARDWARE_PROTRUSION.max(0.02),
            0.02,
            centered_hardware_base(
                window.height,
                preferred_window_hardware_center(window.height),
                0.02,
            ),
        ),
        WindowHardwareType::Crank => {
            let crank_offset = (window.width * 0.25).min((window.width * 0.5 - 0.05).max(0.0));
            mirrored_feature_pair(
                offset_along(center, axis_u, crank_offset),
                axis_u,
                axis_v,
                pane_thickness,
                0.03,
                WINDOW_HARDWARE_PROTRUSION.max(0.03),
                0.18,
                centered_hardware_base(
                    window.height,
                    preferred_window_hardware_center(window.height),
                    0.18,
                ),
            )
        }
    }
}

fn preferred_window_hardware_center(window_height: f64) -> f64 {
    (window_height * 0.3).clamp(0.15, (window_height - 0.05).max(0.15))
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::ElementMeta;

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

    fn test_window(wall_id: &str) -> WindowElement {
        WindowElement {
            meta: ElementMeta::new("Test Window"),
            wall_id: wall_id.to_string(),
            position_along_wall: 0.5,
            width: 1.2,
            height: 1.1,
            sill_height: 0.9,
            hardware_type: WindowHardwareType::Latch,
            style: WindowStyle::Picture,
        }
    }

    #[test]
    fn test_window_mesh_non_empty() {
        let wall = test_wall();
        let window = test_window(&wall.meta.id);
        let input = WindowGeometryInput {
            window: &window,
            host_wall: &wall,
        };
        let mesh = window_mesh(&input).unwrap();
        assert!(!mesh.positions.is_empty());
        assert!(!mesh.normals.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_window_mesh_valid_indices() {
        let wall = test_wall();
        let window = test_window(&wall.meta.id);
        let input = WindowGeometryInput {
            window: &window,
            host_wall: &wall,
        };
        let mesh = window_mesh(&input).unwrap();
        assert_eq!(mesh.indices.len() % 3, 0);
        assert_eq!(mesh.positions.len(), mesh.normals.len());
    }

    #[test]
    fn test_window_mesh_protrudes_past_wall_faces_for_visibility() {
        let wall = test_wall();
        let window = test_window(&wall.meta.id);
        let input = WindowGeometryInput {
            window: &window,
            host_wall: &wall,
        };

        let mesh = window_mesh(&input).unwrap();
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
    fn test_window_hardware_adds_extra_geometry() {
        let wall = test_wall();
        let mut window = test_window(&wall.meta.id);
        let without_hardware = window_mesh(&WindowGeometryInput {
            window: &WindowElement {
                hardware_type: WindowHardwareType::None,
                ..window.clone()
            },
            host_wall: &wall,
        })
        .unwrap();

        window.hardware_type = WindowHardwareType::Crank;
        let with_hardware = window_mesh(&WindowGeometryInput {
            window: &window,
            host_wall: &wall,
        })
        .unwrap();

        assert!(with_hardware.positions.len() > without_hardware.positions.len());
        assert!(with_hardware.indices.len() > without_hardware.indices.len());
    }

    #[test]
    fn test_window_styles_produce_distinct_meshes() {
        let wall = test_wall();
        let base_window = test_window(&wall.meta.id);
        let picture_mesh = window_mesh(&WindowGeometryInput {
            window: &base_window,
            host_wall: &wall,
        })
        .unwrap();

        let mut casement_window = base_window.clone();
        casement_window.style = WindowStyle::Casement;
        let casement_mesh = window_mesh(&WindowGeometryInput {
            window: &casement_window,
            host_wall: &wall,
        })
        .unwrap();

        let mut double_hung_window = base_window.clone();
        double_hung_window.style = WindowStyle::DoubleHung;
        let double_hung_mesh = window_mesh(&WindowGeometryInput {
            window: &double_hung_window,
            host_wall: &wall,
        })
        .unwrap();

        assert!(casement_mesh.positions.len() > picture_mesh.positions.len());
        assert!(double_hung_mesh.positions.len() > picture_mesh.positions.len());
    }
}
