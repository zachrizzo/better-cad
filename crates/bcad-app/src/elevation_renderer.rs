//! Elevation view renderer — generates a side/front/rear view of the building.
//!
//! An elevation projects the 3D building onto a vertical plane, showing
//! wall heights, window positions, and door openings.
//!
//! ## Coordinate conventions
//!
//! The plan uses a flat XY coordinate system where X and Y are the horizontal
//! axes.  For a given elevation direction, one of those horizontal axes becomes
//! the "parallel" axis (shown as X in the elevation view) and the viewing axis
//! is the perpendicular one.  The vertical "Y" of the elevation is the
//! building Z-height (stored in `WallElement::height`).
//!
//! ## Projection algorithm
//!
//! A wall segment has two endpoints in plan space.  The projection of each
//! endpoint onto the elevation canvas is:
//!   - `ex = dot(endpoint, parallel_axis)` — position along the wall "width"
//!   - `ey = wall_height`                  — full height (roof at top)
//! Walls running perpendicular to the viewing direction are shown edge-on as a
//! thin vertical line; walls running parallel are shown as full rectangles.
//!
//! Door and window openings are placed along the wall using
//! `position_along_wall * wall_length` and drawn as cut-outs.

use bcad_domain::{DoorElement, Element, WallElement, WindowElement};
use bcad_state::ui_state::Theme;
use egui::{Color32, Painter, Pos2, Rect, Stroke, StrokeKind};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Cardinal direction from which the elevation is viewed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElevationDirection {
    /// Looking south (viewer is to the north; shows the south face).
    North,
    /// Looking north (viewer is to the south; shows the north face).
    South,
    /// Looking west (viewer is to the east; shows the east face).
    East,
    /// Looking east (viewer is to the west; shows the west face).
    West,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Generate an elevation view for the given direction and render it into
/// `viewport` using egui's `Painter`.
///
/// Walls are drawn as rectangles (height × projected length along the viewing
/// axis).  Door and window openings are cut into the wall rectangle using the
/// background colour.
///
/// The projection auto-scales to fit all geometry inside `viewport` with a
/// small padding margin.
pub fn render_elevation(
    painter: &Painter,
    viewport: Rect,
    elements: &[Element],
    direction: ElevationDirection,
    theme: Theme,
) {
    // Collect relevant walls and their openings.
    let walls: Vec<&WallElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Wall(w) => Some(w),
            _ => None,
        })
        .collect();

    if walls.is_empty() {
        return;
    }

    // Build a list of elevation wall strips.
    let strips: Vec<ElevStrip> = walls
        .iter()
        .filter_map(|w| elevation_strip(w, direction))
        .collect();

    if strips.is_empty() {
        return;
    }

    // Collect openings (doors + windows) per wall.
    let doors: Vec<&DoorElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Door(d) => Some(d),
            _ => None,
        })
        .collect();
    let windows: Vec<&WindowElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Window(w) => Some(w),
            _ => None,
        })
        .collect();

    // Compute world-space bounding box of the elevation to derive the scale.
    let (world_x_min, world_x_max, world_h_max) = {
        let mut xmin = f64::MAX;
        let mut xmax = f64::MIN;
        let mut hmax = 0.01_f64;
        for s in &strips {
            xmin = xmin.min(s.x_start).min(s.x_end);
            xmax = xmax.max(s.x_start).max(s.x_end);
            hmax = hmax.max(s.height);
        }
        (xmin, xmax, hmax)
    };

    let world_w = (world_x_max - world_x_min).max(0.01);
    let pad = 0.05_f32;
    let avail_w = viewport.width() * (1.0 - 2.0 * pad);
    let avail_h = viewport.height() * (1.0 - 2.0 * pad);
    let scale = (avail_w / world_w as f32).min(avail_h / world_h_max as f32);

    // Project helper: world (elevation_x, elevation_y) → screen Pos2.
    // In the elevation, Y=0 is ground (bottom of the viewport, minus padding),
    // Y increases upward.
    let origin_x = viewport.min.x + viewport.width() * pad - world_x_min as f32 * scale;
    let origin_y = viewport.max.y - viewport.height() * pad; // screen Y of ground line

    let to_screen = |ex: f64, ey: f64| -> Pos2 {
        Pos2::new(
            origin_x + ex as f32 * scale,
            origin_y - ey as f32 * scale, // flip Y: up in world = up on screen
        )
    };

    // Colors.
    let wall_fill = match theme {
        Theme::Dark => Color32::from_rgb(80, 80, 90),
        Theme::Light => Color32::from_rgb(200, 200, 210),
    };
    let bg_color = match theme {
        Theme::Dark => Color32::from_rgb(30, 30, 35),
        Theme::Light => Color32::from_rgb(245, 245, 250),
    };
    let outline_stroke = Stroke::new(
        2.0,
        match theme {
            Theme::Dark => Color32::from_rgb(220, 220, 230),
            Theme::Light => Color32::from_rgb(20, 20, 30),
        },
    );
    let opening_stroke = Stroke::new(
        1.0,
        match theme {
            Theme::Dark => Color32::from_rgb(150, 150, 160),
            Theme::Light => Color32::from_rgb(80, 80, 90),
        },
    );

    // Draw each wall strip.
    for strip in &strips {
        let tl = to_screen(strip.x_start, strip.height);
        let br = to_screen(strip.x_end, 0.0);
        let rect = Rect::from_two_pos(tl, br);

        // 1. Filled rectangle for the wall.
        painter.rect_filled(rect, 0.0, wall_fill);

        // 2. Wall outline.
        painter.rect_stroke(rect, 0.0, outline_stroke, StrokeKind::Middle);

        // 3. Door openings: cut out using background colour, add frame lines.
        let wall_len = (strip.x_end - strip.x_start).abs();
        for door in &doors {
            if door.wall_id != strip.wall_id {
                continue;
            }
            let center_ex = strip.x_start + door.position_along_wall * wall_len;
            let half_w = door.width / 2.0;
            let door_tl = to_screen(center_ex - half_w, door.sill_height + door.height);
            let door_br = to_screen(center_ex + half_w, door.sill_height);
            let door_rect = Rect::from_two_pos(door_tl, door_br);
            painter.rect_filled(door_rect, 0.0, bg_color);
            painter.rect_stroke(door_rect, 0.0, opening_stroke, StrokeKind::Middle);
        }

        // 4. Window openings: same treatment.
        for window in &windows {
            if window.wall_id != strip.wall_id {
                continue;
            }
            let center_ex = strip.x_start + window.position_along_wall * wall_len;
            let half_w = window.width / 2.0;
            let sill = window.sill_height;
            let win_tl = to_screen(center_ex - half_w, sill + window.height);
            let win_br = to_screen(center_ex + half_w, sill);
            let win_rect = Rect::from_two_pos(win_tl, win_br);
            painter.rect_filled(win_rect, 0.0, bg_color);
            painter.rect_stroke(win_rect, 0.0, opening_stroke, StrokeKind::Middle);
            // Window sill line.
            painter.line_segment(
                [
                    to_screen(center_ex - half_w, sill),
                    to_screen(center_ex + half_w, sill),
                ],
                opening_stroke,
            );
        }
    }

    // Ground line.
    let ground_left = to_screen(world_x_min - world_w * 0.05, 0.0);
    let ground_right = to_screen(world_x_max + world_w * 0.05, 0.0);
    painter.line_segment([ground_left, ground_right], outline_stroke);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Represents a single wall projected onto the elevation canvas.
struct ElevStrip {
    wall_id: String,
    /// Left edge of the wall in elevation X coordinates.
    x_start: f64,
    /// Right edge of the wall in elevation X coordinates.
    x_end: f64,
    /// Full wall height.
    height: f64,
}

/// Project a `WallElement` onto the elevation axis.
///
/// Returns `None` if the wall is perpendicular to the elevation plane (i.e.
/// it shows edge-on and has zero visible width — we treat those as invisible
/// for now).
fn elevation_strip(wall: &WallElement, dir: ElevationDirection) -> Option<ElevStrip> {
    // The "parallel" axis is the one that runs along the face we are viewing.
    // For North/South views, the face is the XZ plane — parallel axis is X.
    // For East/West views, the face is the YZ plane — parallel axis is Y.
    let (s_par, e_par, _s_perp, _e_perp) = match dir {
        ElevationDirection::North | ElevationDirection::South => {
            (wall.start[0], wall.end[0], wall.start[1], wall.end[1])
        }
        ElevationDirection::East | ElevationDirection::West => {
            (wall.start[1], wall.end[1], wall.start[0], wall.end[0])
        }
    };

    let parallel_len = (e_par - s_par).abs();
    // Skip walls that contribute less than 0.05 m of visible width.
    if parallel_len < 0.05 {
        return None;
    }

    let x_start = s_par.min(e_par);
    let x_end = s_par.max(e_par);

    Some(ElevStrip {
        wall_id: wall.meta.id.clone(),
        x_start,
        x_end,
        height: wall.height,
    })
}
