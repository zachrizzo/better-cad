//! Column element mesh generation.

use bcad_domain::ColumnElement;
use bcad_kernel::{
    error::KernelError,
    geometry::extrude_sketch_points,
    tessellation::{tessellate, TessellatedMesh},
};

/// Produce a mesh for a rectangular column centered at `col.center`.
pub fn column_mesh(col: &ColumnElement) -> Result<TessellatedMesh, KernelError> {
    let hw = col.width * 0.5;
    let hd = col.depth * 0.5;
    let cx = col.center[0];
    let cy = col.center[1];
    let points = vec![
        (cx - hw, cy - hd),
        (cx + hw, cy - hd),
        (cx + hw, cy + hd),
        (cx - hw, cy + hd),
    ];
    let solid = extrude_sketch_points(&points, col.height)?;
    tessellate(&solid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::ElementMeta;

    fn test_column() -> ColumnElement {
        ColumnElement {
            meta: ElementMeta::new("Test Column"),
            center: [2.0, 3.0],
            width: 0.4,
            depth: 0.4,
            height: 3.0,
        }
    }

    #[test]
    fn test_column_mesh_non_empty() {
        let col = test_column();
        let mesh = column_mesh(&col).unwrap();
        assert!(!mesh.positions.is_empty());
        assert!(!mesh.normals.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_column_mesh_valid_indices() {
        let col = test_column();
        let mesh = column_mesh(&col).unwrap();
        assert_eq!(mesh.indices.len() % 3, 0);
        assert_eq!(mesh.positions.len(), mesh.normals.len());
    }
}
