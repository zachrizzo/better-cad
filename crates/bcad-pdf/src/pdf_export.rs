//! Core PDF export logic for BetterCAD construction documents.
//!
//! Produces multi-sheet drawing sets including floor plans, electrical plans,
//! plumbing plans, reflected ceiling plans, site plans, elevations, and
//! schedule tables.
//!
//! All lineweights follow ISO 128 standard pen weight series.

use printpdf::*;

use bcad_domain::{
    self, DoorElement, DoorSwing, Element, RoomElement, SiteDetailType, WallElement, WindowElement,
};

use crate::drawing_helpers::{
    draw_circle, draw_line_seg, draw_rect, mm, reset_dash, set_dash_pattern_mm, set_fill_color_rgb,
    set_pen, set_stroke_color_rgb,
};
use crate::title_block::{get_drawable_area, render_title_block, DrawableArea, TitleBlockConfig};
use crate::types::*;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Export a set of elements to a multi-sheet construction document PDF.
///
/// Returns the raw PDF bytes that can be written to a file or sent over the
/// network.
pub fn export_pdf(elements: &[Element], options: &PdfExportOptions) -> Vec<u8> {
    let (pw, ph) = options.paper_size.dimensions_mm();

    let (doc, first_page, first_layer) = PdfDocument::new(
        &format!("{} CD Set", options.project_info.project_name),
        mm(pw),
        mm(ph),
        "Layer 1",
    );

    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .expect("built-in font");

    let mut page_added = false;
    let mut sheet_index: u32 = 0;

    let mut current_page = first_page;
    let mut current_layer = first_layer;

    for sheet_type in &options.sheets {
        if page_added {
            let (new_page, new_layer) = doc.add_page(mm(pw), mm(ph), "Layer 1");
            current_page = new_page;
            current_layer = new_layer;
        }
        page_added = true;

        let layer_ref = doc.get_page(current_page).get_layer(current_layer);

        let sheet_number = generate_sheet_number(*sheet_type, sheet_index);
        let sheet_info = SheetInfo {
            sheet_number,
            sheet_title: sheet_type.label().to_uppercase(),
            scale: if matches!(sheet_type, SheetType::Schedules) {
                "N/A".to_string()
            } else {
                options.scale.clone()
            },
            revisions: Vec::new(),
        };

        let area = get_drawable_area(&options.paper_size);

        // Render the title block
        if options.show_title_block {
            let tb_config = TitleBlockConfig {
                project: &options.project_info,
                sheet: &sheet_info,
                paper: &options.paper_size,
            };
            render_title_block(&layer_ref, &font, &tb_config);
        }

        match sheet_type {
            SheetType::Schedules => {
                render_schedule_sheet(&layer_ref, &font, elements, &area);
            }
            SheetType::Elevations => {
                render_elevations_placeholder(&layer_ref, &font, &area);
            }
            _ => {
                let visible_layers = sheet_type.visible_layers();
                let filtered: Vec<&Element> = elements
                    .iter()
                    .filter(|el| {
                        let layer = element_layer(el);
                        visible_layers.contains(&layer)
                    })
                    .collect();

                let thin_walls = !matches!(sheet_type, SheetType::FloorPlan);
                let dashed_walls = matches!(sheet_type, SheetType::ReflectedCeiling);

                render_floor_plan(
                    &layer_ref,
                    &font,
                    &filtered,
                    elements,
                    &options.scale,
                    &area,
                    thin_walls,
                    dashed_walls,
                );
            }
        }

        sheet_index += 1;
    }

    if !page_added {
        let layer_ref = doc.get_page(current_page).get_layer(current_layer);
        layer_ref.use_text(
            "NO SHEETS SELECTED FOR EXPORT.",
            12.0,
            mm(20.0),
            mm(180.0),
            &font,
        );
    }

    doc.save_to_bytes()
        .expect("PDF serialization should not fail")
}

// ---------------------------------------------------------------------------
// Element layer mapping
// ---------------------------------------------------------------------------

fn element_layer(el: &Element) -> &'static str {
    if let Element::Electrical(e) = el {
        let light_types = ["light_fixture", "ceiling_fan"];
        if light_types.contains(&e.symbol_type.as_str()) {
            return "E-LITE";
        }
        return "E-POWR";
    }
    kind_to_layer(el.kind_name())
}

// ---------------------------------------------------------------------------
// Viewport / coordinate transforms
// ---------------------------------------------------------------------------

/// Viewport transform: maps world coordinates to page coordinates (mm).
struct Viewport {
    min_x: f64,
    min_y: f64,
    px_per_unit: f64,
    fit_scale: f64,
    offset_x: f64,
    offset_y: f64,
}

impl Viewport {
    /// World X -> page X (mm).
    fn to_page_x(&self, x: f64) -> f64 {
        self.offset_x + (x - self.min_x) * self.px_per_unit * self.fit_scale
    }

    /// World Y -> page Y (mm). Origin is bottom-left in printpdf.
    fn to_page_y(&self, y: f64) -> f64 {
        self.offset_y + (y - self.min_y) * self.px_per_unit * self.fit_scale
    }

    /// Scale a model-space distance to page-space distance (mm).
    fn scale_dist(&self, d: f64) -> f64 {
        d * self.px_per_unit * self.fit_scale
    }
}

/// Compute the viewport that fits all positioned elements into the drawable
/// area with 5mm padding, at the requested architectural scale.
fn compute_viewport(
    elements: &[&Element],
    scale_str: &str,
    area: &DrawableArea,
) -> Option<Viewport> {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    let mut expand = |x: f64, y: f64| {
        if x < min_x {
            min_x = x;
        }
        if y < min_y {
            min_y = y;
        }
        if x > max_x {
            max_x = x;
        }
        if y > max_y {
            max_y = y;
        }
    };

    for el in elements {
        match el {
            Element::Wall(w) => {
                expand(w.start[0], w.start[1]);
                expand(w.end[0], w.end[1]);
            }
            Element::Column(c) => {
                expand(c.center[0] - c.width / 2.0, c.center[1] - c.depth / 2.0);
                expand(c.center[0] + c.width / 2.0, c.center[1] + c.depth / 2.0);
            }
            Element::Stair(s) => {
                expand(s.start[0], s.start[1]);
                expand(s.end[0], s.end[1]);
            }
            Element::Beam(b) => {
                expand(b.start[0], b.start[1]);
                expand(b.end[0], b.end[1]);
            }
            Element::Room(r) => {
                for p in &r.boundary {
                    expand(p[0], p[1]);
                }
            }
            Element::Floor(f) => {
                for p in &f.boundary {
                    expand(p[0], p[1]);
                }
            }
            Element::Foundation(f) => {
                for p in &f.boundary {
                    expand(p[0], p[1]);
                }
            }
            Element::Electrical(e) => {
                expand(e.position[0], e.position[1]);
            }
            Element::Plumbing(p) => {
                expand(p.position[0], p.position[1]);
            }
            Element::Furniture(f) => {
                expand(f.position[0] - f.width / 2.0, f.position[1] - f.depth / 2.0);
                expand(f.position[0] + f.width / 2.0, f.position[1] + f.depth / 2.0);
            }
            Element::SiteDetail(s) => {
                for p in &s.points {
                    expand(p[0], p[1]);
                }
            }
            _ => {}
        }
    }

    if !min_x.is_finite() {
        return None;
    }

    let scale_factor = parse_scale(scale_str);
    let px_per_unit = scale_factor * 1000.0; // mm per model unit on paper

    let model_w = (max_x - min_x) * px_per_unit;
    let model_h = (max_y - min_y) * px_per_unit;

    let pad = 5.0;
    let fit_scale = f64::min(
        (area.width - 2.0 * pad) / model_w.max(1.0),
        (area.height - 2.0 * pad) / model_h.max(1.0),
    )
    .min(1.0);

    let offset_x = area.left + pad + (area.width - 2.0 * pad - model_w * fit_scale) / 2.0;
    let offset_y = area.bottom + pad + (area.height - 2.0 * pad - model_h * fit_scale) / 2.0;

    Some(Viewport {
        min_x,
        min_y,
        px_per_unit,
        fit_scale,
        offset_x,
        offset_y,
    })
}

// ---------------------------------------------------------------------------
// Plan element rendering
// ---------------------------------------------------------------------------

/// Render architectural plan elements onto a PDF layer.
#[allow(clippy::too_many_arguments)]
fn render_floor_plan(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    filtered: &[&Element],
    all_elements: &[Element],
    scale_str: &str,
    area: &DrawableArea,
    thin_walls: bool,
    dashed_walls: bool,
) {
    let vp = match compute_viewport(filtered, scale_str, area) {
        Some(vp) => vp,
        None => return,
    };

    draw_walls(layer, filtered, &vp, thin_walls, dashed_walls);
    draw_doors(layer, filtered, all_elements, &vp);
    draw_windows(layer, filtered, all_elements, &vp);
    draw_columns(layer, filtered, &vp);
    draw_stairs(layer, filtered, &vp);
    draw_site_details(layer, filtered, &vp);
    draw_room_labels(layer, font, filtered, &vp);
    draw_text_annotations(layer, font, filtered, &vp);
}

// ---------------------------------------------------------------------------
// Individual element renderers -- ISO 128 lineweights
// ---------------------------------------------------------------------------

/// Wall poche fill color: medium gray (ISO convention for solid material at cut).
const WALL_POCHE_GRAY: (u8, u8, u8) = (180, 180, 180);

fn draw_walls(
    layer: &PdfLayerReference,
    elements: &[&Element],
    vp: &Viewport,
    thin_walls: bool,
    dashed_walls: bool,
) {
    for el in elements {
        let wall = match el {
            Element::Wall(w) => w,
            _ => continue,
        };
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-8 {
            continue;
        }
        let nx = (-dy / len) * wall.thickness / 2.0;
        let ny = (dx / len) * wall.thickness / 2.0;

        let corners = [
            [wall.start[0] + nx, wall.start[1] + ny],
            [wall.end[0] + nx, wall.end[1] + ny],
            [wall.end[0] - nx, wall.end[1] - ny],
            [wall.start[0] - nx, wall.start[1] - ny],
        ];

        let points: Vec<(Point, bool)> = corners
            .iter()
            .map(|c| {
                (
                    Point::new(mm(vp.to_page_x(c[0])), mm(vp.to_page_y(c[1]))),
                    false,
                )
            })
            .collect();

        // --- Wall poche (solid gray fill) ---
        // Draw filled polygon first, then stroke the outline on top.
        set_fill_color_rgb(
            layer,
            WALL_POCHE_GRAY.0,
            WALL_POCHE_GRAY.1,
            WALL_POCHE_GRAY.2,
        );
        set_stroke_color_rgb(
            layer,
            WALL_POCHE_GRAY.0,
            WALL_POCHE_GRAY.1,
            WALL_POCHE_GRAY.2,
        );
        set_pen(layer, 0.01); // hairline for fill shape
        let fill_line = Line {
            points: points.clone(),
            is_closed: true,
        };
        layer.add_line(fill_line);

        // --- Wall outline stroke ---
        // Determine ISO 128 pen weight based on wall context.
        let lw = if thin_walls {
            // Beyond the cut plane (e.g. electrical/plumbing overlay sheets)
            Lineweights::WALL_BEYOND // 0.25 mm
        } else {
            // Section cut: use exterior (0.50) vs interior (0.35) weight.
            // Heuristic: walls thicker than 0.25 m are typically exterior.
            if wall.thickness >= 0.25 {
                Lineweights::WALL_CUT_EXTERIOR // 0.50 mm
            } else {
                Lineweights::WALL_CUT_INTERIOR // 0.35 mm
            }
        };

        set_stroke_color_rgb(layer, 0, 0, 0);
        set_pen(layer, lw);

        // Apply dashed pattern for reflected ceiling plans
        if dashed_walls {
            set_dash_pattern_mm(layer, &[2.0, 1.0]);
        }

        let outline = Line {
            points,
            is_closed: true,
        };
        layer.add_line(outline);

        // Reset dash pattern after dashed walls
        if dashed_walls {
            reset_dash(layer);
        }
    }
}

fn draw_doors(
    layer: &PdfLayerReference,
    elements: &[&Element],
    all_elements: &[Element],
    vp: &Viewport,
) {
    for el in elements {
        let door = match el {
            Element::Door(d) => d,
            _ => continue,
        };
        let wall = match find_wall(all_elements, &door.wall_id) {
            Some(w) => w,
            None => continue,
        };
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let w_len = (dx * dx + dy * dy).sqrt();
        if w_len < 1e-8 {
            continue;
        }

        let ux = dx / w_len;
        let uy = dy / w_len;
        let cx = wall.start[0] + ux * door.position_along_wall * w_len;
        let cy = wall.start[1] + uy * door.position_along_wall * w_len;
        let px = vp.to_page_x(cx);
        let py = vp.to_page_y(cy);
        let r = vp.scale_dist(door.width / 2.0);

        // Opening gap: white fill over the wall (draw first, behind everything)
        let gap_half_w = door.width / 2.0;
        let gx1 = cx - ux * gap_half_w;
        let gy1 = cy - uy * gap_half_w;
        let gx2 = cx + ux * gap_half_w;
        let gy2 = cy + uy * gap_half_w;
        let nxw = (-uy) * wall.thickness / 2.0;
        let nyw = ux * wall.thickness / 2.0;

        set_fill_color_rgb(layer, 255, 255, 255);
        set_stroke_color_rgb(layer, 255, 255, 255);
        set_pen(layer, 0.01);

        let gap_corners = [
            [gx1 + nxw, gy1 + nyw],
            [gx2 + nxw, gy2 + nyw],
            [gx2 - nxw, gy2 - nyw],
            [gx1 - nxw, gy1 - nyw],
        ];
        let gap_points: Vec<(Point, bool)> = gap_corners
            .iter()
            .map(|c| {
                (
                    Point::new(mm(vp.to_page_x(c[0])), mm(vp.to_page_y(c[1]))),
                    false,
                )
            })
            .collect();
        let gap_line = Line {
            points: gap_points,
            is_closed: true,
        };
        layer.add_line(gap_line);

        // Door leaf line: 0.35 mm (ISO 128 Wide)
        set_stroke_color_rgb(layer, 0, 0, 0);
        set_pen(layer, Lineweights::DOOR_LEAF);
        let leaf_end_x = vp.to_page_x(cx + (-uy) * door.width / 2.0);
        let leaf_end_y = vp.to_page_y(cy + ux * door.width / 2.0);
        draw_line_seg(layer, px, py, leaf_end_x, leaf_end_y);

        // Swing arc: 0.25 mm (ISO 128 Medium)
        set_stroke_color_rgb(layer, 80, 80, 80);
        set_pen(layer, Lineweights::DOOR_SWING);
        draw_circle(layer, px, py, r.max(0.5));

        set_stroke_color_rgb(layer, 0, 0, 0);
    }
}

fn draw_windows(
    layer: &PdfLayerReference,
    elements: &[&Element],
    all_elements: &[Element],
    vp: &Viewport,
) {
    for el in elements {
        let win = match el {
            Element::Window(w) => w,
            _ => continue,
        };
        let wall = match find_wall(all_elements, &win.wall_id) {
            Some(w) => w,
            None => continue,
        };
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let w_len = (dx * dx + dy * dy).sqrt();
        if w_len < 1e-8 {
            continue;
        }

        let ux = dx / w_len;
        let uy = dy / w_len;
        let cx = wall.start[0] + ux * win.position_along_wall * w_len;
        let cy = wall.start[1] + uy * win.position_along_wall * w_len;
        let hw = win.width / 2.0;
        let nxw = (-uy) * wall.thickness / 2.0;
        let nyw = ux * wall.thickness / 2.0;

        // Opening gap: white fill
        let gx1 = cx - ux * hw;
        let gy1 = cy - uy * hw;
        let gx2 = cx + ux * hw;
        let gy2 = cy + uy * hw;

        set_fill_color_rgb(layer, 255, 255, 255);
        set_stroke_color_rgb(layer, 255, 255, 255);
        set_pen(layer, 0.01);

        let gap_corners = [
            [gx1 + nxw, gy1 + nyw],
            [gx2 + nxw, gy2 + nyw],
            [gx2 - nxw, gy2 - nyw],
            [gx1 - nxw, gy1 - nyw],
        ];
        let gap_points: Vec<(Point, bool)> = gap_corners
            .iter()
            .map(|c| {
                (
                    Point::new(mm(vp.to_page_x(c[0])), mm(vp.to_page_y(c[1]))),
                    false,
                )
            })
            .collect();
        let gap_line = Line {
            points: gap_points,
            is_closed: true,
        };
        layer.add_line(gap_line);

        // Window frame (outer + inner lines): 0.35 mm (ISO 128 Wide)
        set_stroke_color_rgb(layer, 0, 0, 0);
        set_pen(layer, Lineweights::WINDOW_FRAME);
        for frac in [-1.0_f64, 1.0] {
            let off_x = nxw * frac * 0.6;
            let off_y = nyw * frac * 0.6;
            let x1 = vp.to_page_x(cx - ux * hw + off_x);
            let y1 = vp.to_page_y(cy - uy * hw + off_y);
            let x2 = vp.to_page_x(cx + ux * hw + off_x);
            let y2 = vp.to_page_y(cy + uy * hw + off_y);
            draw_line_seg(layer, x1, y1, x2, y2);
        }

        // Window glass center line: 0.25 mm (ISO 128 Medium), blue tint
        set_stroke_color_rgb(layer, 0, 100, 200);
        set_pen(layer, Lineweights::WINDOW_GLASS);
        {
            let x1 = vp.to_page_x(cx - ux * hw);
            let y1 = vp.to_page_y(cy - uy * hw);
            let x2 = vp.to_page_x(cx + ux * hw);
            let y2 = vp.to_page_y(cy + uy * hw);
            draw_line_seg(layer, x1, y1, x2, y2);
        }

        set_stroke_color_rgb(layer, 0, 0, 0);
    }
}

fn draw_columns(layer: &PdfLayerReference, elements: &[&Element], vp: &Viewport) {
    for el in elements {
        let col = match el {
            Element::Column(c) => c,
            _ => continue,
        };
        let x = vp.to_page_x(col.center[0] - col.width / 2.0);
        let y = vp.to_page_y(col.center[1] - col.depth / 2.0);
        let w = vp.scale_dist(col.width);
        let h = vp.scale_dist(col.depth);

        // Column fill: solid dark gray (concrete poche)
        set_fill_color_rgb(layer, 100, 100, 100);
        set_stroke_color_rgb(layer, 0, 0, 0);
        // Outline: 0.50 mm (ISO 128 Heavy -- cut line weight)
        set_pen(layer, Lineweights::COLUMN_OUTLINE);
        draw_rect(layer, x, y, w, h);

        // X inside column: centerline weight 0.13 mm
        set_pen(layer, Lineweights::CENTERLINE);
        draw_line_seg(layer, x, y, x + w, y + h);
        draw_line_seg(layer, x + w, y, x, y + h);
    }
}

fn draw_stairs(layer: &PdfLayerReference, elements: &[&Element], vp: &Viewport) {
    for el in elements {
        let stair = match el {
            Element::Stair(s) => s,
            _ => continue,
        };
        let dx = stair.end[0] - stair.start[0];
        let dy = stair.end[1] - stair.start[1];
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-8 {
            continue;
        }
        let nx = (-dy / len) * stair.width / 2.0;
        let ny = (dx / len) * stair.width / 2.0;

        set_stroke_color_rgb(layer, 0, 0, 0);

        // Outline: 0.25 mm (ISO 128 Medium -- stair treads)
        set_pen(layer, Lineweights::STAIR_TREAD);

        let corners = [
            [stair.start[0] + nx, stair.start[1] + ny],
            [stair.end[0] + nx, stair.end[1] + ny],
            [stair.end[0] - nx, stair.end[1] - ny],
            [stair.start[0] - nx, stair.start[1] - ny],
        ];
        let points: Vec<(Point, bool)> = corners
            .iter()
            .map(|c| {
                (
                    Point::new(mm(vp.to_page_x(c[0])), mm(vp.to_page_y(c[1]))),
                    false,
                )
            })
            .collect();
        let line = Line {
            points,
            is_closed: true,
        };
        layer.add_line(line);

        // Tread lines: 0.25 mm (ISO 128 Medium)
        let risers = stair.risers.max(1);
        let ux = dx / len;
        let uy = dy / len;
        set_pen(layer, Lineweights::STAIR_TREAD);
        for i in 1..risers {
            let t = i as f64 / risers as f64;
            let tx = stair.start[0] + ux * len * t;
            let ty = stair.start[1] + uy * len * t;
            draw_line_seg(
                layer,
                vp.to_page_x(tx + nx),
                vp.to_page_y(ty + ny),
                vp.to_page_x(tx - nx),
                vp.to_page_y(ty - ny),
            );
        }

        // Direction arrow: 0.18 mm (ISO 128 Fine)
        let mid_x = (stair.start[0] + stair.end[0]) / 2.0;
        let mid_y = (stair.start[1] + stair.end[1]) / 2.0;
        set_pen(layer, Lineweights::STAIR_ARROW);
        draw_line_seg(
            layer,
            vp.to_page_x(stair.start[0]),
            vp.to_page_y(stair.start[1]),
            vp.to_page_x(mid_x),
            vp.to_page_y(mid_y),
        );
    }
}

fn draw_site_details(layer: &PdfLayerReference, elements: &[&Element], vp: &Viewport) {
    for el in elements {
        let sd = match el {
            Element::SiteDetail(s) => s,
            _ => continue,
        };
        if sd.points.len() < 2 && sd.detail_type != SiteDetailType::Tree {
            continue;
        }

        set_stroke_color_rgb(layer, 0, 100, 0);

        match sd.detail_type {
            SiteDetailType::PropertyLine => {
                // Property lines: 0.25 mm, dash-dot pattern
                set_pen(layer, Lineweights::WALL_BEYOND);
                set_dash_pattern_mm(layer, &[12.0, 1.0, 2.0, 1.0]);
                for i in 0..sd.points.len().saturating_sub(1) {
                    draw_line_seg(
                        layer,
                        vp.to_page_x(sd.points[i][0]),
                        vp.to_page_y(sd.points[i][1]),
                        vp.to_page_x(sd.points[i + 1][0]),
                        vp.to_page_y(sd.points[i + 1][1]),
                    );
                }
                reset_dash(layer);
            }
            SiteDetailType::Tree => {
                set_pen(layer, Lineweights::WALL_BEYOND);
                if let Some(p) = sd.points.first() {
                    let r = vp.scale_dist(sd.radius.unwrap_or(1.0));
                    draw_circle(layer, vp.to_page_x(p[0]), vp.to_page_y(p[1]), r.max(1.0));
                }
            }
            _ => {
                set_pen(layer, Lineweights::EXTENSION);
                for i in 0..sd.points.len().saturating_sub(1) {
                    draw_line_seg(
                        layer,
                        vp.to_page_x(sd.points[i][0]),
                        vp.to_page_y(sd.points[i][1]),
                        vp.to_page_x(sd.points[i + 1][0]),
                        vp.to_page_y(sd.points[i + 1][1]),
                    );
                }
            }
        }

        set_stroke_color_rgb(layer, 0, 0, 0);
    }
}

/// Room name text height: 3.5 mm on paper (ISO 3098 TextRole::RoomName).
const ROOM_NAME_TEXT_HEIGHT_PT: f64 = 3.5 / 0.3528;
/// Room area text height: 2.5 mm on paper (ISO 3098 TextRole::DimensionValue).
const ROOM_AREA_TEXT_HEIGHT_PT: f64 = 2.5 / 0.3528;

fn draw_room_labels(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    elements: &[&Element],
    vp: &Viewport,
) {
    for el in elements {
        let room = match el {
            Element::Room(r) => r,
            _ => continue,
        };
        if room.boundary.len() < 3 {
            continue;
        }

        // Centroid
        let mut cx = 0.0_f64;
        let mut cy = 0.0_f64;
        for p in &room.boundary {
            cx += p[0];
            cy += p[1];
        }
        cx /= room.boundary.len() as f64;
        cy /= room.boundary.len() as f64;

        let px = vp.to_page_x(cx);
        let py = vp.to_page_y(cy);

        // Room name -- ALL UPPERCASE, 3.5 mm text height
        let name = if room.meta.name.is_empty() {
            "ROOM".to_string()
        } else {
            room.meta.name.to_uppercase()
        };
        layer.use_text(
            &name,
            ROOM_NAME_TEXT_HEIGHT_PT as f32,
            mm(px - 5.0),
            mm(py + 1.5),
            font,
        );

        // Area via shoelace -- 2.5 mm text height
        let area_val = bcad_domain::polygon_area(&room.boundary);
        let area_text = format!("{:.1} M\u{00B2}", area_val);
        layer.use_text(
            &area_text,
            ROOM_AREA_TEXT_HEIGHT_PT as f32,
            mm(px - 5.0),
            mm(py - 2.0),
            font,
        );
    }
}

fn draw_text_annotations(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    elements: &[&Element],
    vp: &Viewport,
) {
    for el in elements {
        let (position, text) = match el {
            Element::LeaderAnnotation(la) => (la.end, la.text.as_str()),
            Element::Keynote(kn) => (kn.position, kn.text.as_str()),
            _ => continue,
        };
        let px = vp.to_page_x(position[0]);
        let py = vp.to_page_y(position[1]);
        // All text UPPERCASE in PDF
        let upper = text.to_uppercase();
        layer.use_text(&upper, 7.0, mm(px), mm(py), font);
    }
}

// ---------------------------------------------------------------------------
// Schedule sheet rendering
// ---------------------------------------------------------------------------

/// Render door, window, and room schedule tables onto a PDF layer.
fn render_schedule_sheet(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    elements: &[Element],
    area: &DrawableArea,
) {
    let mut y = area.bottom + area.height - 5.0;

    // --- Door Schedule ---
    let doors: Vec<&DoorElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Door(d) => Some(d),
            _ => None,
        })
        .collect();

    if !doors.is_empty() {
        let headers = &[
            "MARK", "WIDTH", "HEIGHT", "TYPE", "SWING", "SILL HT", "REMARKS",
        ];
        let rows: Vec<Vec<String>> = doors
            .iter()
            .enumerate()
            .map(|(i, d)| {
                let name = if d.meta.name.is_empty() {
                    format!("D{}", i + 1)
                } else {
                    d.meta.name.to_uppercase()
                };
                let swing = match d.swing {
                    DoorSwing::OutLeft | DoorSwing::InLeft => "LEFT",
                    DoorSwing::OutRight | DoorSwing::InRight => "RIGHT",
                };
                vec![
                    name,
                    format_dim(d.width).to_uppercase(),
                    format_dim(d.height).to_uppercase(),
                    "STD".to_string(),
                    swing.to_string(),
                    format_dim(d.sill_height).to_uppercase(),
                    "-".to_string(),
                ]
            })
            .collect();
        y = draw_schedule_table(layer, font, "DOOR SCHEDULE", y, area, headers, &rows);
        y -= 8.0;
    }

    // --- Window Schedule ---
    let windows: Vec<&WindowElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Window(w) => Some(w),
            _ => None,
        })
        .collect();

    if !windows.is_empty() {
        let headers = &[
            "MARK", "WIDTH", "HEIGHT", "SILL HT", "TYPE", "GLAZING", "REMARKS",
        ];
        let rows: Vec<Vec<String>> = windows
            .iter()
            .enumerate()
            .map(|(i, w)| {
                let name = if w.meta.name.is_empty() {
                    format!("W{}", i + 1)
                } else {
                    w.meta.name.to_uppercase()
                };
                vec![
                    name,
                    format_dim(w.width).to_uppercase(),
                    format_dim(w.height).to_uppercase(),
                    format_dim(w.sill_height).to_uppercase(),
                    "FIXED".to_string(),
                    "CLEAR".to_string(),
                    "-".to_string(),
                ]
            })
            .collect();
        y = draw_schedule_table(layer, font, "WINDOW SCHEDULE", y, area, headers, &rows);
        y -= 8.0;
    }

    // --- Room Schedule ---
    let rooms: Vec<&RoomElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Room(r) => Some(r),
            _ => None,
        })
        .collect();

    if !rooms.is_empty() {
        let headers = &[
            "NUMBER",
            "NAME",
            "FLOOR AREA",
            "CLG HEIGHT",
            "FLOOR FINISH",
            "WALL FINISH",
            "CLG FINISH",
        ];
        let rows: Vec<Vec<String>> = rooms
            .iter()
            .enumerate()
            .map(|(i, r)| {
                let area_val = bcad_domain::polygon_area(&r.boundary);
                let name = if r.meta.name.is_empty() {
                    "-".to_string()
                } else {
                    r.meta.name.to_uppercase()
                };
                vec![
                    format!("{}", i + 1),
                    name,
                    format!("{:.1} M\u{00B2}", area_val),
                    "2.7M".to_string(),
                    "-".to_string(),
                    "-".to_string(),
                    "-".to_string(),
                ]
            })
            .collect();
        let _ = draw_schedule_table(layer, font, "ROOM SCHEDULE", y, area, headers, &rows);
    }

    if doors.is_empty() && windows.is_empty() && rooms.is_empty() {
        layer.use_text(
            "NO SCHEDULABLE ELEMENTS FOUND IN THE PROJECT.",
            10.0,
            mm(area.left + 10.0),
            mm(y - 10.0),
            font,
        );
    }
}

/// Draw a single schedule table, returning the Y position of the bottom.
fn draw_schedule_table(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    title: &str,
    start_y: f64,
    area: &DrawableArea,
    headers: &[&str],
    rows: &[Vec<String>],
) -> f64 {
    let col_count = headers.len();
    let col_width = ((area.width - 10.0) / col_count as f64).min(35.0);
    let row_height = 5.0;
    let x0 = area.left + 5.0;

    // Title -- UPPERCASE
    layer.use_text(title, 9.0, mm(x0), mm(start_y), font);
    let mut y = start_y - 3.0;

    // Header row
    set_stroke_color_rgb(layer, 0, 0, 0);
    set_pen(layer, Lineweights::WALL_BEYOND); // 0.25 mm table lines
    set_fill_color_rgb(layer, 230, 230, 230);

    for (c, header) in headers.iter().enumerate() {
        let cx = x0 + c as f64 * col_width;
        draw_rect(layer, cx, y - row_height, col_width, row_height);
        layer.use_text(*header, 6.0, mm(cx + 1.5), mm(y - 3.5), font);
    }
    y -= row_height;

    // Data rows
    for row in rows {
        if y - row_height < area.bottom + 5.0 {
            break;
        }
        set_fill_color_rgb(layer, 255, 255, 255);
        for (c, cell) in row.iter().enumerate().take(col_count) {
            let cx = x0 + c as f64 * col_width;
            draw_rect(layer, cx, y - row_height, col_width, row_height);
            layer.use_text(cell, 5.5, mm(cx + 1.5), mm(y - 3.5), font);
        }
        y -= row_height;
    }

    y
}

// ---------------------------------------------------------------------------
// Elevations placeholder
// ---------------------------------------------------------------------------

fn render_elevations_placeholder(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    area: &DrawableArea,
) {
    layer.use_text(
        "ELEVATION VIEWS",
        10.0,
        mm(area.left + 10.0),
        mm(area.bottom + area.height - 15.0),
        font,
    );
    layer.use_text(
        "(GENERATED FROM 3D MODEL - NORTH, SOUTH, EAST, WEST)",
        7.0,
        mm(area.left + 10.0),
        mm(area.bottom + area.height - 22.0),
        font,
    );

    let quad_w = area.width / 2.0 - 10.0;
    let quad_h = area.height / 2.0 - 15.0;
    let directions = ["NORTH", "SOUTH", "EAST", "WEST"];
    let positions = [
        (area.left + 5.0, area.bottom + area.height / 2.0 + 5.0),
        (
            area.left + 5.0 + quad_w + 10.0,
            area.bottom + area.height / 2.0 + 5.0,
        ),
        (area.left + 5.0, area.bottom + 5.0),
        (area.left + 5.0 + quad_w + 10.0, area.bottom + 5.0),
    ];

    set_pen(layer, Lineweights::EXTENSION); // 0.13 mm for placeholder boxes
    set_stroke_color_rgb(layer, 180, 180, 180);

    for (i, dir) in directions.iter().enumerate() {
        let (px, py) = positions[i];
        draw_rect(layer, px, py, quad_w, quad_h);
        layer.use_text(
            &format!("{} ELEVATION", dir),
            7.0,
            mm(px + quad_w / 2.0 - 10.0),
            mm(py + quad_h / 2.0),
            font,
        );
    }

    set_stroke_color_rgb(layer, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

fn find_wall<'a>(elements: &'a [Element], wall_id: &str) -> Option<&'a WallElement> {
    elements.iter().find_map(|e| match e {
        Element::Wall(w) if w.meta.id == wall_id => Some(w),
        _ => None,
    })
}

/// Format a dimension value in meters for display.
fn format_dim(meters: f64) -> String {
    if meters < 1.0 {
        format!("{:.0} mm", meters * 1000.0)
    } else {
        format!("{:.2} m", meters)
    }
}
