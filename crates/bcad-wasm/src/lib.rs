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
///
/// Returns a JS object with `{ positions: number[], normals: number[], indices: number[] }`
/// where positions/normals are flat [x,y,z,...] arrays and indices are triangle indices.
#[wasm_bindgen]
pub fn create_and_tessellate_box(width: f64, height: f64, depth: f64) -> Result<JsValue, JsError> {
    let solid = bcad_kernel::geometry::create_box(width, height, depth)
        .map_err(|e| JsError::new(&e.to_string()))?;

    let mesh = bcad_kernel::tessellation::tessellate(&solid)
        .map_err(|e| JsError::new(&e.to_string()))?;

    serde_wasm_bindgen::to_value(&mesh).map_err(|e| JsError::new(&e.to_string()))
}
