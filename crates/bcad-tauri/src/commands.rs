//! Tauri command handlers that expose bcad-kernel, bcad-bim, and bcad-io
//! functionality to the frontend.

use serde_json::Value;

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ping() -> String {
    "bcad-tauri pong".to_string()
}

// ---------------------------------------------------------------------------
// Kernel commands
// ---------------------------------------------------------------------------

/// Create a box solid and tessellate it in one step.
/// Returns {positions: number[], normals: number[], indices: number[]}.
#[tauri::command]
pub fn create_and_tessellate_box(
    width: f64,
    height: f64,
    depth: f64,
) -> Result<Value, String> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth)
        .map_err(|e| e.to_string())?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&mesh).map_err(|e| e.to_string())
}

/// Extrude a 2D polygon (flat array [x0, y0, x1, y1, ...]) by height.
/// Returns {positions: number[], normals: number[], indices: number[]}.
#[tauri::command]
pub fn extrude_sketch_points(points: Vec<f64>, height: f64) -> Result<Value, String> {
    if points.len() % 2 != 0 {
        return Err("points array must contain x/y pairs".into());
    }
    let pts: Vec<(f64, f64)> = points
        .chunks_exact(2)
        .map(|chunk| (chunk[0], chunk[1]))
        .collect();
    let solid = bcad_kernel::geometry::extrude_sketch_points(&pts, height)
        .map_err(|e| e.to_string())?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&mesh).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// BIM commands
// ---------------------------------------------------------------------------

/// Add a wall from (start_x, start_y) to (end_x, end_y) with the given
/// height and thickness, then tessellate it.
/// Returns {positions: number[], normals: number[], indices: number[]}.
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
    let solid = wall.to_solid().map_err(|e| e.to_string())?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&mesh).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// I/O commands
// ---------------------------------------------------------------------------

/// Import STEP data (raw bytes) and return an array of tessellated meshes.
/// Each element is {positions: number[], normals: number[], indices: number[]}.
#[tauri::command]
pub fn import_step(data: Vec<u8>) -> Result<Value, String> {
    let solids = bcad_io::step::import_step(&data).map_err(|e| e.to_string())?;
    let meshes: Vec<bcad_kernel::tessellation::TessellatedMesh> = solids
        .iter()
        .filter_map(|s| bcad_kernel::tessellation::tessellate(s).ok())
        .collect();
    serde_json::to_value(&meshes).map_err(|e| e.to_string())
}

/// Create a unit box, export it as STEP bytes, and return those bytes.
/// The width/height/depth parameters are currently unused (always exports a
/// 1×1×1 box as a proof-of-concept until scene serialisation is implemented).
#[tauri::command]
pub fn export_step(width: f64, height: f64, depth: f64) -> Result<Vec<u8>, String> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth)
        .map_err(|e| e.to_string())?;
    bcad_io::step::export_step(&[solid]).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Material library
// ---------------------------------------------------------------------------

/// Return the default PBR material library as a JSON array.
#[tauri::command]
pub fn get_material_library() -> Result<Value, String> {
    let lib = bcad_kernel::materials::MaterialLibrary::default_library();
    serde_json::to_value(&lib.materials).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Project persistence (.bcad format)
// ---------------------------------------------------------------------------

/// Serialize a project JSON string into a .bcad ZIP archive and return the
/// raw bytes.
#[tauri::command]
pub fn save_project(project_json: String) -> Result<Vec<u8>, String> {
    bcad_io::bcad_format::save_bcad(&project_json).map_err(|e| e.to_string())
}

/// Load a .bcad ZIP archive (raw bytes) and return the project JSON string.
#[tauri::command]
pub fn load_project(data: Vec<u8>) -> Result<String, String> {
    bcad_io::bcad_format::load_bcad(&data).map_err(|e| e.to_string())
}
