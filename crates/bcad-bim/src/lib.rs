pub mod beam;
pub mod column;
pub mod door;
pub mod foundation;
pub mod opening;
pub mod plan_view;
pub mod roof;
pub mod section_cut;
pub mod slab;
pub mod wall;
pub mod window;

use bcad_kernel::error::KernelError;
use bcad_kernel::tessellation::TessellatedMesh;

// ---------------------------------------------------------------------------
// Shared mesh helpers used by door, window, wall, and other BIM modules
// ---------------------------------------------------------------------------

/// How far each insert face sits proud of the host wall surface so it
/// remains visible before true wall openings are cut.
pub const INSERT_FACE_OVERHANG: f64 = 0.01;

/// Combine multiple meshes into one, adjusting index offsets.
pub fn combine_meshes(meshes: &[TessellatedMesh]) -> Option<TessellatedMesh> {
    if meshes.is_empty() {
        return None;
    }
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    let mut vertex_offset: u32 = 0;
    for mesh in meshes {
        positions.extend_from_slice(&mesh.positions);
        normals.extend_from_slice(&mesh.normals);
        indices.extend(mesh.indices.iter().map(|idx| idx + vertex_offset));
        vertex_offset += (mesh.positions.len() / 3) as u32;
    }
    Some(TessellatedMesh {
        positions,
        normals,
        indices,
    })
}

/// Translate all vertices in a mesh along the Z axis.
pub fn translate_mesh_z(mesh: &mut TessellatedMesh, offset: f64) {
    if offset.abs() < 1e-9 {
        return;
    }
    for vertex in mesh.positions.chunks_exact_mut(3) {
        vertex[2] += offset as f32;
    }
}

/// Offset a 2D point along a direction vector by distance `t`.
pub fn offset_along(center: [f64; 2], axis: [f64; 2], t: f64) -> [f64; 2] {
    [center[0] + axis[0] * t, center[1] + axis[1] * t]
}

/// Build an axis-aligned prism mesh oriented along arbitrary 2D axes.
///
/// The prism footprint is a rectangle centered at `center` with half-extents
/// `size_u/2` along `axis_u` and `size_v/2` along `axis_v`. It is extruded
/// upward by `height` and shifted vertically by `z_base`.
pub fn oriented_prism_mesh(
    center: [f64; 2],
    axis_u: [f64; 2],
    axis_v: [f64; 2],
    size_u: f64,
    size_v: f64,
    height: f64,
    z_base: f64,
) -> Result<TessellatedMesh, KernelError> {
    let hu = size_u * 0.5;
    let hv = size_v * 0.5;
    let points = vec![
        (
            center[0] - axis_u[0] * hu + axis_v[0] * hv,
            center[1] - axis_u[1] * hu + axis_v[1] * hv,
        ),
        (
            center[0] + axis_u[0] * hu + axis_v[0] * hv,
            center[1] + axis_u[1] * hu + axis_v[1] * hv,
        ),
        (
            center[0] + axis_u[0] * hu - axis_v[0] * hv,
            center[1] + axis_u[1] * hu - axis_v[1] * hv,
        ),
        (
            center[0] - axis_u[0] * hu - axis_v[0] * hv,
            center[1] - axis_u[1] * hu - axis_v[1] * hv,
        ),
    ];

    let solid = bcad_kernel::geometry::extrude_sketch_points(&points, height)?;
    let mut mesh = bcad_kernel::tessellation::tessellate(&solid)?;
    translate_mesh_z(&mut mesh, z_base);
    Ok(mesh)
}

/// Create a pair of features mirrored on either side of a host element.
///
/// Each feature is an `oriented_prism_mesh` offset from the host centerline
/// by `host_depth/2 + feature_depth/2` along `axis_v`.
#[allow(clippy::too_many_arguments)]
pub fn mirrored_feature_pair(
    center: [f64; 2],
    axis_u: [f64; 2],
    axis_v: [f64; 2],
    host_depth: f64,
    size_u: f64,
    feature_depth: f64,
    height: f64,
    z_base: f64,
) -> Result<Vec<TessellatedMesh>, KernelError> {
    let mut meshes = Vec::with_capacity(2);
    let v_offset = host_depth * 0.5 + feature_depth * 0.5;
    for side in [-1.0_f64, 1.0_f64] {
        meshes.push(oriented_prism_mesh(
            offset_along(center, axis_v, side * v_offset),
            axis_u,
            axis_v,
            size_u,
            feature_depth,
            height,
            z_base,
        )?);
    }
    Ok(meshes)
}

/// Compute the Z base offset for hardware centered at a given height.
pub fn centered_hardware_base(max_height: f64, center_height: f64, hardware_height: f64) -> f64 {
    let centered = center_height - hardware_height * 0.5;
    centered.clamp(0.0, (max_height - hardware_height).max(0.0))
}

/// Smoke-test entry point.
pub fn ping() -> &'static str {
    "bcad-bim pong"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(ping(), "bcad-bim pong");
    }
}
