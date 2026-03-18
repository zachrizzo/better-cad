//! Beam element mesh generation.

use bcad_domain::BeamElement;
use bcad_kernel::{
    error::KernelError,
    geometry::extrude_sketch_points,
    tessellation::{tessellate, TessellatedMesh},
};

/// Produce a mesh for a beam running from `beam.start` to `beam.end`.
/// The beam cross-section is `width` (horizontal, perpendicular to run) by `depth` (vertical extrusion).
pub fn beam_mesh(beam: &BeamElement) -> Result<TessellatedMesh, KernelError> {
    let dx = beam.end[0] - beam.start[0];
    let dy = beam.end[1] - beam.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-8 {
        return Err(KernelError::TopologyError(
            "beam has zero length in plan".into(),
        ));
    }
    let ux = dx / len;
    let uy = dy / len;
    let nx = -uy * beam.width * 0.5;
    let ny = ux * beam.width * 0.5;
    let sx = beam.start[0];
    let sy = beam.start[1];
    let ex = beam.end[0];
    let ey = beam.end[1];
    let points = vec![
        (sx + nx, sy + ny),
        (ex + nx, ey + ny),
        (ex - nx, ey - ny),
        (sx - nx, sy - ny),
    ];
    // extrude by depth (vertical)
    let solid = extrude_sketch_points(&points, beam.depth)?;
    tessellate(&solid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::ElementMeta;

    fn test_beam() -> BeamElement {
        BeamElement {
            meta: ElementMeta::new("Test Beam"),
            start: [0.0, 0.0, 3.0],
            end: [5.0, 0.0, 3.0],
            width: 0.2,
            depth: 0.4,
            arc: None,
            arc_segments: 24,
        }
    }

    #[test]
    fn test_beam_mesh_non_empty() {
        let beam = test_beam();
        let mesh = beam_mesh(&beam).unwrap();
        assert!(!mesh.positions.is_empty());
        assert!(!mesh.normals.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_beam_mesh_valid_indices() {
        let beam = test_beam();
        let mesh = beam_mesh(&beam).unwrap();
        assert_eq!(mesh.indices.len() % 3, 0);
        assert_eq!(mesh.positions.len(), mesh.normals.len());
    }

    #[test]
    fn test_beam_zero_length_fails() {
        let beam = BeamElement {
            meta: ElementMeta::new("Zero Beam"),
            start: [1.0, 1.0, 3.0],
            end: [1.0, 1.0, 3.0],
            width: 0.2,
            depth: 0.4,
            arc: None,
            arc_segments: 24,
        };
        assert!(beam_mesh(&beam).is_err());
    }
}
