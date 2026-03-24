//! Stair tool default properties panel.

use crate::widgets::labeled_drag_value;
use bcad_state::bim_defaults::StairType;
use bcad_state::{AppState, Command};

/// Show stair default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    // Stair type dropdown
    let mut stair_type = d.stair_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("stair_type")
            .selected_text(match stair_type {
                StairType::Straight => "Straight",
                StairType::Spiral => "Spiral",
            })
            .show_ui(ui, |ui| {
                if ui
                    .selectable_value(&mut stair_type, StairType::Straight, "Straight")
                    .changed()
                    || ui
                        .selectable_value(&mut stair_type, StairType::Spiral, "Spiral")
                        .changed()
                {
                    cmds.push(Command::SetDefaultStairType { stair_type });
                }
            });
    });

    let mut width = d.stair_width;
    if labeled_drag_value(ui, "Stair Width", &mut width, 0.01, 0.3..=5.0) {
        cmds.push(Command::SetDefaultStairWidth { width });
    }

    let mut risers = d.stair_risers as f64;
    if labeled_drag_value(ui, "Risers", &mut risers, 1.0, 2.0..=64.0) {
        cmds.push(Command::SetDefaultStairRisers {
            risers: risers as u32,
        });
    }

    let mut height = d.stair_height;
    if labeled_drag_value(ui, "Stair Height", &mut height, 0.05, 0.5..=20.0) {
        cmds.push(Command::SetDefaultStairHeight { height });
    }

    // Spiral turns (only shown when spiral)
    if d.stair_type == StairType::Spiral {
        let mut turns = d.spiral_turns;
        if labeled_drag_value(ui, "Turns", &mut turns, 0.25, -5.0..=5.0) {
            cmds.push(Command::SetDefaultSpiralTurns { turns });
        }
    }

    let mut side_wall = d.stair_side_wall_thickness;
    if labeled_drag_value(ui, "Side Wall", &mut side_wall, 0.01, 0.0..=1.0) {
        cmds.push(Command::SetDefaultStairSideWallThickness {
            thickness: side_wall,
        });
    }

    cmds
}
