//! Camera control helpers — aspect ratio updates and look-at projection.
//!
//! The routing wrappers (`route_camera_drag_start`, `route_camera_drag_move`,
//! `route_scroll`) remain in `event_loop.rs` as coordinator glue because they
//! need access to the full `RunningState` struct which lives there.  This
//! module holds the stateless, individually testable pieces.

use bcad_render::camera::CameraState as RenderCameraState;
use bcad_render::viewport::ViewportLayout;
use bcad_state::ui_state::ViewMode;
use bcad_state::AppState;
use glam::Vec3;

// Re-export from event_loop for the view-mode conversion (internal helper).
use crate::event_loop::state_view_mode_to_render;

// ---------------------------------------------------------------------------
// Aspect ratio updates
// ---------------------------------------------------------------------------

/// Update the aspect ratios of both cameras to match the current window size
/// and the active view mode.
///
/// In Split mode the two viewports have different aspect ratios, so they are
/// updated independently.
pub(crate) fn update_camera_aspects(
    app_state: &AppState,
    c3d: &mut RenderCameraState,
    c2d: &mut RenderCameraState,
    w: u32,
    h: u32,
) {
    match app_state.ui.view_mode {
        ViewMode::TwoD => {
            c2d.aspect = w as f32 / h as f32;
            c3d.aspect = c2d.aspect;
        }
        ViewMode::ThreeD => {
            c3d.aspect = w as f32 / h as f32;
            c2d.aspect = c3d.aspect;
        }
        ViewMode::Split => {
            let layout =
                ViewportLayout::compute(state_view_mode_to_render(app_state.ui.view_mode), w, h);
            if let Some(ref r) = layout.viewport_2d {
                c2d.aspect = r.aspect();
            }
            if let Some(ref r) = layout.viewport_3d {
                c3d.aspect = r.aspect();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Programmatic look-at
// ---------------------------------------------------------------------------

/// Apply a world-space look-at pose to a `RenderCameraState`.
///
/// Sets all the derivative camera fields (`distance`, `azimuth`, `elevation`)
/// that the orbit controller uses so that the camera behaves correctly after a
/// programmatic jump.
pub(crate) fn apply_look_at_camera(
    camera: &mut RenderCameraState,
    position: [f64; 3],
    target: [f64; 3],
) {
    let position = Vec3::new(position[0] as f32, position[1] as f32, position[2] as f32);
    let target = Vec3::new(target[0] as f32, target[1] as f32, target[2] as f32);
    let delta = position - target;
    let distance = delta.length().max(0.1);

    camera.position = position;
    camera.target = target;
    camera.up = Vec3::Y;
    camera.distance = distance;
    camera.azimuth = delta.x.atan2(delta.z);
    camera.elevation = (delta.y / distance).asin();
}
