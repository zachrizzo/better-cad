//! Converts tool-layer `Command`s and domain-state enums to the application
//! `bcad_state::Command`s that flow into the command processor.
//!
//! Also houses the BIM defaults builder (`build_tool_defaults`) and the
//! element-mutation helpers used by duplicate/rotate/move operations.

use bcad_state::AppState;
use serde::Serialize;

// ---------------------------------------------------------------------------
// BIM defaults builder
// ---------------------------------------------------------------------------

/// Build a `BimDefaults` value from the current app state, converting all
/// state-layer enum types to their domain equivalents.
pub(crate) fn build_tool_defaults(state: &AppState) -> bcad_tools::tool_trait::BimDefaults {
    bcad_tools::tool_trait::BimDefaults {
        wall_height: state.bim_defaults.wall_height,
        wall_thickness: state.bim_defaults.wall_thickness,
        door_width: state.bim_defaults.door_width,
        door_height: state.bim_defaults.door_height,
        door_sill: state.bim_defaults.door_sill,
        door_swing: state_door_swing_to_domain(state.bim_defaults.door_swing),
        door_hardware_type: state_door_hardware_to_domain(state.bim_defaults.door_hardware_type),
        door_style: state_door_style_to_domain(state.bim_defaults.door_style),
        window_width: state.bim_defaults.window_width,
        window_height: state.bim_defaults.window_height,
        window_sill: state.bim_defaults.window_sill,
        window_hardware_type: state_window_hardware_to_domain(
            state.bim_defaults.window_hardware_type,
        ),
        window_style: state_window_style_to_domain(state.bim_defaults.window_style),
        column_width: state.bim_defaults.column_width,
        column_depth: state.bim_defaults.column_depth,
        column_height: state.bim_defaults.column_height,
        beam_width: state.bim_defaults.beam_width,
        beam_depth: state.bim_defaults.beam_depth,
        beam_elevation: state.bim_defaults.beam_elevation,
        roof_thickness: state.bim_defaults.roof_thickness,
        roof_elevation: state.bim_defaults.roof_elevation,
        roof_auto_elevation: state.bim_defaults.roof_auto_elevation,
        roof_type: state_roof_type_to_domain(state.bim_defaults.roof_type),
        roof_pitch_degrees: state.bim_defaults.roof_pitch_degrees,
        roof_ridge_angle_degrees: state.bim_defaults.roof_ridge_angle_degrees,
        stair_width: state.bim_defaults.stair_width,
        stair_risers: state.bim_defaults.stair_risers,
        stair_height: state.bim_defaults.stair_height,
        stair_type: state_stair_type_to_domain(state.bim_defaults.stair_type),
        spiral_turns: state.bim_defaults.spiral_turns,
        stair_side_wall_thickness: state.bim_defaults.stair_side_wall_thickness,
        floor_thickness: state.bim_defaults.floor_thickness,
        furniture_type: enum_to_snake_case(&state.bim_defaults.furniture_type),
        furniture_rotation: state.bim_defaults.furniture_rotation,
        plumbing_type: enum_to_snake_case(&state.bim_defaults.plumbing_type),
        plumbing_rotation: state.bim_defaults.plumbing_rotation,
        electrical_type: enum_to_snake_case(&state.bim_defaults.electrical_type),
        electrical_rotation: state.bim_defaults.electrical_rotation,
        cabinet_type: enum_to_snake_case(&state.bim_defaults.cabinet_type),
        cabinet_rotation: state.bim_defaults.cabinet_rotation,
        cabinet_door_count: state.bim_defaults.cabinet_door_count,
        cabinet_drawer_count: state.bim_defaults.cabinet_drawer_count,
        hvac_type: enum_to_snake_case(&state.bim_defaults.hvac_type),
        hvac_rotation: state.bim_defaults.hvac_rotation,
        fire_safety_type: enum_to_snake_case(&state.bim_defaults.fire_safety_type),
        fire_safety_rotation: state.bim_defaults.fire_safety_rotation,
        accessibility_type: enum_to_snake_case(&state.bim_defaults.accessibility_type),
        accessibility_rotation: state.bim_defaults.accessibility_rotation,
        dimension_sub_mode: state_dimension_sub_mode_to_tool(state.ui.dimension_sub_mode),
        sketch_draw_mode: state_sketch_draw_mode_to_tool(state.sketch.draw_mode),
    }
}

// ---------------------------------------------------------------------------
// State-to-tool enum conversions
// ---------------------------------------------------------------------------

pub(crate) fn state_length_unit_to_tool(
    unit: bcad_state::settings::LengthUnit,
) -> bcad_tools::tool_trait::LengthUnit {
    match unit {
        bcad_state::settings::LengthUnit::M => bcad_tools::tool_trait::LengthUnit::Meters,
        bcad_state::settings::LengthUnit::Ft => bcad_tools::tool_trait::LengthUnit::Feet,
        bcad_state::settings::LengthUnit::In => bcad_tools::tool_trait::LengthUnit::Inches,
        bcad_state::settings::LengthUnit::Mm => bcad_tools::tool_trait::LengthUnit::Millimeters,
        bcad_state::settings::LengthUnit::Cm => bcad_tools::tool_trait::LengthUnit::Centimeters,
    }
}

pub(crate) fn state_dimension_sub_mode_to_tool(
    mode: bcad_state::ui_state::DimensionSubMode,
) -> bcad_tools::dimension_tool::DimensionSubMode {
    match mode {
        bcad_state::ui_state::DimensionSubMode::Aligned => {
            bcad_tools::dimension_tool::DimensionSubMode::Aligned
        }
        bcad_state::ui_state::DimensionSubMode::Horizontal => {
            bcad_tools::dimension_tool::DimensionSubMode::Horizontal
        }
        bcad_state::ui_state::DimensionSubMode::Vertical => {
            bcad_tools::dimension_tool::DimensionSubMode::Vertical
        }
        bcad_state::ui_state::DimensionSubMode::Chain => {
            bcad_tools::dimension_tool::DimensionSubMode::Chain
        }
        bcad_state::ui_state::DimensionSubMode::Baseline => {
            bcad_tools::dimension_tool::DimensionSubMode::Baseline
        }
        bcad_state::ui_state::DimensionSubMode::Ordinate => {
            bcad_tools::dimension_tool::DimensionSubMode::Ordinate
        }
    }
}

pub(crate) fn state_sketch_draw_mode_to_tool(
    mode: bcad_state::sketch_state::SketchDrawMode,
) -> bcad_tools::sketch_tool::SketchDrawMode {
    match mode {
        bcad_state::sketch_state::SketchDrawMode::None => {
            bcad_tools::sketch_tool::SketchDrawMode::None
        }
        bcad_state::sketch_state::SketchDrawMode::Line => {
            bcad_tools::sketch_tool::SketchDrawMode::Line
        }
        bcad_state::sketch_state::SketchDrawMode::Rectangle => {
            bcad_tools::sketch_tool::SketchDrawMode::Rectangle
        }
        bcad_state::sketch_state::SketchDrawMode::Circle => {
            bcad_tools::sketch_tool::SketchDrawMode::Circle
        }
    }
}

pub(crate) fn state_door_swing_to_domain(
    swing: bcad_state::bim_defaults::DoorSwing,
) -> bcad_domain::DoorSwing {
    match swing {
        bcad_state::bim_defaults::DoorSwing::OutLeft => bcad_domain::DoorSwing::OutLeft,
        bcad_state::bim_defaults::DoorSwing::OutRight => bcad_domain::DoorSwing::OutRight,
        bcad_state::bim_defaults::DoorSwing::InLeft => bcad_domain::DoorSwing::InLeft,
        bcad_state::bim_defaults::DoorSwing::InRight => bcad_domain::DoorSwing::InRight,
    }
}

pub(crate) fn state_door_hardware_to_domain(
    hardware_type: bcad_state::bim_defaults::DoorHardwareType,
) -> bcad_domain::DoorHardwareType {
    match hardware_type {
        bcad_state::bim_defaults::DoorHardwareType::None => bcad_domain::DoorHardwareType::None,
        bcad_state::bim_defaults::DoorHardwareType::Knob => bcad_domain::DoorHardwareType::Knob,
        bcad_state::bim_defaults::DoorHardwareType::Lever => bcad_domain::DoorHardwareType::Lever,
        bcad_state::bim_defaults::DoorHardwareType::PullBar => {
            bcad_domain::DoorHardwareType::PullBar
        }
    }
}

pub(crate) fn state_door_style_to_domain(
    style: bcad_state::bim_defaults::DoorStyle,
) -> bcad_domain::DoorStyle {
    match style {
        bcad_state::bim_defaults::DoorStyle::Flush => bcad_domain::DoorStyle::Flush,
        bcad_state::bim_defaults::DoorStyle::Panel => bcad_domain::DoorStyle::Panel,
        bcad_state::bim_defaults::DoorStyle::Double => bcad_domain::DoorStyle::Double,
    }
}

pub(crate) fn state_window_hardware_to_domain(
    hardware_type: bcad_state::bim_defaults::WindowHardwareType,
) -> bcad_domain::WindowHardwareType {
    match hardware_type {
        bcad_state::bim_defaults::WindowHardwareType::None => bcad_domain::WindowHardwareType::None,
        bcad_state::bim_defaults::WindowHardwareType::Latch => {
            bcad_domain::WindowHardwareType::Latch
        }
        bcad_state::bim_defaults::WindowHardwareType::Crank => {
            bcad_domain::WindowHardwareType::Crank
        }
    }
}

pub(crate) fn state_window_style_to_domain(
    style: bcad_state::bim_defaults::WindowStyle,
) -> bcad_domain::WindowStyle {
    match style {
        bcad_state::bim_defaults::WindowStyle::Picture => bcad_domain::WindowStyle::Picture,
        bcad_state::bim_defaults::WindowStyle::Casement => bcad_domain::WindowStyle::Casement,
        bcad_state::bim_defaults::WindowStyle::DoubleHung => bcad_domain::WindowStyle::DoubleHung,
    }
}

pub(crate) fn state_stair_type_to_domain(
    stair_type: bcad_state::bim_defaults::StairType,
) -> bcad_domain::StairType {
    match stair_type {
        bcad_state::bim_defaults::StairType::Straight => bcad_domain::StairType::Straight,
        bcad_state::bim_defaults::StairType::Spiral => bcad_domain::StairType::Spiral,
    }
}

pub(crate) fn state_roof_type_to_domain(
    roof_type: bcad_state::bim_defaults::RoofType,
) -> bcad_domain::RoofType {
    match roof_type {
        bcad_state::bim_defaults::RoofType::Flat => bcad_domain::RoofType::Flat,
        bcad_state::bim_defaults::RoofType::Shed => bcad_domain::RoofType::Shed,
        bcad_state::bim_defaults::RoofType::Gable => bcad_domain::RoofType::Gable,
        bcad_state::bim_defaults::RoofType::Hip => bcad_domain::RoofType::Hip,
    }
}

pub(crate) fn enum_to_snake_case<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Tool-command → state-command translation
// ---------------------------------------------------------------------------

/// Convert a batch of tool-layer `Command`s to the application-level
/// `bcad_state::Command`s that flow into the command processor.
pub(crate) fn convert_tool_commands(
    tool_cmds: Vec<bcad_tools::tool_trait::Command>,
    app_state: &AppState,
) -> Vec<bcad_state::Command> {
    let mut result = Vec::new();
    for cmd in tool_cmds {
        match cmd {
            bcad_tools::tool_trait::Command::CreateElement(bcad_domain::Element::View(view)) => {
                if let Some(saved_view) = saved_view_from_element_view(&view) {
                    let view_id = saved_view.id.clone();
                    result.push(bcad_state::Command::AddSavedView { view: saved_view });
                    result.push(bcad_state::Command::SetActiveView { id: Some(view_id) });
                } else {
                    result.push(bcad_state::Command::CreateElement {
                        element: bcad_domain::Element::View(view),
                    });
                }
            }
            bcad_tools::tool_trait::Command::CreateElement(element) => {
                result.push(bcad_state::Command::CreateElement { element })
            }
            bcad_tools::tool_trait::Command::UpdateElement { id, element } => {
                result.push(bcad_state::Command::UpdateElement { id, element })
            }
            bcad_tools::tool_trait::Command::DeleteElement(id) => {
                result.push(bcad_state::Command::DeleteElement { id })
            }
            bcad_tools::tool_trait::Command::BatchCreate(elements) => {
                for element in elements {
                    result.push(bcad_state::Command::CreateElement { element });
                }
            }
            bcad_tools::tool_trait::Command::Undo => result.push(bcad_state::Command::Undo),
            bcad_tools::tool_trait::Command::Redo => result.push(bcad_state::Command::Redo),
            bcad_tools::tool_trait::Command::SetActiveTool(_)
            | bcad_tools::tool_trait::Command::Save
            | bcad_tools::tool_trait::Command::Load => {}
            bcad_tools::tool_trait::Command::AutoJoinWalls { wall_id, level_id } => {
                result.push(bcad_state::Command::AutoJoinWalls { wall_id, level_id });
            }
            bcad_tools::tool_trait::Command::Duplicate => convert_duplicate(app_state, &mut result),
            bcad_tools::tool_trait::Command::DeleteSelected => {
                if let Some(id) = &app_state.ui.selected_body_id {
                    result.push(bcad_state::Command::DeleteElement { id: id.clone() });
                }
            }
            bcad_tools::tool_trait::Command::RotateSelected => {
                convert_rotate_selected(app_state, &mut result)
            }
            bcad_tools::tool_trait::Command::MoveElement {
                id,
                delta_x,
                delta_z,
            } => {
                convert_move_element(&id, delta_x, delta_z, app_state, &mut result);
            }
            bcad_tools::tool_trait::Command::SelectElement { id } => {
                result.push(bcad_state::Command::SelectBody { id });
            }
        }
    }
    result
}

fn saved_view_from_element_view(
    view: &bcad_domain::ViewElement,
) -> Option<bcad_state::view_state::SavedView> {
    match view.view_type.as_str() {
        "section" => {
            let cut_line_start = view.cut_start?;
            let cut_line_end = view.cut_end?;
            let dx = cut_line_end[0] - cut_line_start[0];
            let dz = cut_line_end[1] - cut_line_start[1];
            let len = (dx * dx + dz * dz).sqrt();
            if len < 1e-8 {
                return None;
            }
            let nx = -dz / len;
            let nz = dx / len;
            let mid_x = (cut_line_start[0] + cut_line_end[0]) * 0.5;
            let mid_z = (cut_line_start[1] + cut_line_end[1]) * 0.5;
            let camera_distance = 20.0;

            Some(bcad_state::view_state::SavedView {
                id: view.meta.id.clone(),
                name: view.meta.name.clone(),
                view_type: bcad_state::view_state::SavedViewType::Section,
                cut_line_start: Some(cut_line_start),
                cut_line_end: Some(cut_line_end),
                direction: None,
                camera_position: [
                    mid_x + nx * camera_distance,
                    5.0,
                    mid_z + nz * camera_distance,
                ],
                camera_target: [mid_x, 5.0, mid_z],
            })
        }
        "elevation" => {
            let direction = match view.elevation_direction.as_deref() {
                Some("north") => bcad_state::view_state::CardinalDirection::North,
                Some("south") => bcad_state::view_state::CardinalDirection::South,
                Some("east") => bcad_state::view_state::CardinalDirection::East,
                Some("west") => bcad_state::view_state::CardinalDirection::West,
                _ => return None,
            };
            let dist = 50.0;
            let camera_position = match direction {
                bcad_state::view_state::CardinalDirection::North => [0.0, 3.0, -dist],
                bcad_state::view_state::CardinalDirection::South => [0.0, 3.0, dist],
                bcad_state::view_state::CardinalDirection::East => [dist, 3.0, 0.0],
                bcad_state::view_state::CardinalDirection::West => [-dist, 3.0, 0.0],
            };

            Some(bcad_state::view_state::SavedView {
                id: view.meta.id.clone(),
                name: view.meta.name.clone(),
                view_type: bcad_state::view_state::SavedViewType::Elevation,
                cut_line_start: None,
                cut_line_end: None,
                direction: Some(direction),
                camera_position,
                camera_target: [0.0, 3.0, 0.0],
            })
        }
        _ => None,
    }
}

fn convert_duplicate(app_state: &AppState, result: &mut Vec<bcad_state::Command>) {
    let sid = match &app_state.ui.selected_body_id {
        Some(id) => id,
        None => return,
    };
    let el = match app_state
        .document
        .prototype
        .project
        .elements
        .iter()
        .find(|e| e.id() == sid)
    {
        Some(e) => e,
        None => return,
    };
    let mut c = el.clone();
    let nid = uuid::Uuid::new_v4().to_string();
    set_element_id_and_offset(&mut c, &nid, 0.5);
    result.push(bcad_state::Command::CreateElement { element: c });
}

/// Set a new ID and apply a small positional offset on a duplicated element.
///
/// Called from both `convert_duplicate` here and from `command_processor` via
/// `crate::command_translator::set_element_id_and_offset`.
pub(crate) fn set_element_id_and_offset(element: &mut bcad_domain::Element, new_id: &str, o: f64) {
    match element {
        bcad_domain::Element::Wall(w) => {
            w.meta.id = new_id.into();
            w.meta.name = format!("{} (copy)", w.meta.name);
            w.start[0] += o;
            w.end[0] += o;
            w.start[1] += o;
            w.end[1] += o;
        }
        bcad_domain::Element::Column(c) => {
            c.meta.id = new_id.into();
            c.meta.name = format!("{} (copy)", c.meta.name);
            c.center[0] += o;
            c.center[1] += o;
        }
        bcad_domain::Element::Beam(b) => {
            b.meta.id = new_id.into();
            b.meta.name = format!("{} (copy)", b.meta.name);
            b.start[0] += o;
            b.end[0] += o;
            b.start[1] += o;
            b.end[1] += o;
        }
        bcad_domain::Element::Door(d) => {
            d.meta.id = new_id.into();
            d.meta.name = format!("{} (copy)", d.meta.name);
            d.position_along_wall += o;
        }
        bcad_domain::Element::Window(w) => {
            w.meta.id = new_id.into();
            w.meta.name = format!("{} (copy)", w.meta.name);
            w.position_along_wall += o;
        }
        bcad_domain::Element::Furniture(f) => {
            f.meta.id = new_id.into();
            f.meta.name = format!("{} (copy)", f.meta.name);
            f.position[0] += o;
            f.position[1] += o;
        }
        bcad_domain::Element::Electrical(e) => {
            e.meta.id = new_id.into();
            e.meta.name = format!("{} (copy)", e.meta.name);
            e.position[0] += o;
            e.position[1] += o;
        }
        bcad_domain::Element::Plumbing(p) => {
            p.meta.id = new_id.into();
            p.meta.name = format!("{} (copy)", p.meta.name);
            p.position[0] += o;
            p.position[1] += o;
        }
        bcad_domain::Element::Hvac(h) => {
            h.meta.id = new_id.into();
            h.meta.name = format!("{} (copy)", h.meta.name);
            h.position[0] += o;
            h.position[1] += o;
        }
        bcad_domain::Element::FireSafety(f) => {
            f.meta.id = new_id.into();
            f.meta.name = format!("{} (copy)", f.meta.name);
            f.position[0] += o;
            f.position[1] += o;
        }
        bcad_domain::Element::Accessibility(a) => {
            a.meta.id = new_id.into();
            a.meta.name = format!("{} (copy)", a.meta.name);
            a.position[0] += o;
            a.position[1] += o;
        }
        bcad_domain::Element::Cabinet(c) => {
            c.meta.id = new_id.into();
            c.meta.name = format!("{} (copy)", c.meta.name);
            c.position[0] += o;
            c.position[1] += o;
        }
        other => {
            let nn = format!("{} (copy)", other.meta().name);
            match other {
                bcad_domain::Element::Site(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Level(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Grid(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Floor(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Roof(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Foundation(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Stair(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Room(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::View(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Sheet(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Material(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::FamilyType(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Generic(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::SiteDetail(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::LeaderAnnotation(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Keynote(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Tag(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                _ => {}
            }
        }
    }
}

fn convert_rotate_selected(app_state: &AppState, result: &mut Vec<bcad_state::Command>) {
    use std::f64::consts::FRAC_PI_2;
    let sid = match &app_state.ui.selected_body_id {
        Some(id) => id,
        None => return,
    };
    let el = match app_state
        .document
        .prototype
        .project
        .elements
        .iter()
        .find(|e| e.id() == sid)
    {
        Some(e) => e,
        None => return,
    };
    let mut r = el.clone();
    match &mut r {
        bcad_domain::Element::Furniture(f) => f.rotation += FRAC_PI_2,
        bcad_domain::Element::Electrical(e) => e.rotation += FRAC_PI_2,
        bcad_domain::Element::Plumbing(p) => p.rotation += FRAC_PI_2,
        bcad_domain::Element::Hvac(h) => h.rotation += FRAC_PI_2,
        bcad_domain::Element::FireSafety(f) => f.rotation += FRAC_PI_2,
        bcad_domain::Element::Accessibility(a) => a.rotation += FRAC_PI_2,
        bcad_domain::Element::Cabinet(c) => c.rotation += FRAC_PI_2,
        bcad_domain::Element::Wall(w) => {
            let (cx, cy) = ((w.start[0] + w.end[0]) / 2.0, (w.start[1] + w.end[1]) / 2.0);
            let (s0, s1) = rot90(w.start[0], w.start[1], cx, cy);
            let (e0, e1) = rot90(w.end[0], w.end[1], cx, cy);
            w.start = [s0, s1];
            w.end = [e0, e1];
        }
        bcad_domain::Element::Column(_) => {}
        bcad_domain::Element::Beam(b) => {
            let (cx, cy) = ((b.start[0] + b.end[0]) / 2.0, (b.start[1] + b.end[1]) / 2.0);
            let (s0, s1) = rot90(b.start[0], b.start[1], cx, cy);
            let (e0, e1) = rot90(b.end[0], b.end[1], cx, cy);
            b.start[0] = s0;
            b.start[1] = s1;
            b.end[0] = e0;
            b.end[1] = e1;
        }
        _ => return,
    }
    result.push(bcad_state::Command::UpdateElement {
        id: sid.clone(),
        element: r,
    });
}

fn rot90(x: f64, y: f64, cx: f64, cy: f64) -> (f64, f64) {
    (cx - (y - cy), cy + (x - cx))
}

fn convert_move_element(
    id: &str,
    dx: f64,
    dz: f64,
    app_state: &AppState,
    result: &mut Vec<bcad_state::Command>,
) {
    let elements = &app_state.document.prototype.project.elements;
    let element = match elements.iter().find(|e| e.id() == id) {
        Some(e) => e,
        None => return,
    };
    let mut moved = element.clone();
    match &mut moved {
        bcad_domain::Element::Wall(w) => {
            w.start[0] += dx;
            w.end[0] += dx;
            w.start[1] += dz;
            w.end[1] += dz;
        }
        bcad_domain::Element::Column(c) => {
            c.center[0] += dx;
            c.center[1] += dz;
        }
        bcad_domain::Element::Beam(b) => {
            b.start[0] += dx;
            b.end[0] += dx;
            b.start[1] += dz;
            b.end[1] += dz;
        }
        bcad_domain::Element::Furniture(f) => {
            f.position[0] += dx;
            f.position[1] += dz;
        }
        bcad_domain::Element::Electrical(e) => {
            e.position[0] += dx;
            e.position[1] += dz;
        }
        bcad_domain::Element::Plumbing(p) => {
            p.position[0] += dx;
            p.position[1] += dz;
        }
        bcad_domain::Element::Hvac(h) => {
            h.position[0] += dx;
            h.position[1] += dz;
        }
        bcad_domain::Element::FireSafety(f) => {
            f.position[0] += dx;
            f.position[1] += dz;
        }
        bcad_domain::Element::Accessibility(a) => {
            a.position[0] += dx;
            a.position[1] += dz;
        }
        bcad_domain::Element::Cabinet(c) => {
            c.position[0] += dx;
            c.position[1] += dz;
        }
        _ => return,
    }
    result.push(bcad_state::Command::UpdateElement {
        id: id.to_string(),
        element: moved,
    });
}
