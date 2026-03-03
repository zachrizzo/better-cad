//! Foundation element mesh generation.

use bcad_domain::FoundationElement;
use bcad_kernel::{
    error::KernelError,
    geometry::extrude_sketch_points,
    tessellation::{tessellate, TessellatedMesh},
};

/// Produces a mesh for a foundation slab. The caller is responsible for
/// translating the mesh downward by `found.thickness` if below-grade placement is needed.
pub fn foundation_mesh(found: &FoundationElement) -> Result<TessellatedMesh, KernelError> {
    if found.boundary.len() < 3 {
        return Err(KernelError::TopologyError(
            "foundation boundary needs >= 3 points".into(),
        ));
    }
    let points: Vec<(f64, f64)> = found.boundary.iter().map(|p| (p[0], p[1])).collect();
    let solid = extrude_sketch_points(&points, found.thickness)?;
    tessellate(&solid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::ElementMeta;

    fn test_foundation() -> FoundationElement {
        FoundationElement {
            meta: ElementMeta::new("Test Foundation"),
            boundary: vec![[0.0, 0.0], [10.0, 0.0], [10.0, 8.0], [0.0, 8.0]],
            thickness: 0.3,
        }
    }

    #[test]
    fn test_foundation_mesh_non_empty() {
        let found = test_foundation();
        let mesh = foundation_mesh(&found).unwrap();
        assert!(!mesh.positions.is_empty());
        assert!(!mesh.normals.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_foundation_mesh_valid_indices() {
        let found = test_foundation();
        let mesh = foundation_mesh(&found).unwrap();
        assert_eq!(mesh.indices.len() % 3, 0);
        assert_eq!(mesh.positions.len(), mesh.normals.len());
    }

    #[test]
    fn test_foundation_too_few_points() {
        let found = FoundationElement {
            meta: ElementMeta::new("Bad Foundation"),
            boundary: vec![[0.0, 0.0], [1.0, 0.0]],
            thickness: 0.3,
        };
        assert!(foundation_mesh(&found).is_err());
    }
}
