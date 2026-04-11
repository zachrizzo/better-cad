//! Shared 2D orthographic world-to-screen coordinate transforms.
//!
//! Both `plan_renderer_2d` and `preview_renderer` previously defined the same
//! projection inline.  This module provides the canonical implementations so
//! callers only need to `use crate::coordinate_transforms::*;`.

use bcad_render::camera::CameraState;
use egui::{Pos2, Rect};
use glam::Vec2;

/// Convert a 2D world coordinate `[f64; 2]` (plan X/Y) to screen pixels using
/// the 2D orthographic camera.
///
/// The orthographic mapping is:
/// ```text
/// half_w = zoom_level * aspect * 0.5
/// half_h = zoom_level * 0.5
/// ndc_x  = (world_x - pan_offset.x) / half_w
/// ndc_y  = (world_y - pan_offset.y) / half_h
/// screen_x = rect.center().x + ndc_x * rect.width()  * 0.5
/// screen_y = rect.center().y - ndc_y * rect.height() * 0.5   (Y flipped)
/// ```
pub fn world_to_screen_f64(world: [f64; 2], camera: &CameraState, rect: Rect) -> Pos2 {
    let hw = camera.zoom_level * camera.aspect * 0.5;
    let hh = camera.zoom_level * 0.5;
    let nx = (world[0] as f32 - camera.pan_offset.x) / hw;
    let ny = (world[1] as f32 - camera.pan_offset.y) / hh;
    Pos2::new(
        rect.center().x + nx * rect.width() * 0.5,
        rect.center().y - ny * rect.height() * 0.5,
    )
}

/// Convert a 2D world [`Vec2`] (plan coordinates) to screen pixels using the
/// 2D orthographic camera.
///
/// This is the `f32`-flavoured counterpart of [`world_to_screen_f64`].  Uses
/// the same math but accepts a `glam::Vec2` directly (as produced by the tool
/// system and preview geometry).
pub fn world_to_screen_vec2(world: Vec2, camera: &CameraState, rect: Rect) -> Pos2 {
    let half_w = camera.zoom_level * camera.aspect * 0.5;
    let half_h = camera.zoom_level * 0.5;
    let ndc_x = (world.x - camera.pan_offset.x) / half_w;
    let ndc_y = (world.y - camera.pan_offset.y) / half_h;
    let screen_x = (ndc_x + 1.0) * 0.5 * rect.width() + rect.min.x;
    let screen_y = (1.0 - ndc_y) * 0.5 * rect.height() + rect.min.y;
    Pos2::new(screen_x, screen_y)
}

/// Convert a world-space distance to approximate screen pixels (horizontal
/// axis).
///
/// Useful for mapping world-space radii / font sizes to screen-space values.
pub fn world_dist_to_px(dist: f64, camera: &CameraState, rect: Rect) -> f32 {
    let hw = camera.zoom_level * camera.aspect * 0.5;
    (dist as f32 / hw) * rect.width() * 0.5
}
