//! Tauri desktop application shell for BetterCAD.

pub mod commands;

/// Build and run the Tauri application.
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::create_and_tessellate_box,
            commands::extrude_sketch_points,
            commands::add_wall,
            commands::import_step,
            commands::export_step,
            commands::get_material_library,
            commands::save_project,
            commands::load_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
