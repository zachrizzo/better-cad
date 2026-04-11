//! 2D plan view renderer.
//!
//! Renders architectural plan elements (walls, doors, windows, columns, rooms,
//! stairs) as egui painter overlay using the `bcad_2d` symbol generators.

use bcad_2d::primitives::{SymbolPrimitive, TextAnchor};
use bcad_2d::style::{DomainColor, PenWeight, StyledPrimitive};
use bcad_2d::symbols::door_window::{
    self, DoorParams, Swing, WindowParams,
};
use bcad_2d::wall_outline::{self, WallOpening, WallSegment};
use bcad_domain::{DoorSwing, Element, WallElement};
use bcad_render::camera::CameraState;
use bcad_state::ui_state::Theme;
use egui::{Color32, FontId, Pos2, Rect, Stroke};

use crate::coordinate_transforms::{world_dist_to_px, world_to_screen_f64};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Render 2D plan view elements as an egui painter overlay.
///
/// Only elements assigned to the given `level_id` are rendered.
pub fn render_2d_plan(
    painter: &egui::Painter,
    viewport_rect: Rect,
    camera: &CameraState,
    elements: &[Element],
    level_id: &str,
    theme: Theme,
) {
    // Collect walls on this level for outline computation and door/window lookups.
    let walls_on_level: Vec<&WallElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Wall(w)
                if w.meta
                    .level_id
                    .as_ref()
                    .map(|l| l.as_ref() == level_id)
                    .unwrap_or(false) =>
            {
                Some(w)
            }
            _ => None,
        })
        .collect();

    // Build wall segments with opening intervals from doors and windows.
    let wall_segments: Vec<WallSegment> = walls_on_level
        .iter()
        .map(|w| {
            let wall_len = {
                let dx = w.end[0] - w.start[0];
                let dy = w.end[1] - w.start[1];
                (dx * dx + dy * dy).sqrt()
            };

            let openings: Vec<WallOpening> = if wall_len < 1e-6 {
                vec![]
            } else {
                elements
                    .iter()
                    .filter_map(|e| {
                        let (pos, width, wall_id) = match e {
                            Element::Door(d) => (d.position_along_wall, d.width, &d.wall_id),
                            Element::Window(win) => (win.position_along_wall, win.width, &win.wall_id),
                            _ => return None,
                        };
                        if wall_id != &w.meta.id {
                            return None;
                        }
                        let half_t = (width / wall_len) * 0.5;
                        let t_start = (pos - half_t).max(0.0);
                        let t_end = (pos + half_t).min(1.0);
                        if t_end > t_start {
                            Some(WallOpening { t_start, t_end })
                        } else {
                            None
                        }
                    })
                    .collect()
            };

            WallSegment {
                id: w.meta.id.clone(),
                start: w.start,
                end: w.end,
                thickness: w.thickness,
                openings,
            }
        })
        .collect();

    // Rendering order: hatch fill → outlines → symbols → annotations.

    // 1. Wall diagonal hatch fill (45°, FreeCAD/standard architectural style).
    let hatch_color = match theme {
        Theme::Dark => Color32::from_rgb(160, 160, 160),
        Theme::Light => Color32::from_rgb(80, 80, 80),
    };
    let hatch_stroke = Stroke::new(0.5, hatch_color);
    let hatch_lines = wall_outline::build_wall_hatch_lines(&wall_segments, 0.06);
    for line in &hatch_lines {
        let s = world_to_screen_f64(line.start, camera, viewport_rect);
        let e = world_to_screen_f64(line.end, camera, viewport_rect);
        painter.line_segment([s, e], hatch_stroke);
    }

    // 2. Wall outlines (with opening gaps).
    let wall_styled = wall_outline::build_visible_wall_styled_lines(&wall_segments);
    for sp in &wall_styled {
        draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
    }

    // --- Doors ---
    for element in elements {
        if let Element::Door(door) = element {
            let on_level = door
                .meta
                .level_id
                .as_ref()
                .map(|l| l.as_ref() == level_id)
                .unwrap_or(false);
            if !on_level {
                continue;
            }
            if let Some(wall) = walls_on_level.iter().find(|w| w.meta.id == door.wall_id) {
                let prims = generate_door_symbol(wall, door);
                for sp in &prims {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
        }
    }

    // --- Windows ---
    for element in elements {
        if let Element::Window(window) = element {
            let on_level = window
                .meta
                .level_id
                .as_ref()
                .map(|l| l.as_ref() == level_id)
                .unwrap_or(false);
            if !on_level {
                continue;
            }
            if let Some(wall) = walls_on_level.iter().find(|w| w.meta.id == window.wall_id) {
                let prims = generate_window_symbol(wall, window);
                for sp in &prims {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
        }
    }

    // --- Columns ---
    for element in elements {
        if let Element::Column(col) = element {
            let on_level = col
                .meta
                .level_id
                .as_ref()
                .map(|l| l.as_ref() == level_id)
                .unwrap_or(false);
            if !on_level {
                continue;
            }
            draw_column(painter, viewport_rect, camera, col, theme);
        }
    }

    // --- Rooms ---
    for element in elements {
        if let Element::Room(room) = element {
            let on_level = room
                .meta
                .level_id
                .as_ref()
                .map(|l| l.as_ref() == level_id)
                .unwrap_or(false);
            if !on_level {
                continue;
            }
            draw_room_label(painter, viewport_rect, camera, room, theme);
        }
    }

    // --- Stairs ---
    for element in elements {
        if let Element::Stair(stair) = element {
            let on_level = stair
                .meta
                .level_id
                .as_ref()
                .map(|l| l.as_ref() == level_id)
                .unwrap_or(false);
            if !on_level {
                continue;
            }
            draw_stair(painter, viewport_rect, camera, stair, theme);
        }
    }
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

fn domain_color_to_color32(dc: DomainColor, theme: Theme) -> Color32 {
    let (r, g, b) = dc.rgb();
    match theme {
        Theme::Dark => Color32::from_rgb(
            (r as u16 + 60).min(255) as u8,
            (g as u16 + 60).min(255) as u8,
            (b as u16 + 60).min(255) as u8,
        ),
        Theme::Light => Color32::from_rgb(r, g, b),
    }
}

fn pen_weight_to_px(pen: PenWeight) -> f32 {
    match pen {
        PenWeight::ExtraFine => 0.5,
        PenWeight::Fine => 1.0,
        PenWeight::Medium => 1.5,
        PenWeight::Wide => 2.0,
        PenWeight::Heavy => 2.5,
        PenWeight::ExtraHeavy => 3.0,
    }
}

// ---------------------------------------------------------------------------
// StyledPrimitive -> egui draw calls
// ---------------------------------------------------------------------------

fn draw_styled_primitive(
    painter: &egui::Painter,
    viewport: Rect,
    camera: &CameraState,
    sp: &StyledPrimitive,
    theme: Theme,
) {
    let color = domain_color_to_color32(sp.domain_color, theme);
    let width = pen_weight_to_px(sp.pen);
    let stroke = Stroke::new(width, color);

    match &sp.primitive {
        SymbolPrimitive::Polyline { points, closed } => {
            if points.len() < 2 {
                return;
            }
            let screen_pts: Vec<Pos2> = points
                .iter()
                .map(|p| world_to_screen_f64(*p, camera, viewport))
                .collect();

            if *closed && screen_pts.len() >= 3 {
                // Draw closed polyline as connected segments back to start.
                for pair in screen_pts.windows(2) {
                    painter.line_segment([pair[0], pair[1]], stroke);
                }
                painter.line_segment(
                    [*screen_pts.last().unwrap(), screen_pts[0]],
                    stroke,
                );
            } else {
                for pair in screen_pts.windows(2) {
                    painter.line_segment([pair[0], pair[1]], stroke);
                }
            }
        }
        SymbolPrimitive::Circle { center, radius } => {
            let screen_center = world_to_screen_f64(*center, camera, viewport);
            let screen_radius = world_dist_to_px(*radius, camera, viewport);
            painter.circle_stroke(screen_center, screen_radius, stroke);
        }
        SymbolPrimitive::Arc {
            center,
            radius,
            start_angle,
            end_angle,
        } => {
            // Tessellate arc to polyline.
            let segments = 32u32;
            let angle_span = end_angle - start_angle;
            let mut pts = Vec::with_capacity(segments as usize + 1);
            for i in 0..=segments {
                let t = i as f64 / segments as f64;
                let angle = start_angle + t * angle_span;
                let wx = center[0] + radius * angle.cos();
                let wy = center[1] + radius * angle.sin();
                pts.push(world_to_screen_f64([wx, wy], camera, viewport));
            }
            for pair in pts.windows(2) {
                painter.line_segment([pair[0], pair[1]], stroke);
            }
        }
        SymbolPrimitive::Text {
            position,
            content,
            font_size,
            anchor,
        } => {
            let screen_pos = world_to_screen_f64(*position, camera, viewport);
            let screen_font_size = world_dist_to_px(*font_size, camera, viewport).max(8.0);
            let align = match anchor {
                TextAnchor::TopLeft => egui::Align2::LEFT_TOP,
                TextAnchor::TopCenter => egui::Align2::CENTER_TOP,
                TextAnchor::TopRight => egui::Align2::RIGHT_TOP,
                TextAnchor::MiddleLeft => egui::Align2::LEFT_CENTER,
                TextAnchor::Center => egui::Align2::CENTER_CENTER,
                TextAnchor::MiddleRight => egui::Align2::RIGHT_CENTER,
                TextAnchor::BottomLeft => egui::Align2::LEFT_BOTTOM,
                TextAnchor::BottomCenter => egui::Align2::CENTER_BOTTOM,
                TextAnchor::BottomRight => egui::Align2::RIGHT_BOTTOM,
            };
            painter.text(
                screen_pos,
                align,
                content,
                FontId::proportional(screen_font_size),
                color,
            );
        }
        SymbolPrimitive::FilledRect { min, max } => {
            let screen_min = world_to_screen_f64(*min, camera, viewport);
            let screen_max = world_to_screen_f64(*max, camera, viewport);
            let rect = Rect::from_two_pos(screen_min, screen_max);
            painter.rect_filled(rect, 0.0, color);
        }
    }
}

// ---------------------------------------------------------------------------
// Door symbol generation
// ---------------------------------------------------------------------------

fn generate_door_symbol(
    wall: &WallElement,
    door: &bcad_domain::DoorElement,
) -> Vec<StyledPrimitive> {
    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let wall_len = (dx * dx + dy * dy).sqrt();
    if wall_len < 1e-6 {
        return Vec::new();
    }
    let ux = dx / wall_len;
    let uy = dy / wall_len;
    let nx = -uy;
    let ny = ux;

    let center = [
        wall.start[0] + ux * door.position_along_wall * wall_len,
        wall.start[1] + uy * door.position_along_wall * wall_len,
    ];

    let swing = match door.swing {
        DoorSwing::OutLeft | DoorSwing::InLeft => Swing::Left,
        DoorSwing::OutRight | DoorSwing::InRight => Swing::Right,
    };

    let normal = if door.swing.opens_towards_positive_normal() {
        [nx, ny]
    } else {
        [-nx, -ny]
    };

    let params = DoorParams {
        center,
        dir: [ux, uy],
        normal,
        width: door.width,
        wall_thickness: wall.thickness,
        swing,
    };

    door_window::single_swing_door(&params)
}

// ---------------------------------------------------------------------------
// Window symbol generation
// ---------------------------------------------------------------------------

fn generate_window_symbol(
    wall: &WallElement,
    window: &bcad_domain::WindowElement,
) -> Vec<StyledPrimitive> {
    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let wall_len = (dx * dx + dy * dy).sqrt();
    if wall_len < 1e-6 {
        return Vec::new();
    }
    let ux = dx / wall_len;
    let uy = dy / wall_len;
    let nx = -uy;
    let ny = ux;

    let center = [
        wall.start[0] + ux * window.position_along_wall * wall_len,
        wall.start[1] + uy * window.position_along_wall * wall_len,
    ];

    let params = WindowParams {
        center,
        dir: [ux, uy],
        normal: [nx, ny],
        width: window.width,
        wall_thickness: wall.thickness,
    };

    door_window::double_hung_window(&params)
}

// ---------------------------------------------------------------------------
// Column rendering
// ---------------------------------------------------------------------------

fn draw_column(
    painter: &egui::Painter,
    viewport: Rect,
    camera: &CameraState,
    col: &bcad_domain::ColumnElement,
    theme: Theme,
) {
    let color = domain_color_to_color32(DomainColor::Architectural, theme);
    let stroke = Stroke::new(pen_weight_to_px(PenWeight::Heavy), color);

    if let Some(diameter) = col.diameter {
        // Circular column: draw circle + cross.
        let screen_center = world_to_screen_f64(col.center, camera, viewport);
        let screen_radius = world_dist_to_px(diameter / 2.0, camera, viewport);
        painter.circle_stroke(screen_center, screen_radius, stroke);

        // X cross inside circle.
        let r = screen_radius * 0.707;
        let cross_stroke = Stroke::new(pen_weight_to_px(PenWeight::Fine), color);
        painter.line_segment(
            [
                Pos2::new(screen_center.x - r, screen_center.y - r),
                Pos2::new(screen_center.x + r, screen_center.y + r),
            ],
            cross_stroke,
        );
        painter.line_segment(
            [
                Pos2::new(screen_center.x + r, screen_center.y - r),
                Pos2::new(screen_center.x - r, screen_center.y + r),
            ],
            cross_stroke,
        );
    } else {
        // Rectangular column: filled rect + X cross.
        let hw = col.width / 2.0;
        let hd = col.depth / 2.0;
        let corners = [
            [col.center[0] - hw, col.center[1] - hd],
            [col.center[0] + hw, col.center[1] - hd],
            [col.center[0] + hw, col.center[1] + hd],
            [col.center[0] - hw, col.center[1] + hd],
        ];
        let screen_corners: Vec<Pos2> = corners
            .iter()
            .map(|c| world_to_screen_f64(*c, camera, viewport))
            .collect();

        // Filled background.
        let fill_color = Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), 40);
        painter.add(egui::Shape::convex_polygon(
            screen_corners.clone(),
            fill_color,
            Stroke::NONE,
        ));

        // Outline.
        for i in 0..4 {
            painter.line_segment(
                [screen_corners[i], screen_corners[(i + 1) % 4]],
                stroke,
            );
        }

        // X cross.
        let cross_stroke = Stroke::new(pen_weight_to_px(PenWeight::Fine), color);
        painter.line_segment([screen_corners[0], screen_corners[2]], cross_stroke);
        painter.line_segment([screen_corners[1], screen_corners[3]], cross_stroke);
    }
}

// ---------------------------------------------------------------------------
// Room label
// ---------------------------------------------------------------------------

fn draw_room_label(
    painter: &egui::Painter,
    viewport: Rect,
    camera: &CameraState,
    room: &bcad_domain::RoomElement,
    theme: Theme,
) {
    if room.boundary.is_empty() {
        return;
    }

    // Compute centroid.
    let n = room.boundary.len() as f64;
    let cx: f64 = room.boundary.iter().map(|p| p[0]).sum::<f64>() / n;
    let cy: f64 = room.boundary.iter().map(|p| p[1]).sum::<f64>() / n;

    let screen_pos = world_to_screen_f64([cx, cy], camera, viewport);
    let color = domain_color_to_color32(DomainColor::Annotation, theme);

    // Room name.
    painter.text(
        screen_pos,
        egui::Align2::CENTER_CENTER,
        &room.meta.name,
        FontId::proportional(14.0),
        color,
    );
}

// ---------------------------------------------------------------------------
// Stair symbol
// ---------------------------------------------------------------------------

fn draw_stair(
    painter: &egui::Painter,
    viewport: Rect,
    camera: &CameraState,
    stair: &bcad_domain::StairElement,
    theme: Theme,
) {
    let dx = stair.end[0] - stair.start[0];
    let dy = stair.end[1] - stair.start[1];
    let run_len = (dx * dx + dy * dy).sqrt();
    if run_len < 1e-6 || stair.risers == 0 {
        return;
    }

    let ux = dx / run_len;
    let uy = dy / run_len;
    let nx = -uy;
    let ny = ux;
    let half_w = stair.width / 2.0;

    let color = domain_color_to_color32(DomainColor::Architectural, theme);
    let outline_stroke = Stroke::new(pen_weight_to_px(PenWeight::Wide), color);
    let tread_stroke = Stroke::new(pen_weight_to_px(PenWeight::Fine), color);

    // Outline rectangle.
    let corners = [
        [
            stair.start[0] + nx * half_w,
            stair.start[1] + ny * half_w,
        ],
        [stair.end[0] + nx * half_w, stair.end[1] + ny * half_w],
        [stair.end[0] - nx * half_w, stair.end[1] - ny * half_w],
        [
            stair.start[0] - nx * half_w,
            stair.start[1] - ny * half_w,
        ],
    ];
    let screen_corners: Vec<Pos2> = corners
        .iter()
        .map(|c| world_to_screen_f64(*c, camera, viewport))
        .collect();
    for i in 0..4 {
        painter.line_segment(
            [screen_corners[i], screen_corners[(i + 1) % 4]],
            outline_stroke,
        );
    }

    // Tread lines across the width at each riser.
    let treads = stair.risers;
    for i in 1..treads {
        let t = i as f64 / treads as f64;
        let base_x = stair.start[0] + ux * run_len * t;
        let base_y = stair.start[1] + uy * run_len * t;
        let p1 = [base_x + nx * half_w, base_y + ny * half_w];
        let p2 = [base_x - nx * half_w, base_y - ny * half_w];
        let sp1 = world_to_screen_f64(p1, camera, viewport);
        let sp2 = world_to_screen_f64(p2, camera, viewport);
        painter.line_segment([sp1, sp2], tread_stroke);
    }

    // Direction arrow: from 1/3 to 2/3 along center.
    let arrow_start_t = 0.33;
    let arrow_end_t = 0.67;
    let arrow_s = [
        stair.start[0] + ux * run_len * arrow_start_t,
        stair.start[1] + uy * run_len * arrow_start_t,
    ];
    let arrow_e = [
        stair.start[0] + ux * run_len * arrow_end_t,
        stair.start[1] + uy * run_len * arrow_end_t,
    ];
    let ss = world_to_screen_f64(arrow_s, camera, viewport);
    let se = world_to_screen_f64(arrow_e, camera, viewport);
    painter.line_segment([ss, se], outline_stroke);

    // Arrowhead.
    let ah = run_len * 0.05;
    let tip = arrow_e;
    let al = [
        tip[0] - ux * ah + nx * ah * 0.5,
        tip[1] - uy * ah + ny * ah * 0.5,
    ];
    let ar = [
        tip[0] - ux * ah - nx * ah * 0.5,
        tip[1] - uy * ah - ny * ah * 0.5,
    ];
    let s_tip = world_to_screen_f64(tip, camera, viewport);
    let s_al = world_to_screen_f64(al, camera, viewport);
    let s_ar = world_to_screen_f64(ar, camera, viewport);
    painter.line_segment([s_al, s_tip], outline_stroke);
    painter.line_segment([s_ar, s_tip], outline_stroke);
}
