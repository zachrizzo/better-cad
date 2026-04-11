//! IFC (Industry Foundation Classes) import/export.
//!
//! Exports BetterCAD elements to IFC4 SPF (STEP Physical File) format.
//! Imports IFC4 (and IFC2X3) files via a lightweight SPF parser.
//! This text-based format can be read by Revit, ArchiCAD, etc.

use bcad_domain::{
    BeamElement, ColumnElement, DoorElement, DoorHardwareType, DoorStyle, DoorSwing, Element,
    ElementMeta, FloorElement, FoundationElement, FurnitureElement, LevelElement, PlumbingElement,
    RoofElement, RoofType, RoomElement, StairElement, StairType, WallElement, WindowElement,
    WindowHardwareType, WindowStyle,
};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// IFC Import
// ---------------------------------------------------------------------------

/// A warning generated during IFC import when geometry is too complex or
/// an entity cannot be fully mapped.
#[derive(Debug, Clone)]
pub struct ImportWarning {
    pub entity_id: u32,
    pub message: String,
}

/// Result of an IFC import operation.
pub struct IfcImportResult {
    pub elements: Vec<Element>,
    pub warnings: Vec<ImportWarning>,
}

/// Parsed raw SPF entity: entity type name + raw attribute string.
struct RawEntity {
    entity_type: String,
    raw_attrs: String,
}

/// Import IFC (IFC4 or IFC2X3) SPF data into BetterCAD elements.
///
/// Uses a 3-phase approach:
/// 1. Line scan: parse DATA section into entity map
/// 2. Entity resolution: map IFC entities to domain elements
/// 3. Relationship resolution: assign level_id and wall_id via rels
pub fn import_ifc(data: &[u8]) -> Result<IfcImportResult, crate::IoError> {
    let text = std::str::from_utf8(data)
        .map_err(|e| crate::IoError::FormatError(format!("Invalid UTF-8: {}", e)))?;

    // Phase 1: Line scan — parse DATA section
    let entities = parse_spf_data_section(text)?;

    // Phase 2: Entity resolution
    let mut elements: Vec<Element> = Vec::new();
    let mut warnings: Vec<ImportWarning> = Vec::new();
    // Maps from IFC entity ID to our domain element index
    let mut ifc_to_element_idx: HashMap<u32, usize> = HashMap::new();
    // Maps from IFC entity ID to level element id
    let mut ifc_storey_to_level_id: HashMap<u32, String> = HashMap::new();

    // Pass 1: IfcBuildingStorey → LevelElement
    for (&eid, raw) in &entities {
        let etype = raw.entity_type.to_uppercase();
        if etype == "IFCBUILDINGSTOREY" {
            let attrs = split_spf_attrs(&raw.raw_attrs);
            let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                .unwrap_or_else(|| format!("Level #{}", eid));
            let elevation = attrs
                .get(9)
                .and_then(|s| s.trim().parse::<f64>().ok())
                .unwrap_or(0.0);

            let mut meta = ElementMeta::new(&name);
            meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
            let level = Element::Level(LevelElement { meta, elevation });
            let idx = elements.len();
            ifc_storey_to_level_id.insert(eid, level.id().to_string());
            ifc_to_element_idx.insert(eid, idx);
            elements.push(level);
        }
    }

    // Pass 2: Building elements
    for (&eid, raw) in &entities {
        let etype = raw.entity_type.to_uppercase();
        let attrs = split_spf_attrs(&raw.raw_attrs);

        match etype.as_str() {
            "IFCWALL" | "IFCWALLSTANDARDCASE" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Wall #{}", eid));
                let placement_ref = parse_entity_ref(&attrs.get(5).cloned().unwrap_or_default());
                let (x, y, _z) = resolve_placement_location(&entities, placement_ref);
                let (dir_x, dir_y) = resolve_placement_direction(&entities, placement_ref);

                // Try to get dimensions from the product shape
                let shape_ref = parse_entity_ref(&attrs.get(6).cloned().unwrap_or_default());
                let (length, height, thickness) =
                    resolve_wall_dimensions(&entities, shape_ref, &mut warnings, eid);

                let end_x = x + dir_x * length;
                let end_y = y + dir_y * length;

                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let wall = Element::Wall(WallElement {
                    meta,
                    start: [x, y],
                    end: [end_x, end_y],
                    height,
                    thickness,
                    arc: None,
                    arc_segments: 24,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(wall);
            }
            "IFCSLAB" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Slab #{}", eid));
                // Check predefined type — last attr
                let predefined = attrs.last().cloned().unwrap_or_default().to_uppercase();
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());

                if predefined.contains("BASESLAB") {
                    let elem = Element::Foundation(FoundationElement {
                        meta,
                        boundary: vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]],
                        thickness: 0.3,
                    });
                    let idx = elements.len();
                    ifc_to_element_idx.insert(eid, idx);
                    elements.push(elem);
                    warnings.push(ImportWarning {
                        entity_id: eid,
                        message: "Foundation slab imported with default boundary".into(),
                    });
                } else {
                    // .FLOOR. or default
                    let elem = Element::Floor(FloorElement {
                        meta,
                        boundary: vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]],
                        thickness: 0.3,
                        boundary_segments: Vec::new(),
                    });
                    let idx = elements.len();
                    ifc_to_element_idx.insert(eid, idx);
                    elements.push(elem);
                    warnings.push(ImportWarning {
                        entity_id: eid,
                        message: "Floor slab imported with default boundary".into(),
                    });
                }
            }
            "IFCROOF" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Roof #{}", eid));
                let predefined = attrs.last().cloned().unwrap_or_default().to_uppercase();
                let roof_type = if predefined.contains("GABLE") {
                    RoofType::Gable
                } else if predefined.contains("HIP") {
                    RoofType::Hip
                } else if predefined.contains("SHED") {
                    RoofType::Shed
                } else {
                    RoofType::Flat
                };
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Roof(RoofElement {
                    meta,
                    boundary: vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]],
                    thickness: 0.3,
                    elevation: 3.0,
                    auto_elevation: true,
                    roof_type,
                    pitch_degrees: 30.0,
                    ridge_angle_degrees: 0.0,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
                warnings.push(ImportWarning {
                    entity_id: eid,
                    message: "Roof imported with default boundary".into(),
                });
            }
            "IFCCOLUMN" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Column #{}", eid));
                let placement_ref = parse_entity_ref(&attrs.get(5).cloned().unwrap_or_default());
                let (x, y, _z) = resolve_placement_location(&entities, placement_ref);
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Column(ColumnElement {
                    meta,
                    center: [x, y],
                    width: 0.3,
                    depth: 0.3,
                    height: 3.0,
                    diameter: None,
                    column_segments: 24,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
            }
            "IFCBEAM" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Beam #{}", eid));
                let placement_ref = parse_entity_ref(&attrs.get(5).cloned().unwrap_or_default());
                let (x, y, z) = resolve_placement_location(&entities, placement_ref);
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Beam(BeamElement {
                    meta,
                    start: [x, y, z],
                    end: [x + 3.0, y, z],
                    width: 0.2,
                    depth: 0.4,
                    arc: None,
                    arc_segments: 24,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
                warnings.push(ImportWarning {
                    entity_id: eid,
                    message: "Beam imported with default length 3m".into(),
                });
            }
            "IFCDOOR" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Door #{}", eid));
                let height = attrs
                    .get(8)
                    .and_then(|s| s.trim().parse::<f64>().ok())
                    .unwrap_or(2.1);
                let width = attrs
                    .get(9)
                    .and_then(|s| s.trim().parse::<f64>().ok())
                    .unwrap_or(0.9);
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Door(DoorElement {
                    meta,
                    wall_id: String::new(), // resolved in phase 3
                    position_along_wall: 0.5,
                    width,
                    height,
                    sill_height: 0.0,
                    swing: DoorSwing::OutRight,
                    hardware_type: DoorHardwareType::Lever,
                    style: DoorStyle::Flush,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
            }
            "IFCWINDOW" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Window #{}", eid));
                let height = attrs
                    .get(8)
                    .and_then(|s| s.trim().parse::<f64>().ok())
                    .unwrap_or(1.0);
                let width = attrs
                    .get(9)
                    .and_then(|s| s.trim().parse::<f64>().ok())
                    .unwrap_or(1.2);
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Window(WindowElement {
                    meta,
                    wall_id: String::new(), // resolved in phase 3
                    position_along_wall: 0.5,
                    width,
                    height,
                    sill_height: 0.9,
                    hardware_type: WindowHardwareType::Latch,
                    style: WindowStyle::Picture,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
            }
            "IFCSTAIR" | "IFCSTAIRFLIGHT" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Stair #{}", eid));
                let predefined = attrs.last().cloned().unwrap_or_default().to_uppercase();
                let stair_type = if predefined.contains("SPIRAL") {
                    StairType::Spiral
                } else {
                    StairType::Straight
                };
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Stair(StairElement {
                    meta,
                    start: [0.0, 0.0],
                    end: [3.0, 0.0],
                    width: 1.0,
                    risers: 15,
                    total_height: 3.0,
                    stair_type,
                    spiral_turns: 1.0,
                    side_wall_thickness: 0.12,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
                warnings.push(ImportWarning {
                    entity_id: eid,
                    message: "Stair imported with default geometry".into(),
                });
            }
            "IFCSPACE" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Room #{}", eid));
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Room(RoomElement {
                    meta,
                    boundary: vec![[0.0, 0.0], [4.0, 0.0], [4.0, 3.0], [0.0, 3.0]],
                    boundary_segments: Vec::new(),
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
                warnings.push(ImportWarning {
                    entity_id: eid,
                    message: "Space imported with default boundary".into(),
                });
            }
            "IFCFURNISHINGELEMENT" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Furnishing #{}", eid));
                let placement_ref = parse_entity_ref(&attrs.get(5).cloned().unwrap_or_default());
                let (x, y, _z) = resolve_placement_location(&entities, placement_ref);
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                let elem = Element::Furniture(FurnitureElement {
                    meta,
                    symbol_type: "generic".to_string(),
                    position: [x, y],
                    rotation: 0.0,
                    width: 0.6,
                    depth: 0.6,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
            }
            "IFCFLOWTERMINAL" => {
                let name = unquote_spf(&attrs.get(2).cloned().unwrap_or_default())
                    .unwrap_or_else(|| format!("Terminal #{}", eid));
                let placement_ref = parse_entity_ref(&attrs.get(5).cloned().unwrap_or_default());
                let (x, y, _z) = resolve_placement_location(&entities, placement_ref);
                let mut meta = ElementMeta::new(&name);
                meta.ifc_guid = unquote_spf(&attrs.first().cloned().unwrap_or_default());
                // Map to plumbing as a generic terminal
                let elem = Element::Plumbing(PlumbingElement {
                    meta,
                    symbol_type: "generic".to_string(),
                    position: [x, y],
                    rotation: 0.0,
                });
                let idx = elements.len();
                ifc_to_element_idx.insert(eid, idx);
                elements.push(elem);
            }
            _ => {}
        }
    }

    // Phase 3: Relationship resolution
    for raw in entities.values() {
        let etype = raw.entity_type.to_uppercase();

        // IfcRelContainedInSpatialStructure → assign level_id
        if etype == "IFCRELCONTAINEDINSPATIALSTRUCTURE" {
            let attrs = split_spf_attrs(&raw.raw_attrs);
            // Last attr is the spatial element ref
            let storey_ref = parse_entity_ref(&attrs.last().cloned().unwrap_or_default());
            if let Some(level_id) = storey_ref.and_then(|r| ifc_storey_to_level_id.get(&r)) {
                // attr 4 is the related elements set
                if let Some(set_str) = attrs.get(4) {
                    for ref_id in parse_entity_ref_list(set_str) {
                        if let Some(&idx) = ifc_to_element_idx.get(&ref_id) {
                            assign_level_to_element(&mut elements[idx], level_id);
                        }
                    }
                }
            }
        }

        // IfcRelVoidsElement → track wall→opening mapping
        // IfcRelFillsElement → assign wall_id to doors/windows
        if etype == "IFCRELFILLSELEMENT" {
            let attrs = split_spf_attrs(&raw.raw_attrs);
            // attr 4 = opening ref, attr 5 = filling element ref
            let _opening_ref = parse_entity_ref(&attrs.get(4).cloned().unwrap_or_default());
            let filling_ref = parse_entity_ref(&attrs.get(5).cloned().unwrap_or_default());
            // Walk back to find the wall through IfcRelVoidsElement
            if let Some(filling_id) = filling_ref {
                if let Some(&idx) = ifc_to_element_idx.get(&filling_id) {
                    // We'll handle wall assignment in a simplified manner below
                    let _ = idx;
                }
            }
        }
    }

    // For doors/windows without wall_id, try to find a wall to attach to
    // This is a simplified approach - find the first wall on the same level
    let wall_ids: Vec<(String, usize)> = elements
        .iter()
        .enumerate()
        .filter_map(|(i, e)| match e {
            Element::Wall(w) => Some((w.meta.id.clone(), i)),
            _ => None,
        })
        .collect();

    for element in elements.iter_mut() {
        match element {
            Element::Door(door) if door.wall_id.is_empty() => {
                if let Some((wid, _)) = wall_ids.first() {
                    door.wall_id = wid.clone();
                    door.meta.host_id = Some(wid.clone().into());
                }
            }
            Element::Window(window) if window.wall_id.is_empty() => {
                if let Some((wid, _)) = wall_ids.first() {
                    window.wall_id = wid.clone();
                    window.meta.host_id = Some(wid.clone().into());
                }
            }
            _ => {}
        }
    }

    Ok(IfcImportResult { elements, warnings })
}

// ---------------------------------------------------------------------------
// SPF Parsing Helpers
// ---------------------------------------------------------------------------

/// Parse the DATA section of an SPF file into a map of entity_id -> RawEntity.
fn parse_spf_data_section(text: &str) -> Result<HashMap<u32, RawEntity>, crate::IoError> {
    let mut entities = HashMap::new();
    let mut in_data = false;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed == "DATA;" {
            in_data = true;
            continue;
        }
        if trimmed == "ENDSEC;" && in_data {
            break;
        }
        if !in_data {
            continue;
        }

        // Match lines like: #42=IFCWALL('GUID',$,$,$,$,#5,#6,$,.STANDARD.);
        if let Some(entity) = parse_spf_line(trimmed) {
            entities.insert(entity.0, entity.1);
        }
    }

    Ok(entities)
}

/// Parse a single SPF entity line: #N=ENTITYTYPE(attrs);
fn parse_spf_line(line: &str) -> Option<(u32, RawEntity)> {
    let line = line.trim();
    if !line.starts_with('#') {
        return None;
    }
    // Strip trailing semicolon
    let line = line.strip_suffix(';').unwrap_or(line);

    let eq_pos = line.find('=')?;
    let id_str = &line[1..eq_pos];
    let id: u32 = id_str.parse().ok()?;

    let rest = &line[eq_pos + 1..];
    let paren_pos = rest.find('(')?;
    let entity_type = rest[..paren_pos].to_string();

    // Extract everything between the outermost parens
    let raw_attrs = if rest.ends_with(')') {
        rest[paren_pos + 1..rest.len() - 1].to_string()
    } else {
        rest[paren_pos + 1..].to_string()
    };

    Some((
        id,
        RawEntity {
            entity_type,
            raw_attrs,
        },
    ))
}

/// Split SPF attributes by comma, respecting nested parentheses.
fn split_spf_attrs(s: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut depth = 0;

    for ch in s.chars() {
        match ch {
            '(' => {
                depth += 1;
                current.push(ch);
            }
            ')' => {
                depth -= 1;
                current.push(ch);
            }
            ',' if depth == 0 => {
                result.push(current.trim().to_string());
                current.clear();
            }
            _ => {
                current.push(ch);
            }
        }
    }
    if !current.is_empty() || !result.is_empty() {
        result.push(current.trim().to_string());
    }
    result
}

/// Unquote an SPF string value: 'Hello' -> Some("Hello"), $ -> None
fn unquote_spf(s: &str) -> Option<String> {
    let s = s.trim();
    if s == "$" || s.is_empty() {
        return None;
    }
    if s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2 {
        return Some(s[1..s.len() - 1].to_string());
    }
    Some(s.to_string())
}

/// Parse an entity reference like "#42" -> Some(42)
fn parse_entity_ref(s: &str) -> Option<u32> {
    s.trim().strip_prefix('#')?.parse().ok()
}

/// Parse a list of entity references from a set like "(#1,#2,#3)"
fn parse_entity_ref_list(s: &str) -> Vec<u32> {
    let s = s.trim();
    let s = s.strip_prefix('(').unwrap_or(s);
    let s = s.strip_suffix(')').unwrap_or(s);
    s.split(',')
        .filter_map(|part| parse_entity_ref(part.trim()))
        .collect()
}

/// Navigate IfcLocalPlacement -> IfcAxis2Placement3D and return the
/// axis entity's parsed attributes.  Returns `None` if any link is
/// missing or the entity types do not match the expected chain.
fn resolve_axis_placement_attrs(
    entities: &HashMap<u32, RawEntity>,
    placement_ref: Option<u32>,
) -> Option<Vec<String>> {
    let pid = placement_ref?;
    let placement_entity = entities.get(&pid)?;
    if placement_entity.entity_type.to_uppercase() != "IFCLOCALPLACEMENT" {
        return None;
    }
    let attrs = split_spf_attrs(&placement_entity.raw_attrs);
    let axis_id = parse_entity_ref(&attrs.get(1).cloned().unwrap_or_default())?;
    let axis_entity = entities.get(&axis_id)?;
    if axis_entity.entity_type.to_uppercase() != "IFCAXIS2PLACEMENT3D" {
        return None;
    }
    Some(split_spf_attrs(&axis_entity.raw_attrs))
}

/// Resolve placement location by following IfcLocalPlacement -> IfcAxis2Placement3D -> IfcCartesianPoint
fn resolve_placement_location(
    entities: &HashMap<u32, RawEntity>,
    placement_ref: Option<u32>,
) -> (f64, f64, f64) {
    let Some(axis_attrs) = resolve_axis_placement_attrs(entities, placement_ref) else {
        return (0.0, 0.0, 0.0);
    };
    let point_id = match parse_entity_ref(&axis_attrs.first().cloned().unwrap_or_default()) {
        Some(id) => id,
        None => return (0.0, 0.0, 0.0),
    };
    let Some(point_entity) = entities.get(&point_id) else {
        return (0.0, 0.0, 0.0);
    };
    if point_entity.entity_type.to_uppercase() != "IFCCARTESIANPOINT" {
        return (0.0, 0.0, 0.0);
    }
    parse_point_coords(&point_entity.raw_attrs)
}

/// Resolve placement direction from IfcLocalPlacement -> IfcAxis2Placement3D -> RefDirection
fn resolve_placement_direction(
    entities: &HashMap<u32, RawEntity>,
    placement_ref: Option<u32>,
) -> (f64, f64) {
    let Some(axis_attrs) = resolve_axis_placement_attrs(entities, placement_ref) else {
        return (1.0, 0.0);
    };
    let dir_id = match parse_entity_ref(&axis_attrs.get(2).cloned().unwrap_or_default()) {
        Some(id) => id,
        None => return (1.0, 0.0),
    };
    let Some(dir_entity) = entities.get(&dir_id) else {
        return (1.0, 0.0);
    };
    if dir_entity.entity_type.to_uppercase() != "IFCDIRECTION" {
        return (1.0, 0.0);
    }
    let (dx, dy, _) = parse_point_coords(&dir_entity.raw_attrs);
    let len = (dx * dx + dy * dy).sqrt();
    if len > 1e-9 {
        (dx / len, dy / len)
    } else {
        (1.0, 0.0)
    }
}

/// Try to extract wall dimensions from the product shape (via IfcExtrudedAreaSolid + IfcRectangleProfileDef).
/// Returns (length, height, thickness). Falls back to defaults if geometry is too complex.
fn resolve_wall_dimensions(
    entities: &HashMap<u32, RawEntity>,
    shape_ref: Option<u32>,
    warnings: &mut Vec<ImportWarning>,
    eid: u32,
) -> (f64, f64, f64) {
    let default = (4.0, 2.7, 0.2);

    let Some(sid) = shape_ref else {
        warnings.push(ImportWarning {
            entity_id: eid,
            message: "Wall has no shape; using default dimensions 4m x 2.7m x 0.2m".into(),
        });
        return default;
    };
    let Some(shape_entity) = entities.get(&sid) else {
        return default;
    };

    // Navigate: IfcProductDefinitionShape -> Representations -> IfcShapeRepresentation -> Items -> IfcExtrudedAreaSolid
    let shape_type = shape_entity.entity_type.to_uppercase();
    if shape_type != "IFCPRODUCTDEFINITIONSHAPE" {
        return default;
    }
    let shape_attrs = split_spf_attrs(&shape_entity.raw_attrs);
    // Third attr (index 2) is the list of representations
    let rep_refs = shape_attrs
        .get(2)
        .map(|s| parse_entity_ref_list(s))
        .unwrap_or_default();

    for rep_ref in rep_refs {
        if let Some(rep_entity) = entities.get(&rep_ref) {
            if rep_entity.entity_type.to_uppercase() != "IFCSHAPEREPRESENTATION" {
                continue;
            }
            let rep_attrs = split_spf_attrs(&rep_entity.raw_attrs);
            // Fourth attr (index 3) is the items set
            let item_refs = rep_attrs
                .get(3)
                .map(|s| parse_entity_ref_list(s))
                .unwrap_or_default();

            for item_ref in item_refs {
                if let Some(item_entity) = entities.get(&item_ref) {
                    if item_entity.entity_type.to_uppercase() == "IFCEXTRUDEDAREASOLID" {
                        let item_attrs = split_spf_attrs(&item_entity.raw_attrs);
                        // attr 0 = profile, attr 3 = depth (extrusion height)
                        let depth = item_attrs
                            .get(3)
                            .and_then(|s| s.trim().parse::<f64>().ok())
                            .unwrap_or(2.7);

                        let profile_ref =
                            parse_entity_ref(&item_attrs.first().cloned().unwrap_or_default());
                        if let Some(prof_id) = profile_ref {
                            if let Some(prof_entity) = entities.get(&prof_id) {
                                if prof_entity.entity_type.to_uppercase()
                                    == "IFCRECTANGLEPROFILEDEF"
                                {
                                    let prof_attrs = split_spf_attrs(&prof_entity.raw_attrs);
                                    // attr 3 = XDim (length), attr 4 = YDim (thickness)
                                    let x_dim = prof_attrs
                                        .get(3)
                                        .and_then(|s| s.trim().parse::<f64>().ok())
                                        .unwrap_or(4.0);
                                    let y_dim = prof_attrs
                                        .get(4)
                                        .and_then(|s| s.trim().parse::<f64>().ok())
                                        .unwrap_or(0.2);
                                    return (x_dim, depth, y_dim);
                                }
                            }
                        }
                        // ExtrudedAreaSolid with non-rectangle profile
                        warnings.push(ImportWarning {
                            entity_id: eid,
                            message:
                                "Wall has non-rectangular profile; using default thickness 0.2m"
                                    .into(),
                        });
                        return (4.0, depth, 0.2);
                    }
                }
            }
        }
    }

    warnings.push(ImportWarning {
        entity_id: eid,
        message: "Wall geometry too complex; using default dimensions 4m x 2.7m x 0.2m".into(),
    });
    default
}

/// Parse coordinates from IfcCartesianPoint raw attrs: "(x,y,z)" or "(x,y)"
fn parse_point_coords(raw_attrs: &str) -> (f64, f64, f64) {
    let s = raw_attrs.trim();
    // The attrs look like "(1.0,2.0,3.0)" — it's a single attribute that is a list
    let s = s.strip_prefix('(').unwrap_or(s);
    let s = s.strip_suffix(')').unwrap_or(s);
    let parts: Vec<&str> = s.split(',').collect();
    let x = parts
        .first()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0.0);
    let y = parts
        .get(1)
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0.0);
    let z = parts
        .get(2)
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0.0);
    (x, y, z)
}

/// Assign level_id to an element if it doesn't already have one.
fn assign_level_to_element(element: &mut Element, level_id: &str) {
    let meta = element.meta_mut();
    if meta.level_id.is_none() {
        meta.level_id = Some(level_id.into());
    }
}

// ---------------------------------------------------------------------------
// IFC Export (IFC4)
// ---------------------------------------------------------------------------

/// Export BetterCAD elements to IFC4 SPF format.
pub fn export_ifc(elements: &[Element]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut w = IfcWriter::new();
    w.write_project(elements);
    Ok(w.finish().into_bytes())
}

// ---------------------------------------------------------------------------
// IFC GlobalId generation
// ---------------------------------------------------------------------------

/// IFC uses a 22-character base64 encoding of a 128-bit GUID.
/// Characters: 0-9, A-Z, a-z, underscore, dollar sign (64 chars).
fn ifc_guid_from_bytes(bytes: &[u8; 16]) -> String {
    const CHARS: &[u8; 64] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

    let mut result = String::with_capacity(22);
    let mut num: u128 = 0;
    for &b in bytes {
        num = (num << 8) | b as u128;
    }

    for i in (0..22).rev() {
        let shift = i * 6;
        let idx = ((num >> shift) & 0x3F) as usize;
        result.push(CHARS[idx] as char);
    }

    result
}

/// Generate a deterministic IFC GUID from a seed string (element id + salt).
fn make_ifc_guid(seed: &str) -> String {
    let mut hash: [u8; 16] = [0u8; 16];
    let seed_bytes = seed.as_bytes();
    for (i, slot) in hash.iter_mut().enumerate() {
        let mut h: u64 = 0xcbf29ce484222325_u64;
        h = h.wrapping_mul(0x100000001b3).wrapping_add(i as u64);
        for &b in seed_bytes {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        *slot = (h & 0xFF) as u8;
    }
    ifc_guid_from_bytes(&hash)
}

// ---------------------------------------------------------------------------
// Sequential ID allocator and IFC writer
// ---------------------------------------------------------------------------

struct IfcWriter {
    next_id: u32,
    lines: Vec<String>,
}

impl IfcWriter {
    fn new() -> Self {
        Self {
            next_id: 1,
            lines: Vec::new(),
        }
    }

    fn alloc(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    fn emit(&mut self, id: u32, line: String) {
        self.lines.push(format!("#{}={};", id, line));
    }

    fn write_project(&mut self, elements: &[Element]) {
        // --- Shared infrastructure entities ---

        // #1 IFCPERSON
        let person = self.alloc();
        self.emit(person, "IFCPERSON($,$,'',$,$,$,$,$)".into());

        // #2 IFCORGANIZATION
        let org = self.alloc();
        self.emit(org, "IFCORGANIZATION($,'BetterCAD',$,$,$)".into());

        // #3 IFCPERSONANDORGANIZATION
        let person_org = self.alloc();
        self.emit(
            person_org,
            format!("IFCPERSONANDORGANIZATION(#{},#{},$)", person, org),
        );

        // #4 IFCAPPLICATION
        let app = self.alloc();
        self.emit(
            app,
            format!("IFCAPPLICATION(#{},'0.1','BetterCAD','BetterCAD')", org),
        );

        // #5 IFCOWNERHISTORY
        let owner_history = self.alloc();
        self.emit(
            owner_history,
            format!(
                "IFCOWNERHISTORY(#{},#{},$,.NOCHANGE.,$,$,$,0)",
                person_org, app
            ),
        );

        // --- Units ---
        let unit_length = self.alloc();
        self.emit(unit_length, "IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)".into());

        let unit_area = self.alloc();
        self.emit(unit_area, "IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)".into());

        let unit_volume = self.alloc();
        self.emit(
            unit_volume,
            "IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)".into(),
        );

        let unit_angle = self.alloc();
        self.emit(
            unit_angle,
            "IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)".into(),
        );

        let units = self.alloc();
        self.emit(
            units,
            format!(
                "IFCUNITASSIGNMENT((#{},#{},#{},#{}))",
                unit_length, unit_area, unit_volume, unit_angle
            ),
        );

        // --- Geometric representation context ---
        let origin_3d = self.write_cartesian_point_3d(0.0, 0.0, 0.0);
        let dir_z = self.write_direction_3d(0.0, 0.0, 1.0);
        let dir_x = self.write_direction_3d(1.0, 0.0, 0.0);
        let world_coord = self.alloc();
        self.emit(
            world_coord,
            format!("IFCAXIS2PLACEMENT3D(#{},#{},#{})", origin_3d, dir_z, dir_x),
        );

        let dim_count = self.alloc();
        self.emit(dim_count, "IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0)".into());

        let geom_ctx = self.alloc();
        self.emit(
            geom_ctx,
            format!(
                "IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#{},$)",
                world_coord
            ),
        );

        let body_ctx = self.alloc();
        self.emit(
            body_ctx,
            format!(
                "IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#{},$,.MODEL_VIEW.,$)",
                geom_ctx
            ),
        );

        // --- Project ---
        let project_guid = make_ifc_guid("project_root");
        let project = self.alloc();
        self.emit(
            project,
            format!(
                "IFCPROJECT('{}',#{},'BetterCAD Project',$,$,$,$,(#{}),#{})",
                project_guid, owner_history, geom_ctx, units
            ),
        );

        // --- Site ---
        let site_guid = make_ifc_guid("site_default");
        let site_placement = self.write_local_placement(None, 0.0, 0.0, 0.0);
        let site = self.alloc();
        self.emit(
            site,
            format!(
                "IFCSITE('{}',#{},'Default Site',$,$,#{},$,$,.ELEMENT.,$,$,$,$,$)",
                site_guid, owner_history, site_placement
            ),
        );

        // --- Building ---
        let bldg_guid = make_ifc_guid("building_default");
        let bldg_placement = self.write_local_placement(Some(site_placement), 0.0, 0.0, 0.0);
        let building = self.alloc();
        self.emit(
            building,
            format!(
                "IFCBUILDING('{}',#{},'Default Building',$,$,#{},$,$,.ELEMENT.,$,$,$)",
                bldg_guid, owner_history, bldg_placement
            ),
        );

        // --- Multi-storey: collect unique level_ids ---
        let level_elements: HashMap<String, &LevelElement> = elements
            .iter()
            .filter_map(|e| match e {
                Element::Level(level) => Some((level.meta.id.clone(), level)),
                _ => None,
            })
            .collect();

        // Build storeys from levels, or create a default one
        struct StoreyInfo {
            ifc_id: u32,
            placement: u32,
            level_domain_id: Option<String>,
        }
        let mut storeys: Vec<StoreyInfo> = Vec::new();

        if level_elements.is_empty() {
            // Single default storey
            let storey_guid = make_ifc_guid("storey_default");
            let storey_placement = self.write_local_placement(Some(bldg_placement), 0.0, 0.0, 0.0);
            let storey = self.alloc();
            self.emit(
                storey,
                format!(
                    "IFCBUILDINGSTOREY('{}',#{},'Level 1',$,$,#{},$,$,.ELEMENT.,0.0)",
                    storey_guid, owner_history, storey_placement
                ),
            );
            storeys.push(StoreyInfo {
                ifc_id: storey,
                placement: storey_placement,
                level_domain_id: None,
            });
        } else {
            // One storey per level element
            let mut sorted_levels: Vec<(&String, &&LevelElement)> = level_elements.iter().collect();
            sorted_levels.sort_by(|a, b| {
                a.1.elevation
                    .partial_cmp(&b.1.elevation)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            for (level_id, level) in sorted_levels {
                let storey_guid = make_ifc_guid(&format!("storey_{}", level_id));
                let storey_placement =
                    self.write_local_placement(Some(bldg_placement), 0.0, 0.0, level.elevation);
                let storey = self.alloc();
                self.emit(
                    storey,
                    format!(
                        "IFCBUILDINGSTOREY('{}',#{},'{}','Level',$,#{},$,$,.ELEMENT.,{})",
                        storey_guid,
                        owner_history,
                        level.meta.name,
                        storey_placement,
                        level.elevation
                    ),
                );
                storeys.push(StoreyInfo {
                    ifc_id: storey,
                    placement: storey_placement,
                    level_domain_id: Some(level_id.clone()),
                });
            }
        }

        // --- Spatial containment hierarchy ---
        // Site in Project
        let rel_site = self.alloc();
        self.emit(
            rel_site,
            format!(
                "IFCRELAGGREGATES('{}',#{},$,$,#{},(#{}))",
                make_ifc_guid("rel_site_in_project"),
                owner_history,
                project,
                site
            ),
        );

        // Building in Site
        let rel_bldg = self.alloc();
        self.emit(
            rel_bldg,
            format!(
                "IFCRELAGGREGATES('{}',#{},$,$,#{},(#{}))",
                make_ifc_guid("rel_bldg_in_site"),
                owner_history,
                site,
                building
            ),
        );

        // All storeys in Building
        let storey_refs: Vec<String> = storeys.iter().map(|s| format!("#{}", s.ifc_id)).collect();
        let rel_storeys = self.alloc();
        self.emit(
            rel_storeys,
            format!(
                "IFCRELAGGREGATES('{}',#{},$,$,#{},({}))",
                make_ifc_guid("rel_storeys_in_bldg"),
                owner_history,
                building,
                storey_refs.join(",")
            ),
        );

        // Build a wall lookup for door/window placement
        let walls_by_id: HashMap<&str, &WallElement> = elements
            .iter()
            .filter_map(|e| match e {
                Element::Wall(w) => Some((w.meta.id.as_str(), w)),
                _ => None,
            })
            .collect();

        // --- Write building elements grouped by storey ---
        // For each storey, collect elements that belong to it
        for storey_info in &storeys {
            let mut storey_elements: Vec<u32> = Vec::new();

            for element in elements {
                // Determine which storey this element belongs to
                let element_level_id = element.meta().level_id.as_ref().map(|r| r.0.clone());

                let belongs = match &storey_info.level_domain_id {
                    Some(lid) => element_level_id.as_deref() == Some(lid.as_str()),
                    None => true, // default storey: everything goes here
                };

                if !belongs {
                    continue;
                }

                match element {
                    Element::Wall(wall) => {
                        let id =
                            self.write_wall(wall, owner_history, storey_info.placement, body_ctx);

                        // Write openings for doors/windows hosted on this wall
                        for el in elements {
                            match el {
                                Element::Door(door) if door.wall_id == wall.meta.id => {
                                    self.write_door_with_opening(
                                        door,
                                        wall,
                                        id,
                                        owner_history,
                                        storey_info.placement,
                                        body_ctx,
                                    );
                                    // Door is NOT added to storey_elements (it's in the opening)
                                }
                                Element::Window(window) if window.wall_id == wall.meta.id => {
                                    self.write_window_with_opening(
                                        window,
                                        wall,
                                        id,
                                        owner_history,
                                        storey_info.placement,
                                        body_ctx,
                                    );
                                }
                                _ => {}
                            }
                        }

                        storey_elements.push(id);
                    }
                    Element::Floor(floor) => {
                        let id =
                            self.write_floor(floor, owner_history, storey_info.placement, body_ctx);
                        storey_elements.push(id);
                    }
                    Element::Roof(roof) => {
                        let id =
                            self.write_roof(roof, owner_history, storey_info.placement, body_ctx);
                        storey_elements.push(id);
                    }
                    Element::Foundation(foundation) => {
                        let id = self.write_foundation(
                            foundation,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                        );
                        storey_elements.push(id);
                    }
                    Element::Column(col) => {
                        let id =
                            self.write_column(col, owner_history, storey_info.placement, body_ctx);
                        storey_elements.push(id);
                    }
                    Element::Beam(beam) => {
                        let id =
                            self.write_beam(beam, owner_history, storey_info.placement, body_ctx);
                        storey_elements.push(id);
                    }
                    Element::Stair(stair) => {
                        let id =
                            self.write_stair(stair, owner_history, storey_info.placement, body_ctx);
                        storey_elements.push(id);
                    }
                    Element::Room(room) => {
                        let id =
                            self.write_space(room, owner_history, storey_info.placement, body_ctx);
                        storey_elements.push(id);
                    }
                    // Doors and windows without a host wall → add standalone
                    Element::Door(door) if !walls_by_id.contains_key(door.wall_id.as_str()) => {
                        let id = self.write_door_standalone(
                            door,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                        );
                        storey_elements.push(id);
                    }
                    Element::Window(window)
                        if !walls_by_id.contains_key(window.wall_id.as_str()) =>
                    {
                        let id = self.write_window_standalone(
                            window,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                        );
                        storey_elements.push(id);
                    }
                    Element::Furniture(furn) => {
                        let id = self.write_furnishing_element(
                            &furn.meta.id,
                            &furn.meta.name,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                            furn.position[0],
                            furn.position[1],
                            furn.width,
                            furn.depth,
                            0.9, // default height
                        );
                        storey_elements.push(id);
                    }
                    Element::Cabinet(cab) => {
                        let id = self.write_furnishing_element(
                            &cab.meta.id,
                            &cab.meta.name,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                            cab.position[0],
                            cab.position[1],
                            cab.width,
                            cab.depth,
                            cab.height,
                        );
                        storey_elements.push(id);
                    }
                    Element::Electrical(elec) => {
                        let id = self.write_flow_terminal(
                            &elec.meta.id,
                            &elec.meta.name,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                            elec.position[0],
                            elec.position[1],
                            0.1,
                            0.1,
                            0.05,
                        );
                        storey_elements.push(id);
                    }
                    Element::Plumbing(plumb) => {
                        let id = self.write_flow_terminal(
                            &plumb.meta.id,
                            &plumb.meta.name,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                            plumb.position[0],
                            plumb.position[1],
                            0.15,
                            0.15,
                            0.1,
                        );
                        storey_elements.push(id);
                    }
                    Element::Hvac(hvac) => {
                        let w = hvac.width.unwrap_or(0.3);
                        let d = hvac.depth.unwrap_or(0.3);
                        let id = self.write_flow_terminal(
                            &hvac.meta.id,
                            &hvac.meta.name,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                            hvac.position[0],
                            hvac.position[1],
                            w,
                            d,
                            0.1,
                        );
                        storey_elements.push(id);
                    }
                    Element::FireSafety(fs) => {
                        let id = self.write_distribution_element(
                            &fs.meta.id,
                            &fs.meta.name,
                            owner_history,
                            storey_info.placement,
                            body_ctx,
                            fs.position[0],
                            fs.position[1],
                        );
                        storey_elements.push(id);
                    }
                    // Skip: Level, Grid, Material, FamilyType, Accessibility, etc. + doors/windows with wall_id
                    _ => {}
                }
            }

            // Containment: elements in storey
            if !storey_elements.is_empty() {
                let element_refs: Vec<String> = storey_elements
                    .iter()
                    .map(|id| format!("#{}", id))
                    .collect();
                let rel_contains = self.alloc();
                self.emit(
                    rel_contains,
                    format!(
                        "IFCRELCONTAINEDINSPATIALSTRUCTURE('{}',#{},$,$,({}),#{})",
                        make_ifc_guid(&format!(
                            "rel_contains_{}",
                            storey_info.level_domain_id.as_deref().unwrap_or("default")
                        )),
                        owner_history,
                        element_refs.join(","),
                        storey_info.ifc_id
                    ),
                );
            }
        }
    }

    // --- Geometry helpers ---

    fn write_cartesian_point_3d(&mut self, x: f64, y: f64, z: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCCARTESIANPOINT(({},{},{}))", x, y, z));
        id
    }

    fn write_cartesian_point_2d(&mut self, x: f64, y: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCCARTESIANPOINT(({},{}))", x, y));
        id
    }

    fn write_direction_3d(&mut self, x: f64, y: f64, z: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCDIRECTION(({},{},{}))", x, y, z));
        id
    }

    fn write_direction_2d(&mut self, x: f64, y: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCDIRECTION(({},{}))", x, y));
        id
    }

    fn write_local_placement(&mut self, relative_to: Option<u32>, x: f64, y: f64, z: f64) -> u32 {
        self.write_local_placement_with_dir(
            relative_to,
            [x, y, z],
            [0.0, 0.0, 1.0],
            [1.0, 0.0, 0.0],
        )
    }

    fn write_local_placement_with_dir(
        &mut self,
        relative_to: Option<u32>,
        origin: [f64; 3],
        axis_dir: [f64; 3],
        ref_dir: [f64; 3],
    ) -> u32 {
        let origin_id = self.write_cartesian_point_3d(origin[0], origin[1], origin[2]);
        let dir_z = self.write_direction_3d(axis_dir[0], axis_dir[1], axis_dir[2]);
        let dir_x = self.write_direction_3d(ref_dir[0], ref_dir[1], ref_dir[2]);
        let axis = self.alloc();
        self.emit(
            axis,
            format!("IFCAXIS2PLACEMENT3D(#{},#{},#{})", origin_id, dir_z, dir_x),
        );

        let placement = self.alloc();
        match relative_to {
            Some(parent) => self.emit(
                placement,
                format!("IFCLOCALPLACEMENT(#{},#{})", parent, axis),
            ),
            None => self.emit(placement, format!("IFCLOCALPLACEMENT($,#{})", axis)),
        }
        placement
    }

    fn write_rectangle_profile(&mut self, x_dim: f64, y_dim: f64) -> u32 {
        let center = self.write_cartesian_point_2d(0.0, 0.0);
        let dir = self.write_direction_2d(1.0, 0.0);
        let axis2d = self.alloc();
        self.emit(axis2d, format!("IFCAXIS2PLACEMENT2D(#{},#{})", center, dir));

        let profile = self.alloc();
        self.emit(
            profile,
            format!(
                "IFCRECTANGLEPROFILEDEF(.AREA.,$,#{},{},{})",
                axis2d, x_dim, y_dim
            ),
        );
        profile
    }

    fn write_arbitrary_profile(&mut self, points: &[[f64; 2]]) -> u32 {
        let mut point_ids: Vec<u32> = Vec::new();
        for p in points {
            point_ids.push(self.write_cartesian_point_2d(p[0], p[1]));
        }
        if let Some(&first) = points.first() {
            point_ids.push(self.write_cartesian_point_2d(first[0], first[1]));
        }

        let refs: Vec<String> = point_ids.iter().map(|id| format!("#{}", id)).collect();
        let polyline = self.alloc();
        self.emit(polyline, format!("IFCPOLYLINE(({}))", refs.join(",")));

        let profile = self.alloc();
        self.emit(
            profile,
            format!("IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#{})", polyline),
        );
        profile
    }

    fn write_extruded_area_solid(&mut self, profile: u32, depth: f64) -> u32 {
        let origin = self.write_cartesian_point_3d(0.0, 0.0, 0.0);
        let dir_z = self.write_direction_3d(0.0, 0.0, 1.0);
        let dir_x = self.write_direction_3d(1.0, 0.0, 0.0);
        let position = self.alloc();
        self.emit(
            position,
            format!("IFCAXIS2PLACEMENT3D(#{},#{},#{})", origin, dir_z, dir_x),
        );

        let extrude_dir = self.write_direction_3d(0.0, 0.0, 1.0);

        let solid = self.alloc();
        self.emit(
            solid,
            format!(
                "IFCEXTRUDEDAREASOLID(#{},#{},#{},{})",
                profile, position, extrude_dir, depth
            ),
        );
        solid
    }

    fn write_body_shape(&mut self, solid: u32, body_ctx: u32) -> u32 {
        let shape_rep = self.alloc();
        self.emit(
            shape_rep,
            format!(
                "IFCSHAPEREPRESENTATION(#{},'Body','SweptSolid',(#{}))",
                body_ctx, solid
            ),
        );

        let prod_shape = self.alloc();
        self.emit(
            prod_shape,
            format!("IFCPRODUCTDEFINITIONSHAPE($,$,(#{}))", shape_rep),
        );
        prod_shape
    }

    // --- Building element writers (IFC4) ---

    fn write_wall(
        &mut self,
        wall: &WallElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let length = (dx * dx + dy * dy).sqrt();

        let (dir_x, dir_y) = if length > 1e-9 {
            (dx / length, dy / length)
        } else {
            (1.0, 0.0)
        };

        let placement = self.write_local_placement_with_dir(
            Some(storey_placement),
            [wall.start[0], wall.start[1], 0.0],
            [0.0, 0.0, 1.0],
            [dir_x, dir_y, 0.0],
        );

        let profile = self.write_rectangle_profile(length, wall.thickness);
        let solid = self.write_extruded_area_solid(profile, wall.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("wall_{}", wall.meta.id));
        let wall_id = self.alloc();
        // IFC4: IFCWALL with PredefinedType .STANDARD. as last attribute
        self.emit(
            wall_id,
            format!(
                "IFCWALL('{}',#{},'{}','Wall',$,#{},#{},$,.STANDARD.)",
                guid, owner_history, wall.meta.name, placement, shape
            ),
        );

        self.write_quantity_set(
            &wall.meta.id,
            owner_history,
            wall_id,
            "Wall",
            &[
                ("Length", length),
                ("Height", wall.height),
                ("Thickness", wall.thickness),
            ],
        );

        wall_id
    }

    fn write_door_standalone(
        &mut self,
        door: &DoorElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement =
            self.write_local_placement(Some(storey_placement), 0.0, 0.0, door.sill_height);

        let profile = self.write_rectangle_profile(door.width, 0.05);
        let solid = self.write_extruded_area_solid(profile, door.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("door_{}", door.meta.id));
        let door_id = self.alloc();
        // IFC4: IFCDOOR with PredefinedType at end
        self.emit(
            door_id,
            format!(
                "IFCDOOR('{}',#{},'{}','Door',$,#{},#{},$,{},{},$)",
                guid, owner_history, door.meta.name, placement, shape, door.height, door.width
            ),
        );

        door_id
    }

    fn write_door_with_opening(
        &mut self,
        door: &DoorElement,
        wall: &WallElement,
        wall_ifc_id: u32,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) {
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let wall_length = (dx * dx + dy * dy).sqrt();
        let (dir_x, dir_y) = if wall_length > 1e-9 {
            (dx / wall_length, dy / wall_length)
        } else {
            (1.0, 0.0)
        };

        // Opening center along wall
        let center_dist = door.position_along_wall * wall_length;
        let opening_x = wall.start[0] + dir_x * (center_dist - door.width * 0.5);
        let opening_y = wall.start[1] + dir_y * (center_dist - door.width * 0.5);

        // IfcOpeningElement
        let opening_placement = self.write_local_placement_with_dir(
            Some(storey_placement),
            [opening_x, opening_y, door.sill_height],
            [0.0, 0.0, 1.0],
            [dir_x, dir_y, 0.0],
        );
        let opening_profile = self.write_rectangle_profile(door.width, wall.thickness + 0.01);
        let opening_solid = self.write_extruded_area_solid(opening_profile, door.height);
        let opening_shape = self.write_body_shape(opening_solid, body_ctx);

        let opening_guid = make_ifc_guid(&format!("opening_door_{}", door.meta.id));
        let opening_id = self.alloc();
        self.emit(
            opening_id,
            format!(
                "IFCOPENINGELEMENT('{}',#{},'Door Opening',$,$,#{},#{},$,.OPENING.)",
                opening_guid, owner_history, opening_placement, opening_shape
            ),
        );

        // IfcRelVoidsElement (wall → opening)
        let rel_void_guid = make_ifc_guid(&format!("relvoid_door_{}", door.meta.id));
        let rel_void = self.alloc();
        self.emit(
            rel_void,
            format!(
                "IFCRELVOIDSELEMENT('{}',#{},$,$,#{},#{})",
                rel_void_guid, owner_history, wall_ifc_id, opening_id
            ),
        );

        // Door element placed relative to the opening
        let door_placement = self.write_local_placement(Some(opening_placement), 0.0, 0.0, 0.0);
        let door_profile = self.write_rectangle_profile(door.width, 0.05);
        let door_solid = self.write_extruded_area_solid(door_profile, door.height);
        let door_shape = self.write_body_shape(door_solid, body_ctx);

        let door_guid = make_ifc_guid(&format!("door_{}", door.meta.id));
        let door_ifc_id = self.alloc();
        self.emit(
            door_ifc_id,
            format!(
                "IFCDOOR('{}',#{},'{}','Door',$,#{},#{},$,{},{},$)",
                door_guid,
                owner_history,
                door.meta.name,
                door_placement,
                door_shape,
                door.height,
                door.width
            ),
        );

        // IfcRelFillsElement (opening → door)
        let rel_fill_guid = make_ifc_guid(&format!("relfill_door_{}", door.meta.id));
        let rel_fill = self.alloc();
        self.emit(
            rel_fill,
            format!(
                "IFCRELFILLSELEMENT('{}',#{},$,$,#{},#{})",
                rel_fill_guid, owner_history, opening_id, door_ifc_id
            ),
        );
    }

    fn write_window_standalone(
        &mut self,
        window: &WindowElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement =
            self.write_local_placement(Some(storey_placement), 0.0, 0.0, window.sill_height);

        let profile = self.write_rectangle_profile(window.width, 0.05);
        let solid = self.write_extruded_area_solid(profile, window.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("window_{}", window.meta.id));
        let win_id = self.alloc();
        self.emit(
            win_id,
            format!(
                "IFCWINDOW('{}',#{},'{}','Window',$,#{},#{},$,{},{},$)",
                guid,
                owner_history,
                window.meta.name,
                placement,
                shape,
                window.height,
                window.width
            ),
        );

        win_id
    }

    fn write_window_with_opening(
        &mut self,
        window: &WindowElement,
        wall: &WallElement,
        wall_ifc_id: u32,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) {
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let wall_length = (dx * dx + dy * dy).sqrt();
        let (dir_x, dir_y) = if wall_length > 1e-9 {
            (dx / wall_length, dy / wall_length)
        } else {
            (1.0, 0.0)
        };

        let center_dist = window.position_along_wall * wall_length;
        let opening_x = wall.start[0] + dir_x * (center_dist - window.width * 0.5);
        let opening_y = wall.start[1] + dir_y * (center_dist - window.width * 0.5);

        // IfcOpeningElement
        let opening_placement = self.write_local_placement_with_dir(
            Some(storey_placement),
            [opening_x, opening_y, window.sill_height],
            [0.0, 0.0, 1.0],
            [dir_x, dir_y, 0.0],
        );
        let opening_profile = self.write_rectangle_profile(window.width, wall.thickness + 0.01);
        let opening_solid = self.write_extruded_area_solid(opening_profile, window.height);
        let opening_shape = self.write_body_shape(opening_solid, body_ctx);

        let opening_guid = make_ifc_guid(&format!("opening_window_{}", window.meta.id));
        let opening_id = self.alloc();
        self.emit(
            opening_id,
            format!(
                "IFCOPENINGELEMENT('{}',#{},'Window Opening',$,$,#{},#{},$,.OPENING.)",
                opening_guid, owner_history, opening_placement, opening_shape
            ),
        );

        // IfcRelVoidsElement (wall → opening)
        let rel_void_guid = make_ifc_guid(&format!("relvoid_window_{}", window.meta.id));
        let rel_void = self.alloc();
        self.emit(
            rel_void,
            format!(
                "IFCRELVOIDSELEMENT('{}',#{},$,$,#{},#{})",
                rel_void_guid, owner_history, wall_ifc_id, opening_id
            ),
        );

        // Window element placed relative to the opening
        let win_placement = self.write_local_placement(Some(opening_placement), 0.0, 0.0, 0.0);
        let win_profile = self.write_rectangle_profile(window.width, 0.05);
        let win_solid = self.write_extruded_area_solid(win_profile, window.height);
        let win_shape = self.write_body_shape(win_solid, body_ctx);

        let win_guid = make_ifc_guid(&format!("window_{}", window.meta.id));
        let win_ifc_id = self.alloc();
        self.emit(
            win_ifc_id,
            format!(
                "IFCWINDOW('{}',#{},'{}','Window',$,#{},#{},$,{},{},$)",
                win_guid,
                owner_history,
                window.meta.name,
                win_placement,
                win_shape,
                window.height,
                window.width
            ),
        );

        // IfcRelFillsElement (opening → window)
        let rel_fill_guid = make_ifc_guid(&format!("relfill_window_{}", window.meta.id));
        let rel_fill = self.alloc();
        self.emit(
            rel_fill,
            format!(
                "IFCRELFILLSELEMENT('{}',#{},$,$,#{},#{})",
                rel_fill_guid, owner_history, opening_id, win_ifc_id
            ),
        );
    }

    fn write_floor(
        &mut self,
        floor: &FloorElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), 0.0, 0.0, 0.0);

        let profile = self.write_arbitrary_profile(&floor.boundary);
        let solid = self.write_extruded_area_solid(profile, floor.thickness);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("floor_{}", floor.meta.id));
        let slab_id = self.alloc();
        // IFC4: IFCSLAB with PredefinedType at end
        self.emit(
            slab_id,
            format!(
                "IFCSLAB('{}',#{},'{}','Floor slab',$,#{},#{},$,.FLOOR.)",
                guid, owner_history, floor.meta.name, placement, shape
            ),
        );

        slab_id
    }

    fn write_foundation(
        &mut self,
        foundation: &FoundationElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), 0.0, 0.0, 0.0);

        let profile = self.write_arbitrary_profile(&foundation.boundary);
        let solid = self.write_extruded_area_solid(profile, foundation.thickness);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("foundation_{}", foundation.meta.id));
        let slab_id = self.alloc();
        self.emit(
            slab_id,
            format!(
                "IFCSLAB('{}',#{},'{}','Foundation slab',$,#{},#{},$,.BASESLAB.)",
                guid, owner_history, foundation.meta.name, placement, shape
            ),
        );

        slab_id
    }

    fn write_roof(
        &mut self,
        roof: &RoofElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement =
            self.write_local_placement(Some(storey_placement), 0.0, 0.0, roof.elevation);
        let roof_type = match roof.roof_type {
            RoofType::Flat => ".FLAT_ROOF.",
            RoofType::Shed => ".SHED_ROOF.",
            RoofType::Gable => ".GABLE_ROOF.",
            RoofType::Hip => ".HIP_ROOF.",
            RoofType::BarrelVault => ".BARREL_ROOF.",
            RoofType::Dome => ".DOME_ROOF.",
            RoofType::Conical => ".PAVILION_ROOF.",
        };

        let profile = self.write_arbitrary_profile(&roof.boundary);
        let solid = self.write_extruded_area_solid(profile, roof.thickness);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("roof_{}", roof.meta.id));
        let roof_id = self.alloc();
        self.emit(
            roof_id,
            format!(
                "IFCROOF('{}',#{},'{}','Roof',$,#{},#{},$,{})",
                guid, owner_history, roof.meta.name, placement, shape, roof_type
            ),
        );

        roof_id
    }

    fn write_column(
        &mut self,
        col: &ColumnElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement =
            self.write_local_placement(Some(storey_placement), col.center[0], col.center[1], 0.0);

        let profile = self.write_rectangle_profile(col.width, col.depth);
        let solid = self.write_extruded_area_solid(profile, col.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("column_{}", col.meta.id));
        let col_id = self.alloc();
        // IFC4: IFCCOLUMN with PredefinedType at end
        self.emit(
            col_id,
            format!(
                "IFCCOLUMN('{}',#{},'{}','Column',$,#{},#{},$,$)",
                guid, owner_history, col.meta.name, placement, shape
            ),
        );

        col_id
    }

    fn write_beam(
        &mut self,
        beam: &BeamElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let dx = beam.end[0] - beam.start[0];
        let dy = beam.end[1] - beam.start[1];
        let dz = beam.end[2] - beam.start[2];
        let length = (dx * dx + dy * dy + dz * dz).sqrt();

        let (ref_dx, ref_dy, ref_dz) = if length > 1e-9 {
            (dx / length, dy / length, dz / length)
        } else {
            (1.0, 0.0, 0.0)
        };

        let placement = self.write_local_placement_with_dir(
            Some(storey_placement),
            beam.start,
            [ref_dx, ref_dy, ref_dz],
            [0.0, 0.0, 1.0],
        );

        let profile = self.write_rectangle_profile(beam.width, beam.depth);
        let solid = self.write_extruded_area_solid(profile, length);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("beam_{}", beam.meta.id));
        let beam_id = self.alloc();
        // IFC4: IFCBEAM with PredefinedType at end
        self.emit(
            beam_id,
            format!(
                "IFCBEAM('{}',#{},'{}','Beam',$,#{},#{},$,$)",
                guid, owner_history, beam.meta.name, placement, shape
            ),
        );

        beam_id
    }

    fn write_stair(
        &mut self,
        stair: &StairElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement =
            self.write_local_placement(Some(storey_placement), stair.start[0], stair.start[1], 0.0);

        let dx = stair.end[0] - stair.start[0];
        let dy = stair.end[1] - stair.start[1];
        let run = (dx * dx + dy * dy).sqrt();

        let profile = self.write_rectangle_profile(run, stair.width);
        let solid = self.write_extruded_area_solid(profile, stair.total_height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("stair_{}", stair.meta.id));
        let stair_id = self.alloc();
        let stair_kind = match stair.stair_type {
            StairType::Straight => ".STRAIGHT_RUN_STAIR.",
            StairType::Spiral => ".SPIRAL_STAIR.",
        };
        self.emit(
            stair_id,
            format!(
                "IFCSTAIR('{}',#{},'{}','Stair',$,#{},#{},$,{})",
                guid, owner_history, stair.meta.name, placement, shape, stair_kind
            ),
        );

        stair_id
    }

    fn write_space(
        &mut self,
        room: &RoomElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), 0.0, 0.0, 0.0);

        let profile = self.write_arbitrary_profile(&room.boundary);
        let solid = self.write_extruded_area_solid(profile, 3.0);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("space_{}", room.meta.id));
        let space_id = self.alloc();
        self.emit(
            space_id,
            format!(
                "IFCSPACE('{}',#{},'{}','Room',$,#{},#{},$,.ELEMENT.,.INTERNAL.,$)",
                guid, owner_history, room.meta.name, placement, shape
            ),
        );

        space_id
    }

    fn write_furnishing_element(
        &mut self,
        seed_id: &str,
        name: &str,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
        x: f64,
        y: f64,
        width: f64,
        depth: f64,
        height: f64,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), x, y, 0.0);
        let profile = self.write_rectangle_profile(width, depth);
        let solid = self.write_extruded_area_solid(profile, height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("furnishing_{}", seed_id));
        let elem_id = self.alloc();
        self.emit(
            elem_id,
            format!(
                "IFCFURNISHINGELEMENT('{}',#{},'{}','Furnishing',$,#{},#{},$)",
                guid, owner_history, name, placement, shape
            ),
        );
        elem_id
    }

    /// IfcFlowTerminal: used for plumbing fixtures, electrical outlets/lights, HVAC terminals.
    fn write_flow_terminal(
        &mut self,
        seed_id: &str,
        name: &str,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
        x: f64,
        y: f64,
        width: f64,
        depth: f64,
        height: f64,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), x, y, 0.0);
        let profile = self.write_rectangle_profile(width.max(0.01), depth.max(0.01));
        let solid = self.write_extruded_area_solid(profile, height.max(0.01));
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("flowterminal_{}", seed_id));
        let elem_id = self.alloc();
        self.emit(
            elem_id,
            format!(
                "IFCFLOWTERMINAL('{}',#{},'{}','Terminal',$,#{},#{},$,$)",
                guid, owner_history, name, placement, shape
            ),
        );
        elem_id
    }

    /// IfcDistributionElement: used for fire safety devices.
    fn write_distribution_element(
        &mut self,
        seed_id: &str,
        name: &str,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
        x: f64,
        y: f64,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), x, y, 0.0);
        let profile = self.write_rectangle_profile(0.1, 0.1);
        let solid = self.write_extruded_area_solid(profile, 0.05);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("distrib_{}", seed_id));
        let elem_id = self.alloc();
        self.emit(
            elem_id,
            format!(
                "IFCDISTRIBUTIONELEMENT('{}',#{},'{}','Distribution',$,#{},#{},$)",
                guid, owner_history, name, placement, shape
            ),
        );
        elem_id
    }

    // --- Property sets ---

    fn write_quantity_set(
        &mut self,
        element_seed: &str,
        owner_history: u32,
        element_id: u32,
        category: &str,
        quantities: &[(&str, f64)],
    ) {
        let mut qty_ids: Vec<u32> = Vec::new();
        for (name, value) in quantities {
            let qty = self.alloc();
            self.emit(
                qty,
                format!(
                    "IFCQUANTITYLENGTH('{}','{} {}',$,{},$)",
                    name, category, name, value
                ),
            );
            qty_ids.push(qty);
        }

        let refs: Vec<String> = qty_ids.iter().map(|id| format!("#{}", id)).collect();
        let qset = self.alloc();
        self.emit(
            qset,
            format!(
                "IFCELEMENTQUANTITY('{}',#{},'BaseQuantities',$,$,({}))",
                make_ifc_guid(&format!("qset_{}", element_seed)),
                owner_history,
                refs.join(",")
            ),
        );

        let rel = self.alloc();
        self.emit(
            rel,
            format!(
                "IFCRELDEFINESBYPROPERTIES('{}',#{},$,$,(#{}),#{})",
                make_ifc_guid(&format!("relqset_{}", element_seed)),
                owner_history,
                element_id,
                qset
            ),
        );
    }

    // --- File assembly ---

    fn finish(self) -> String {
        let timestamp = "2026-01-01T00:00:00";
        let mut output = String::new();

        // Header
        output.push_str("ISO-10303-21;\n");
        output.push_str("HEADER;\n");
        output.push_str("FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');\n");
        output.push_str(&format!(
            "FILE_NAME('export.ifc','{}',(''),(''),'','BetterCAD 0.1','');\n",
            timestamp
        ));
        output.push_str("FILE_SCHEMA(('IFC4'));\n");
        output.push_str("ENDSEC;\n");
        output.push_str("DATA;\n");

        for line in &self.lines {
            output.push_str(line);
            output.push('\n');
        }

        output.push_str("ENDSEC;\n");
        output.push_str("END-ISO-10303-21;\n");

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ifc_guid_length() {
        let guid = make_ifc_guid("test_seed");
        assert_eq!(guid.len(), 22);
        for ch in guid.chars() {
            assert!(
                ch.is_ascii_alphanumeric() || ch == '_' || ch == '$',
                "invalid char: {}",
                ch
            );
        }
    }

    #[test]
    fn test_ifc_guid_deterministic() {
        let a = make_ifc_guid("wall_abc");
        let b = make_ifc_guid("wall_abc");
        assert_eq!(a, b);
    }

    #[test]
    fn test_ifc_guid_unique() {
        let a = make_ifc_guid("wall_1");
        let b = make_ifc_guid("wall_2");
        assert_ne!(a, b);
    }

    #[test]
    fn test_export_empty_project() {
        let bytes = export_ifc(&[]).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.starts_with("ISO-10303-21;"));
        assert!(text.contains("IFCPROJECT"));
        assert!(text.contains("IFCSITE"));
        assert!(text.contains("IFCBUILDING"));
        assert!(text.contains("IFCBUILDINGSTOREY"));
        assert!(text.ends_with("END-ISO-10303-21;\n"));
    }

    #[test]
    fn test_export_uses_ifc4_schema() {
        let bytes = export_ifc(&[]).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(
            text.contains("FILE_SCHEMA(('IFC4'))"),
            "Should use IFC4 schema"
        );
        assert!(!text.contains("IFC2X3"), "Should not contain IFC2X3");
    }

    #[test]
    fn test_export_wall_uses_ifcwall() {
        let elements = vec![Element::Wall(WallElement {
            meta: ElementMeta::new("Test Wall"),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        })];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        // IFC4 uses IFCWALL with .STANDARD. instead of IFCWALLSTANDARDCASE
        assert!(text.contains("IFCWALL("), "Should contain IFCWALL");
        assert!(
            text.contains(".STANDARD.)"),
            "Should have .STANDARD. predefined type"
        );
        assert!(
            !text.contains("IFCWALLSTANDARDCASE"),
            "Should NOT contain IFCWALLSTANDARDCASE"
        );
    }

    #[test]
    fn test_export_multiple_elements() {
        let elements = vec![
            Element::Wall(WallElement {
                meta: ElementMeta::new("Wall 1"),
                start: [0.0, 0.0],
                end: [5.0, 0.0],
                height: 3.0,
                thickness: 0.2,
                arc: None,
                arc_segments: 24,
            }),
            Element::Floor(FloorElement {
                meta: ElementMeta::new("Floor 1"),
                boundary: vec![[0.0, 0.0], [5.0, 0.0], [5.0, 4.0], [0.0, 4.0]],
                thickness: 0.3,
                boundary_segments: Vec::new(),
            }),
            Element::Column(ColumnElement {
                meta: ElementMeta::new("Col 1"),
                center: [2.5, 2.0],
                width: 0.3,
                depth: 0.3,
                height: 3.0,
                diameter: None,
                column_segments: 24,
            }),
        ];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("IFCWALL("));
        assert!(text.contains("IFCSLAB"));
        assert!(text.contains("IFCCOLUMN"));
    }

    #[test]
    fn test_export_door_with_opening() {
        let wall = WallElement {
            meta: {
                let mut m = ElementMeta::new("Wall 1");
                m.id = "w1".to_string();
                m
            },
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        };

        let elements = vec![
            Element::Wall(wall),
            Element::Door(DoorElement {
                meta: ElementMeta::new("Door 1"),
                wall_id: "w1".into(),
                position_along_wall: 0.5,
                width: 0.9,
                height: 2.1,
                sill_height: 0.0,
                swing: DoorSwing::OutRight,
                hardware_type: DoorHardwareType::Lever,
                style: DoorStyle::Flush,
            }),
        ];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(
            text.contains("IFCOPENINGELEMENT"),
            "Should have opening element"
        );
        assert!(text.contains("IFCRELVOIDSELEMENT"), "Should have rel voids");
        assert!(text.contains("IFCRELFILLSELEMENT"), "Should have rel fills");
        assert!(text.contains("IFCDOOR"));
    }

    #[test]
    fn test_export_stair_and_room() {
        let elements = vec![
            Element::Stair(StairElement {
                meta: ElementMeta::new("Stair 1"),
                start: [0.0, 0.0],
                end: [3.0, 0.0],
                width: 1.0,
                risers: 15,
                total_height: 3.0,
                stair_type: StairType::Straight,
                spiral_turns: 1.0,
                side_wall_thickness: 0.12,
            }),
            Element::Room(RoomElement {
                meta: ElementMeta::new("Living Room"),
                boundary: vec![[0.0, 0.0], [5.0, 0.0], [5.0, 4.0], [0.0, 4.0]],
                boundary_segments: Vec::new(),
            }),
        ];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("IFCSTAIR"));
        assert!(text.contains("IFCSPACE"));
    }

    #[test]
    fn test_export_foundation() {
        let elements = vec![Element::Foundation(FoundationElement {
            meta: ElementMeta::new("Foundation 1"),
            boundary: vec![[0.0, 0.0], [6.0, 0.0], [6.0, 4.0], [0.0, 4.0]],
            thickness: 0.5,
        })];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("IFCSLAB"));
        assert!(
            text.contains(".BASESLAB.)"),
            "Foundation should use .BASESLAB. predefined type"
        );
    }

    #[test]
    fn test_ifc_file_structure() {
        let bytes = export_ifc(&[]).unwrap();
        let text = String::from_utf8(bytes).unwrap();

        assert!(text.contains("HEADER;"));
        assert!(text.contains("FILE_DESCRIPTION"));
        assert!(text.contains("FILE_NAME"));
        assert!(text.contains("FILE_SCHEMA(('IFC4'))"));
        assert!(text.contains("DATA;"));
        assert!(text.contains("ENDSEC;"));
        assert!(text.contains("IFCRELAGGREGATES"));
    }

    #[test]
    fn test_export_multi_storey() {
        let level1 = Element::Level(LevelElement {
            meta: {
                let mut m = ElementMeta::new("Level 1");
                m.id = "L1".to_string();
                m
            },
            elevation: 0.0,
        });
        let level2 = Element::Level(LevelElement {
            meta: {
                let mut m = ElementMeta::new("Level 2");
                m.id = "L2".to_string();
                m
            },
            elevation: 3.0,
        });
        let wall1 = Element::Wall(WallElement {
            meta: {
                let mut m = ElementMeta::new("Wall L1");
                m.level_id = Some("L1".into());
                m
            },
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        });
        let wall2 = Element::Wall(WallElement {
            meta: {
                let mut m = ElementMeta::new("Wall L2");
                m.level_id = Some("L2".into());
                m
            },
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        });

        let elements = vec![level1, level2, wall1, wall2];
        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        // Should have two IFCBUILDINGSTOREY entities
        let storey_count = text.matches("IFCBUILDINGSTOREY(").count();
        assert_eq!(storey_count, 2, "Should have 2 storeys");
        // Should have two separate IFCRELCONTAINEDINSPATIALSTRUCTURE
        let contains_count = text.matches("IFCRELCONTAINEDINSPATIALSTRUCTURE(").count();
        assert_eq!(contains_count, 2, "Should have 2 containment relations");
    }

    // --- Import Tests ---

    #[test]
    fn test_import_ifc_empty() {
        let ifc = "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n";
        let result = import_ifc(ifc.as_bytes()).unwrap();
        assert!(result.elements.is_empty());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_import_ifc_wall() {
        let ifc = r#"ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.0,0.0,0.0));
#2=IFCDIRECTION((0.0,0.0,1.0));
#3=IFCDIRECTION((1.0,0.0,0.0));
#4=IFCAXIS2PLACEMENT3D(#1,#2,#3);
#5=IFCLOCALPLACEMENT($,#4);
#10=IFCWALL('0test_guid_wall_12345',$,'My Wall',$,$,#5,$,$,.STANDARD.);
ENDSEC;
END-ISO-10303-21;
"#;
        let result = import_ifc(ifc.as_bytes()).unwrap();
        assert_eq!(result.elements.len(), 1);
        match &result.elements[0] {
            Element::Wall(w) => {
                assert_eq!(w.meta.name, "My Wall");
                assert!((w.start[0]).abs() < 1e-6);
            }
            other => panic!("expected Wall, got {:?}", other.kind_name()),
        }
    }

    #[test]
    fn test_import_ifc_storey_and_slab() {
        let ifc = r#"ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCBUILDINGSTOREY('guid1',$,'Ground Floor',$,$,$,$,$,.ELEMENT.,0.0);
#2=IFCSLAB('guid2',$,'Floor Slab',$,$,$,$,$,.FLOOR.);
#3=IFCRELCONTAINEDINSPATIALSTRUCTURE('guid3',$,$,$,(#2),#1);
ENDSEC;
END-ISO-10303-21;
"#;
        let result = import_ifc(ifc.as_bytes()).unwrap();
        // Should have 1 level + 1 floor = 2 elements
        let levels: Vec<_> = result
            .elements
            .iter()
            .filter(|e| matches!(e, Element::Level(_)))
            .collect();
        let floors: Vec<_> = result
            .elements
            .iter()
            .filter(|e| matches!(e, Element::Floor(_)))
            .collect();
        assert_eq!(levels.len(), 1);
        assert_eq!(floors.len(), 1);
        // Floor should have a level_id
        if let Element::Floor(f) = floors[0] {
            assert!(
                f.meta.level_id.is_some(),
                "Floor should have level_id assigned"
            );
        }
    }

    #[test]
    fn test_spf_attr_parsing() {
        let attrs = split_spf_attrs("'hello',#42,$,(#1,#2),3.14");
        assert_eq!(attrs.len(), 5);
        assert_eq!(attrs[0], "'hello'");
        assert_eq!(attrs[1], "#42");
        assert_eq!(attrs[2], "$");
        assert_eq!(attrs[3], "(#1,#2)");
        assert_eq!(attrs[4], "3.14");
    }

    #[test]
    fn test_import_export_roundtrip() {
        // Export a simple project, then import it back
        let elements = vec![Element::Wall(WallElement {
            meta: ElementMeta::new("Test Wall"),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        })];

        let bytes = export_ifc(&elements).unwrap();
        let result = import_ifc(&bytes).unwrap();
        // Should find at least 1 wall plus the default storey
        let walls: Vec<_> = result
            .elements
            .iter()
            .filter(|e| matches!(e, Element::Wall(_)))
            .collect();
        assert!(!walls.is_empty(), "Roundtrip should preserve walls");
    }
}
