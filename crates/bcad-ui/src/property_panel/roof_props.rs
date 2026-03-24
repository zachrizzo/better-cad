//! Roof tool default properties panel.

use crate::widgets::labeled_drag_value;
use bcad_state::bim_defaults::RoofType;
use bcad_state::{AppState, Command};

/// Show roof default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    // Roof type dropdown
    let mut roof_type = d.roof_type;
    ui.horizontal(|ui| {
        ui.label("Roof Type");
        egui::ComboBox::from_id_salt("roof_type")
            .selected_text(roof_type_label(roof_type))
            .show_ui(ui, |ui| {
                for variant in ALL_ROOF_TYPES {
                    if ui
                        .selectable_value(&mut roof_type, *variant, roof_type_label(*variant))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultRoofType { roof_type });
                    }
                }
            });
    });

    // Auto-elevation toggle
    let mut auto_elev = d.roof_auto_elevation;
    if ui.checkbox(&mut auto_elev, "Auto Elevation").changed() {
        cmds.push(Command::SetDefaultRoofAutoElevation { enabled: auto_elev });
    }

    let mut thickness = d.roof_thickness;
    if labeled_drag_value(ui, "Roof Thickness", &mut thickness, 0.01, 0.01..=5.0) {
        cmds.push(Command::SetDefaultRoofThickness { thickness });
    }

    let mut elevation = d.roof_elevation;
    let elev_enabled = !d.roof_auto_elevation;
    ui.add_enabled_ui(elev_enabled, |ui| {
        if labeled_drag_value(ui, "Roof Elevation", &mut elevation, 0.05, 0.0..=50.0) {
            cmds.push(Command::SetDefaultRoofElevation { elevation });
        }
    });

    // Pitch degrees (disabled for flat roofs)
    let pitch_enabled = d.roof_type != RoofType::Flat;
    ui.add_enabled_ui(pitch_enabled, |ui| {
        let mut pitch = d.roof_pitch_degrees;
        if labeled_drag_value(ui, "Pitch (deg)", &mut pitch, 1.0, 0.0..=75.0) {
            cmds.push(Command::SetDefaultRoofPitchDegrees { degrees: pitch });
        }
    });

    // Ridge angle degrees (disabled for flat roofs)
    ui.add_enabled_ui(pitch_enabled, |ui| {
        let mut ridge = d.roof_ridge_angle_degrees;
        if labeled_drag_value(ui, "Ridge (deg)", &mut ridge, 1.0, 0.0..=360.0) {
            cmds.push(Command::SetDefaultRoofRidgeAngleDegrees { degrees: ridge });
        }
    });

    cmds
}

const ALL_ROOF_TYPES: &[RoofType] = &[
    RoofType::Flat,
    RoofType::Shed,
    RoofType::Gable,
    RoofType::Hip,
];

fn roof_type_label(rt: RoofType) -> &'static str {
    match rt {
        RoofType::Flat => "Flat",
        RoofType::Shed => "Shed",
        RoofType::Gable => "Gable",
        RoofType::Hip => "Hip",
    }
}
