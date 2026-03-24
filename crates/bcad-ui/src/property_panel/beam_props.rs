//! Beam tool default properties panel.

use crate::widgets::labeled_drag_value;
use bcad_state::{AppState, Command};

/// Show beam default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut width = d.beam_width;
    if labeled_drag_value(ui, "Beam Width", &mut width, 0.01, 0.05..=5.0) {
        cmds.push(Command::SetDefaultBeamWidth { width });
    }

    let mut depth = d.beam_depth;
    if labeled_drag_value(ui, "Beam Depth", &mut depth, 0.01, 0.05..=5.0) {
        cmds.push(Command::SetDefaultBeamDepth { depth });
    }

    let mut elevation = d.beam_elevation;
    if labeled_drag_value(ui, "Beam Elevation", &mut elevation, 0.05, 0.0..=50.0) {
        cmds.push(Command::SetDefaultBeamElevation { elevation });
    }

    cmds
}
