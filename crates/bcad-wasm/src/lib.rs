use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn ping() -> String {
    "pong".into()
}

/// Create a box solid and tessellate it into a triangle mesh.
#[wasm_bindgen]
pub fn create_and_tessellate_box(width: f64, height: f64, depth: f64) -> Result<JsValue, JsError> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| JsError::new(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&mesh).map_err(|e| JsError::new(&e.to_string()))
}

/// Extrude a 2D polygon (XY points) into a 3D solid and tessellate.
/// `points` is a flat array [x0, y0, x1, y1, ...]. `height` is the extrusion distance.
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

/// Create a wall solid from start/end points, height, and thickness, and tessellate it.
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
    let solid = params
        .to_solid()
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| JsError::new(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&mesh).map_err(|e| JsError::new(&e.to_string()))
}

/// Generate 2D plan view lines from a JSON array of wall params.
#[wasm_bindgen]
pub fn generate_plan_view(walls_json: &str) -> Result<String, JsError> {
    let walls: Vec<bcad_bim::wall::WallParams> =
        serde_json::from_str(walls_json).map_err(|e| JsError::new(&e.to_string()))?;
    let plan = bcad_bim::plan_view::generate_plan(&walls);
    serde_json::to_string(&plan).map_err(|e| JsError::new(&e.to_string()))
}

/// Solve sketch constraints. Takes a JSON sketch, returns solved JSON sketch.
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

/// Export a box as STEP format bytes.
/// Creates a box with the given dimensions and returns the STEP file content.
#[wasm_bindgen]
pub fn export_step_from_box(width: f64, height: f64, depth: f64) -> Result<Vec<u8>, JsError> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth)
        .map_err(|e| JsError::new(&e.to_string()))?;
    bcad_io::step::export_step(&[solid])
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Import STEP file data and return tessellated meshes as a JS array.
/// `data` is the raw bytes of the STEP file.
#[wasm_bindgen]
pub fn import_step_data(data: &[u8]) -> Result<JsValue, JsError> {
    let solids = bcad_io::step::import_step(data)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let meshes: Vec<_> = solids
        .iter()
        .filter_map(|s| bcad_kernel::tessellation::tessellate(s).ok())
        .collect();
    serde_wasm_bindgen::to_value(&meshes).map_err(|e| JsError::new(&e.to_string()))
}
