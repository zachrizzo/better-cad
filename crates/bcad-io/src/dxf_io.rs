//! DXF file import/export.
//!
//! Reads and writes AutoCAD DXF files for 2D drawing interchange.

use bcad_domain::{
    BeamElement, ColumnElement, Element, ElementMeta, FloorElement, RoomElement, WallElement,
};
use std::io::Cursor;

/// Export BetterCAD elements to DXF format bytes.
///
/// Mapping:
/// - Walls -> two LINE entities (wall edges offset by thickness)
/// - Floors -> closed LWPOLYLINE entities
/// - Rooms -> closed LWPOLYLINE entities
/// - Columns -> closed LWPOLYLINE (rectangle)
/// - Beams -> LINE entity (centerline projected to XY)
/// - Doors/Windows -> LINE entities at the opening position along the host wall
pub fn export_dxf(elements: &[Element]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut drawing = dxf::Drawing::new();
    drawing.header.version = dxf::enums::AcadVersion::R2000;

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
                add_wall_lines(&mut drawing, wall);
            }
            Element::Floor(floor) => {
                add_closed_polyline(&mut drawing, &floor.boundary, &floor.meta.name);
            }
            Element::Room(room) => {
                add_closed_polyline(&mut drawing, &room.boundary, &room.meta.name);
            }
            Element::Column(col) => {
                add_column_polyline(&mut drawing, col);
            }
            Element::Beam(beam) => {
                add_beam_line(&mut drawing, beam);
            }
            Element::Door(door) => {
                if let Some(wall) = walls_by_id.get(door.wall_id.as_str()) {
                    add_opening_line(&mut drawing, wall, door.position_along_wall, door.width);
                }
            }
            Element::Window(window) => {
                if let Some(wall) = walls_by_id.get(window.wall_id.as_str()) {
                    add_opening_line(&mut drawing, wall, window.position_along_wall, window.width);
                }
            }
            _ => {
                // Other element types are not exported to DXF.
            }
        }
    }

    let mut buf: Vec<u8> = Vec::new();
    drawing.save(&mut buf)?;
    Ok(buf)

    // -- helper closures as free fns below --
}

fn add_wall_lines(drawing: &mut dxf::Drawing, wall: &WallElement) {
    use dxf::entities::{Entity, EntityType, Line};
    use dxf::Point;

    let dx = wall.end[0] - wall.start[0];
    let dy = wall.end[1] - wall.start[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-12 {
        return;
    }
    let nx = -dy / len * wall.thickness * 0.5;
    let ny = dx / len * wall.thickness * 0.5;

    // Edge 1
    let mut e1 = Entity {
        common: Default::default(),
        specific: EntityType::Line(Line {
            p1: Point::new(wall.start[0] + nx, wall.start[1] + ny, 0.0),
            p2: Point::new(wall.end[0] + nx, wall.end[1] + ny, 0.0),
            ..Default::default()
        }),
    };
    e1.common.layer = "WALLS".to_string();
    drawing.add_entity(e1);

    // Edge 2
    let mut e2 = Entity {
        common: Default::default(),
        specific: EntityType::Line(Line {
            p1: Point::new(wall.start[0] - nx, wall.start[1] - ny, 0.0),
            p2: Point::new(wall.end[0] - nx, wall.end[1] - ny, 0.0),
            ..Default::default()
        }),
    };
    e2.common.layer = "WALLS".to_string();
    drawing.add_entity(e2);
}

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
    add_closed_polyline(drawing, &boundary, "COLUMNS");
}

fn add_beam_line(drawing: &mut dxf::Drawing, beam: &BeamElement) {
    use dxf::entities::{Entity, EntityType, Line};
    use dxf::Point;

    let mut entity = Entity {
        common: Default::default(),
        specific: EntityType::Line(Line {
            p1: Point::new(beam.start[0], beam.start[1], 0.0),
            p2: Point::new(beam.end[0], beam.end[1], 0.0),
            ..Default::default()
        }),
    };
    entity.common.layer = "BEAMS".to_string();
    drawing.add_entity(entity);
}

fn add_opening_line(
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

    // Normal perpendicular to wall direction, scaled by half thickness.
    let nx = -uy * wall.thickness * 0.5;
    let ny = ux * wall.thickness * 0.5;

    let start_dist = position_along_wall - width * 0.5;
    let end_dist = position_along_wall + width * 0.5;

    // Two short lines across the wall thickness to mark the opening edges.
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
        entity.common.layer = "OPENINGS".to_string();
        drawing.add_entity(entity);
    }
}

/// Import DXF data and convert recognized entities to BetterCAD elements.
///
/// - LINE entities on the "WALLS" layer with matching height are paired into WallElements.
/// - Closed LWPOLYLINE entities become FloorElements (>= 3 vertices).
/// - Other LINE entities become generic wall segments with default height.
pub fn import_dxf(data: &[u8]) -> Result<Vec<Element>, Box<dyn std::error::Error>> {
    use dxf::entities::EntityType;
    use dxf::Drawing;

    let mut cursor = Cursor::new(data);
    let drawing = Drawing::load(&mut cursor)?;

    let mut elements: Vec<Element> = Vec::new();

    // Collect LINE entities — try to create walls from them.
    // Collect LWPOLYLINE entities — create floors/rooms.
    for entity in drawing.entities() {
        match &entity.specific {
            EntityType::Line(line) => {
                let wall = WallElement {
                    meta: ElementMeta::new(format!("Imported Wall {}", elements.len() + 1)),
                    start: [line.p1.x, line.p1.y],
                    end: [line.p2.x, line.p2.y],
                    height: 3.0,     // default wall height
                    thickness: 0.2,  // default wall thickness
                };
                elements.push(Element::Wall(wall));
            }
            EntityType::LwPolyline(poly) => {
                if poly.vertices.len() < 3 {
                    continue;
                }
                let boundary: Vec<[f64; 2]> =
                    poly.vertices.iter().map(|v| [v.x, v.y]).collect();

                let is_closed = poly.is_closed();
                if is_closed {
                    let floor = FloorElement {
                        meta: ElementMeta::new(format!("Imported Floor {}", elements.len() + 1)),
                        boundary,
                        thickness: 0.3, // default slab thickness
                    };
                    elements.push(Element::Floor(floor));
                } else {
                    // Open polylines: treat as a room boundary anyway.
                    let room = RoomElement {
                        meta: ElementMeta::new(format!("Imported Room {}", elements.len() + 1)),
                        boundary,
                    };
                    elements.push(Element::Room(room));
                }
            }
            _ => {
                // Skip unsupported entity types.
            }
        }
    }

    Ok(elements)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::{ElementMeta, WallElement};

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

        // Re-import: the two wall edge lines should produce two wall elements.
        let imported = import_dxf(&dxf_bytes).expect("import should succeed");
        assert_eq!(imported.len(), 2, "two LINE entities = two walls");
        for elem in &imported {
            match elem {
                Element::Wall(w) => {
                    assert!((w.start[1] - w.end[1]).abs() < 1e-6, "wall should be horizontal");
                }
                _ => panic!("expected Wall element"),
            }
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
        match &imported[0] {
            Element::Floor(f) => {
                // Closed polyline imports as floor
                assert_eq!(f.boundary.len(), 4);
            }
            _ => panic!("expected Floor element from closed polyline"),
        }
    }
}
