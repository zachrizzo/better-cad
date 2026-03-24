//! Wall tool default properties panel.

use crate::widgets::labeled_drag_value;
use bcad_state::{AppState, Command};

/// Show wall default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut height = d.wall_height;
    if labeled_drag_value(ui, "Wall Height", &mut height, 0.05, 0.1..=20.0) {
        cmds.push(Command::SetDefaultWallHeight { height });
    }

    let mut thickness = d.wall_thickness;
    if labeled_drag_value(ui, "Wall Thickness", &mut thickness, 0.01, 0.05..=2.0) {
        cmds.push(Command::SetDefaultWallThickness { thickness });
    }

    cmds
}
