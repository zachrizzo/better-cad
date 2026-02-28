//! Tessellation (triangulation) of B-Rep geometry for rendering.
//!
//! Converts Truck solids into indexed triangle meshes suitable
//! for GPU rendering via Three.js / WebGPU.

use crate::topology::Solid;
use serde::{Deserialize, Serialize};
use truck_meshalgo::prelude::*;

/// A tessellated triangle mesh ready for GPU upload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TessellatedMesh {
    /// Flat array of vertex positions [x, y, z, x, y, z, ...].
    pub positions: Vec<f32>,
    /// Flat array of vertex normals [nx, ny, nz, nx, ny, nz, ...].
    pub normals: Vec<f32>,
    /// Triangle indices into the position/normal arrays.
    pub indices: Vec<u32>,
}

/// Tessellates a Truck B-Rep solid into an indexed triangle mesh.
///
/// `tol` controls the tessellation tolerance -- smaller values produce
/// finer meshes.  A reasonable default is `0.01`.
pub fn tessellate(solid: &Solid) -> Result<TessellatedMesh, crate::error::KernelError> {
    tessellate_with_tolerance(solid, 0.01)
}

/// Tessellates a Truck B-Rep solid with a specified tolerance.
pub fn tessellate_with_tolerance(
    solid: &Solid,
    tol: f64,
) -> Result<TessellatedMesh, crate::error::KernelError> {
    // Tessellate the solid into a polygon mesh via Truck
    let meshed = solid.triangulation(tol);
    let mut polygon = meshed.to_polygon();

    // Add normals and merge coincident vertices so the mesh is watertight
    polygon.put_together_same_attrs(TOLERANCE);
    polygon.add_naive_normals(true);

    // Collect triangle face indices. Truck polygon meshes store faces
    // with StandardVertex which has separate pos/nor indices. We need
    // to expand to a flat per-vertex layout for GPU consumption.
    let expanded = polygon.expands(|attr| {
        let pos = attr.position;
        let nor = attr.normal.unwrap_or(Vector3::new(0.0, 0.0, 1.0));
        (pos, nor)
    });

    let mut flat_positions = Vec::new();
    let mut flat_normals = Vec::new();
    let mut flat_indices = Vec::new();

    for (pos, nor) in expanded.attributes().iter() {
        flat_positions.push(pos.x as f32);
        flat_positions.push(pos.y as f32);
        flat_positions.push(pos.z as f32);
        flat_normals.push(nor.x as f32);
        flat_normals.push(nor.y as f32);
        flat_normals.push(nor.z as f32);
    }

    // Collect triangle indices from the expanded mesh
    for tri in expanded.tri_faces() {
        flat_indices.push(tri[0] as u32);
        flat_indices.push(tri[1] as u32);
        flat_indices.push(tri[2] as u32);
    }

    // Also handle quads by splitting into two triangles
    for quad in expanded.quad_faces() {
        flat_indices.push(quad[0] as u32);
        flat_indices.push(quad[1] as u32);
        flat_indices.push(quad[2] as u32);
        flat_indices.push(quad[0] as u32);
        flat_indices.push(quad[2] as u32);
        flat_indices.push(quad[3] as u32);
    }

    if flat_indices.is_empty() {
        return Err(crate::error::KernelError::TessellationError(
            "tessellation produced no triangles".into(),
        ));
    }

    Ok(TessellatedMesh {
        positions: flat_positions,
        normals: flat_normals,
        indices: flat_indices,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::create_box;

    #[test]
    fn test_tessellate_box() {
        let solid = create_box(1.0, 1.0, 1.0).unwrap();
        let mesh = tessellate(&solid).unwrap();

        // Positions should be non-empty and divisible by 3
        assert!(!mesh.positions.is_empty());
        assert_eq!(mesh.positions.len() % 3, 0);

        // Normals should match positions count
        assert_eq!(mesh.normals.len(), mesh.positions.len());

        // Indices should be non-empty and divisible by 3 (triangles)
        assert!(!mesh.indices.is_empty());
        assert_eq!(mesh.indices.len() % 3, 0);
    }

    #[test]
    fn test_tessellate_box_indices_in_range() {
        let solid = create_box(2.0, 3.0, 4.0).unwrap();
        let mesh = tessellate(&solid).unwrap();
        let vertex_count = (mesh.positions.len() / 3) as u32;
        for &idx in &mesh.indices {
            assert!(idx < vertex_count, "index {idx} out of range (vertex_count={vertex_count})");
        }
    }

    #[test]
    fn test_tessellate_box_has_reasonable_triangle_count() {
        let solid = create_box(1.0, 1.0, 1.0).unwrap();
        let mesh = tessellate(&solid).unwrap();
        let tri_count = mesh.indices.len() / 3;
        // A box has 6 faces, each tessellated into at least 2 triangles
        assert!(tri_count >= 12, "expected at least 12 triangles, got {tri_count}");
    }
}
