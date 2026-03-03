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

use bcad_kernel::tessellation::TessellatedMesh;

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
