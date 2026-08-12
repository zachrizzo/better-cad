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
use egui::Rect;
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
    ui_viewport_rect: Rect,
) {
    match app_state.ui.view_mode {
        ViewMode::TwoD => {
            c2d.aspect = viewport_aspect(ui_viewport_rect, w, h);
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

fn viewport_aspect(rect: Rect, fallback_width: u32, fallback_height: u32) -> f32 {
    if rect.width() > 0.0 && rect.height() > 0.0 {
        rect.width() / rect.height()
    } else if fallback_height == 0 {
        1.0
    } else {
        fallback_width as f32 / fallback_height as f32
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

#[cfg(test)]
mod tests {
    use super::*;
    use egui::{pos2, vec2};

    #[test]
    fn two_d_mode_uses_visible_viewport_aspect() {
        let mut app_state = AppState::default();
        app_state.ui.view_mode = ViewMode::TwoD;

        let mut c3d = RenderCameraState::default_3d();
        let mut c2d = RenderCameraState::default_2d();
        let viewport_rect = Rect::from_min_size(pos2(84.0, 24.0), vec2(996.0, 600.0));

        update_camera_aspects(&app_state, &mut c3d, &mut c2d, 1400, 900, viewport_rect);

        let expected = viewport_rect.width() / viewport_rect.height();
        assert!((c2d.aspect - expected).abs() < f32::EPSILON);
        assert!((c3d.aspect - expected).abs() < f32::EPSILON);
    }
}
