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
