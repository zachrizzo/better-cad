//! Property panel module -- the right-side panel that shows context-sensitive
//! BIM defaults, selected element properties, or general project info.
//!
//! Routing logic:
//! 1. If an element is selected (Select tool + selected_body_id): show selected element editor.
//! 2. If a BIM tool is active: show that tool's default properties.
//! 3. Otherwise: show general project info.

mod beam_props;
mod cabinet_props;
mod column_props;
mod door_props;
mod floor_props;
mod furniture_props;
mod mep_props;
mod opening_family_types;
mod roof_props;
mod selected_element;
mod snap_settings;
mod stair_props;
mod wall_props;
mod window_props;

use bcad_state::settings::MeasurementSnapTool;
use bcad_state::ui_state::ToolType;
use bcad_state::{AppState, Command};

/// Render the property panel and return any commands from user edits.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tool = state.ui.active_tool;

    // Determine what to show
    let show_selected = tool == ToolType::Select && state.ui.selected_body_id.is_some();

    // Panel title
    let title = if show_selected {
        "Element Properties".to_string()
    } else {
        format!("{} Settings", tool_display_name(tool))
    };

    ui.label(egui::RichText::new(&title).strong().size(14.0));
    ui.separator();

    // Route to appropriate sub-panel
    if show_selected {
        cmds.extend(selected_element::show(ui, state));
    } else {
        // Tool defaults
        match tool {
            ToolType::Wall => {
                cmds.extend(wall_props::show(ui, state));
            }
            ToolType::Door => {
                cmds.extend(door_props::show(ui, state));
            }
            ToolType::Window => {
                cmds.extend(window_props::show(ui, state));
            }
            ToolType::Floor => {
                cmds.extend(floor_props::show(ui, state, "Floor"));
            }
            ToolType::Parking => {
                cmds.extend(floor_props::show(ui, state, "Parking"));
            }
            ToolType::Foundation => {
                cmds.extend(floor_props::show(ui, state, "Foundation"));
            }
            ToolType::Stair => {
                cmds.extend(stair_props::show(ui, state));
            }
            ToolType::Column => {
                cmds.extend(column_props::show(ui, state));
            }
            ToolType::Beam => {
                cmds.extend(beam_props::show(ui, state));
            }
            ToolType::Roof => {
                cmds.extend(roof_props::show(ui, state));
            }
            ToolType::Furniture => {
                cmds.extend(furniture_props::show(ui, state));
            }
            ToolType::Plumbing => {
                cmds.extend(mep_props::show_plumbing(ui, state));
            }
            ToolType::Electrical => {
                cmds.extend(mep_props::show_electrical(ui, state));
            }
            ToolType::Hvac => {
                cmds.extend(mep_props::show_hvac(ui, state));
            }
            ToolType::FireSafety => {
                cmds.extend(mep_props::show_fire_safety(ui, state));
            }
            ToolType::Accessibility => {
                cmds.extend(mep_props::show_accessibility(ui, state));
            }
            ToolType::Cabinet => {
                cmds.extend(cabinet_props::show(ui, state));
            }
            ToolType::Measure
            | ToolType::MeasurePath
            | ToolType::MeasureAngle
            | ToolType::MeasureArea => {
                cmds.extend(snap_settings::show(ui, state, MeasurementSnapTool::Measure));
            }
            ToolType::Dimension => {
                cmds.extend(snap_settings::show(
                    ui,
                    state,
                    MeasurementSnapTool::Dimension,
                ));
            }
            ToolType::Select
            | ToolType::Room
            | ToolType::Text
            | ToolType::Sketch
            | ToolType::Section
            | ToolType::SpotElevation => {
                ui.label("No tool defaults for this tool.");
            }
        }
    }

    cmds
}

/// Human-readable display name for a tool.
fn tool_display_name(tool: ToolType) -> &'static str {
    match tool {
        ToolType::Select => "Select",
        ToolType::Foundation => "Foundation",
        ToolType::Parking => "Parking",
        ToolType::Wall => "Wall",
        ToolType::Door => "Door",
        ToolType::Floor => "Floor",
        ToolType::Roof => "Roof",
        ToolType::Stair => "Stair",
        ToolType::Measure => "Measure",
        ToolType::MeasurePath => "Measure Path",
        ToolType::MeasureAngle => "Measure Angle",
        ToolType::MeasureArea => "Measure Area",
        ToolType::Window => "Window",
        ToolType::Column => "Column",
        ToolType::Beam => "Beam",
        ToolType::Room => "Room",
        ToolType::Dimension => "Dimension",
        ToolType::Text => "Text",
        ToolType::Sketch => "Sketch",
        ToolType::Section => "Section",
        ToolType::Furniture => "Furniture",
        ToolType::Plumbing => "Plumbing",
        ToolType::Electrical => "Electrical",
        ToolType::Cabinet => "Cabinet",
        ToolType::Hvac => "HVAC",
        ToolType::FireSafety => "Fire Safety",
        ToolType::Accessibility => "Accessibility",
        ToolType::SpotElevation => "Spot Elevation",
    }
}
