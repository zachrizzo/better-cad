//! Tool preview geometry overlay renderer.
//!
//! Renders `PreviewGeometry` items (points, lines, polygons, labels, arcs)
//! produced by the active tool as an egui painter overlay on top of the 3D/2D
//! viewport. This provides visual feedback during drawing operations (wall
//! thickness outlines, snap markers, measurement labels, etc.).
//!
//! ## ISO 128 pen weight support
//!
//! The [`pen_to_screen_px`] function converts an ISO 128 [`PenWeight`] to
//! screen pixels based on the current viewport zoom level. Preview geometry
//! that carries pen weight information uses this to render lines at
//! standards-compliant visual thickness.

use bcad_2d::style::PenWeight;
use bcad_render::camera::CameraState;
use bcad_tools::tool_trait::{MarkerShape, PreviewGeometry};
use egui::{Color32, FontId, Pos2, Rect, Stroke};
use glam::Vec2;

use crate::coordinate_transforms::world_to_screen_vec2;

// ---------------------------------------------------------------------------
// Color conversion
// ---------------------------------------------------------------------------

/// Convert an [f32; 4] RGBA color to egui's `Color32`.
fn to_color32(c: [f32; 4]) -> Color32 {
    Color32::from_rgba_unmultiplied(
        (c[0] * 255.0) as u8,
        (c[1] * 255.0) as u8,
        (c[2] * 255.0) as u8,
        (c[3] * 255.0) as u8,
    )
}

// ---------------------------------------------------------------------------
// ISO 128 pen weight -> screen pixel conversion
// ---------------------------------------------------------------------------

/// Convert an ISO 128 [`PenWeight`] to screen-space pixel width.
///
/// The pen weight (in mm on paper) is converted to pixels using the current
/// viewport zoom level. At zoom = 1.0, the mapping assumes 96 DPI
/// (1 px ~ 0.2646 mm). The result is clamped to a minimum of 1.0 px so that
/// every visible line remains perceptible regardless of zoom.
///
/// # Example
///
/// ```rust,ignore
/// let px = pen_to_screen_px(PenWeight::Heavy, camera.zoom_level);
/// let stroke = Stroke::new(px, Color32::BLACK);
/// ```
#[allow(dead_code)]
pub fn pen_to_screen_px(pen: PenWeight, zoom: f32) -> f32 {
    // PenWeight::screen_px already implements the mm-to-px conversion with
    // zoom scaling: (mm / 0.2646) * zoom.
    pen.screen_px(zoom).max(1.0)
}

// ---------------------------------------------------------------------------
// World-to-screen projection
// ---------------------------------------------------------------------------

/// Project a world-space 2D point (plan XZ coordinates) to screen-space `Pos2`
/// using the 3D perspective camera.
///
/// The tool system works in plan coordinates (X, Z) where Y is the elevation.
/// We project through the camera's view-projection matrix to NDC, then to
/// screen coordinates. `level_y` is the Y elevation of the active level.
fn world_to_screen_3d(
    world: Vec2,
    camera: &CameraState,
    viewport: Rect,
    level_y: f32,
) -> Option<Pos2> {
    let vp_matrix = camera.view_projection_matrix();
    let world_pos = glam::Vec4::new(world.x, level_y, world.y, 1.0);
    let clip = vp_matrix * world_pos;

    // Behind the camera -- don't render.
    if clip.w <= 0.0 {
        return None;
    }

    let ndc_x = clip.x / clip.w;
    let ndc_y = clip.y / clip.w;
    let screen_x = (ndc_x + 1.0) * 0.5 * viewport.width() + viewport.min.x;
    let screen_y = (1.0 - ndc_y) * 0.5 * viewport.height() + viewport.min.y;
    Some(Pos2::new(screen_x, screen_y))
}

// ---------------------------------------------------------------------------
// Main rendering entry point
// ---------------------------------------------------------------------------

/// Render tool preview geometry as an egui overlay.
///
/// `is_2d` selects the projection mode. `camera_2d` and `camera_3d` are the
/// current camera states. `level_y` is the active level elevation (used for 3D
/// projection).
pub fn render_preview(
    painter: &egui::Painter,
    viewport: Rect,
    preview: &[PreviewGeometry],
    camera_2d: &CameraState,
    camera_3d: &CameraState,
    is_2d: bool,
    level_y: f32,
) {
    // Closure that projects world coords to screen coords.
    let project = |world: Vec2| -> Option<Pos2> {
        if is_2d {
            Some(world_to_screen_vec2(world, camera_2d, viewport))
        } else {
            world_to_screen_3d(world, camera_3d, viewport, level_y)
        }
    };

    for geom in preview {
        match geom {
            PreviewGeometry::Point {
                position,
                radius,
                color,
                shape,
            } => {
                if let Some(screen_pos) = project(*position) {
                    // Convert radius from world units to screen pixels.
                    // Use a reference offset to compute pixel scale.
                    let pixel_radius = world_radius_to_pixels(
                        *position, *radius, camera_2d, camera_3d, viewport, is_2d, level_y,
                    );
                    let c = to_color32(*color);
                    render_point_marker(painter, screen_pos, pixel_radius, c, shape);
                }
            }
            PreviewGeometry::Line {
                points,
                color,
                width,
                dashed,
                dash_size,
                gap_size,
            } => {
                let screen_pts: Vec<Pos2> = points.iter().filter_map(|p| project(*p)).collect();
                if screen_pts.len() < 2 {
                    continue;
                }
                let c = to_color32(*color);
                let stroke = Stroke::new(*width, c);
                if *dashed {
                    render_dashed_polyline(
                        painter,
                        &screen_pts,
                        stroke,
                        *dash_size,
                        *gap_size,
                        camera_2d,
                        camera_3d,
                        viewport,
                        is_2d,
                        level_y,
                    );
                } else {
                    // Draw as connected line segments.
                    for pair in screen_pts.windows(2) {
                        painter.line_segment([pair[0], pair[1]], stroke);
                    }
                }
            }
            PreviewGeometry::Polygon { vertices, color } => {
                let screen_pts: Vec<Pos2> = vertices.iter().filter_map(|p| project(*p)).collect();
                if screen_pts.len() < 3 {
                    continue;
                }
                let c = to_color32(*color);
                painter.add(egui::Shape::convex_polygon(screen_pts, c, Stroke::NONE));
            }
            PreviewGeometry::Label {
                position,
                text,
                font_size,
                color,
            } => {
                if let Some(screen_pos) = project(*position) {
                    let c = to_color32(*color);
                    // Offset label slightly above the point.
                    let label_pos = Pos2::new(screen_pos.x, screen_pos.y - 14.0);
                    painter.text(
                        label_pos,
                        egui::Align2::CENTER_BOTTOM,
                        text,
                        FontId::proportional(*font_size),
                        c,
                    );
                }
            }
            PreviewGeometry::Arc {
                center,
                radius,
                start_angle,
                end_angle,
                color,
                width,
                dashed,
            } => {
                // Tessellate arc to line segments.
                let segments = 32u32;
                let mut arc_pts = Vec::with_capacity(segments as usize + 1);
                let angle_span = end_angle - start_angle;
                for i in 0..=segments {
                    let t = i as f32 / segments as f32;
                    let angle = start_angle + t * angle_span;
                    let wx = center.x + radius * angle.cos();
                    let wy = center.y + radius * angle.sin();
                    if let Some(sp) = project(Vec2::new(wx, wy)) {
                        arc_pts.push(sp);
                    }
                }
                if arc_pts.len() < 2 {
                    continue;
                }
                let c = to_color32(*color);
                let stroke = Stroke::new(*width, c);
                if *dashed {
                    render_dashed_polyline(
                        painter, &arc_pts, stroke, 8.0, 4.0, camera_2d, camera_3d, viewport, is_2d,
                        level_y,
                    );
                } else {
                    for pair in arc_pts.windows(2) {
                        painter.line_segment([pair[0], pair[1]], stroke);
                    }
                }
            }
            PreviewGeometry::Mesh3D { .. } => {
                // 3D mesh preview is not rendered via egui overlay.
                // It would require a separate wgpu render pipeline.
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helper: world radius to pixel radius
// ---------------------------------------------------------------------------

/// Convert a world-space radius to screen-space pixel radius.
fn world_radius_to_pixels(
    center: Vec2,
    radius: f32,
    camera_2d: &CameraState,
    camera_3d: &CameraState,
    viewport: Rect,
    is_2d: bool,
    level_y: f32,
) -> f32 {
    if is_2d {
        let c = world_to_screen_vec2(center, camera_2d, viewport);
        let edge =
            world_to_screen_vec2(Vec2::new(center.x + radius, center.y), camera_2d, viewport);
        (edge.x - c.x).abs().max(4.0)
    } else {
        let c = world_to_screen_3d(center, camera_3d, viewport, level_y);
        let edge = world_to_screen_3d(
            Vec2::new(center.x + radius, center.y),
            camera_3d,
            viewport,
            level_y,
        );
        match (c, edge) {
            (Some(cp), Some(ep)) => (ep.x - cp.x).abs().max(4.0),
            _ => 6.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Helper: render point markers (circle, ring, diamond, square, hexagon)
// ---------------------------------------------------------------------------

fn render_point_marker(
    painter: &egui::Painter,
    pos: Pos2,
    radius: f32,
    color: Color32,
    shape: &MarkerShape,
) {
    match shape {
        MarkerShape::Circle => {
            painter.circle_filled(pos, radius, color);
        }
        MarkerShape::Ring { inner_radius } => {
            // Draw as a thick circle stroke.
            let outer = radius;
            let inner_px = inner_radius / 0.1 * radius; // Scale inner relative
            let stroke_width = (outer - inner_px).max(1.5);
            let mid_r = (outer + inner_px) * 0.5;
            painter.circle_stroke(pos, mid_r, Stroke::new(stroke_width, color));
        }
        MarkerShape::Diamond => {
            let pts = vec![
                Pos2::new(pos.x, pos.y - radius),
                Pos2::new(pos.x + radius, pos.y),
                Pos2::new(pos.x, pos.y + radius),
                Pos2::new(pos.x - radius, pos.y),
            ];
            painter.add(egui::Shape::convex_polygon(pts, color, Stroke::NONE));
        }
        MarkerShape::Square => {
            let r = radius * 0.707; // inscribed square
            let pts = vec![
                Pos2::new(pos.x - r, pos.y - r),
                Pos2::new(pos.x + r, pos.y - r),
                Pos2::new(pos.x + r, pos.y + r),
                Pos2::new(pos.x - r, pos.y + r),
            ];
            painter.add(egui::Shape::convex_polygon(pts, color, Stroke::NONE));
        }
        MarkerShape::Hexagon => {
            let mut pts = Vec::with_capacity(6);
            for i in 0..6 {
                let angle = std::f32::consts::FRAC_PI_3 * i as f32;
                pts.push(Pos2::new(
                    pos.x + radius * angle.cos(),
                    pos.y + radius * angle.sin(),
                ));
            }
            painter.add(egui::Shape::convex_polygon(pts, color, Stroke::NONE));
        }
    }
}

// ---------------------------------------------------------------------------
// Helper: dashed polyline
// ---------------------------------------------------------------------------

/// Render a dashed polyline. `dash_size` and `gap_size` are in world units;
/// we convert them to approximate screen pixels for the dash pattern.
fn render_dashed_polyline(
    painter: &egui::Painter,
    points: &[Pos2],
    stroke: Stroke,
    dash_world: f32,
    gap_world: f32,
    camera_2d: &CameraState,
    camera_3d: &CameraState,
    viewport: Rect,
    is_2d: bool,
    level_y: f32,
) {
    // Compute approximate pixels-per-world-unit from the viewport center.
    let ppwu = pixels_per_world_unit(camera_2d, camera_3d, viewport, is_2d, level_y);
    let dash_px = (dash_world * ppwu).max(4.0);
    let gap_px = (gap_world * ppwu).max(2.0);

    let mut remaining_dash = dash_px;
    let mut drawing = true; // true = dash, false = gap

    for pair in points.windows(2) {
        let (p0, p1) = (pair[0], pair[1]);
        let dx = p1.x - p0.x;
        let dy = p1.y - p0.y;
        let seg_len = (dx * dx + dy * dy).sqrt();
        if seg_len < 0.5 {
            continue;
        }
        let ux = dx / seg_len;
        let uy = dy / seg_len;

        let mut traveled = 0.0_f32;
        while traveled < seg_len {
            let step = remaining_dash.min(seg_len - traveled);
            if drawing {
                let a = Pos2::new(p0.x + ux * traveled, p0.y + uy * traveled);
                let b = Pos2::new(p0.x + ux * (traveled + step), p0.y + uy * (traveled + step));
                painter.line_segment([a, b], stroke);
            }
            traveled += step;
            remaining_dash -= step;
            if remaining_dash <= 0.0 {
                drawing = !drawing;
                remaining_dash = if drawing { dash_px } else { gap_px };
            }
        }
    }
}

/// Approximate pixels-per-world-unit at the viewport center.
fn pixels_per_world_unit(
    camera_2d: &CameraState,
    camera_3d: &CameraState,
    viewport: Rect,
    is_2d: bool,
    level_y: f32,
) -> f32 {
    let center = Vec2::new(
        if is_2d {
            camera_2d.pan_offset.x
        } else {
            camera_3d.target.x
        },
        if is_2d {
            camera_2d.pan_offset.y
        } else {
            camera_3d.target.z
        },
    );
    let offset = Vec2::new(center.x + 1.0, center.y);
    if is_2d {
        let sc = world_to_screen_vec2(center, camera_2d, viewport);
        let so = world_to_screen_vec2(offset, camera_2d, viewport);
        (so.x - sc.x).abs().max(1.0)
    } else {
        let sc = world_to_screen_3d(center, camera_3d, viewport, level_y);
        let so = world_to_screen_3d(offset, camera_3d, viewport, level_y);
        match (sc, so) {
            (Some(a), Some(b)) => (b.x - a.x).abs().max(1.0),
            _ => 50.0, // fallback
        }
    }
}
