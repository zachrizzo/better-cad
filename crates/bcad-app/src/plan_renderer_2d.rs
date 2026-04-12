//! 2D plan view renderer.
//!
//! Renders a proper architectural floor plan: white paper background,
//! light drawing grid, then all domain elements in correct layer order
//! (floors → walls → openings → MEP → furniture → annotations).

use bcad_2d::primitives::{SymbolPrimitive, TextAnchor};
use bcad_2d::style::{DomainColor, PenWeight, StyledPrimitive};
use bcad_2d::symbols::{
    accessibility, cabinet,
    door_window::{self, DoorParams, Swing, WindowParams},
    electrical, fire_safety, furniture, hvac, plumbing,
};
use bcad_2d::wall_outline::{self, WallOpening, WallSegment};
use bcad_domain::{DoorSwing, Element, WallElement};
use bcad_render::camera::CameraState;
use bcad_state::ui_state::Theme;
use egui::{Color32, FontId, Pos2, Rect, Stroke};

// ---------------------------------------------------------------------------
// Architectural drawing ink colors (ISO 128 / FreeCAD convention)
//
// 2D plan views use black ink on white paper — all strokes near-black.
// MEP categories use very dark tinted grays so their origin is still
// distinguishable on screen without looking garish.
// ---------------------------------------------------------------------------
const INK_BLACK: Color32 = Color32::from_rgb(15, 15, 15);       // walls, structure
const INK_ANNOTATION: Color32 = Color32::from_rgb(40, 40, 40);   // dims, text, sections
const INK_FURNITURE: Color32 = Color32::from_rgb(55, 55, 55);    // furniture / cabinets
const INK_PLUMBING: Color32 = Color32::from_rgb(15, 35, 65);     // dark navy
const INK_ELECTRICAL: Color32 = Color32::from_rgb(55, 15, 15);   // very dark maroon
const INK_HVAC: Color32 = Color32::from_rgb(30, 15, 55);         // very dark indigo
const INK_FIRE: Color32 = Color32::from_rgb(65, 10, 10);         // very dark red
const INK_ACCESS: Color32 = Color32::from_rgb(10, 45, 55);       // very dark teal

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
    // ---- 0. White paper background + architectural grid ----
    draw_paper_background(painter, viewport_rect, theme);
    draw_architectural_grid(painter, viewport_rect, camera, theme);

    // ---- Collect walls on this level ----
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

    // Helper: check if an element is on this level.
    let on_level = |meta: &bcad_domain::ElementMeta| {
        meta.level_id
            .as_ref()
            .map(|l| l.as_ref() == level_id)
            .unwrap_or(false)
    };

    // ---- 1. Floor / slab boundaries (thin dashed outline under walls) ----
    for element in elements {
        if let Element::Floor(floor) = element {
            if !on_level(&floor.meta) {
                continue;
            }
            draw_floor_boundary(painter, viewport_rect, camera, &floor.boundary, theme);
        }
        if let Element::Foundation(f) = element {
            if !on_level(&f.meta) {
                continue;
            }
            draw_floor_boundary(painter, viewport_rect, camera, &f.boundary, theme);
        }
    }

    // ---- 2. Wall hatch fill + outlines with opening gaps ----
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
                            Element::Window(win) => {
                                (win.position_along_wall, win.width, &win.wall_id)
                            }
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

    // Step A: Solid white fill for wall cross-sections (so hatching reads on white).
    for quad in &wall_outline::build_wall_fill_quads(&wall_segments) {
        let pts: Vec<Pos2> = quad
            .iter()
            .map(|p| world_to_screen_f64(*p, camera, viewport_rect))
            .collect();
        if pts.len() >= 3 {
            painter.add(egui::Shape::convex_polygon(
                pts,
                Color32::WHITE,
                Stroke::NONE,
            ));
        }
    }

    // Step B: 45° diagonal hatch lines inside wall sections (standard cut hatching).
    // FreeCAD uses ~60mm spacing at 1:100 scale. 0.06 m ≈ 60mm.
    let hatch_stroke = Stroke::new(0.5, INK_BLACK);
    for line in &wall_outline::build_wall_hatch_lines(&wall_segments, 0.06) {
        let s = world_to_screen_f64(line.start, camera, viewport_rect);
        let e = world_to_screen_f64(line.end, camera, viewport_rect);
        painter.line_segment([s, e], hatch_stroke);
    }

    // Step C: Wall outlines — thickest lines in the drawing (Heavy = cut-plane weight).
    let wall_outline_stroke = Stroke::new(pen_weight_to_px(PenWeight::Heavy), INK_BLACK);
    for outline in &wall_outline::build_visible_wall_outlines(&wall_segments) {
        let s = world_to_screen_f64(outline.start, camera, viewport_rect);
        let e = world_to_screen_f64(outline.end, camera, viewport_rect);
        painter.line_segment([s, e], wall_outline_stroke);
    }

    // ---- 3. Doors ----
    for element in elements {
        if let Element::Door(door) = element {
            if !on_level(&door.meta) {
                continue;
            }
            if let Some(wall) = walls_on_level.iter().find(|w| w.meta.id == door.wall_id) {
                for sp in &generate_door_symbol(wall, door) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
        }
    }

    // ---- 4. Windows ----
    for element in elements {
        if let Element::Window(window) = element {
            if !on_level(&window.meta) {
                continue;
            }
            if let Some(wall) = walls_on_level.iter().find(|w| w.meta.id == window.wall_id) {
                for sp in &generate_window_symbol(wall, window) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
        }
    }

    // ---- 5. Structural: columns and beams ----
    for element in elements {
        match element {
            Element::Column(col) if on_level(&col.meta) => {
                draw_column(painter, viewport_rect, camera, col, theme)
            }
            Element::Beam(beam) if on_level(&beam.meta) => {
                draw_beam(painter, viewport_rect, camera, beam, theme)
            }
            _ => {}
        }
    }

    // ---- 6. Stairs ----
    for element in elements {
        if let Element::Stair(stair) = element {
            if on_level(&stair.meta) {
                draw_stair(painter, viewport_rect, camera, stair, theme);
            }
        }
    }

    // ---- 7. Furniture & cabinets ----
    for element in elements {
        match element {
            Element::Furniture(f) if on_level(&f.meta) => {
                for sp in &dispatch_furniture(f) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
            Element::Cabinet(c) if on_level(&c.meta) => {
                for sp in &dispatch_cabinet(c) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
            _ => {}
        }
    }

    // ---- 8. MEP: plumbing, electrical, HVAC, fire safety, accessibility ----
    for element in elements {
        match element {
            Element::Plumbing(p) if on_level(&p.meta) => {
                for sp in &dispatch_plumbing(p) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
            Element::Electrical(e) if on_level(&e.meta) => {
                for sp in &dispatch_electrical(e) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
            Element::Hvac(h) if on_level(&h.meta) => {
                for sp in &dispatch_hvac(h) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
            Element::FireSafety(fs) if on_level(&fs.meta) => {
                for sp in &dispatch_fire_safety(fs) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
            Element::Accessibility(a) if on_level(&a.meta) => {
                for sp in &dispatch_accessibility(a) {
                    draw_styled_primitive(painter, viewport_rect, camera, sp, theme);
                }
            }
            _ => {}
        }
    }

    // ---- 9. Room labels (always on top) ----
    for element in elements {
        if let Element::Room(room) = element {
            if on_level(&room.meta) {
                draw_room_label(painter, viewport_rect, camera, room, theme);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Paper background and architectural grid
// ---------------------------------------------------------------------------

/// Draw white paper background — makes the 2D view look like a real drawing.
fn draw_paper_background(painter: &egui::Painter, viewport: Rect, _theme: Theme) {
    // Always white — architectural drawings are on white paper.
    painter.rect_filled(viewport, 0.0, Color32::from_rgb(255, 255, 255));
}

/// Draw a light architectural grid (1m minor, 5m major) appropriate for a
/// floor plan drawing, replacing the 3D viewport grid.
fn draw_architectural_grid(
    painter: &egui::Painter,
    viewport: Rect,
    camera: &CameraState,
    _theme: Theme,
) {
    let minor_color = Color32::from_rgba_unmultiplied(180, 190, 200, 80);
    let major_color = Color32::from_rgba_unmultiplied(150, 165, 180, 140);
    let minor_stroke = Stroke::new(0.5, minor_color);
    let major_stroke = Stroke::new(1.0, major_color);

    // Determine world bounds visible in viewport.
    let hw = (camera.zoom_level * camera.aspect * 0.5) as f64;
    let hh = (camera.zoom_level * 0.5) as f64;
    let cx = camera.pan_offset.x as f64;
    let cy = camera.pan_offset.y as f64;

    let world_min_x = cx - hw;
    let world_max_x = cx + hw;
    let world_min_y = cy - hh;
    let world_max_y = cy + hh;

    // Choose grid spacing: 1m minor, 5m major. At large zoom use 5/25m.
    let span = (world_max_x - world_min_x).max(world_max_y - world_min_y);
    let (minor, major) = if span < 20.0 {
        (1.0f64, 5.0f64)
    } else if span < 100.0 {
        (5.0, 25.0)
    } else {
        (10.0, 50.0)
    };

    // Vertical lines
    let x_start = (world_min_x / minor).floor() * minor;
    let mut x = x_start;
    while x <= world_max_x + minor {
        let is_major = ((x / major).round() - x / major).abs() < 1e-6;
        let s = world_to_screen_f64([x, world_min_y], camera, viewport);
        let e = world_to_screen_f64([x, world_max_y], camera, viewport);
        painter.line_segment([s, e], if is_major { major_stroke } else { minor_stroke });
        x += minor;
    }

    // Horizontal lines
    let y_start = (world_min_y / minor).floor() * minor;
    let mut y = y_start;
    while y <= world_max_y + minor {
        let is_major = ((y / major).round() - y / major).abs() < 1e-6;
        let s = world_to_screen_f64([world_min_x, y], camera, viewport);
        let e = world_to_screen_f64([world_max_x, y], camera, viewport);
        painter.line_segment([s, e], if is_major { major_stroke } else { minor_stroke });
        y += minor;
    }
}

// ---------------------------------------------------------------------------
// Floor / slab boundary
// ---------------------------------------------------------------------------

fn draw_floor_boundary(
    painter: &egui::Painter,
    viewport: Rect,
    camera: &CameraState,
    boundary: &[[f64; 2]],
    _theme: Theme,
) {
    if boundary.len() < 2 {
        return;
    }
    // Floor slabs: thin gray dashed outline (below the cut plane, seen not cut).
    // ISO 128: elements below cut plane use projected (fine) weight.
    let color = Color32::from_rgb(140, 140, 140);
    let stroke = Stroke::new(pen_weight_to_px(PenWeight::Fine), color);
    let pts: Vec<Pos2> = boundary
        .iter()
        .map(|p| world_to_screen_f64(*p, camera, viewport))
        .collect();
    for pair in pts.windows(2) {
        painter.line_segment([pair[0], pair[1]], stroke);
    }
    if pts.len() >= 3 {
        painter.line_segment([*pts.last().unwrap(), pts[0]], stroke);
    }
}

// ---------------------------------------------------------------------------
// Beam
// ---------------------------------------------------------------------------

fn draw_beam(
    painter: &egui::Painter,
    viewport: Rect,
    camera: &CameraState,
    beam: &bcad_domain::BeamElement,
    _theme: Theme,
) {
    let dx = beam.end[0] - beam.start[0];
    let dy = beam.end[1] - beam.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-6 {
        return;
    }
    let ux = dx / len;
    let uy = dy / len;
    let nx = -uy;
    let ny = ux;
    let hw = beam.width / 2.0;

    let corners = [
        [beam.start[0] + nx * hw, beam.start[1] + ny * hw],
        [beam.end[0] + nx * hw, beam.end[1] + ny * hw],
        [beam.end[0] - nx * hw, beam.end[1] - ny * hw],
        [beam.start[0] - nx * hw, beam.start[1] - ny * hw],
    ];
    // Beams are typically seen from below the cut plane — use Medium (visible) weight.
    let stroke = Stroke::new(pen_weight_to_px(PenWeight::Medium), INK_BLACK);
    let sc: Vec<Pos2> = corners
        .iter()
        .map(|c| world_to_screen_f64(*c, camera, viewport))
        .collect();
    // Light gray fill to distinguish beams from open space.
    painter.add(egui::Shape::convex_polygon(
        sc.clone(),
        Color32::from_rgb(230, 230, 230),
        Stroke::NONE,
    ));
    for i in 0..4 {
        painter.line_segment([sc[i], sc[(i + 1) % 4]], stroke);
    }
    // Diagonal cross — standard beam symbol in plan view.
    let cross_stroke = Stroke::new(pen_weight_to_px(PenWeight::Fine), INK_BLACK);
    painter.line_segment([sc[0], sc[2]], cross_stroke);
    painter.line_segment([sc[1], sc[3]], cross_stroke);
}

// ---------------------------------------------------------------------------
// Symbol dispatchers — map symbol_type string → generator function
// ---------------------------------------------------------------------------

fn dispatch_furniture(f: &bcad_domain::FurnitureElement) -> Vec<StyledPrimitive> {
    let c = f.position;
    let r = f.rotation;
    let w = f.width;
    let d = f.depth;
    match f.symbol_type.as_str() {
        "desk" => furniture::desk(c, r, w, d),
        "chair" => furniture::chair(c, r, w, d),
        "table" => furniture::table(c, r, w, d),
        "dining_table" => furniture::dining_table(c, r, w, d),
        "bed" => furniture::bed(c, r, w, d),
        "sofa" => furniture::sofa(c, r, w, d),
        "bookshelf" => furniture::bookshelf(c, r, w, d),
        "wardrobe" => furniture::wardrobe(c, r, w, d),
        "refrigerator" => furniture::refrigerator(c, r, w, d),
        "stove" => furniture::stove(c, r, w, d),
        "washer_dryer" => furniture::washer_dryer(c, r, w, d),
        "nightstand" => furniture::nightstand(c, r, w, d),
        "coffee_table" => furniture::coffee_table(c, r, w, d),
        "tv_console" => furniture::tv_console(c, r, w, d),
        "console_table" => furniture::console_table(c, r, w, d),
        "bench" => furniture::bench(c, r, w, d),
        "ottoman" => furniture::ottoman(c, r, w, d),
        "vanity" => furniture::vanity(c, r, w, d),
        "fireplace" => furniture::fireplace(c, r, w, d),
        "plant" => furniture::plant(c, r, w, d),
        _ => furniture::desk(c, r, w, d), // fallback
    }
}

fn dispatch_cabinet(c: &bcad_domain::CabinetElement) -> Vec<StyledPrimitive> {
    let pos = c.position;
    let r = c.rotation;
    let w = c.width;
    let d = c.depth;
    match c.cabinet_type.as_str() {
        "drawer_base" => cabinet::drawer_base(pos, r, w, d),
        "upper_cabinet" => cabinet::upper_cabinet(pos, r, w, d),
        "tall_cabinet" => cabinet::tall_cabinet(pos, r, w, d),
        "corner_base" => cabinet::corner_base(pos, r, w, d),
        "corner_upper" => cabinet::corner_upper(pos, r, w, d),
        "corner_tall" => cabinet::corner_tall(pos, r, w, d),
        "sink_base" => cabinet::sink_base(pos, r, w, d),
        "lazy_susan" => cabinet::lazy_susan(pos, r, w, d),
        "blind_corner" => cabinet::blind_corner(pos, r, w, d),
        "appliance_garage" => cabinet::appliance_garage(pos, r, w, d),
        "pantry" => cabinet::pantry(pos, r, w, d),
        _ => cabinet::base_cabinet(pos, r, w, d, c.door_count),
    }
}

fn dispatch_plumbing(p: &bcad_domain::PlumbingElement) -> Vec<StyledPrimitive> {
    let c = p.position;
    let r = p.rotation;
    match p.symbol_type.as_str() {
        "toilet" => plumbing::toilet(c, r),
        "sink" => plumbing::sink(c, r),
        "bathtub" => plumbing::bathtub(c, r),
        "shower" => plumbing::shower(c, r),
        "urinal" => plumbing::urinal(c, r),
        "water_heater" => plumbing::water_heater(c, r),
        "floor_drain" => plumbing::floor_drain(c, r),
        "dishwasher" => plumbing::dishwasher(c, r),
        "washing_machine" => plumbing::washing_machine(c, r),
        "hose_bib" => plumbing::hose_bib(c, r),
        "double_sink" => plumbing::double_sink(c, r),
        "bidet" => plumbing::bidet(c, r),
        "utility_sink" => plumbing::utility_sink(c, r),
        "pedestal_sink" => plumbing::pedestal_sink(c, r),
        _ => plumbing::sink(c, r),
    }
}

fn dispatch_electrical(e: &bcad_domain::ElectricalElement) -> Vec<StyledPrimitive> {
    let c = e.position;
    let r = e.rotation;
    match e.symbol_type.as_str() {
        "outlet" => electrical::outlet(c, r),
        "gfci_outlet" => electrical::gfci_outlet(c, r),
        "floor_outlet" => electrical::floor_outlet(c, r),
        "data_outlet" => electrical::data_outlet(c, r),
        "switch" => electrical::switch(c, r),
        "three_way_switch" => electrical::three_way_switch(c, r),
        "dimmer_switch" => electrical::dimmer_switch(c, r),
        "timer_switch" => electrical::timer_switch(c, r),
        "motion_sensor" => electrical::motion_sensor(c, r),
        "light_fixture" => electrical::light_fixture(c, r),
        "ceiling_fan" => electrical::ceiling_fan(c, r),
        "recessed_light" => electrical::recessed_light(c, r),
        "track_light" => electrical::track_light(c, r),
        "pendant_light" => electrical::pendant_light(c, r),
        "wall_sconce" => electrical::wall_sconce(c, r),
        "outdoor_light" => electrical::outdoor_light(c, r),
        "panel" => electrical::panel(c, r),
        "junction_box" => electrical::junction_box(c, r),
        "smoke_detector" => electrical::smoke_detector(c, r),
        "thermostat" => electrical::thermostat(c, r),
        _ => electrical::outlet(c, r),
    }
}

fn dispatch_hvac(h: &bcad_domain::HvacElement) -> Vec<StyledPrimitive> {
    let c = h.position;
    let r = h.rotation;
    match h.symbol_type.as_str() {
        "supply_vent" => hvac::supply_vent(c, r),
        "return_vent" => hvac::return_vent(c, r),
        "thermostat" => hvac::thermostat(c, r),
        "exhaust_fan" => hvac::exhaust_fan(c, r),
        "ductwork" => hvac::ductwork(c, r),
        "mini_split" => hvac::mini_split(c, r),
        "air_handler" => hvac::air_handler(c, r),
        "condensing_unit" => hvac::condensing_unit(c, r),
        "damper" => hvac::damper(c, r),
        "diffuser" => hvac::diffuser(c, r),
        _ => hvac::supply_vent(c, r),
    }
}

fn dispatch_fire_safety(fs: &bcad_domain::FireSafetyElement) -> Vec<StyledPrimitive> {
    let c = fs.position;
    let r = fs.rotation;
    match fs.symbol_type.as_str() {
        "fire_extinguisher" => fire_safety::fire_extinguisher(c, r),
        "sprinkler_head" => fire_safety::sprinkler_head(c, r),
        "exit_sign" => fire_safety::exit_sign(c, r),
        "pull_station" => fire_safety::pull_station(c, r),
        "smoke_alarm" => fire_safety::smoke_alarm(c, r),
        "fire_alarm_panel" => fire_safety::fire_alarm_panel(c, r),
        "fire_hose_cabinet" => fire_safety::fire_hose_cabinet(c, r),
        "annunciator" => fire_safety::annunciator(c, r),
        _ => fire_safety::sprinkler_head(c, r),
    }
}

fn dispatch_accessibility(a: &bcad_domain::AccessibilityElement) -> Vec<StyledPrimitive> {
    let c = a.position;
    let r = a.rotation;
    match a.symbol_type.as_str() {
        "wheelchair" => accessibility::wheelchair(c, r),
        "ramp" => accessibility::ramp(c, r, false),
        "grab_bar" => accessibility::grab_bar(c, r),
        "accessible_parking" => accessibility::accessible_parking(c, r),
        "tactile_warning" => accessibility::tactile_warning(c, r),
        "ada_restroom" => accessibility::ada_restroom(c, r),
        "hearing_loop" => accessibility::hearing_loop(c, r),
        _ => accessibility::wheelchair(c, r),
    }
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

fn domain_color_to_color32(dc: DomainColor, _theme: Theme) -> Color32 {
    // 2D plan view uses near-black ink on white paper — ISO 128 / FreeCAD convention.
    // Slight color tints allow on-screen differentiation of MEP layers while
    // keeping the drawing professional and printable.
    match dc {
        DomainColor::Architectural => INK_BLACK,
        DomainColor::Annotation => INK_ANNOTATION,
        DomainColor::Furniture => INK_FURNITURE,
        DomainColor::Cabinet => INK_FURNITURE,
        DomainColor::Plumbing => INK_PLUMBING,
        DomainColor::Electrical => INK_ELECTRICAL,
        DomainColor::Hvac => INK_HVAC,
        DomainColor::FireSafety => INK_FIRE,
        DomainColor::Accessibility => INK_ACCESS,
    }
}

fn pen_weight_to_px(pen: PenWeight) -> f32 {
    // ISO 128 proportions: base = Fine (1px), each step ≈ √2 heavier.
    // FreeCAD ratio: cut-section lines = 2× visible lines, symbols = 0.6×.
    match pen {
        PenWeight::ExtraFine => 0.5,  // hatch, grid, construction
        PenWeight::Fine => 1.0,       // dimension lines, extensions, symbols (0.6× of Heavy)
        PenWeight::Medium => 1.5,     // secondary visible outlines
        PenWeight::Wide => 2.0,       // primary visible outlines
        PenWeight::Heavy => 2.5,      // cut-section outlines (walls, columns) — 2× of Fine
        PenWeight::ExtraHeavy => 3.5, // section cut borders, title block frame
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
                painter.line_segment([*screen_pts.last().unwrap(), screen_pts[0]], stroke);
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
    _theme: Theme,
) {
    // Columns are structural elements cut by the plan plane — use Heavy weight black.
    let stroke = Stroke::new(pen_weight_to_px(PenWeight::Heavy), INK_BLACK);
    let cross_stroke = Stroke::new(pen_weight_to_px(PenWeight::Fine), INK_BLACK);

    if let Some(diameter) = col.diameter {
        // Circular column: solid white fill + thick black circle + diagonal cross.
        let screen_center = world_to_screen_f64(col.center, camera, viewport);
        let screen_radius = world_dist_to_px(diameter / 2.0, camera, viewport);

        // White fill (solid concrete section, same treatment as walls).
        painter.circle_filled(screen_center, screen_radius, Color32::WHITE);
        painter.circle_stroke(screen_center, screen_radius, stroke);

        // X cross inside circle — FreeCAD standard for RC columns.
        let r = screen_radius * 0.707;
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
        // Rectangular column: white fill + thick black outline + X cross.
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

        // White fill (solid section interior).
        painter.add(egui::Shape::convex_polygon(
            screen_corners.clone(),
            Color32::WHITE,
            Stroke::NONE,
        ));

        // Outline.
        for i in 0..4 {
            painter.line_segment([screen_corners[i], screen_corners[(i + 1) % 4]], stroke);
        }

        // X cross — standard column symbol in plan view.
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

    // Compute floor area via the shoelace formula (m²).
    let verts = &room.boundary;
    let mut area = 0.0f64;
    for i in 0..verts.len() {
        let j = (i + 1) % verts.len();
        area += verts[i][0] * verts[j][1];
        area -= verts[j][0] * verts[i][1];
    }
    area = area.abs() * 0.5;

    let screen_pos = world_to_screen_f64([cx, cy], camera, viewport);
    let color = domain_color_to_color32(DomainColor::Annotation, theme);
    let name_font = FontId::proportional(14.0);
    let area_font = FontId::proportional(11.0);

    // Room name (centred slightly above midpoint) + area below (FreeCAD convention).
    painter.text(
        screen_pos,
        egui::Align2::CENTER_BOTTOM,
        &room.meta.name,
        name_font,
        color,
    );
    painter.text(
        Pos2::new(screen_pos.x, screen_pos.y + 2.0),
        egui::Align2::CENTER_TOP,
        format!("{:.1} m²", area),
        area_font,
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
        [stair.start[0] + nx * half_w, stair.start[1] + ny * half_w],
        [stair.end[0] + nx * half_w, stair.end[1] + ny * half_w],
        [stair.end[0] - nx * half_w, stair.end[1] - ny * half_w],
        [stair.start[0] - nx * half_w, stair.start[1] - ny * half_w],
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

    // ---- Section cut line (ISO 128 stair break mark) at ~60 % of flight ----
    // A perpendicular line across the full stair width with a small diagonal
    // notch at its centre indicates the horizontal section plane.
    let cut_t = 0.60;
    let cut_base = [
        stair.start[0] + ux * run_len * cut_t,
        stair.start[1] + uy * run_len * cut_t,
    ];
    let cut_l = [cut_base[0] + nx * half_w, cut_base[1] + ny * half_w];
    let cut_r = [cut_base[0] - nx * half_w, cut_base[1] - ny * half_w];
    let cut_stroke = Stroke::new(pen_weight_to_px(PenWeight::Wide), color);
    let sc_l = world_to_screen_f64(cut_l, camera, viewport);
    let sc_r = world_to_screen_f64(cut_r, camera, viewport);
    painter.line_segment([sc_l, sc_r], cut_stroke);

    // Small diagonal break notch at the midpoint of the cut line.
    let notch_size = half_w * 0.25;
    let notch_a = [
        cut_base[0] - ux * notch_size - nx * notch_size * 0.5,
        cut_base[1] - uy * notch_size - ny * notch_size * 0.5,
    ];
    let notch_b = [
        cut_base[0] + ux * notch_size + nx * notch_size * 0.5,
        cut_base[1] + uy * notch_size + ny * notch_size * 0.5,
    ];
    let sna = world_to_screen_f64(notch_a, camera, viewport);
    let snb = world_to_screen_f64(notch_b, camera, viewport);
    painter.line_segment([sna, snb], cut_stroke);

    // ---- "UP" label near the upper end of the stair ----
    let label_pos = [
        stair.start[0] + ux * run_len * 0.82,
        stair.start[1] + uy * run_len * 0.82,
    ];
    let s_label = world_to_screen_f64(label_pos, camera, viewport);
    let label_color = domain_color_to_color32(DomainColor::Annotation, theme);
    painter.text(
        s_label,
        egui::Align2::CENTER_CENTER,
        "UP",
        FontId::proportional(10.0),
        label_color,
    );
}
