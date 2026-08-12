//! Mesh regeneration: converts document elements to GPU meshes.
//!
//! Queries elements from `AppState`, generates `TessellatedMesh` via bcad-bim,
//! and uploads to the GPU via `bcad_render::mesh::upload::upload_tessellated_mesh`.

use std::collections::HashMap;

use bcad_domain::{DoorElement, Element, WallElement, WindowElement};
use bcad_kernel::tessellation::TessellatedMesh;
use bcad_render::gpu::GpuContext;
use bcad_render::mesh::upload::upload_tessellated_mesh;
use bcad_render::GpuMesh;

/// Cache of GPU-resident meshes, keyed by element ID.
pub struct MeshCache {
    pub meshes: HashMap<String, GpuMesh>,
}

#[allow(dead_code)]
impl MeshCache {
    pub fn new() -> Self {
        Self {
            meshes: HashMap::new(),
        }
    }

    /// Regenerate all meshes from scratch.
    ///
    /// Iterates over all elements, generates tessellated meshes via bcad-bim,
    /// uploads them to the GPU, and stores the handles.
    pub fn regenerate_all(&mut self, elements: &[Element], gpu: &GpuContext) {
        self.meshes.clear();

        for element in elements {
            if let Some(mut tessellated) = tessellate_element(element, elements) {
                convert_tessellated_mesh_to_y_up(&mut tessellated);
                let gpu_mesh = upload_tessellated_mesh(&gpu.device, &gpu.queue, &tessellated);
                self.meshes.insert(element.meta().id.clone(), gpu_mesh);
            }
        }

        log::debug!(
            "Regenerated {} GPU meshes from {} elements",
            self.meshes.len(),
            elements.len()
        );
    }

    /// Regenerate mesh for a single element.
    pub fn regenerate_one(&mut self, element: &Element, gpu: &GpuContext) {
        let id = element.meta().id.clone();
        if let Some(mut tessellated) = tessellate_element(element, std::slice::from_ref(element)) {
            convert_tessellated_mesh_to_y_up(&mut tessellated);
            let gpu_mesh = upload_tessellated_mesh(&gpu.device, &gpu.queue, &tessellated);
            self.meshes.insert(id, gpu_mesh);
        } else {
            self.meshes.remove(&id);
        }
    }

    /// Remove mesh for a deleted element.
    pub fn remove(&mut self, element_id: &str) {
        self.meshes.remove(element_id);
    }

    /// Get a reference to a GPU mesh by element ID.
    pub fn get(&self, element_id: &str) -> Option<&GpuMesh> {
        self.meshes.get(element_id)
    }
}

fn convert_tessellated_mesh_to_y_up(mesh: &mut TessellatedMesh) {
    for vertex in mesh.positions.chunks_exact_mut(3) {
        let plan_y = vertex[1];
        let up_z = vertex[2];
        vertex[1] = up_z;
        vertex[2] = plan_y;
    }

    for normal in mesh.normals.chunks_exact_mut(3) {
        let plan_y = normal[1];
        let up_z = normal[2];
        normal[1] = up_z;
        normal[2] = plan_y;
    }

    // Swapping axes changes handedness, so flip triangle winding to keep
    // backface culling and normals aligned with the transformed geometry.
    for tri in mesh.indices.chunks_exact_mut(3) {
        tri.swap(1, 2);
    }
}

fn find_host_wall<'a>(elements: &'a [Element], wall_id: &str) -> Option<&'a WallElement> {
    elements.iter().find_map(|element| match element {
        Element::Wall(wall) if wall.meta.id == wall_id => Some(wall),
        _ => None,
    })
}

fn door_mesh_with_host_lookup(door: &DoorElement, elements: &[Element]) -> Option<TessellatedMesh> {
    let host_wall = find_host_wall(elements, &door.wall_id)?;
    let input = bcad_bim::door::DoorGeometryInput { door, host_wall };
    match bcad_bim::door::door_mesh(&input) {
        Ok(mut mesh) => {
            bcad_bim::translate_mesh_z(&mut mesh, door.sill_height);
            Some(mesh)
        }
        Err(error) => {
            log::warn!("Failed to tessellate door {}: {}", door.meta.id, error);
            None
        }
    }
}

fn window_mesh_with_host_lookup(
    window: &WindowElement,
    elements: &[Element],
) -> Option<TessellatedMesh> {
    let host_wall = find_host_wall(elements, &window.wall_id)?;
    let input = bcad_bim::window::WindowGeometryInput { window, host_wall };
    match bcad_bim::window::window_mesh(&input) {
        Ok(mut mesh) => {
            bcad_bim::translate_mesh_z(&mut mesh, window.sill_height);
            Some(mesh)
        }
        Err(error) => {
            log::warn!("Failed to tessellate window {}: {}", window.meta.id, error);
            None
        }
    }
}

fn opening_specs_for_wall(wall_id: &str, elements: &[Element]) -> Vec<bcad_bim::wall::OpeningSpec> {
    elements
        .iter()
        .filter_map(|element| match element {
            Element::Door(door) if door.wall_id == wall_id => Some(bcad_bim::wall::OpeningSpec {
                position_along_wall: door.position_along_wall,
                width: door.width,
                height: door.height,
                sill_height: door.sill_height,
            }),
            Element::Window(window) if window.wall_id == wall_id => {
                Some(bcad_bim::wall::OpeningSpec {
                    position_along_wall: window.position_along_wall,
                    width: window.width,
                    height: window.height,
                    sill_height: window.sill_height,
                })
            }
            _ => None,
        })
        .collect()
}

fn dist_2d(a: [f64; 2], b: [f64; 2]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

/// Adjust wall endpoints using a butt-joint "one wall wins" approach.
///
/// At each shared endpoint the wall that ENDS there wins (it extends fully
/// to the junction); the wall that STARTS there is trimmed back so it butts
/// cleanly against the winning wall's side face.  When both walls end or
/// both start at the junction the wall with the lexicographically larger
/// meta-id wins.
///
/// The trim distance along the losing wall's centreline is
/// `other.thickness / (2 * |sin(angle)|)` — the exact amount needed for
/// the losing wall's face to clear the winning wall's side face at any angle.
fn adjust_wall_for_junctions_butt(
    wall: &WallElement,
    all_elements: &[Element],
) -> ([f64; 2], [f64; 2]) {
    let mut start = wall.start;
    let mut end   = wall.end;
    let eps = 0.01;

    let dx = end[0] - start[0];
    let dy = end[1] - start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-6 { return (start, end); }
    let ux = dx / len;
    let uy = dy / len;

    for el in all_elements {
        let other = match el {
            Element::Wall(w) if w.meta.id != wall.meta.id && w.arc.is_none() => w,
            _ => continue,
        };

        let odx = other.end[0] - other.start[0];
        let ody = other.end[1] - other.start[1];
        let olen = (odx * odx + ody * ody).sqrt();
        if olen < 1e-6 { continue; }
        let oux = odx / olen;
        let ouy = ody / olen;

        let sin_angle = (ux * ouy - uy * oux).abs();
        if sin_angle < 0.1 { continue; } // near-parallel, skip

        let shorten = (other.thickness * 0.5) / sin_angle;

        // --- Start of this wall ---
        let start_at_other_start = dist_2d(other.start, wall.start) < eps;
        let start_at_other_end   = dist_2d(other.end,   wall.start) < eps;
        if start_at_other_start || start_at_other_end {
            // If other ENDS here → other wins → this wall (starting here) is trimmed.
            // If other STARTS here → both start; larger id wins.
            let this_wins = if start_at_other_end {
                false
            } else {
                wall.meta.id > other.meta.id
            };
            if !this_wins {
                start[0] += ux * shorten;
                start[1] += uy * shorten;
            }
        }

        // --- End of this wall ---
        let end_at_other_start = dist_2d(other.start, wall.end) < eps;
        let end_at_other_end   = dist_2d(other.end,   wall.end) < eps;
        if end_at_other_start || end_at_other_end {
            // If other STARTS here → this wall (ending here) wins → NOT trimmed.
            // If other ENDS here → both end; larger id wins.
            let this_wins = if end_at_other_start {
                true
            } else {
                wall.meta.id > other.meta.id
            };
            if !this_wins {
                end[0] -= ux * shorten;
                end[1] -= uy * shorten;
            }
        }
    }

    (start, end)
}

/// Adjust wall endpoints for junctions using the angle-correct miter distance.

/// Tessellate a single element using the bcad-bim mesh generators.
///
/// Returns `None` for elements that don't have a 3D representation
/// (e.g., annotations, views, sheets, etc.)
fn tessellate_element(element: &Element, all_elements: &[Element]) -> Option<TessellatedMesh> {
    match element {
        Element::Wall(wall) => {
            let openings = opening_specs_for_wall(&wall.meta.id, all_elements);

            let result = if let Some(arc) = wall.arc {
                // Curved walls: junction corners don't apply (yet)
                bcad_bim::wall::curved_wall_mesh_with_openings(
                    &bcad_bim::wall::CurvedWallParams {
                        start: wall.start,
                        end: wall.end,
                        height: wall.height,
                        thickness: wall.thickness,
                        arc,
                        segments: wall.arc_segments,
                    },
                    &openings,
                )
            } else {
                // Butt-joint junctions: the wall that ends at a shared endpoint
                // "wins" and extends fully; the wall that starts is trimmed.
                // Works correctly at any angle including acute triangle corners.
                let (adj_start, adj_end) =
                    adjust_wall_for_junctions_butt(wall, all_elements);
                bcad_bim::wall::wall_mesh_with_openings(
                    &bcad_bim::wall::WallParams {
                        start: adj_start,
                        end: adj_end,
                        height: wall.height,
                        thickness: wall.thickness,
                    },
                    &openings,
                )
            };

            match result {
                Ok(mesh) => Some(mesh),
                Err(e) => {
                    log::warn!("Failed to tessellate wall {}: {}", wall.meta.id, e);
                    None
                }
            }
        }
        Element::Column(col) => match bcad_bim::column::column_mesh(col) {
            Ok(mesh) => Some(mesh),
            Err(e) => {
                log::warn!("Failed to tessellate column {}: {}", col.meta.id, e);
                None
            }
        },
        Element::Floor(floor) => match bcad_bim::slab::floor_mesh(floor) {
            Ok(mesh) => Some(mesh),
            Err(e) => {
                log::warn!("Failed to tessellate floor {}: {}", floor.meta.id, e);
                None
            }
        },
        Element::Foundation(foundation) => {
            match bcad_bim::foundation::foundation_mesh(foundation) {
                Ok(mesh) => Some(mesh),
                Err(e) => {
                    log::warn!(
                        "Failed to tessellate foundation {}: {}",
                        foundation.meta.id,
                        e
                    );
                    None
                }
            }
        }
        Element::Roof(roof) => match bcad_bim::roof::roof_mesh(roof) {
            Ok(mesh) => Some(mesh),
            Err(e) => {
                log::warn!("Failed to tessellate roof {}: {}", roof.meta.id, e);
                None
            }
        },
        Element::Door(door) => door_mesh_with_host_lookup(door, all_elements),
        Element::Window(window) => window_mesh_with_host_lookup(window, all_elements),
        Element::Stair(stair) => {
            log::debug!("Stair tessellation not yet wired: {}", stair.meta.id);
            None
        }
        Element::Beam(_beam) => {
            // Beam tessellation via bcad-bim::beam requires converting to beam params.
            // TODO: wire this up once beam_mesh API is finalized.
            None
        }
        // Non-3D elements: views, sheets, annotations, site metadata, symbols, etc.
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        convert_tessellated_mesh_to_y_up, door_mesh_with_host_lookup, find_host_wall,
        opening_specs_for_wall, tessellate_element, window_mesh_with_host_lookup,
    };
    use bcad_domain::{
        DoorElement, DoorHardwareType, DoorStyle, DoorSwing, Element, ElementMeta, WallElement,
        WindowElement, WindowHardwareType, WindowStyle,
    };
    use bcad_kernel::tessellation::TessellatedMesh;

    #[test]
    fn converts_positions_normals_and_winding_from_z_up_to_y_up() {
        let mut mesh = TessellatedMesh {
            positions: vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
            normals: vec![0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0],
            indices: vec![0, 1, 2],
        };

        convert_tessellated_mesh_to_y_up(&mut mesh);

        assert_eq!(
            mesh.positions,
            vec![1.0, 3.0, 2.0, 4.0, 6.0, 5.0, 7.0, 9.0, 8.0,]
        );
        assert_eq!(
            mesh.normals,
            vec![0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0,]
        );
        assert_eq!(mesh.indices, vec![0, 2, 1]);
    }

    fn host_wall() -> WallElement {
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

    #[test]
    fn finds_host_wall_by_id() {
        let wall = host_wall();
        let elements = vec![Element::Wall(wall.clone())];
        let found = find_host_wall(&elements, &wall.meta.id).unwrap();
        assert_eq!(found.meta.id, wall.meta.id);
    }

    #[test]
    fn generates_door_mesh_when_host_wall_exists() {
        let wall = host_wall();
        let door = DoorElement {
            meta: ElementMeta::new("Door"),
            wall_id: wall.meta.id.clone(),
            position_along_wall: 0.5,
            width: 0.9,
            height: 2.1,
            sill_height: 0.0,
            swing: DoorSwing::OutRight,
            hardware_type: DoorHardwareType::Lever,
            style: DoorStyle::Flush,
        };
        let elements = vec![Element::Wall(wall)];
        let mesh = door_mesh_with_host_lookup(&door, &elements).unwrap();
        assert!(!mesh.positions.is_empty());
    }

    #[test]
    fn generates_window_mesh_when_host_wall_exists() {
        let wall = host_wall();
        let window = WindowElement {
            meta: ElementMeta::new("Window"),
            wall_id: wall.meta.id.clone(),
            position_along_wall: 0.5,
            width: 1.2,
            height: 1.1,
            sill_height: 0.9,
            hardware_type: WindowHardwareType::Latch,
            style: WindowStyle::Picture,
        };
        let elements = vec![Element::Wall(wall)];
        let mesh = window_mesh_with_host_lookup(&window, &elements).unwrap();
        assert!(!mesh.positions.is_empty());
    }

    #[test]
    fn collects_door_and_window_openings_for_a_wall() {
        let wall = host_wall();
        let elements = vec![
            Element::Wall(wall.clone()),
            Element::Door(DoorElement {
                meta: ElementMeta::new("Door"),
                wall_id: wall.meta.id.clone(),
                position_along_wall: 0.25,
                width: 0.9,
                height: 2.1,
                sill_height: 0.0,
                swing: DoorSwing::OutRight,
                hardware_type: DoorHardwareType::Lever,
                style: DoorStyle::Flush,
            }),
            Element::Window(WindowElement {
                meta: ElementMeta::new("Window"),
                wall_id: wall.meta.id.clone(),
                position_along_wall: 0.75,
                width: 1.2,
                height: 1.1,
                sill_height: 0.9,
                hardware_type: WindowHardwareType::Latch,
                style: WindowStyle::Picture,
            }),
        ];

        let openings = opening_specs_for_wall(&wall.meta.id, &elements);

        assert_eq!(openings.len(), 2);
        assert_eq!(openings[0].width, 0.9);
        assert_eq!(openings[1].sill_height, 0.9);
    }

    #[test]
    fn wall_tessellation_uses_openings_from_hosted_elements() {
        let wall = host_wall();
        let wall_element = Element::Wall(wall.clone());
        let full_wall_mesh = tessellate_element(&wall_element, std::slice::from_ref(&wall_element))
            .expect("wall mesh without openings");

        let elements = vec![
            wall_element.clone(),
            Element::Door(DoorElement {
                meta: ElementMeta::new("Door"),
                wall_id: wall.meta.id.clone(),
                position_along_wall: 0.5,
                width: 0.9,
                height: 2.1,
                sill_height: 0.0,
                swing: DoorSwing::OutRight,
                hardware_type: DoorHardwareType::Lever,
                style: DoorStyle::Flush,
            }),
        ];
        let opening_wall_mesh =
            tessellate_element(&wall_element, &elements).expect("wall mesh with opening");

        assert!(opening_wall_mesh.positions.len() > full_wall_mesh.positions.len());
        assert!(opening_wall_mesh.indices.len() > full_wall_mesh.indices.len());
    }
}
