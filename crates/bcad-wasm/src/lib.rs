use std::cell::RefCell;
use std::collections::HashMap;

use bcad_domain::{Element, FloorElement, PrototypeProject, PrototypeState, StairElement, WallElement};
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

fn floor_mesh(floor: &FloorElement) -> Result<TessellatedMesh, JsError> {
    if floor.boundary.len() < 3 {
        return Err(JsError::new("floor boundary must have at least 3 points"));
    }

    let points: Vec<(f64, f64)> = floor.boundary.iter().map(|p| (p[0], p[1])).collect();
    let solid = bcad_kernel::geometry::extrude_sketch_points(&points, floor.thickness)
        .map_err(|e| JsError::new(&e.to_string()))?;
    bcad_kernel::tessellation::tessellate(&solid).map_err(|e| JsError::new(&e.to_string()))
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

    let solid = bcad_kernel::geometry::extrude_sketch_points(&points, step_height)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mut mesh = bcad_kernel::tessellation::tessellate(&solid).map_err(|e| JsError::new(&e.to_string()))?;
    if z_base.abs() > 1e-9 {
        translate_mesh(&mut mesh, 0.0, 0.0, z_base as f32);
    }
    Ok(mesh)
}

fn stair_mesh(stair: &StairElement) -> Result<TessellatedMesh, JsError> {
    let dx = stair.end[0] - stair.start[0];
    let dy = stair.end[1] - stair.start[1];
    let run_len = (dx * dx + dy * dy).sqrt();
    if run_len < 1e-8 {
        return Err(JsError::new("stair has zero run length"));
    }

    let risers = stair.risers.max(1) as usize;
    let step_depth = run_len / risers as f64;
    let step_height = stair.total_height / risers as f64;

    let mut step_meshes = Vec::new();
    for i in 0..risers {
        let seg_start = i as f64 * step_depth;
        let seg_end = (i + 1) as f64 * step_depth;
        let z_base = i as f64 * step_height;
        step_meshes.push(stair_step_mesh(
            stair,
            seg_start,
            seg_end,
            z_base,
            step_height,
        )?);
    }

    combine_meshes(&step_meshes)
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

        let mut meshes: Vec<RegeneratedMesh> = Vec::new();
        for element in state.query_elements() {
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
                    let mesh = floor_mesh(floor)?;
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
