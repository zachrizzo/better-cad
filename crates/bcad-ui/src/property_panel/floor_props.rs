//! Floor/Slab tool default properties panel.
//!
//! Also used for Foundation and Parking tools (they share the floor thickness default).

use crate::widgets::labeled_drag_value;
use bcad_state::{AppState, Command};

/// Show floor/slab default properties. `label_prefix` allows customisation
/// for Parking ("Parking") vs Floor ("Floor") vs Foundation ("Found").
pub fn show(ui: &mut egui::Ui, state: &AppState, label_prefix: &str) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut thickness = d.floor_thickness;
    let label = format!("{} Thickness", label_prefix);
    if labeled_drag_value(ui, &label, &mut thickness, 0.01, 0.01..=5.0) {
        cmds.push(Command::SetDefaultFloorThickness { thickness });
    }

    cmds
}
