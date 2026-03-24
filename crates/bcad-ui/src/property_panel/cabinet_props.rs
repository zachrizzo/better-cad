//! Cabinet tool default properties panel.

use crate::widgets::labeled_drag_value;
use bcad_state::bim_defaults::CabinetType;
use bcad_state::{AppState, Command};

/// Show cabinet default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    // Cabinet type dropdown
    let mut ctype = d.cabinet_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("cabinet_type")
            .selected_text(cabinet_label(ctype))
            .show_ui(ui, |ui| {
                for v in ALL_CABINET_TYPES {
                    if ui
                        .selectable_value(&mut ctype, *v, cabinet_label(*v))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultCabinetType {
                            cabinet_type: ctype,
                        });
                    }
                }
            });
    });

    // Door count (integer)
    let mut doors = d.cabinet_door_count as f64;
    if labeled_drag_value(ui, "Door Count", &mut doors, 1.0, 0.0..=10.0) {
        cmds.push(Command::SetDefaultCabinetDoorCount {
            count: doors as u32,
        });
    }

    // Drawer count (integer)
    let mut drawers = d.cabinet_drawer_count as f64;
    if labeled_drag_value(ui, "Drawer Count", &mut drawers, 1.0, 0.0..=10.0) {
        cmds.push(Command::SetDefaultCabinetDrawerCount {
            count: drawers as u32,
        });
    }

    cmds
}

const ALL_CABINET_TYPES: &[CabinetType] = &[
    CabinetType::Base,
    CabinetType::Upper,
    CabinetType::Tall,
    CabinetType::CornerBase,
    CabinetType::CornerUpper,
    CabinetType::CornerTall,
    CabinetType::SinkBase,
    CabinetType::LazySusan,
    CabinetType::BlindCorner,
    CabinetType::Pantry,
    CabinetType::DrawerBase,
    CabinetType::ApplianceGarage,
];

fn cabinet_label(ct: CabinetType) -> &'static str {
    match ct {
        CabinetType::Base => "Base",
        CabinetType::Upper => "Upper",
        CabinetType::Tall => "Tall",
        CabinetType::CornerBase => "Corner Base",
        CabinetType::CornerUpper => "Corner Upper",
        CabinetType::CornerTall => "Corner Tall",
        CabinetType::SinkBase => "Sink Base",
        CabinetType::LazySusan => "Lazy Susan",
        CabinetType::BlindCorner => "Blind Corner",
        CabinetType::Pantry => "Pantry",
        CabinetType::DrawerBase => "Drawer Base",
        CabinetType::ApplianceGarage => "Appliance Garage",
    }
}
