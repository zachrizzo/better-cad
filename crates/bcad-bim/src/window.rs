//! Window element mesh generation.

use bcad_domain::{WallElement, WindowElement};
use bcad_kernel::{
    error::KernelError,
    geometry::extrude_sketch_points,
    tessellation::{tessellate, TessellatedMesh},
};

/// Input for window mesh generation, bundling the window with its host wall.
pub struct WindowGeometryInput<'a> {
    pub window: &'a WindowElement,
    pub host_wall: &'a WallElement,
}

/// Produce a mesh for a window (thin glass pane approximation) positioned along the host wall.
pub fn window_mesh(input: &WindowGeometryInput) -> Result<TessellatedMesh, KernelError> {
    let window = input.window;
    let wall = input.host_wall;

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
    let nx = -uy;
    let ny = ux;

    let center_dist = window.position_along_wall * wall_len;
    let cx = wall.start[0] + ux * center_dist;
    let cy = wall.start[1] + uy * center_dist;

    // Simple window: just a thin slab (glass pane approximation)
    let hw = window.width * 0.5;
    let ht = wall.thickness * 0.5;

    let pane_points = vec![
        (cx - ux * hw + nx * ht, cy - uy * hw + ny * ht),
        (cx + ux * hw + nx * ht, cy + uy * hw + ny * ht),
        (cx + ux * hw - nx * ht, cy + uy * hw - ny * ht),
        (cx - ux * hw - nx * ht, cy - uy * hw - ny * ht),
    ];

    let solid = extrude_sketch_points(&pane_points, window.height)?;
    tessellate(&solid)
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
}
