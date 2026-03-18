//! DXF file import/export.
//!
//! Reads and writes AutoCAD DXF files for 2D drawing interchange.
//! Uses AIA-standard layer naming (A-WALL, A-DOOR, A-WIND, etc.).

use bcad_domain::{
    BeamElement, ColumnElement, Element, ElementMeta, ElectricalElement, FloorElement,
    FoundationElement, FurnitureElement, PlumbingElement, RoomElement, RoofElement, RoofType,
    SiteDetailElement, StairElement, StairType, WallElement,
};
use std::io::Cursor;

// ---------------------------------------------------------------------------
// Standard AIA layer definitions
// ---------------------------------------------------------------------------

/// (layer_name, dxf_color_number)
///
/// Color mapping:
///   1=Red, 2=Yellow, 3=Green, 4=Cyan, 5=Blue, 6=Magenta, 7=White/Black
const STANDARD_LAYERS: &[(&str, i16)] = &[
    ("A-WALL", 7),   // white (walls)
    ("A-DOOR", 3),   // green
    ("A-WIND", 5),   // blue
    ("A-FLOR", 8),   // grey
    ("A-ROOF", 30),  // orange
    ("A-STRS", 8),   // grey
    ("A-CLNG", 9),   // light grey
    ("A-COLS", 7),   // white
    ("A-BEAM", 4),   // cyan
    ("A-FNDN", 44),  // brown
    ("E-POWR", 1),   // red
    ("E-LITE", 2),   // yellow
    ("P-FIXT", 5),   // blue
    ("S-GRID", 6),   // magenta
    ("F-FURN", 3),   // green
    ("L-SITE", 80),  // dark green
    ("G-ANNO", 7),   // white
    ("G-DIMS", 7),   // white
    ("G-TAGS", 7),   // white
];

/// Ensure standard layers exist in the drawing.
fn ensure_standard_layers(drawing: &mut dxf::Drawing) {
    for &(name, color_number) in STANDARD_LAYERS {
        let already = drawing
            .layers()
            .any(|l| l.name.eq_ignore_ascii_case(name));
        if !already {
            let mut layer = dxf::tables::Layer::default();
            layer.name = name.to_string();
            layer.color = dxf::Color::from_index(color_number as u8);
            drawing.add_layer(layer);
        }
    }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/// Export BetterCAD elements to DXF format bytes.
///
/// Element-to-layer mapping uses AIA standard layer names:
/// - Walls -> A-WALL
/// - Doors -> A-DOOR
/// - Windows -> A-WIND
/// - Floors -> A-FLOR
/// - Rooms -> A-FLOR (room boundaries)
/// - Columns -> A-COLS
/// - Beams -> A-BEAM
/// - Foundations -> A-FNDN
/// - Roofs -> A-ROOF
/// - Stairs -> A-STRS
/// - Electrical -> E-POWR or E-LITE
/// - Plumbing -> P-FIXT
/// - Furniture -> F-FURN
/// - SiteDetail -> L-SITE
/// - Dimensions -> G-DIMS
pub fn export_dxf(elements: &[Element]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut drawing = dxf::Drawing::new();
    drawing.header.version = dxf::enums::AcadVersion::R2000;

    // Add standard AIA layer table
    ensure_standard_layers(&mut drawing);

    // Build a lookup for walls by id so door/window export can reference them.
    let walls_by_id: std::collections::HashMap<&str, &WallElement> = elements
        .iter()
        .filter_map(|e| match e {
            Element::Wall(w) => Some((w.meta.id.as_str(), w)),
            _ => None,
        })
        .collect();

    for element in elements {
        match element {
            Element::Wall(wall) => {
                add_wall_polyline(&mut drawing, wall);
            }
            Element::Floor(floor) => {
                add_closed_polyline(&mut drawing, &floor.boundary, "A-FLOR");
            }
            Element::Room(room) => {
                add_closed_polyline(&mut drawing, &room.boundary, "A-FLOR");
            }
            Element::Column(col) => {
                add_column_polyline(&mut drawing, col);
            }
            Element::Beam(beam) => {
                add_beam_line(&mut drawing, beam);
            }
            Element::Foundation(foundation) => {
                add_closed_polyline(&mut drawing, &foundation.boundary, "A-FNDN");
            }
            Element::Roof(roof) => {
                add_closed_polyline(&mut drawing, &roof.boundary, "A-ROOF");
            }
            Element::Stair(stair) => {
                add_stair_polyline(&mut drawing, stair);
            }
            Element::Door(door) => {
                if let Some(wall) = walls_by_id.get(door.wall_id.as_str()) {
                    add_door_entities(&mut drawing, wall, door.position_along_wall, door.width);
                }
            }
            Element::Window(window) => {
                if let Some(wall) = walls_by_id.get(window.wall_id.as_str()) {
                    add_window_entities(&mut drawing, wall, window.position_along_wall, window.width);
                }
            }
            Element::Electrical(elec) => {
                add_electrical_symbol(&mut drawing, elec);
            }
            Element::Plumbing(plumb) => {
                add_plumbing_symbol(&mut drawing, plumb);
            }
            Element::Furniture(furn) => {
                add_furniture_entity(&mut drawing, furn);
            }
            Element::SiteDetail(site) => {
                add_site_detail_entity(&mut drawing, site);
            }
            _ => {
                // Other element types (Level, Grid, View, Sheet, Material, etc.)
                // are not exported to DXF.
            }
        }
    }

    let mut buf: Vec<u8> = Vec::new();
    drawing.save(&mut buf)?;
    Ok(buf)
}

// ---------------------------------------------------------------------------
// Wall
// ---------------------------------------------------------------------------

fn add_wall_polyline(drawing: &mut dxf::Drawing, wall: &WallElement) {
    use dxf::entities::{Entity, EntityType, LwPolyline};
    use dxf::LwPolylineVertex;

    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-12 {
        return;
    }
    let nx = -dy / len * wall.thickness * 0.5;
    let ny = dx / len * wall.thickness * 0.5;

    let vertices = vec![
        LwPolylineVertex {
            x: wall.start[0] + nx,
            y: wall.start[1] + ny,
            ..Default::default()
        },
        LwPolylineVertex {
            x: wall.end[0] + nx,
            y: wall.end[1] + ny,
            ..Default::default()
        },
        LwPolylineVertex {
            x: wall.end[0] - nx,
            y: wall.end[1] - ny,
            ..Default::default()
        },
        LwPolylineVertex {
            x: wall.start[0] - nx,
            y: wall.start[1] - ny,
            ..Default::default()
        },
    ];

    let mut poly = LwPolyline {
        vertices,
        ..Default::default()
    };
    poly.set_is_closed(true);

    let mut entity = Entity {
        common: Default::default(),
        specific: EntityType::LwPolyline(poly),
    };
    entity.common.layer = "A-WALL".to_string();

    // Store XData: element_id, height, thickness
    let xdata = dxf::XData {
        application_name: "BCAD".to_string(),
        items: vec![dxf::XDataItem::Str(format!(
            "{},{},{}",
            wall.meta.id, wall.height, wall.thickness
        ))],
    };
    entity.common.x_data.push(xdata);

    drawing.add_entity(entity);
}

// ---------------------------------------------------------------------------
// Closed polyline helper
// ---------------------------------------------------------------------------

fn add_closed_polyline(drawing: &mut dxf::Drawing, boundary: &[[f64; 2]], layer: &str) {
    use dxf::entities::{Entity, EntityType, LwPolyline};
    use dxf::LwPolylineVertex;

    if boundary.len() < 3 {
        return;
    }

    let vertices: Vec<LwPolylineVertex> = boundary
        .iter()
        .map(|pt| LwPolylineVertex {
            x: pt[0],
            y: pt[1],
            ..Default::default()
        })
        .collect();

    let mut poly = LwPolyline {
        vertices,
        ..Default::default()
    };
    poly.set_is_closed(true);

    let mut entity = Entity {
        common: Default::default(),
        specific: EntityType::LwPolyline(poly),
    };
    entity.common.layer = layer.to_string();
    drawing.add_entity(entity);
}

// ---------------------------------------------------------------------------
// Column (with X mark)
// ---------------------------------------------------------------------------

fn add_column_polyline(drawing: &mut dxf::Drawing, col: &ColumnElement) {
    let hw = col.width * 0.5;
    let hd = col.depth * 0.5;
    let cx = col.center[0];
    let cy = col.center[1];
    let boundary = vec![
        [cx - hw, cy - hd],
        [cx + hw, cy - hd],
        [cx + hw, cy + hd],
        [cx - hw, cy + hd],
    ];
    add_closed_polyline(drawing, &boundary, "A-COLS");

    // Add X lines inside column
    add_line(drawing, cx - hw, cy - hd, cx + hw, cy + hd, "A-COLS");
    add_line(drawing, cx + hw, cy - hd, cx - hw, cy + hd, "A-COLS");
}

// ---------------------------------------------------------------------------
// Beam
// ---------------------------------------------------------------------------

fn add_beam_line(drawing: &mut dxf::Drawing, beam: &BeamElement) {
    add_line(
        drawing,
        beam.start[0],
        beam.start[1],
        beam.end[0],
        beam.end[1],
        "A-BEAM",
    );
}

// ---------------------------------------------------------------------------
// Stair
// ---------------------------------------------------------------------------

fn add_stair_polyline(drawing: &mut dxf::Drawing, stair: &StairElement) {
    use dxf::entities::{Entity, EntityType, LwPolyline};
    use dxf::LwPolylineVertex;

    let dx = stair.end[0] - stair.start[0];
    let dy = stair.end[1] - stair.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-12 {
        return;
    }
    let nx = -dy / len * stair.width * 0.5;
    let ny = dx / len * stair.width * 0.5;

    let vertices = vec![
        LwPolylineVertex {
            x: stair.start[0] + nx,
            y: stair.start[1] + ny,
            ..Default::default()
        },
        LwPolylineVertex {
            x: stair.end[0] + nx,
            y: stair.end[1] + ny,
            ..Default::default()
        },
        LwPolylineVertex {
            x: stair.end[0] - nx,
            y: stair.end[1] - ny,
            ..Default::default()
        },
        LwPolylineVertex {
            x: stair.start[0] - nx,
            y: stair.start[1] - ny,
            ..Default::default()
        },
    ];

    let mut poly = LwPolyline {
        vertices,
        ..Default::default()
    };
    poly.set_is_closed(true);

    let mut entity = Entity {
        common: Default::default(),
        specific: EntityType::LwPolyline(poly),
    };
    entity.common.layer = "A-STRS".to_string();
    drawing.add_entity(entity);

    // Add tread lines
    let risers = stair.risers.max(1) as usize;
    let ux = dx / len;
    let uy = dy / len;
    for i in 1..risers {
        let t = i as f64 / risers as f64;
        let tx = stair.start[0] + ux * len * t;
        let ty = stair.start[1] + uy * len * t;
        add_line(drawing, tx + nx, ty + ny, tx - nx, ty - ny, "A-STRS");
    }
}

// ---------------------------------------------------------------------------
// Door entities (opening gap lines on A-DOOR layer)
// ---------------------------------------------------------------------------

fn add_door_entities(
    drawing: &mut dxf::Drawing,
    wall: &WallElement,
    position_along_wall: f64,
    width: f64,
) {
    use dxf::entities::{Entity, EntityType, Line};
    use dxf::Point;

    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let wall_len = (dx * dx + dy * dy).sqrt();
    if wall_len < 1e-12 {
        return;
    }
    let ux = dx / wall_len;
    let uy = dy / wall_len;

    let nx = -uy * wall.thickness * 0.5;
    let ny = ux * wall.thickness * 0.5;

    let start_dist = position_along_wall - width * 0.5;
    let end_dist = position_along_wall + width * 0.5;

    for dist in [start_dist, end_dist] {
        let cx = wall.start[0] + ux * dist;
        let cy = wall.start[1] + uy * dist;
        let mut entity = Entity {
            common: Default::default(),
            specific: EntityType::Line(Line {
                p1: Point::new(cx + nx, cy + ny, 0.0),
                p2: Point::new(cx - nx, cy - ny, 0.0),
                ..Default::default()
            }),
        };
        entity.common.layer = "A-DOOR".to_string();
        drawing.add_entity(entity);
    }

    // Door swing arc approximation: a quarter-circle polyline
    let center_dist = (start_dist + end_dist) * 0.5;
    let cx = wall.start[0] + ux * center_dist;
    let cy = wall.start[1] + uy * center_dist;
    let radius = width * 0.5;
    let arc_segments = 8;
    let base_angle = f64::atan2(uy, ux);

    for i in 0..arc_segments {
        let a1 = base_angle + std::f64::consts::FRAC_PI_2 * (i as f64 / arc_segments as f64);
        let a2 =
            base_angle + std::f64::consts::FRAC_PI_2 * ((i + 1) as f64 / arc_segments as f64);
        let x1 = cx + radius * a1.cos();
        let y1 = cy + radius * a1.sin();
        let x2 = cx + radius * a2.cos();
        let y2 = cy + radius * a2.sin();
        add_line(drawing, x1, y1, x2, y2, "A-DOOR");
    }
}

// ---------------------------------------------------------------------------
// Window entities (three parallel lines on A-WIND layer)
// ---------------------------------------------------------------------------

fn add_window_entities(
    drawing: &mut dxf::Drawing,
    wall: &WallElement,
    position_along_wall: f64,
    width: f64,
) {
    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let wall_len = (dx * dx + dy * dy).sqrt();
    if wall_len < 1e-12 {
        return;
    }
    let ux = dx / wall_len;
    let uy = dy / wall_len;

    let nx = -uy * wall.thickness * 0.5;
    let ny = ux * wall.thickness * 0.5;

    let center_dist = position_along_wall;
    let cx = wall.start[0] + ux * center_dist;
    let cy = wall.start[1] + uy * center_dist;
    let hw = width * 0.5;

    // Three parallel lines: outer, center, inner
    for frac in [-0.6_f64, 0.0, 0.6] {
        let off_x = nx * frac;
        let off_y = ny * frac;
        add_line(
            drawing,
            cx - ux * hw + off_x,
            cy - uy * hw + off_y,
            cx + ux * hw + off_x,
            cy + uy * hw + off_y,
            "A-WIND",
        );
    }
}

// ---------------------------------------------------------------------------
// Electrical symbols
// ---------------------------------------------------------------------------

fn add_electrical_symbol(drawing: &mut dxf::Drawing, elec: &ElectricalElement) {
    let px = elec.position[0];
    let py = elec.position[1];

    // Determine layer: lighting vs power
    let layer = match elec.symbol_type.as_str() {
        "light_fixture" | "ceiling_fan" | "recessed_light" | "wall_sconce"
        | "pendant_light" | "track_light" | "outdoor_light" => "E-LITE",
        _ => "E-POWR",
    };

    // Draw as a circle approximation (octagon) on appropriate layer
    let radius = 0.15; // symbol radius in model units
    add_circle_approx(drawing, px, py, radius, layer);

    // Cross-hair for lights
    if layer == "E-LITE" {
        add_line(drawing, px - radius, py, px + radius, py, layer);
        add_line(drawing, px, py - radius, px, py + radius, layer);
    }
}

// ---------------------------------------------------------------------------
// Plumbing symbols
// ---------------------------------------------------------------------------

fn add_plumbing_symbol(drawing: &mut dxf::Drawing, plumb: &PlumbingElement) {
    let px = plumb.position[0];
    let py = plumb.position[1];
    let layer = "P-FIXT";

    match plumb.symbol_type.as_str() {
        "toilet" => {
            // Bowl (circle) + tank (rectangle)
            add_circle_approx(drawing, px, py + 0.15, 0.15, layer);
            let boundary = vec![
                [px - 0.15, py - 0.3],
                [px + 0.15, py - 0.3],
                [px + 0.15, py - 0.15],
                [px - 0.15, py - 0.15],
            ];
            add_closed_polyline(drawing, &boundary, layer);
        }
        "sink" => {
            // Oval approximation
            add_circle_approx(drawing, px, py, 0.2, layer);
        }
        "bathtub" => {
            let boundary = vec![
                [px - 0.4, py - 0.3],
                [px + 0.4, py - 0.3],
                [px + 0.4, py + 0.3],
                [px - 0.4, py + 0.3],
            ];
            add_closed_polyline(drawing, &boundary, layer);
        }
        "shower" => {
            let boundary = vec![
                [px - 0.4, py - 0.4],
                [px + 0.4, py - 0.4],
                [px + 0.4, py + 0.4],
                [px - 0.4, py + 0.4],
            ];
            add_closed_polyline(drawing, &boundary, layer);
            add_line(drawing, px - 0.4, py - 0.4, px + 0.4, py + 0.4, layer);
            add_line(drawing, px + 0.4, py - 0.4, px - 0.4, py + 0.4, layer);
        }
        _ => {
            add_circle_approx(drawing, px, py, 0.15, layer);
        }
    }
}

// ---------------------------------------------------------------------------
// Furniture entities
// ---------------------------------------------------------------------------

fn add_furniture_entity(drawing: &mut dxf::Drawing, furn: &FurnitureElement) {
    let px = furn.position[0];
    let py = furn.position[1];
    let hw = furn.width * 0.5;
    let hd = furn.depth * 0.5;
    let layer = "F-FURN";

    let boundary = vec![
        [px - hw, py - hd],
        [px + hw, py - hd],
        [px + hw, py + hd],
        [px - hw, py + hd],
    ];
    add_closed_polyline(drawing, &boundary, layer);
}

// ---------------------------------------------------------------------------
// Site detail entities
// ---------------------------------------------------------------------------

fn add_site_detail_entity(drawing: &mut dxf::Drawing, site: &SiteDetailElement) {
    let layer = "L-SITE";

    if site.points.len() < 2 {
        // Single point or no points: draw a circle if radius is available
        if let (Some(&pt), Some(radius)) = (site.points.first(), site.radius) {
            add_circle_approx(drawing, pt[0], pt[1], radius, layer);
        }
        return;
    }

    // Draw polyline for linear site details
    let boundary: Vec<[f64; 2]> = site.points.clone();
    // Determine if it should be closed
    let closed = matches!(
        site.detail_type,
        bcad_domain::SiteDetailType::ParkingSpace
            | bcad_domain::SiteDetailType::Sidewalk
            | bcad_domain::SiteDetailType::Driveway
    );

    if closed && boundary.len() >= 3 {
        add_closed_polyline(drawing, &boundary, layer);
    } else {
        // Open polyline as series of lines
        for i in 0..boundary.len() - 1 {
            add_line(
                drawing,
                boundary[i][0],
                boundary[i][1],
                boundary[i + 1][0],
                boundary[i + 1][1],
                layer,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Helper: add a LINE entity
// ---------------------------------------------------------------------------

fn add_line(drawing: &mut dxf::Drawing, x1: f64, y1: f64, x2: f64, y2: f64, layer: &str) {
    use dxf::entities::{Entity, EntityType, Line};
    use dxf::Point;

    let mut entity = Entity {
        common: Default::default(),
        specific: EntityType::Line(Line {
            p1: Point::new(x1, y1, 0.0),
            p2: Point::new(x2, y2, 0.0),
            ..Default::default()
        }),
    };
    entity.common.layer = layer.to_string();
    drawing.add_entity(entity);
}

// ---------------------------------------------------------------------------
// Helper: approximate a circle as a closed polyline (octagon)
// ---------------------------------------------------------------------------

fn add_circle_approx(drawing: &mut dxf::Drawing, cx: f64, cy: f64, radius: f64, layer: &str) {
    let segments = 12;
    let mut points = Vec::with_capacity(segments);
    for i in 0..segments {
        let angle = 2.0 * std::f64::consts::PI * (i as f64 / segments as f64);
        points.push([cx + radius * angle.cos(), cy + radius * angle.sin()]);
    }
    add_closed_polyline(drawing, &points, layer);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/// Import DXF data and convert recognized entities to BetterCAD elements.
///
/// Layer-based discrimination uses both legacy layer names and new AIA names:
/// - `WALLS` / `A-WALL` layer LWPOLYLINE -> WallElement
/// - `FLOORS` / `A-FLOR` layer closed LWPOLYLINE -> FloorElement
/// - `ROOMS` layer closed LWPOLYLINE -> RoomElement
/// - `COLUMNS` / `A-COLS` layer closed LWPOLYLINE -> ColumnElement
/// - `BEAMS` / `A-BEAM` layer LINE -> BeamElement
/// - `FOUNDATIONS` / `A-FNDN` layer closed LWPOLYLINE -> FoundationElement
/// - `ROOFS` / `A-ROOF` layer closed LWPOLYLINE -> RoofElement
/// - `STAIRS` / `A-STRS` layer closed LWPOLYLINE -> StairElement
/// - Other LINE entities -> WallElement (fallback)
/// - Other closed LWPOLYLINE -> FloorElement (fallback)
pub fn import_dxf(data: &[u8]) -> Result<Vec<Element>, Box<dyn std::error::Error>> {
    use dxf::entities::EntityType;
    use dxf::Drawing;

    let mut cursor = Cursor::new(data);
    let drawing = Drawing::load(&mut cursor)?;

    let mut elements: Vec<Element> = Vec::new();

    for entity in drawing.entities() {
        let layer = entity.common.layer.to_uppercase();

        match &entity.specific {
            EntityType::LwPolyline(poly) => {
                if poly.vertices.len() < 3 {
                    continue;
                }

                let is_closed = poly.is_closed();

                match layer.as_str() {
                    "WALLS" | "A-WALL" if is_closed && poly.vertices.len() >= 4 => {
                        if let Some(wall) =
                            reconstruct_wall_from_polyline(poly, &entity.common.x_data)
                        {
                            elements.push(Element::Wall(wall));
                        }
                    }
                    "FLOORS" | "A-FLOR" if is_closed => {
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let floor = FloorElement {
                            meta: ElementMeta::new(format!(
                                "Imported Floor {}",
                                elements.len() + 1
                            )),
                            boundary,
                            thickness: 0.3,
                            boundary_segments: Vec::new(),
                        };
                        elements.push(Element::Floor(floor));
                    }
                    "ROOMS" => {
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let room = RoomElement {
                            meta: ElementMeta::new(format!(
                                "Imported Room {}",
                                elements.len() + 1
                            )),
                            boundary,
                            boundary_segments: Vec::new(),
                        };
                        elements.push(Element::Room(room));
                    }
                    "COLUMNS" | "A-COLS" if is_closed && poly.vertices.len() >= 4 => {
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let (min_x, max_x, min_y, max_y) = bounding_box(&boundary);
                        let col = ColumnElement {
                            meta: ElementMeta::new(format!(
                                "Imported Column {}",
                                elements.len() + 1
                            )),
                            center: [(min_x + max_x) * 0.5, (min_y + max_y) * 0.5],
                            width: max_x - min_x,
                            depth: max_y - min_y,
                            height: 3.0,
                            diameter: None,
                            column_segments: 24,
                        };
                        elements.push(Element::Column(col));
                    }
                    "FOUNDATIONS" | "A-FNDN" if is_closed => {
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let foundation = FoundationElement {
                            meta: ElementMeta::new(format!(
                                "Imported Foundation {}",
                                elements.len() + 1
                            )),
                            boundary,
                            thickness: 0.5,
                        };
                        elements.push(Element::Foundation(foundation));
                    }
                    "ROOFS" | "A-ROOF" if is_closed => {
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let roof = RoofElement {
                            meta: ElementMeta::new(format!(
                                "Imported Roof {}",
                                elements.len() + 1
                            )),
                            boundary,
                            thickness: 0.3,
                            elevation: 3.0,
                            auto_elevation: true,
                            roof_type: RoofType::Flat,
                            pitch_degrees: 30.0,
                            ridge_angle_degrees: 0.0,
                        };
                        elements.push(Element::Roof(roof));
                    }
                    "STAIRS" | "A-STRS" if is_closed && poly.vertices.len() >= 4 => {
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let (min_x, max_x, min_y, max_y) = bounding_box(&boundary);
                        let stair = StairElement {
                            meta: ElementMeta::new(format!(
                                "Imported Stair {}",
                                elements.len() + 1
                            )),
                            start: [min_x, (min_y + max_y) * 0.5],
                            end: [max_x, (min_y + max_y) * 0.5],
                            width: max_y - min_y,
                            risers: 15,
                            total_height: 3.0,
                            stair_type: StairType::Straight,
                            spiral_turns: 1.0,
                            side_wall_thickness: 0.12,
                        };
                        elements.push(Element::Stair(stair));
                    }
                    _ if is_closed => {
                        // Fallback: closed polyline -> floor
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let floor = FloorElement {
                            meta: ElementMeta::new(format!(
                                "Imported Floor {}",
                                elements.len() + 1
                            )),
                            boundary,
                            thickness: 0.3,
                            boundary_segments: Vec::new(),
                        };
                        elements.push(Element::Floor(floor));
                    }
                    _ => {
                        // Open polyline on unknown layer: treat as room boundary
                        let boundary: Vec<[f64; 2]> =
                            poly.vertices.iter().map(|v| [v.x, v.y]).collect();
                        let room = RoomElement {
                            meta: ElementMeta::new(format!(
                                "Imported Room {}",
                                elements.len() + 1
                            )),
                            boundary,
                            boundary_segments: Vec::new(),
                        };
                        elements.push(Element::Room(room));
                    }
                }
            }
            EntityType::Line(line) => {
                match layer.as_str() {
                    "BEAMS" | "A-BEAM" => {
                        let beam = BeamElement {
                            meta: ElementMeta::new(format!(
                                "Imported Beam {}",
                                elements.len() + 1
                            )),
                            start: [line.p1.x, line.p1.y, line.p1.z],
                            end: [line.p2.x, line.p2.y, line.p2.z],
                            width: 0.2,
                            depth: 0.4,
                            arc: None,
                            arc_segments: 24,
                        };
                        elements.push(Element::Beam(beam));
                    }
                    "A-DOOR" | "A-WIND" | "A-STRS" | "E-POWR" | "E-LITE" | "P-FIXT"
                    | "F-FURN" | "L-SITE" | "G-DIMS" | "G-ANNO" | "G-TAGS" => {
                        // Skip supplementary entities (door swings, window lines, etc.)
                        // These are reconstructed from the primary elements.
                    }
                    _ => {
                        // Fallback: LINE -> wall
                        let wall = WallElement {
                            meta: ElementMeta::new(format!(
                                "Imported Wall {}",
                                elements.len() + 1
                            )),
                            start: [line.p1.x, line.p1.y],
                            end: [line.p2.x, line.p2.y],
                            height: 3.0,
                            thickness: 0.2,
                            arc: None,
                            arc_segments: 24,
                        };
                        elements.push(Element::Wall(wall));
                    }
                }
            }
            _ => {
                // Skip unsupported entity types.
            }
        }
    }

    Ok(elements)
}

// ---------------------------------------------------------------------------
// Wall reconstruction from polyline
// ---------------------------------------------------------------------------

fn reconstruct_wall_from_polyline(
    poly: &dxf::entities::LwPolyline,
    x_data: &[dxf::XData],
) -> Option<WallElement> {
    if poly.vertices.len() < 4 {
        return None;
    }

    let mut xdata_id: Option<String> = None;
    let mut xdata_height: Option<f64> = None;
    let mut xdata_thickness: Option<f64> = None;

    for xd in x_data {
        if xd.application_name == "BCAD" {
            for item in &xd.items {
                if let dxf::XDataItem::Str(s) = item {
                    let parts: Vec<&str> = s.split(',').collect();
                    if parts.len() >= 3 {
                        xdata_id = Some(parts[0].to_string());
                        xdata_height = parts[1].parse().ok();
                        xdata_thickness = parts[2].parse().ok();
                    }
                }
            }
        }
    }

    let verts: Vec<[f64; 2]> = poly.vertices.iter().map(|v| [v.x, v.y]).collect();

    let mid_start_x = (verts[0][0] + verts[3][0]) * 0.5;
    let mid_start_y = (verts[0][1] + verts[3][1]) * 0.5;
    let mid_end_x = (verts[1][0] + verts[2][0]) * 0.5;
    let mid_end_y = (verts[1][1] + verts[2][1]) * 0.5;

    let edge_dx = verts[0][0] - verts[3][0];
    let edge_dy = verts[0][1] - verts[3][1];
    let computed_thickness = (edge_dx * edge_dx + edge_dy * edge_dy).sqrt();

    let height = xdata_height.unwrap_or(3.0);
    let thickness = xdata_thickness.unwrap_or(computed_thickness.max(0.01));

    let mut meta = ElementMeta::new("Imported Wall".to_string());
    if let Some(id) = xdata_id {
        meta.id = id;
    }

    Some(WallElement {
        meta,
        start: [mid_start_x, mid_start_y],
        end: [mid_end_x, mid_end_y],
        height,
        thickness,
        arc: None,
        arc_segments: 24,
    })
}

// ---------------------------------------------------------------------------
// Bounding box helper
// ---------------------------------------------------------------------------

fn bounding_box(points: &[[f64; 2]]) -> (f64, f64, f64, f64) {
    let mut min_x = f64::MAX;
    let mut max_x = f64::MIN;
    let mut min_y = f64::MAX;
    let mut max_y = f64::MIN;
    for p in points {
        min_x = min_x.min(p[0]);
        max_x = max_x.max(p[0]);
        min_y = min_y.min(p[1]);
        max_y = max_y.max(p[1]);
    }
    (min_x, max_x, min_y, max_y)
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::ElementMeta;

    #[test]
    fn test_export_and_reimport_wall() {
        let wall = Element::Wall(WallElement {
            meta: ElementMeta::new("Test Wall"),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        });

        let dxf_bytes = export_dxf(&[wall]).expect("export should succeed");
        assert!(!dxf_bytes.is_empty());

        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        // Should have at least one wall (may have extra from column X-lines etc.)
        let walls: Vec<_> = imported
            .iter()
            .filter(|e| matches!(e, Element::Wall(_)))
            .collect();
        assert!(!walls.is_empty(), "should import at least one wall");
        match &walls[0] {
            Element::Wall(w) => {
                assert!(
                    (w.start[1] - w.end[1]).abs() < 1e-6,
                    "wall should be horizontal"
                );
                assert!(
                    (w.height - 3.0).abs() < 1e-6,
                    "height should be preserved via XData"
                );
                assert!(
                    (w.thickness - 0.2).abs() < 1e-2,
                    "thickness should be preserved"
                );
            }
            other => panic!("expected Wall element, got {:?}", other.kind_name()),
        }
    }

    #[test]
    fn test_export_and_reimport_floor() {
        let floor = Element::Floor(FloorElement {
            meta: ElementMeta::new("Test Floor"),
            boundary: vec![[0.0, 0.0], [5.0, 0.0], [5.0, 4.0], [0.0, 4.0]],
            thickness: 0.3,
        });

        let dxf_bytes = export_dxf(&[floor]).expect("export should succeed");
        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        assert_eq!(imported.len(), 1);
        match &imported[0] {
            Element::Floor(f) => {
                assert_eq!(f.boundary.len(), 4);
            }
            _ => panic!("expected Floor element"),
        }
    }

    #[test]
    fn test_export_empty() {
        let dxf_bytes = export_dxf(&[]).expect("export empty should succeed");
        assert!(!dxf_bytes.is_empty());
        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        assert!(imported.is_empty());
    }

    #[test]
    fn test_export_room() {
        let room = Element::Room(RoomElement {
            meta: ElementMeta::new("Living Room"),
            boundary: vec![[0.0, 0.0], [6.0, 0.0], [6.0, 5.0], [0.0, 5.0]],
        });

        let dxf_bytes = export_dxf(&[room]).expect("export should succeed");
        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        assert_eq!(imported.len(), 1);
        // A-FLOR layer, closed polyline -> Floor on import (since room and floor share layer)
        match &imported[0] {
            Element::Floor(_) | Element::Room(_) => {
                // Both are acceptable for A-FLOR layer
            }
            other => panic!(
                "expected Floor or Room element from A-FLOR layer, got {:?}",
                other.kind_name()
            ),
        }
    }

    #[test]
    fn test_export_foundation() {
        let foundation = Element::Foundation(FoundationElement {
            meta: ElementMeta::new("Foundation"),
            boundary: vec![[0.0, 0.0], [6.0, 0.0], [6.0, 5.0], [0.0, 5.0]],
            thickness: 0.5,
        });

        let dxf_bytes = export_dxf(&[foundation]).expect("export should succeed");
        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        assert_eq!(imported.len(), 1);
        match &imported[0] {
            Element::Foundation(f) => {
                assert_eq!(f.boundary.len(), 4);
            }
            _ => panic!("expected Foundation element from A-FNDN layer"),
        }
    }

    #[test]
    fn test_export_stair() {
        let stair = Element::Stair(StairElement {
            meta: ElementMeta::new("Stair 1"),
            start: [0.0, 0.0],
            end: [3.0, 0.0],
            width: 1.0,
            risers: 15,
            total_height: 3.0,
            stair_type: StairType::Straight,
            spiral_turns: 1.0,
            side_wall_thickness: 0.12,
        });

        let dxf_bytes = export_dxf(&[stair]).expect("export should succeed");
        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        // At least the outline stair polyline should round-trip
        let stairs: Vec<_> = imported
            .iter()
            .filter(|e| matches!(e, Element::Stair(_)))
            .collect();
        assert!(!stairs.is_empty(), "should import at least one stair");
    }

    #[test]
    fn test_export_column_with_aia_layer() {
        let col = Element::Column(ColumnElement {
            meta: ElementMeta::new("Col 1"),
            center: [2.0, 3.0],
            width: 0.4,
            depth: 0.4,
            height: 3.0,
        });

        let dxf_bytes = export_dxf(&[col]).expect("export should succeed");
        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        let cols: Vec<_> = imported
            .iter()
            .filter(|e| matches!(e, Element::Column(_)))
            .collect();
        assert!(!cols.is_empty(), "should import at least one column");
    }

    #[test]
    fn test_standard_layers_created() {
        let dxf_bytes = export_dxf(&[]).expect("export should succeed");

        // Parse and verify layers exist
        let mut cursor = Cursor::new(&dxf_bytes);
        let drawing = dxf::Drawing::load(&mut cursor).expect("should load");
        let layer_names: Vec<String> = drawing.layers().map(|l| l.name.clone()).collect();

        assert!(
            layer_names.iter().any(|n| n == "A-WALL"),
            "should have A-WALL layer"
        );
        assert!(
            layer_names.iter().any(|n| n == "A-DOOR"),
            "should have A-DOOR layer"
        );
        assert!(
            layer_names.iter().any(|n| n == "G-DIMS"),
            "should have G-DIMS layer"
        );
    }
}
