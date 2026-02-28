//! Tauri command handlers exposing prototype-velocity entity operations.

use std::collections::HashMap;
use std::sync::Mutex;

use bcad_domain::{Element, FloorElement, PrototypeProject, PrototypeState, StairElement, WallElement};
use bcad_kernel::tessellation::TessellatedMesh;
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::{json, Value};

static PROTOTYPE_STATE: Lazy<Mutex<PrototypeState>> = Lazy::new(|| Mutex::new(PrototypeState::default()));

#[derive(Debug, Clone, Serialize)]
struct RegeneratedMesh {
    id: String,
    positions: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u32>,
}

fn translate_mesh(mesh: &mut TessellatedMesh, dx: f32, dy: f32, dz: f32) {
    for vertex in mesh.positions.chunks_exact_mut(3) {
        vertex[0] += dx;
        vertex[1] += dy;
        vertex[2] += dz;
    }
}

fn combine_meshes(meshes: &[TessellatedMesh]) -> Result<TessellatedMesh, String> {
    if meshes.is_empty() {
        return Err("no meshes to combine".into());
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
) -> Result<TessellatedMesh, String> {
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

    bcad_bim::wall::wall_mesh_with_openings(&wall_params, &openings).map_err(|e| e.to_string())
}

fn floor_mesh(floor: &FloorElement) -> Result<TessellatedMesh, String> {
    if floor.boundary.len() < 3 {
        return Err("floor boundary must have at least 3 points".into());
    }
    let points: Vec<(f64, f64)> = floor.boundary.iter().map(|p| (p[0], p[1])).collect();
    let solid = bcad_kernel::geometry::extrude_sketch_points(&points, floor.thickness)
        .map_err(|e| e.to_string())?;
    bcad_kernel::tessellation::tessellate(&solid).map_err(|e| e.to_string())
}

fn stair_step_mesh(
    stair: &StairElement,
    seg_start: f64,
    seg_end: f64,
    z_base: f64,
    step_height: f64,
) -> Result<TessellatedMesh, String> {
    let dx = stair.end[0] - stair.start[0];
    let dy = stair.end[1] - stair.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-8 {
        return Err("stair has zero run length".into());
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
        .map_err(|e| e.to_string())?;
    let mut mesh = bcad_kernel::tessellation::tessellate(&solid).map_err(|e| e.to_string())?;
    if z_base.abs() > 1e-9 {
        translate_mesh(&mut mesh, 0.0, 0.0, z_base as f32);
    }
    Ok(mesh)
}

fn stair_mesh(stair: &StairElement) -> Result<TessellatedMesh, String> {
    let dx = stair.end[0] - stair.start[0];
    let dy = stair.end[1] - stair.start[1];
    let run_len = (dx * dx + dy * dy).sqrt();
    if run_len < 1e-8 {
        return Err("stair has zero run length".into());
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
// Ping
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ping() -> String {
    "bcad-tauri pong".to_string()
}

// ---------------------------------------------------------------------------
// Entity API (prototype v2)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn reset_project(name: String, units: String) -> Result<(), String> {
    let mut state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
    state.reset(name, units);
    Ok(())
}

#[tauri::command]
pub fn create_element(element_json: String) -> Result<String, String> {
    let element: Element = serde_json::from_str(&element_json).map_err(|e| e.to_string())?;
    let mut state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
    state.create_element(element).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_element(element_id: String, element_json: String) -> Result<(), String> {
    let element: Element = serde_json::from_str(&element_json).map_err(|e| e.to_string())?;
    let mut state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
    state
        .update_element(&element_id, element)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_element(element_id: String) -> Result<(), String> {
    let mut state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
    state.delete_element(&element_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn query_elements() -> Result<String, String> {
    let state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
    serde_json::to_string(state.query_elements()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn regen_view() -> Result<Value, String> {
    let state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;

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

    serde_json::to_value(&meshes).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Transitional geometry commands (kept for compatibility while UI migrates)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn create_and_tessellate_box(width: f64, height: f64, depth: f64) -> Result<Value, String> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth).map_err(|e| e.to_string())?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid).map_err(|e| e.to_string())?;
    serde_json::to_value(&mesh).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn extrude_sketch_points(points: Vec<f64>, height: f64) -> Result<Value, String> {
    if points.len() % 2 != 0 {
        return Err("points array must contain x/y pairs".into());
    }
    let pts: Vec<(f64, f64)> = points
        .chunks_exact(2)
        .map(|chunk| (chunk[0], chunk[1]))
        .collect();
    let solid = bcad_kernel::geometry::extrude_sketch_points(&pts, height).map_err(|e| e.to_string())?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid).map_err(|e| e.to_string())?;
    serde_json::to_value(&mesh).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_wall(
    start_x: f64,
    start_y: f64,
    end_x: f64,
    end_y: f64,
    height: f64,
    thickness: f64,
) -> Result<Value, String> {
    let wall = bcad_bim::wall::WallParams {
        start: [start_x, start_y],
        end: [end_x, end_y],
        height,
        thickness,
    };

    let mesh = bcad_bim::wall::wall_mesh_with_openings(&wall, &[]).map_err(|e| e.to_string())?;
    serde_json::to_value(&mesh).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_plan_view(walls_json: String) -> Result<String, String> {
    let walls: Vec<bcad_bim::wall::WallParams> =
        serde_json::from_str(&walls_json).map_err(|e| e.to_string())?;
    let plan = bcad_bim::plan_view::generate_plan(&walls);
    serde_json::to_string(&plan).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// I/O commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn import_step(data: Vec<u8>) -> Result<Value, String> {
    let solids = bcad_io::step::import_step(&data).map_err(|e| e.to_string())?;
    let meshes: Vec<bcad_kernel::tessellation::TessellatedMesh> = solids
        .iter()
        .filter_map(|s| bcad_kernel::tessellation::tessellate(s).ok())
        .collect();
    serde_json::to_value(&meshes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_step(width: f64, height: f64, depth: f64) -> Result<Vec<u8>, String> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth).map_err(|e| e.to_string())?;
    bcad_io::step::export_step(&[solid]).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_material_library() -> Result<Value, String> {
    let lib = bcad_kernel::materials::MaterialLibrary::default_library();
    serde_json::to_value(&lib.materials).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_project(project_json: Option<String>) -> Result<Vec<u8>, String> {
    let project = if let Some(project_json) = project_json {
        serde_json::from_str::<PrototypeProject>(&project_json).map_err(|e| e.to_string())?
    } else {
        let state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
        state.project.clone()
    };

    bcad_io::prototype_format::save_project_v2(&project).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_project(data: Vec<u8>) -> Result<String, String> {
    let project = bcad_io::prototype_format::load_project_v2(&data).map_err(|e| e.to_string())?;
    {
        let mut state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
        state.project = project.clone();
    }
    serde_json::to_string(&project).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_summary() -> Result<Value, String> {
    let state = PROTOTYPE_STATE.lock().map_err(|e| e.to_string())?;
    Ok(json!({
        "name": state.project.name,
        "units": state.project.units,
        "element_count": state.project.elements.len(),
        "format": state.project.format,
        "version": state.project.version,
    }))
}
