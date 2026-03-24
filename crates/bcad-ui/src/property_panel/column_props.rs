//! Column tool default properties panel.

use crate::widgets::labeled_drag_value;
use bcad_state::{AppState, Command};

/// Show column default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut width = d.column_width;
    if labeled_drag_value(ui, "Col Width", &mut width, 0.01, 0.05..=5.0) {
        cmds.push(Command::SetDefaultColumnWidth { width });
    }

    let mut depth = d.column_depth;
    if labeled_drag_value(ui, "Col Depth", &mut depth, 0.01, 0.05..=5.0) {
        cmds.push(Command::SetDefaultColumnDepth { depth });
    }

    let mut height = d.column_height;
    if labeled_drag_value(ui, "Col Height", &mut height, 0.05, 0.1..=20.0) {
        cmds.push(Command::SetDefaultColumnHeight { height });
    }

    cmds
}
