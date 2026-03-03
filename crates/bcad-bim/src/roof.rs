//! Roof element mesh generation.

use bcad_domain::{RoofElement, RoofType};
use bcad_kernel::{
    error::KernelError,
    geometry::extrude_sketch_points,
    tessellation::{tessellate, TessellatedMesh},
};

const MIN_ROOF_THICKNESS: f64 = 0.1;
const MAX_ROOF_PITCH_DEGREES: f64 = 75.0;
const EPS: f64 = 1e-9;

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn normalize_angle_degrees(angle: f64) -> f64 {
    let mut normalized = angle % 360.0;
    if normalized < 0.0 {
        normalized += 360.0;
    }
    normalized
}

fn subdivide_top_triangles(mesh: &mut TessellatedMesh, top_z: f64) {
    if mesh.indices.len() < 3 || mesh.positions.len() < 9 {
        return;
    }

    let top_eps = top_z.abs().max(1.0) * 1e-4;
    let mut positions = mesh.positions.clone();
    let mut new_indices = Vec::with_capacity(mesh.indices.len() * 2);
    let original_indices = mesh.indices.clone();
    let vertex_count = mesh.positions.len() / 3;

    for tri in original_indices.chunks_exact(3) {
        let i0 = tri[0] as usize;
        let i1 = tri[1] as usize;
        let i2 = tri[2] as usize;
        if i0 >= vertex_count || i1 >= vertex_count || i2 >= vertex_count {
            continue;
        }

        let z0 = mesh.positions[i0 * 3 + 2] as f64;
        let z1 = mesh.positions[i1 * 3 + 2] as f64;
        let z2 = mesh.positions[i2 * 3 + 2] as f64;
        let is_top = (z0 - top_z).abs() <= top_eps
            && (z1 - top_z).abs() <= top_eps
            && (z2 - top_z).abs() <= top_eps;

        if !is_top || positions.len() / 3 >= u32::MAX as usize {
            new_indices.extend_from_slice(tri);
            continue;
        }

        let x0 = mesh.positions[i0 * 3] as f64;
        let y0 = mesh.positions[i0 * 3 + 1] as f64;
        let x1 = mesh.positions[i1 * 3] as f64;
        let y1 = mesh.positions[i1 * 3 + 1] as f64;
        let x2 = mesh.positions[i2 * 3] as f64;
        let y2 = mesh.positions[i2 * 3 + 1] as f64;

        let centroid_idx = (positions.len() / 3) as u32;
        positions.push(((x0 + x1 + x2) / 3.0) as f32);
        positions.push(((y0 + y1 + y2) / 3.0) as f32);
        positions.push(top_z as f32);

        new_indices.extend_from_slice(&[
            tri[0],
            tri[1],
            centroid_idx,
            tri[1],
            tri[2],
            centroid_idx,
            tri[2],
            tri[0],
            centroid_idx,
        ]);
    }

    mesh.positions = positions;
    mesh.indices = new_indices;
}

fn apply_pitched_profile(mesh: &mut TessellatedMesh, roof: &RoofElement, thickness: f64) {
    let pitch = clamp(roof.pitch_degrees, 0.0, MAX_ROOF_PITCH_DEGREES);
    if matches!(roof.roof_type, RoofType::Flat) || pitch <= EPS {
        return;
    }

    // Add interior top vertices so gable/hip profiles can form ridges instead of staying flat.
    subdivide_top_triangles(mesh, thickness);

    let ridge_angle = normalize_angle_degrees(roof.ridge_angle_degrees).to_radians();
    let ridge_dir_x = ridge_angle.cos();
    let ridge_dir_y = ridge_angle.sin();
    // Match UI convention: slope direction is clockwise-perpendicular to ridge.
    let slope_dir_x = ridge_dir_y;
    let slope_dir_y = -ridge_dir_x;

    let mut min_along = f64::INFINITY;
    let mut max_along = f64::NEG_INFINITY;
    let mut min_perp = f64::INFINITY;
    let mut max_perp = f64::NEG_INFINITY;

    for point in &roof.boundary {
        let along = point[0] * slope_dir_x + point[1] * slope_dir_y;
        let perp = point[0] * ridge_dir_x + point[1] * ridge_dir_y;
        min_along = min_along.min(along);
        max_along = max_along.max(along);
        min_perp = min_perp.min(perp);
        max_perp = max_perp.max(perp);
    }

    let along_span = (max_along - min_along).max(0.0);
    let perp_span = (max_perp - min_perp).max(0.0);
    if along_span <= EPS {
        return;
    }

    let tan_pitch = pitch.to_radians().tan();
    let linear_rise = tan_pitch * along_span;
    let hip_span = along_span.min(perp_span).max(EPS);
    let hip_rise = tan_pitch * hip_span;
    let thickness_safe = thickness.max(EPS);

    for vertex in mesh.positions.chunks_exact_mut(3) {
        let x = vertex[0] as f64;
        let y = vertex[1] as f64;
        let z = vertex[2] as f64;

        let along = x * slope_dir_x + y * slope_dir_y;
        let t = clamp((along - min_along) / along_span, 0.0, 1.0);

        let displacement = match roof.roof_type {
            RoofType::Flat => 0.0,
            RoofType::Shed => t * linear_rise,
            RoofType::Gable => (1.0 - (2.0 * t - 1.0).abs()) * linear_rise,
            RoofType::Hip => {
                let perp = x * ridge_dir_x + y * ridge_dir_y;
                let u = if perp_span > EPS {
                    clamp((perp - min_perp) / perp_span, 0.0, 1.0)
                } else {
                    0.5
                };
                let edge_factor = clamp(t.min(1.0 - t).min(u).min(1.0 - u) / 0.5, 0.0, 1.0);
                edge_factor * hip_rise
            }
        };

        // Keep underside level and only lift toward the top skin.
        let top_factor = clamp(z / thickness_safe, 0.0, 1.0);
        vertex[2] = (z + displacement * top_factor) as f32;
    }
}

fn recompute_vertex_normals(mesh: &mut TessellatedMesh) {
    let vertex_count = mesh.positions.len() / 3;
    if vertex_count == 0 {
        mesh.normals.clear();
        return;
    }

    let mut accum = vec![0.0_f64; vertex_count * 3];
    for tri in mesh.indices.chunks_exact(3) {
        let i0 = tri[0] as usize;
        let i1 = tri[1] as usize;
        let i2 = tri[2] as usize;
        if i0 >= vertex_count || i1 >= vertex_count || i2 >= vertex_count {
            continue;
        }

        let p0x = mesh.positions[i0 * 3] as f64;
        let p0y = mesh.positions[i0 * 3 + 1] as f64;
        let p0z = mesh.positions[i0 * 3 + 2] as f64;
        let p1x = mesh.positions[i1 * 3] as f64;
        let p1y = mesh.positions[i1 * 3 + 1] as f64;
        let p1z = mesh.positions[i1 * 3 + 2] as f64;
        let p2x = mesh.positions[i2 * 3] as f64;
        let p2y = mesh.positions[i2 * 3 + 1] as f64;
        let p2z = mesh.positions[i2 * 3 + 2] as f64;

        let ux = p1x - p0x;
        let uy = p1y - p0y;
        let uz = p1z - p0z;
        let vx = p2x - p0x;
        let vy = p2y - p0y;
        let vz = p2z - p0z;

        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        let norm_sq = nx * nx + ny * ny + nz * nz;
        if norm_sq <= EPS {
            continue;
        }

        for idx in [i0, i1, i2] {
            accum[idx * 3] += nx;
            accum[idx * 3 + 1] += ny;
            accum[idx * 3 + 2] += nz;
        }
    }

    mesh.normals = vec![0.0_f32; vertex_count * 3];
    for i in 0..vertex_count {
        let nx = accum[i * 3];
        let ny = accum[i * 3 + 1];
        let nz = accum[i * 3 + 2];
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        if len > EPS {
            mesh.normals[i * 3] = (nx / len) as f32;
            mesh.normals[i * 3 + 1] = (ny / len) as f32;
            mesh.normals[i * 3 + 2] = (nz / len) as f32;
        } else {
            mesh.normals[i * 3] = 0.0;
            mesh.normals[i * 3 + 1] = 0.0;
            mesh.normals[i * 3 + 2] = 1.0;
        }
    }
}

/// Produce a mesh for a roof element.
pub fn roof_mesh(roof: &RoofElement) -> Result<TessellatedMesh, KernelError> {
    if roof.boundary.len() < 3 {
        return Err(KernelError::TopologyError(
            "roof boundary needs >= 3 points".into(),
        ));
    }
    let points: Vec<(f64, f64)> = roof.boundary.iter().map(|p| (p[0], p[1])).collect();
    let thickness = roof.thickness.max(MIN_ROOF_THICKNESS);
    let solid = extrude_sketch_points(&points, thickness)?;
    let mut mesh = tessellate(&solid)?;
    apply_pitched_profile(&mut mesh, roof, thickness);
    recompute_vertex_normals(&mut mesh);
    Ok(mesh)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::{ElementMeta, RoofType};

    fn test_roof() -> RoofElement {
        RoofElement {
            meta: ElementMeta::new("Test Roof"),
            boundary: vec![[0.0, 0.0], [10.0, 0.0], [10.0, 8.0], [0.0, 8.0]],
            thickness: 0.25,
            elevation: 6.0,
            auto_elevation: true,
            roof_type: RoofType::Flat,
            pitch_degrees: 0.0,
            ridge_angle_degrees: 0.0,
        }
    }

    #[test]
    fn test_roof_mesh_non_empty() {
        let roof = test_roof();
        let mesh = roof_mesh(&roof).unwrap();
        assert!(!mesh.positions.is_empty());
        assert!(!mesh.normals.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn test_roof_mesh_valid_indices() {
        let roof = test_roof();
        let mesh = roof_mesh(&roof).unwrap();
        assert_eq!(mesh.indices.len() % 3, 0);
        assert_eq!(mesh.positions.len(), mesh.normals.len());
    }

    #[test]
    fn test_roof_too_few_points() {
        let roof = RoofElement {
            meta: ElementMeta::new("Bad Roof"),
            boundary: vec![[0.0, 0.0], [1.0, 0.0]],
            thickness: 0.25,
            elevation: 6.0,
            auto_elevation: true,
            roof_type: RoofType::Flat,
            pitch_degrees: 0.0,
            ridge_angle_degrees: 0.0,
        };
        assert!(roof_mesh(&roof).is_err());
    }

    #[test]
    fn test_shed_roof_rises_above_thickness() {
        let mut roof = test_roof();
        roof.roof_type = RoofType::Shed;
        roof.pitch_degrees = 30.0;

        let mesh = roof_mesh(&roof).unwrap();
        let max_z = mesh
            .positions
            .chunks_exact(3)
            .map(|p| p[2] as f64)
            .fold(f64::NEG_INFINITY, f64::max);
        assert!(max_z > roof.thickness + 0.1);
    }

    #[test]
    fn test_gable_roof_creates_peaks() {
        let mut roof = test_roof();
        roof.roof_type = RoofType::Gable;
        roof.pitch_degrees = 30.0;

        let mesh = roof_mesh(&roof).unwrap();
        let max_z = mesh
            .positions
            .chunks_exact(3)
            .map(|p| p[2] as f64)
            .fold(f64::NEG_INFINITY, f64::max);
        assert!(max_z > roof.thickness + 0.1);
    }

    #[test]
    fn test_flat_roof_keeps_top_at_thickness() {
        let mut roof = test_roof();
        roof.roof_type = RoofType::Flat;
        roof.pitch_degrees = 45.0;

        let mesh = roof_mesh(&roof).unwrap();
        let max_z = mesh
            .positions
            .chunks_exact(3)
            .map(|p| p[2] as f64)
            .fold(f64::NEG_INFINITY, f64::max);
        assert!((max_z - roof.thickness).abs() < 1e-4);
    }
}
