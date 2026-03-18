//! Wall element for architectural BIM modeling.

use bcad_kernel::tessellation::TessellatedMesh;
use serde::{Deserialize, Serialize};

/// Parameters that define a straight wall segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallParams {
    /// Start point [x, y] on the floor plan.
    pub start: [f64; 2],
    /// End point [x, y] on the floor plan.
    pub end: [f64; 2],
    /// Wall height.
    pub height: f64,
    /// Wall thickness.
    pub thickness: f64,
}

/// Opening cut definition projected onto a host wall centerline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpeningSpec {
    /// Position along wall centerline in [0, 1].
    pub position_along_wall: f64,
    /// Opening width along the wall direction.
    pub width: f64,
    /// Opening height.
    pub height: f64,
    /// Bottom elevation above floor.
    pub sill_height: f64,
}

impl WallParams {
    /// Convert wall params to a solid using extrude_sketch_points.
    /// The wall is a rectangular cross-section extruded along the wall direction.
    pub fn to_solid(
        &self,
    ) -> Result<bcad_kernel::topology::Solid, bcad_kernel::error::KernelError> {
        // Calculate wall direction and normal
        let dx = self.end[0] - self.start[0];
        let dy = self.end[1] - self.start[1];
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-10 {
            return Err(bcad_kernel::error::KernelError::TopologyError(
                "wall has zero length".into(),
            ));
        }
        // Normal perpendicular to wall direction
        let nx = -dy / len * self.thickness / 2.0;
        let ny = dx / len * self.thickness / 2.0;

        // 4 corners of the wall footprint in CCW order on the XY plane.
        // Keeping a consistent winding prevents inside-out face normals after extrusion.
        let points = vec![
            (self.start[0] + nx, self.start[1] + ny),
            (self.start[0] - nx, self.start[1] - ny),
            (self.end[0] - nx, self.end[1] - ny),
            (self.end[0] + nx, self.end[1] + ny),
        ];

        bcad_kernel::geometry::extrude_sketch_points(&points, self.height)
    }
}

#[derive(Debug, Clone, Copy)]
struct OpeningInterval {
    start: f64,
    end: f64,
    sill: f64,
    top: f64,
}

/// Build a wall mesh that includes physical voids for door/window openings.
///
/// This function does not rely on boolean operations. Instead, it decomposes
/// the host wall into a set of non-overlapping wall prisms around each opening.
pub fn wall_mesh_with_openings(
    wall: &WallParams,
    openings: &[OpeningSpec],
) -> Result<TessellatedMesh, bcad_kernel::error::KernelError> {
    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let length = (dx * dx + dy * dy).sqrt();
    if length < 1e-10 {
        return Err(bcad_kernel::error::KernelError::TopologyError(
            "wall has zero length".into(),
        ));
    }

    let mut intervals: Vec<OpeningInterval> = openings
        .iter()
        .filter_map(|opening| {
            if opening.width <= 0.0 || opening.height <= 0.0 {
                return None;
            }
            let center = opening.position_along_wall.clamp(0.0, 1.0) * length;
            let half = opening.width * 0.5;
            let start = (center - half).max(0.0);
            let end = (center + half).min(length);
            if end - start <= 1e-8 {
                return None;
            }

            let sill = opening.sill_height.max(0.0).min(wall.height);
            let top = (sill + opening.height).max(sill).min(wall.height);
            Some(OpeningInterval {
                start,
                end,
                sill,
                top,
            })
        })
        .collect();

    intervals.sort_by(|a, b| a.start.total_cmp(&b.start));
    for pair in intervals.windows(2) {
        if pair[1].start < pair[0].end - 1e-8 {
            return Err(bcad_kernel::error::KernelError::TopologyError(
                "overlapping wall openings are not supported".into(),
            ));
        }
    }

    let mut piece_meshes: Vec<TessellatedMesh> = Vec::new();
    let mut cursor = 0.0;

    for interval in &intervals {
        if interval.start - cursor > 1e-8 {
            piece_meshes.push(wall_piece_mesh(
                wall,
                cursor,
                interval.start,
                0.0,
                wall.height,
            )?);
        }
        cursor = interval.end;
    }
    if length - cursor > 1e-8 {
        piece_meshes.push(wall_piece_mesh(wall, cursor, length, 0.0, wall.height)?);
    }

    for interval in &intervals {
        if interval.sill > 1e-8 {
            piece_meshes.push(wall_piece_mesh(
                wall,
                interval.start,
                interval.end,
                0.0,
                interval.sill,
            )?);
        }
        if wall.height - interval.top > 1e-8 {
            piece_meshes.push(wall_piece_mesh(
                wall,
                interval.start,
                interval.end,
                interval.top,
                wall.height - interval.top,
            )?);
        }
    }

    if piece_meshes.is_empty() {
        return Err(bcad_kernel::error::KernelError::TopologyError(
            "wall openings removed all geometry".into(),
        ));
    }

    Ok(combine_meshes(&piece_meshes))
}

fn wall_piece_mesh(
    wall: &WallParams,
    start_t: f64,
    end_t: f64,
    z_base: f64,
    height: f64,
) -> Result<TessellatedMesh, bcad_kernel::error::KernelError> {
    if end_t - start_t <= 1e-8 || height <= 1e-8 {
        return Err(bcad_kernel::error::KernelError::TopologyError(
            "invalid wall piece dimensions".into(),
        ));
    }

    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    let ux = dx / len;
    let uy = dy / len;
    let nx = -uy * wall.thickness * 0.5;
    let ny = ux * wall.thickness * 0.5;

    let sx = wall.start[0] + ux * start_t;
    let sy = wall.start[1] + uy * start_t;
    let ex = wall.start[0] + ux * end_t;
    let ey = wall.start[1] + uy * end_t;

    // Keep wall piece profile winding consistent with WallParams::to_solid.
    let points = vec![
        (sx + nx, sy + ny),
        (sx - nx, sy - ny),
        (ex - nx, ey - ny),
        (ex + nx, ey + ny),
    ];

    let solid = bcad_kernel::geometry::extrude_sketch_points(&points, height)?;
    let mut mesh = bcad_kernel::tessellation::tessellate(&solid)?;
    if z_base.abs() > 1e-9 {
        for vertex in mesh.positions.chunks_exact_mut(3) {
            vertex[2] += z_base as f32;
        }
    }
    Ok(mesh)
}

// ---------------------------------------------------------------------------
// Curved wall mesh generation
// ---------------------------------------------------------------------------

/// Parameters for a curved (arc) wall segment.
#[derive(Debug, Clone)]
pub struct CurvedWallParams {
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub height: f64,
    pub thickness: f64,
    pub arc: bcad_domain::ArcDef,
    pub segments: u32,
}

/// Build a mesh for a curved wall, optionally with door/window openings.
///
/// The wall centerline follows a circular arc.  The mesh is composed of
/// `segments` straight wall prisms whose footprints approximate inner/outer
/// arcs offset from the centerline by ±thickness/2.
pub fn curved_wall_mesh_with_openings(
    wall: &CurvedWallParams,
    openings: &[OpeningSpec],
) -> Result<TessellatedMesh, bcad_kernel::error::KernelError> {
    let segs = wall.segments.max(3);
    let half_t = wall.thickness * 0.5;

    // Tessellate the centerline arc.
    let centerline = bcad_kernel::geometry::arc_to_points(
        (wall.arc.center[0], wall.arc.center[1]),
        wall.arc.radius,
        wall.arc.start_angle,
        wall.arc.end_angle,
        segs,
    );

    if centerline.len() < 2 {
        return Err(bcad_kernel::error::KernelError::TopologyError(
            "curved wall arc produced fewer than 2 points".into(),
        ));
    }

    // Compute total arc length (used to map opening positions).
    let mut cumulative_len: Vec<f64> = Vec::with_capacity(centerline.len());
    cumulative_len.push(0.0);
    for i in 1..centerline.len() {
        let dx = centerline[i].0 - centerline[i - 1].0;
        let dy = centerline[i].1 - centerline[i - 1].1;
        cumulative_len.push(cumulative_len[i - 1] + (dx * dx + dy * dy).sqrt());
    }
    let total_len = *cumulative_len.last().unwrap();
    if total_len < 1e-10 {
        return Err(bcad_kernel::error::KernelError::TopologyError(
            "curved wall has zero arc length".into(),
        ));
    }

    // Pre-compute opening intervals projected onto arc length.
    let mut intervals: Vec<OpeningInterval> = openings
        .iter()
        .filter_map(|opening| {
            if opening.width <= 0.0 || opening.height <= 0.0 {
                return None;
            }
            let center = opening.position_along_wall.clamp(0.0, 1.0) * total_len;
            let half = opening.width * 0.5;
            let start = (center - half).max(0.0);
            let end = (center + half).min(total_len);
            if end - start <= 1e-8 {
                return None;
            }
            let sill = opening.sill_height.max(0.0).min(wall.height);
            let top = (sill + opening.height).max(sill).min(wall.height);
            Some(OpeningInterval { start, end, sill, top })
        })
        .collect();
    intervals.sort_by(|a, b| a.start.total_cmp(&b.start));

    // Build wall piece meshes for each segment of the arc.
    let mut piece_meshes: Vec<TessellatedMesh> = Vec::new();

    for i in 0..centerline.len() - 1 {
        let seg_start_len = cumulative_len[i];
        let seg_end_len = cumulative_len[i + 1];

        // For each arc segment, compute the local outward normal (radial direction).
        let (cx, cy) = (wall.arc.center[0], wall.arc.center[1]);

        let (s0x, s0y) = centerline[i];
        let (s1x, s1y) = centerline[i + 1];

        // Outward normals (from center outward) at each endpoint.
        let r0 = ((s0x - cx).powi(2) + (s0y - cy).powi(2)).sqrt().max(1e-10);
        let n0x = (s0x - cx) / r0;
        let n0y = (s0y - cy) / r0;

        let r1 = ((s1x - cx).powi(2) + (s1y - cy).powi(2)).sqrt().max(1e-10);
        let n1x = (s1x - cx) / r1;
        let n1y = (s1y - cy) / r1;

        // Check if this segment is fully inside an opening gap (no wall needed).
        let mut is_full_gap = false;
        let mut sub_pieces: Vec<(f64, f64, f64, f64)> = Vec::new(); // (z_base, height) ranges

        // Determine which height ranges have wall material in this segment.
        let overlapping: Vec<&OpeningInterval> = intervals
            .iter()
            .filter(|iv| iv.start < seg_end_len - 1e-8 && iv.end > seg_start_len + 1e-8)
            .collect();

        if overlapping.is_empty() {
            // Full-height wall segment.
            sub_pieces.push((0.0, wall.height, 0.0, 0.0));
        } else {
            // Check how much of this segment is within each opening.
            // For simplicity, treat the segment as fully affected if any opening
            // overlaps the majority of its length.
            let mut has_full_opening = false;
            for iv in &overlapping {
                let overlap_start = iv.start.max(seg_start_len);
                let overlap_end = iv.end.min(seg_end_len);
                let seg_len = seg_end_len - seg_start_len;
                if overlap_end - overlap_start > seg_len * 0.5 {
                    has_full_opening = true;
                    // Below opening
                    if iv.sill > 1e-8 {
                        sub_pieces.push((0.0, iv.sill, 0.0, 0.0));
                    }
                    // Above opening
                    if wall.height - iv.top > 1e-8 {
                        sub_pieces.push((iv.top, wall.height - iv.top, 0.0, 0.0));
                    }
                    break;
                }
            }
            if !has_full_opening {
                sub_pieces.push((0.0, wall.height, 0.0, 0.0));
            }
            is_full_gap = sub_pieces.is_empty();
        }

        if is_full_gap {
            continue;
        }

        for &(z_base, piece_height, _, _) in &sub_pieces {
            if piece_height < 1e-8 {
                continue;
            }

            // Build 4-corner footprint: start-outer, start-inner, end-inner, end-outer (CCW)
            let points = vec![
                (s0x + n0x * half_t, s0y + n0y * half_t),
                (s0x - n0x * half_t, s0y - n0y * half_t),
                (s1x - n1x * half_t, s1y - n1y * half_t),
                (s1x + n1x * half_t, s1y + n1y * half_t),
            ];

            let solid = bcad_kernel::geometry::extrude_sketch_points(&points, piece_height)?;
            let mut mesh = bcad_kernel::tessellation::tessellate(&solid)?;
            if z_base.abs() > 1e-9 {
                for vertex in mesh.positions.chunks_exact_mut(3) {
                    vertex[2] += z_base as f32;
                }
            }
            piece_meshes.push(mesh);
        }
    }

    if piece_meshes.is_empty() {
        return Err(bcad_kernel::error::KernelError::TopologyError(
            "curved wall produced no geometry".into(),
        ));
    }

    Ok(combine_meshes(&piece_meshes))
}

fn combine_meshes(meshes: &[TessellatedMesh]) -> TessellatedMesh {
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

    TessellatedMesh {
        positions,
        normals,
        indices,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wall_to_solid_succeeds() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let solid = wall.to_solid();
        assert!(solid.is_ok());
    }

    #[test]
    fn test_wall_to_solid_has_six_faces() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let solid = wall.to_solid().unwrap();
        assert_eq!(solid.boundaries().len(), 1);
        assert_eq!(solid.boundaries()[0].len(), 6);
    }

    #[test]
    fn test_wall_to_solid_tessellates() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let solid = wall.to_solid().unwrap();
        let mesh = bcad_kernel::tessellation::tessellate(&solid).unwrap();
        assert!(!mesh.indices.is_empty());
        assert!(!mesh.positions.is_empty());
        assert_eq!(mesh.positions.len(), mesh.normals.len());
        assert_eq!(mesh.indices.len() % 3, 0);
    }

    #[test]
    fn test_wall_diagonal() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [3.0, 4.0],
            height: 2.5,
            thickness: 0.15,
        };
        let solid = wall.to_solid();
        assert!(solid.is_ok());
    }

    #[test]
    fn test_wall_zero_length_fails() {
        let wall = WallParams {
            start: [1.0, 1.0],
            end: [1.0, 1.0],
            height: 3.0,
            thickness: 0.2,
        };
        assert!(wall.to_solid().is_err());
    }

    #[test]
    fn test_wall_mesh_with_door_opening() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [6.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };
        let mesh = wall_mesh_with_openings(
            &wall,
            &[OpeningSpec {
                position_along_wall: 0.5,
                width: 1.0,
                height: 2.1,
                sill_height: 0.0,
            }],
        )
        .unwrap();

        assert!(!mesh.indices.is_empty());
        assert_eq!(mesh.positions.len() % 3, 0);
        assert_eq!(mesh.normals.len(), mesh.positions.len());
    }

    #[test]
    fn test_wall_mesh_rejects_overlapping_openings() {
        let wall = WallParams {
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        };

        let result = wall_mesh_with_openings(
            &wall,
            &[
                OpeningSpec {
                    position_along_wall: 0.4,
                    width: 1.2,
                    height: 2.1,
                    sill_height: 0.0,
                },
                OpeningSpec {
                    position_along_wall: 0.5,
                    width: 1.2,
                    height: 2.1,
                    sill_height: 0.0,
                },
            ],
        );

        assert!(result.is_err());
    }
}
