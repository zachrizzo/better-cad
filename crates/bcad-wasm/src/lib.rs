use std::cell::RefCell;
use std::collections::HashMap;

use bcad_domain::{
    default_backend_capabilities, Element, ElementMeta, FloorElement, LevelElement,
    PrototypeProject, PrototypeState, StairElement, StairType, WallElement,
};
use bcad_kernel::tessellation::TessellatedMesh;
use wasm_bindgen::prelude::*;

thread_local! {
    static PROTOTYPE_STATE: RefCell<PrototypeState> = RefCell::new(PrototypeState::default());
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn ping() -> String {
    "pong".into()
}

#[wasm_bindgen]
pub fn get_capabilities() -> Result<JsValue, JsError> {
    serde_wasm_bindgen::to_value(&default_backend_capabilities())
        .map_err(|e| JsError::new(&e.to_string()))
}

fn translate_mesh(mesh: &mut TessellatedMesh, dx: f32, dy: f32, dz: f32) {
    for vertex in mesh.positions.chunks_exact_mut(3) {
        vertex[0] += dx;
        vertex[1] += dy;
        vertex[2] += dz;
    }
}

fn combine_meshes(meshes: &[TessellatedMesh]) -> Result<TessellatedMesh, JsError> {
    if meshes.is_empty() {
        return Err(JsError::new("no meshes to combine"));
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

    Ok(TessellatedMesh {
        positions,
        normals,
        indices,
    })
}

fn wall_mesh(
    wall: &WallElement,
    openings_by_wall: &HashMap<String, Vec<bcad_bim::wall::OpeningSpec>>,
) -> Result<TessellatedMesh, JsError> {
    let wall_params = bcad_bim::wall::WallParams {
        start: wall.start,
        end: wall.end,
        height: wall.height,
        thickness: wall.thickness,
    };
    let openings = openings_by_wall
        .get(&wall.meta.id)
        .cloned()
        .unwrap_or_default();

    bcad_bim::wall::wall_mesh_with_openings(&wall_params, &openings)
        .map_err(|e| JsError::new(&e.to_string()))
}

fn floor_mesh(floor: &FloorElement, stair_openings: &[Vec<[f64; 2]>]) -> Result<TessellatedMesh, JsError> {
    bcad_bim::slab::floor_mesh_with_openings(floor, stair_openings)
        .map_err(|e| JsError::new(&e.to_string()))
}

fn collect_stair_openings_by_target_level(elements: &[Element]) -> HashMap<String, Vec<Vec<[f64; 2]>>> {
    let mut levels: Vec<(&str, f64)> = elements
        .iter()
        .filter_map(|element| match element {
            Element::Level(level) => Some((level.meta.id.as_str(), level.elevation)),
            _ => None,
        })
        .collect();
    levels.sort_by(|a, b| a.1.total_cmp(&b.1));

    let mut next_level_by_id: HashMap<&str, &str> = HashMap::new();
    for pair in levels.windows(2) {
        next_level_by_id.insert(pair[0].0, pair[1].0);
    }

    let mut openings_by_level: HashMap<String, Vec<Vec<[f64; 2]>>> = HashMap::new();
    for element in elements {
        let Element::Stair(stair) = element else {
            continue;
        };

        let Some(source_level_id) = stair.meta.level_id.as_ref().map(|id| id.as_ref()) else {
            continue;
        };
        let Some(target_level_id) = next_level_by_id.get(source_level_id).copied() else {
            continue;
        };
        let Some(opening_loop) = bcad_bim::slab::stair_opening_boundary(stair) else {
            continue;
        };

        openings_by_level
            .entry(target_level_id.to_string())
            .or_default()
            .push(opening_loop);
    }

    openings_by_level
}

fn normalize_spiral_turns(turns: f64) -> f64 {
    let clamped = turns.clamp(-5.0, 5.0);
    if clamped.abs() < 0.1 {
        if clamped < 0.0 {
            -0.1
        } else {
            0.1
        }
    } else {
        clamped
    }
}

fn extrude_plan_mesh(points: &[(f64, f64)], height: f64, z_base: f64) -> Result<TessellatedMesh, JsError> {
    let solid = bcad_kernel::geometry::extrude_sketch_points(points, height)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mut mesh = bcad_kernel::tessellation::tessellate(&solid).map_err(|e| JsError::new(&e.to_string()))?;
    if z_base.abs() > 1e-9 {
        translate_mesh(&mut mesh, 0.0, 0.0, z_base as f32);
    }
    Ok(mesh)
}

fn stair_step_mesh(
    stair: &StairElement,
    seg_start: f64,
    seg_end: f64,
    z_base: f64,
    step_height: f64,
) -> Result<TessellatedMesh, JsError> {
    let dx = stair.end[0] - stair.start[0];
    let dy = stair.end[1] - stair.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-8 {
        return Err(JsError::new("stair has zero run length"));
    }

    let ux = dx / len;
    let uy = dy / len;
    let nx = -uy * stair.width * 0.5;
    let ny = ux * stair.width * 0.5;

    let sx = stair.start[0] + ux * seg_start;
    let sy = stair.start[1] + uy * seg_start;
    let ex = stair.start[0] + ux * seg_end;
    let ey = stair.start[1] + uy * seg_end;

    let points = vec![
        (sx + nx, sy + ny),
        (ex + nx, ey + ny),
        (ex - nx, ey - ny),
        (sx - nx, sy - ny),
    ];

    extrude_plan_mesh(&points, step_height, z_base)
}

fn annular_sector_points(
    center: [f64; 2],
    inner_radius: f64,
    outer_radius: f64,
    start_angle: f64,
    end_angle: f64,
) -> Vec<(f64, f64)> {
    let sweep = (end_angle - start_angle).abs();
    let segments = ((sweep / (std::f64::consts::PI / 12.0)).ceil() as usize).max(2);
    let mut points: Vec<(f64, f64)> = Vec::with_capacity((segments + 1) * 2);

    for i in 0..=segments {
        let t = i as f64 / segments as f64;
        let angle = start_angle + (end_angle - start_angle) * t;
        points.push((
            center[0] + angle.cos() * outer_radius,
            center[1] + angle.sin() * outer_radius,
        ));
    }

    for i in (0..=segments).rev() {
        let t = i as f64 / segments as f64;
        let angle = start_angle + (end_angle - start_angle) * t;
        points.push((
            center[0] + angle.cos() * inner_radius,
            center[1] + angle.sin() * inner_radius,
        ));
    }

    points
}

fn straight_stair_mesh(stair: &StairElement) -> Result<TessellatedMesh, JsError> {
    let dx = stair.end[0] - stair.start[0];
    let dy = stair.end[1] - stair.start[1];
    let run_len = (dx * dx + dy * dy).sqrt();
    if run_len < 1e-8 {
        return Err(JsError::new("stair has zero run length"));
    }

    let risers = stair.risers.max(1) as usize;
    let step_depth = run_len / risers as f64;
    let step_height = stair.total_height / risers as f64;

    let mut meshes = Vec::with_capacity(risers + 2);
    for i in 0..risers {
        let seg_start = i as f64 * step_depth;
        let seg_end = (i + 1) as f64 * step_depth;
        let z_base = i as f64 * step_height;
        meshes.push(stair_step_mesh(stair, seg_start, seg_end, z_base, step_height)?);
    }

    let side_wall_thickness = stair.side_wall_thickness.max(0.0);
    if side_wall_thickness > 1e-6 {
        let ux = dx / run_len;
        let uy = dy / run_len;
        let nx = -uy;
        let ny = ux;
        let half_width = stair.width * 0.5;
        let half_wall = side_wall_thickness * 0.5;

        for side in [1.0_f64, -1.0_f64] {
            let center_offset = side * (half_width + half_wall);
            let min_offset = center_offset - half_wall;
            let max_offset = center_offset + half_wall;
            let points = vec![
                (stair.start[0] + nx * min_offset, stair.start[1] + ny * min_offset),
                (stair.end[0] + nx * min_offset, stair.end[1] + ny * min_offset),
                (stair.end[0] + nx * max_offset, stair.end[1] + ny * max_offset),
                (stair.start[0] + nx * max_offset, stair.start[1] + ny * max_offset),
            ];
            meshes.push(extrude_plan_mesh(&points, stair.total_height, 0.0)?);
        }
    }

    combine_meshes(&meshes)
}

fn spiral_stair_mesh(stair: &StairElement) -> Result<TessellatedMesh, JsError> {
    let center = stair.start;
    let dx = stair.end[0] - center[0];
    let dy = stair.end[1] - center[1];
    let outer_radius = (dx * dx + dy * dy).sqrt();
    if outer_radius < 1e-8 {
        return Err(JsError::new("spiral stair has zero radius"));
    }

    let inner_radius_cap = (outer_radius - 0.01).max(0.01);
    let inner_radius = (outer_radius - stair.width).max(0.05).min(inner_radius_cap);
    let risers = stair.risers.max(1) as usize;
    let step_height = stair.total_height / risers as f64;
    let start_angle = dy.atan2(dx);
    let turns = normalize_spiral_turns(stair.spiral_turns);
    let total_angle = turns * std::f64::consts::PI * 2.0;

    let mut meshes = Vec::with_capacity(risers + 2);
    for i in 0..risers {
        let a0 = start_angle + total_angle * (i as f64 / risers as f64);
        let a1 = start_angle + total_angle * ((i + 1) as f64 / risers as f64);
        let z_base = i as f64 * step_height;
        let points = annular_sector_points(center, inner_radius, outer_radius, a0, a1);
        meshes.push(extrude_plan_mesh(&points, step_height, z_base)?);
    }

    let side_wall_thickness = stair.side_wall_thickness.max(0.0);
    if side_wall_thickness > 1e-6 {
        let end_angle = start_angle + total_angle;
        let outer_points = annular_sector_points(
            center,
            outer_radius,
            outer_radius + side_wall_thickness,
            start_angle,
            end_angle,
        );
        meshes.push(extrude_plan_mesh(&outer_points, stair.total_height, 0.0)?);

        let inner_wall_inner_radius = inner_radius - side_wall_thickness;
        if inner_wall_inner_radius > 0.01 {
            let inner_points = annular_sector_points(
                center,
                inner_wall_inner_radius,
                inner_radius,
                start_angle,
                end_angle,
            );
            meshes.push(extrude_plan_mesh(&inner_points, stair.total_height, 0.0)?);
        }
    }

    combine_meshes(&meshes)
}

fn stair_mesh(stair: &StairElement) -> Result<TessellatedMesh, JsError> {
    match stair.stair_type {
        StairType::Straight => straight_stair_mesh(stair),
        StairType::Spiral => spiral_stair_mesh(stair),
    }
}

fn assign_level_if_missing(element: &mut Element, level_id: &str) {
    match element {
        Element::Wall(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Floor(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Roof(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Foundation(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Column(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Beam(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Door(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Window(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Stair(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        Element::Room(e) => {
            if e.meta.level_id.is_none() {
                e.meta.level_id = Some(level_id.into());
            }
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Entity API (prototype v2)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn reset_project(name: &str, units: &str) {
    PROTOTYPE_STATE.with(|state| {
        state.borrow_mut().reset(name.to_string(), units.to_string());
    });
}

#[wasm_bindgen]
pub fn create_element(element_json: &str) -> Result<String, JsError> {
    let element: Element = serde_json::from_str(element_json).map_err(|e| JsError::new(&e.to_string()))?;
    PROTOTYPE_STATE.with(|state| {
        state
            .borrow_mut()
            .create_element(element)
            .map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn update_element(element_id: &str, element_json: &str) -> Result<(), JsError> {
    let element: Element = serde_json::from_str(element_json).map_err(|e| JsError::new(&e.to_string()))?;
    PROTOTYPE_STATE.with(|state| {
        state
            .borrow_mut()
            .update_element(element_id, element)
            .map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn delete_element(element_id: &str) -> Result<(), JsError> {
    PROTOTYPE_STATE.with(|state| {
        state
            .borrow_mut()
            .delete_element(element_id)
            .map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn query_elements() -> Result<String, JsError> {
    PROTOTYPE_STATE.with(|state| {
        serde_json::to_string(state.borrow().query_elements()).map_err(|e| JsError::new(&e.to_string()))
    })
}

#[derive(serde::Serialize)]
struct RegeneratedMesh {
    id: String,
    positions: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u32>,
}

#[wasm_bindgen]
pub fn regen_view() -> Result<JsValue, JsError> {
    let meshes = PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let stair_openings_by_level = collect_stair_openings_by_target_level(state.query_elements());
        let mut openings_by_wall: HashMap<String, Vec<bcad_bim::wall::OpeningSpec>> = HashMap::new();

        for element in state.query_elements() {
            match element {
                Element::Door(door) => {
                    openings_by_wall
                        .entry(door.wall_id.clone())
                        .or_default()
                        .push(bcad_bim::wall::OpeningSpec {
                            position_along_wall: door.position_along_wall,
                            width: door.width,
                            height: door.height,
                            sill_height: door.sill_height,
                        });
                }
                Element::Window(window) => {
                    openings_by_wall
                        .entry(window.wall_id.clone())
                        .or_default()
                        .push(bcad_bim::wall::OpeningSpec {
                            position_along_wall: window.position_along_wall,
                            width: window.width,
                            height: window.height,
                            sill_height: window.sill_height,
                        });
                }
                _ => {}
            }
        }

        // Build a lookup of walls by ID for door/window host resolution
        let mut walls_by_id: HashMap<String, &WallElement> = HashMap::new();
        for element in state.query_elements() {
            if let Element::Wall(wall) = element {
                walls_by_id.insert(wall.meta.id.clone(), wall);
            }
        }

        let mut meshes: Vec<RegeneratedMesh> = Vec::new();
        for element in state.query_elements_ordered() {
            match element {
                Element::Wall(wall) => {
                    let mesh = wall_mesh(wall, &openings_by_wall)?;
                    meshes.push(RegeneratedMesh {
                        id: wall.meta.id.clone(),
                        positions: mesh.positions,
                        normals: mesh.normals,
                        indices: mesh.indices,
                    });
                }
                Element::Floor(floor) => {
                    let stair_openings = floor
                        .meta
                        .level_id
                        .as_ref()
                        .and_then(|level_id| stair_openings_by_level.get(level_id.as_ref()))
                        .map(Vec::as_slice)
                        .unwrap_or(&[]);
                    let mesh = floor_mesh(floor, stair_openings)?;
                    meshes.push(RegeneratedMesh {
                        id: floor.meta.id.clone(),
                        positions: mesh.positions,
                        normals: mesh.normals,
                        indices: mesh.indices,
                    });
                }
                Element::Stair(stair) => {
                    let mesh = stair_mesh(stair)?;
                    meshes.push(RegeneratedMesh {
                        id: stair.meta.id.clone(),
                        positions: mesh.positions,
                        normals: mesh.normals,
                        indices: mesh.indices,
                    });
                }
                Element::Column(col) => {
                    match bcad_bim::column::column_mesh(col) {
                        Ok(mesh) => {
                            meshes.push(RegeneratedMesh {
                                id: col.meta.id.clone(),
                                positions: mesh.positions,
                                normals: mesh.normals,
                                indices: mesh.indices,
                            });
                        }
                        Err(_) => { /* skip column with invalid geometry */ }
                    }
                }
                Element::Beam(beam) => {
                    match bcad_bim::beam::beam_mesh(beam) {
                        Ok(mut mesh) => {
                            // Translate beam to its start Z elevation
                            let z_base = beam.start[2] as f32;
                            if z_base.abs() > 1e-6 {
                                translate_mesh(&mut mesh, 0.0, 0.0, z_base);
                            }
                            meshes.push(RegeneratedMesh {
                                id: beam.meta.id.clone(),
                                positions: mesh.positions,
                                normals: mesh.normals,
                                indices: mesh.indices,
                            });
                        }
                        Err(_) => { /* skip beam with invalid geometry */ }
                    }
                }
                Element::Foundation(found) => {
                    match bcad_bim::foundation::foundation_mesh(found) {
                        Ok(mut mesh) => {
                            // Translate foundation downward
                            translate_mesh(&mut mesh, 0.0, 0.0, -(found.thickness as f32));
                            meshes.push(RegeneratedMesh {
                                id: found.meta.id.clone(),
                                positions: mesh.positions,
                                normals: mesh.normals,
                                indices: mesh.indices,
                            });
                        }
                        Err(_) => { /* skip foundation with invalid geometry */ }
                    }
                }
                Element::Roof(roof) => {
                    match bcad_bim::roof::roof_mesh(roof) {
                        Ok(mut mesh) => {
                            // Translate roof to its elevation
                            let z = roof.elevation as f32;
                            if z.abs() > 1e-6 {
                                translate_mesh(&mut mesh, 0.0, 0.0, z);
                            }
                            meshes.push(RegeneratedMesh {
                                id: roof.meta.id.clone(),
                                positions: mesh.positions,
                                normals: mesh.normals,
                                indices: mesh.indices,
                            });
                        }
                        Err(_) => { /* skip roof with invalid geometry */ }
                    }
                }
                Element::Door(door) => {
                    if let Some(wall) = walls_by_id.get(&door.wall_id) {
                        let input = bcad_bim::door::DoorGeometryInput { door, host_wall: wall };
                        match bcad_bim::door::door_mesh(&input) {
                            Ok(mesh) => {
                                meshes.push(RegeneratedMesh {
                                    id: door.meta.id.clone(),
                                    positions: mesh.positions,
                                    normals: mesh.normals,
                                    indices: mesh.indices,
                                });
                            }
                            Err(_) => { /* skip door with invalid geometry */ }
                        }
                    }
                }
                Element::Window(window) => {
                    if let Some(wall) = walls_by_id.get(&window.wall_id) {
                        let input = bcad_bim::window::WindowGeometryInput { window, host_wall: wall };
                        match bcad_bim::window::window_mesh(&input) {
                            Ok(mesh) => {
                                meshes.push(RegeneratedMesh {
                                    id: window.meta.id.clone(),
                                    positions: mesh.positions,
                                    normals: mesh.normals,
                                    indices: mesh.indices,
                                });
                            }
                            Err(_) => { /* skip window with invalid geometry */ }
                        }
                    }
                }
                _ => {}
            }
        }

        Ok::<Vec<RegeneratedMesh>, JsError>(meshes)
    })?;

    serde_wasm_bindgen::to_value(&meshes).map_err(|e| JsError::new(&e.to_string()))
}

// ---------------------------------------------------------------------------
// Transitional geometry commands (kept while UI migrates)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn create_and_tessellate_box(width: f64, height: f64, depth: f64) -> Result<JsValue, JsError> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| JsError::new(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&mesh).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn extrude_sketch_points(points: &[f64], height: f64) -> Result<JsValue, JsError> {
    if points.len() % 2 != 0 {
        return Err(JsError::new("points array must have even length (x,y pairs)"));
    }
    let pts: Vec<(f64, f64)> = points.chunks_exact(2).map(|c| (c[0], c[1])).collect();
    let solid = bcad_kernel::geometry::extrude_sketch_points(&pts, height)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| JsError::new(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&mesh).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn add_wall(
    start_x: f64,
    start_y: f64,
    end_x: f64,
    end_y: f64,
    height: f64,
    thickness: f64,
) -> Result<JsValue, JsError> {
    let params = bcad_bim::wall::WallParams {
        start: [start_x, start_y],
        end: [end_x, end_y],
        height,
        thickness,
    };
    let mesh = bcad_bim::wall::wall_mesh_with_openings(&params, &[])
        .map_err(|e| JsError::new(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&mesh).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn generate_plan_view(walls_json: &str) -> Result<String, JsError> {
    let walls: Vec<bcad_bim::wall::WallParams> =
        serde_json::from_str(walls_json).map_err(|e| JsError::new(&e.to_string()))?;
    let plan = bcad_bim::plan_view::generate_plan(&walls);
    serde_json::to_string(&plan).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn solve_sketch(sketch_json: &str) -> Result<String, JsError> {
    let mut sketch: bcad_constraint::sketch::Sketch =
        serde_json::from_str(sketch_json).map_err(|e| JsError::new(&e.to_string()))?;
    let result = bcad_constraint::solver::solve(&mut sketch);
    if !result.converged {
        return Err(JsError::new(&format!(
            "Solver did not converge after {} iterations (residual: {:.6})",
            result.iterations, result.residual_norm
        )));
    }
    serde_json::to_string(&sketch).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn export_step_from_box(width: f64, height: f64, depth: f64) -> Result<Vec<u8>, JsError> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth)
        .map_err(|e| JsError::new(&e.to_string()))?;
    bcad_io::step::export_step(&[solid]).map_err(|e| JsError::new(&e.to_string()))
}

/// Export all project elements as a STEP file by creating box solids from the tessellated geometry.
/// For now, this creates one box solid per wall element (using wall bounding volume).
#[wasm_bindgen]
pub fn export_step_project() -> Result<Vec<u8>, JsError> {
    PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let elements = state.query_elements();

        let mut solids = Vec::new();
        for element in elements {
            match element {
                Element::Wall(wall) => {
                    let dx = wall.end[0] - wall.start[0];
                    let dy = wall.end[1] - wall.start[1];
                    let length = (dx * dx + dy * dy).sqrt();
                    if length < 1e-8 { continue; }
                    if let Ok(solid) = bcad_kernel::geometry::create_box(length, wall.thickness, wall.height) {
                        solids.push(solid);
                    }
                }
                Element::Floor(floor) => {
                    if floor.boundary.len() >= 2 {
                        let xs: Vec<f64> = floor.boundary.iter().map(|p| p[0]).collect();
                        let ys: Vec<f64> = floor.boundary.iter().map(|p| p[1]).collect();
                        let w = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max) - xs.iter().cloned().fold(f64::INFINITY, f64::min);
                        let d = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max) - ys.iter().cloned().fold(f64::INFINITY, f64::min);
                        if w > 1e-8 && d > 1e-8 {
                            if let Ok(solid) = bcad_kernel::geometry::create_box(w, d, floor.thickness) {
                                solids.push(solid);
                            }
                        }
                    }
                }
                Element::Stair(stair) => {
                    let dx = stair.end[0] - stair.start[0];
                    let dy = stair.end[1] - stair.start[1];
                    let run_len = (dx * dx + dy * dy).sqrt();
                    if run_len > 1e-8 {
                        if let Ok(solid) = bcad_kernel::geometry::create_box(run_len, stair.width, stair.total_height) {
                            solids.push(solid);
                        }
                    }
                }
                _ => {}
            }
        }

        if solids.is_empty() {
            return Err(JsError::new("no exportable geometry in project"));
        }

        bcad_io::step::export_step(&solids).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Export all project elements as a GLB (binary glTF 2.0) file using the regenerated meshes.
#[wasm_bindgen]
pub fn export_gltf_project() -> Result<Vec<u8>, JsError> {
    PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let elements = state.query_elements();
        let stair_openings_by_level = collect_stair_openings_by_target_level(elements);

        let mut openings_by_wall: HashMap<String, Vec<bcad_bim::wall::OpeningSpec>> = HashMap::new();
        for element in elements {
            match element {
                Element::Door(door) => {
                    openings_by_wall
                        .entry(door.wall_id.clone())
                        .or_default()
                        .push(bcad_bim::wall::OpeningSpec {
                            position_along_wall: door.position_along_wall,
                            width: door.width,
                            height: door.height,
                            sill_height: door.sill_height,
                        });
                }
                Element::Window(window) => {
                    openings_by_wall
                        .entry(window.wall_id.clone())
                        .or_default()
                        .push(bcad_bim::wall::OpeningSpec {
                            position_along_wall: window.position_along_wall,
                            width: window.width,
                            height: window.height,
                            sill_height: window.sill_height,
                        });
                }
                _ => {}
            }
        }

        // Build wall lookup for door/window host resolution
        let mut walls_by_id: HashMap<String, &WallElement> = HashMap::new();
        for element in state.query_elements() {
            if let Element::Wall(wall) = element {
                walls_by_id.insert(wall.meta.id.clone(), wall);
            }
        }

        let mut mesh_material_pairs: Vec<(bcad_kernel::tessellation::TessellatedMesh, bcad_kernel::materials::PbrMaterial)> = Vec::new();
        let mut element_infos: Vec<Option<bcad_io::gltf_export::GltfElementInfo>> = Vec::new();

        for element in state.query_elements() {
            match element {
                Element::Wall(wall) => {
                    if let Ok(mesh) = wall_mesh(wall, &openings_by_wall) {
                        element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                            element_id: wall.meta.id.clone(),
                            element_kind: "wall".to_string(),
                            element_name: wall.meta.name.clone(),
                        }));
                        mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Wall", [0.85, 0.85, 0.80, 1.0], 0.0, 0.7)));
                    }
                }
                Element::Floor(floor) => {
                    let stair_openings = floor
                        .meta
                        .level_id
                        .as_ref()
                        .and_then(|level_id| stair_openings_by_level.get(level_id.as_ref()))
                        .map(Vec::as_slice)
                        .unwrap_or(&[]);
                    if let Ok(mesh) = floor_mesh(floor, stair_openings) {
                        element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                            element_id: floor.meta.id.clone(),
                            element_kind: "floor".to_string(),
                            element_name: floor.meta.name.clone(),
                        }));
                        mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Floor", [0.6, 0.6, 0.55, 1.0], 0.0, 0.6)));
                    }
                }
                Element::Stair(stair) => {
                    if let Ok(mesh) = stair_mesh(stair) {
                        element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                            element_id: stair.meta.id.clone(),
                            element_kind: "stair".to_string(),
                            element_name: stair.meta.name.clone(),
                        }));
                        mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Stair", [0.5, 0.45, 0.35, 1.0], 0.0, 0.5)));
                    }
                }
                Element::Column(col) => {
                    if let Ok(mesh) = bcad_bim::column::column_mesh(col) {
                        element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                            element_id: col.meta.id.clone(),
                            element_kind: "column".to_string(),
                            element_name: col.meta.name.clone(),
                        }));
                        mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Column", [0.7, 0.7, 0.7, 1.0], 0.0, 0.6)));
                    }
                }
                Element::Beam(beam) => {
                    if let Ok(mut mesh) = bcad_bim::beam::beam_mesh(beam) {
                        let z_base = beam.start[2] as f32;
                        if z_base.abs() > 1e-6 {
                            translate_mesh(&mut mesh, 0.0, 0.0, z_base);
                        }
                        element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                            element_id: beam.meta.id.clone(),
                            element_kind: "beam".to_string(),
                            element_name: beam.meta.name.clone(),
                        }));
                        mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Beam", [0.65, 0.65, 0.65, 1.0], 0.0, 0.6)));
                    }
                }
                Element::Foundation(found) => {
                    if let Ok(mut mesh) = bcad_bim::foundation::foundation_mesh(found) {
                        translate_mesh(&mut mesh, 0.0, 0.0, -(found.thickness as f32));
                        element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                            element_id: found.meta.id.clone(),
                            element_kind: "foundation".to_string(),
                            element_name: found.meta.name.clone(),
                        }));
                        mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Foundation", [0.5, 0.5, 0.45, 1.0], 0.0, 0.8)));
                    }
                }
                Element::Roof(roof) => {
                    if let Ok(mut mesh) = bcad_bim::roof::roof_mesh(roof) {
                        let z = roof.elevation as f32;
                        if z.abs() > 1e-6 {
                            translate_mesh(&mut mesh, 0.0, 0.0, z);
                        }
                        element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                            element_id: roof.meta.id.clone(),
                            element_kind: "roof".to_string(),
                            element_name: roof.meta.name.clone(),
                        }));
                        mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Roof", [0.6, 0.3, 0.2, 1.0], 0.0, 0.5)));
                    }
                }
                Element::Door(door) => {
                    if let Some(wall) = walls_by_id.get(&door.wall_id) {
                        let input = bcad_bim::door::DoorGeometryInput { door, host_wall: wall };
                        if let Ok(mesh) = bcad_bim::door::door_mesh(&input) {
                            element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                                element_id: door.meta.id.clone(),
                                element_kind: "door".to_string(),
                                element_name: door.meta.name.clone(),
                            }));
                            mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Door", [0.4, 0.25, 0.15, 1.0], 0.0, 0.4)));
                        }
                    }
                }
                Element::Window(window) => {
                    if let Some(wall) = walls_by_id.get(&window.wall_id) {
                        let input = bcad_bim::window::WindowGeometryInput { window, host_wall: wall };
                        if let Ok(mesh) = bcad_bim::window::window_mesh(&input) {
                            element_infos.push(Some(bcad_io::gltf_export::GltfElementInfo {
                                element_id: window.meta.id.clone(),
                                element_kind: "window".to_string(),
                                element_name: window.meta.name.clone(),
                            }));
                            mesh_material_pairs.push((mesh, bcad_kernel::materials::PbrMaterial::new("Window", [0.6, 0.8, 0.9, 0.5], 0.0, 0.3)));
                        }
                    }
                }
                _ => {}
            }
        }

        if mesh_material_pairs.is_empty() {
            return Err(JsError::new("no exportable geometry in project"));
        }

        let refs: Vec<(&bcad_kernel::tessellation::TessellatedMesh, &bcad_kernel::materials::PbrMaterial)> =
            mesh_material_pairs.iter().map(|(m, mat)| (m, mat)).collect();

        bcad_io::gltf_export::export_gltf_with_extras(&refs, &element_infos).map_err(|e| JsError::new(&e.to_string()))
    })
}

// ---------------------------------------------------------------------------
// Documentation views (plan v2, section, elevation)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn generate_plan_view_v2() -> Result<String, JsError> {
    PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let elements = state.query_elements();
        let plan = bcad_bim::plan_view::generate_plan_from_elements(elements);
        serde_json::to_string(&plan).map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn generate_section_cut_view(
    cut_start_x: f64,
    cut_start_y: f64,
    cut_end_x: f64,
    cut_end_y: f64,
    cut_height: f64,
) -> Result<String, JsError> {
    PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let elements = state.query_elements();
        let data = bcad_bim::section_cut::generate_section_cut(
            [cut_start_x, cut_start_y],
            [cut_end_x, cut_end_y],
            cut_height,
            elements,
        );
        serde_json::to_string(&data).map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn generate_elevation_view(direction: &str) -> Result<String, JsError> {
    PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let elements = state.query_elements();
        let data = bcad_bim::section_cut::generate_elevation(direction, elements);
        serde_json::to_string(&data).map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn import_step_data(data: &[u8]) -> Result<JsValue, JsError> {
    let solids = bcad_io::step::import_step(data).map_err(|e| JsError::new(&e.to_string()))?;
    let meshes: Vec<_> = solids
        .iter()
        .filter_map(|s| bcad_kernel::tessellation::tessellate(s).ok())
        .collect();
    serde_wasm_bindgen::to_value(&meshes).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn get_material_library() -> Result<JsValue, JsError> {
    let lib = bcad_kernel::materials::MaterialLibrary::default_library();
    serde_wasm_bindgen::to_value(&lib.materials).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn save_project(project_json: &str) -> Result<Vec<u8>, JsError> {
    let project = if project_json.trim().is_empty() {
        PROTOTYPE_STATE.with(|state| state.borrow().project.clone())
    } else {
        serde_json::from_str::<PrototypeProject>(project_json).map_err(|e| JsError::new(&e.to_string()))?
    };

    bcad_io::prototype_format::save_project_v2(&project).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn load_project(data: &[u8]) -> Result<String, JsError> {
    let project = bcad_io::prototype_format::load_project_v2(data).map_err(|e| JsError::new(&e.to_string()))?;
    PROTOTYPE_STATE.with(|state| {
        state.borrow_mut().project = project.clone();
    });
    serde_json::to_string(&project).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
pub fn export_ifc_project() -> Result<Vec<u8>, JsError> {
    PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let elements = state.query_elements();
        bcad_io::ifc::export_ifc(elements).map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn export_dxf_project() -> Result<Vec<u8>, JsError> {
    PROTOTYPE_STATE.with(|state| {
        let state = state.borrow();
        let elements = state.query_elements();
        bcad_io::dxf_io::export_dxf(elements).map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn import_dxf_data(data: &[u8]) -> Result<String, JsError> {
    let elements = bcad_io::dxf_io::import_dxf(data).map_err(|e| JsError::new(&e.to_string()))?;
    PROTOTYPE_STATE.with(|state| {
        let mut state = state.borrow_mut();
        let level_id = if let Some(level) = state
            .query_elements()
            .iter()
            .find_map(|element| match element {
                Element::Level(level) => Some(level.meta.id.clone()),
                _ => None,
            })
        {
            level
        } else {
            let level = Element::Level(LevelElement {
                meta: ElementMeta::new("Imported Level"),
                elevation: 0.0,
            });
            let id = level.id().to_string();
            let _ = state.create_element(level);
            id
        };

        for mut element in elements {
            assign_level_if_missing(&mut element, &level_id);
            let _ = state.create_element(element);
        }
    });
    // Return the updated elements as JSON.
    PROTOTYPE_STATE.with(|state| {
        serde_json::to_string(state.borrow().query_elements())
            .map_err(|e| JsError::new(&e.to_string()))
    })
}

#[wasm_bindgen]
pub fn import_ifc_data(data: &[u8]) -> Result<String, JsError> {
    let result = bcad_io::ifc::import_ifc(data).map_err(|e| JsError::new(&e.to_string()))?;

    PROTOTYPE_STATE.with(|state| {
        let mut state = state.borrow_mut();
        let level_id = if let Some(level) = state
            .query_elements()
            .iter()
            .find_map(|element| match element {
                Element::Level(level) => Some(level.meta.id.clone()),
                _ => None,
            })
        {
            level
        } else {
            // Check if the imported elements already include a level
            if let Some(level) = result.elements.iter().find_map(|e| match e {
                Element::Level(l) => Some(l.meta.id.clone()),
                _ => None,
            }) {
                level
            } else {
                let level = Element::Level(LevelElement {
                    meta: ElementMeta::new("Imported Level"),
                    elevation: 0.0,
                });
                let id = level.id().to_string();
                let _ = state.create_element(level);
                id
            }
        };

        for mut element in result.elements {
            assign_level_if_missing(&mut element, &level_id);
            let _ = state.create_element(element);
        }
    });

    // Return the updated elements as JSON with warnings info
    PROTOTYPE_STATE.with(|state| {
        serde_json::to_string(state.borrow().query_elements())
            .map_err(|e| JsError::new(&e.to_string()))
    })
}
