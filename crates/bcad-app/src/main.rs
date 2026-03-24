//! BetterCAD desktop application entry point.
//!
//! Creates the window, initializes GPU + egui, and runs the event loop.
//! All state mutations flow through the command processor.

mod ai_service;
mod command_processor;
mod event_loop;
mod file_ops;
mod mesh_regeneration;
mod plan_renderer_2d;
mod preview_renderer;
mod render_frame;
mod scene_renderer;

use winit::event_loop::EventLoop;

use crate::event_loop::App;

fn main() {
    // Load .env file (searches current dir and parents for .env)
    // Supports both ANTHROPIC_API_KEY and VITE_ANTHROPIC_API_KEY (for backward compat)
    if let Err(e) = dotenvy::dotenv() {
        // .env file is optional — not an error if missing
        if !matches!(e, dotenvy::Error::Io(_)) {
            eprintln!("Warning: .env parse error: {e}");
        }
    }

    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    log::info!("BetterCAD starting...");

    // Create winit event loop
    let event_loop = EventLoop::new().expect("Failed to create event loop");

    // Create the application (window + GPU init happens inside resumed)
    let mut app = App::new();

    // Run the event loop using winit 0.30 ApplicationHandler pattern
    event_loop
        .run_app(&mut app)
        .expect("Event loop exited with error");
}
