//! Door tool default properties panel.

use super::opening_family_types::{
    active_door_family_type, apply_door_family_to_defaults_commands,
    build_door_family_type_from_defaults, clear_active_door_family_type_if_needed,
    door_family_types, rename_family_type, updated_active_door_family_type_from_defaults,
};
use crate::widgets::labeled_drag_value;
use bcad_domain::Element;
use bcad_state::bim_defaults::{DoorHardwareType, DoorStyle, DoorSwing};
use bcad_state::{AppState, Command};

const DOOR_SWING_OPTIONS: &[(DoorSwing, &str)] = &[
    (DoorSwing::OutLeft, "Out Left"),
    (DoorSwing::OutRight, "Out Right"),
    (DoorSwing::InLeft, "In Left"),
    (DoorSwing::InRight, "In Right"),
];

const DOOR_HARDWARE_OPTIONS: &[(DoorHardwareType, &str)] = &[
    (DoorHardwareType::Lever, "Lever"),
    (DoorHardwareType::Knob, "Knob"),
    (DoorHardwareType::PullBar, "Pull Bar"),
    (DoorHardwareType::None, "None"),
];

const DOOR_STYLE_OPTIONS: &[(DoorStyle, &str)] = &[
    (DoorStyle::Flush, "Flush"),
    (DoorStyle::Panel, "Panel"),
    (DoorStyle::Double, "Double"),
];

/// Show door default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;
    let door_types = door_family_types(state);
    let active_type = active_door_family_type(state);
    let mut selected_type_id = active_type
        .as_ref()
        .map(|entry| entry.element.meta.id.clone());

    ui.horizontal(|ui| {
        ui.label("Reusable Type");
        egui::ComboBox::from_id_salt("door_family_type")
            .selected_text(
                active_type
                    .as_ref()
                    .map(|entry| entry.element.meta.name.as_str())
                    .unwrap_or("Custom"),
            )
            .show_ui(ui, |ui| {
                if ui
                    .selectable_value(&mut selected_type_id, None, "Custom")
                    .changed()
                {
                    cmds.push(Command::SetActiveDoorFamilyType { id: None });
                }
                for entry in &door_types {
                    let entry_id = Some(entry.element.meta.id.clone());
                    if ui
                        .selectable_value(
                            &mut selected_type_id,
                            entry_id,
                            entry.element.meta.name.as_str(),
                        )
                        .changed()
                    {
                        cmds.extend(apply_door_family_to_defaults_commands(entry));
                    }
                }
            });
    });

    if let Some(active_type) = active_type.as_ref() {
        let mut family_name = active_type.element.meta.name.clone();
        ui.horizontal(|ui| {
            ui.label("Type Name");
            if ui.text_edit_singleline(&mut family_name).changed()
                && family_name != active_type.element.meta.name
            {
                cmds.push(Command::UpdateElement {
                    id: active_type.element.meta.id.clone(),
                    element: Element::FamilyType(rename_family_type(
                        &active_type.element,
                        &family_name,
                    )),
                });
            }
        });
    }

    ui.horizontal(|ui| {
        if ui.button("Save New Type").clicked() {
            let family = build_door_family_type_from_defaults(state);
            let family_id = family.meta.id.clone();
            cmds.push(Command::CreateElement {
                element: Element::FamilyType(family),
            });
            cmds.push(Command::SetActiveDoorFamilyType {
                id: Some(family_id),
            });
        }

        if ui.button("Update Active Type").clicked() {
            if let Some(updated_family) = updated_active_door_family_type_from_defaults(state) {
                cmds.push(Command::UpdateElement {
                    id: updated_family.meta.id.clone(),
                    element: Element::FamilyType(updated_family),
                });
            }
        }
    });

    ui.separator();

    let mut width = d.door_width;
    if labeled_drag_value(ui, "Door Width", &mut width, 0.01, 0.3..=3.0) {
        clear_active_door_family_type_if_needed(state, &mut cmds);
        cmds.push(Command::SetDefaultDoorWidth { width });
    }

    let mut height = d.door_height;
    if labeled_drag_value(ui, "Door Height", &mut height, 0.01, 0.5..=4.0) {
        clear_active_door_family_type_if_needed(state, &mut cmds);
        cmds.push(Command::SetDefaultDoorHeight { height });
    }

    let mut sill = d.door_sill;
    if labeled_drag_value(ui, "Sill Height", &mut sill, 0.01, 0.0..=3.0) {
        clear_active_door_family_type_if_needed(state, &mut cmds);
        cmds.push(Command::SetDefaultDoorSill { sill });
    }

    let mut swing = d.door_swing;
    ui.horizontal(|ui| {
        ui.label("Swing");
        egui::ComboBox::from_id_salt("door_swing")
            .selected_text(door_swing_label(swing))
            .show_ui(ui, |ui| {
                for (value, label) in DOOR_SWING_OPTIONS {
                    if ui.selectable_value(&mut swing, *value, *label).changed() {
                        clear_active_door_family_type_if_needed(state, &mut cmds);
                        cmds.push(Command::SetDefaultDoorSwing { swing });
                    }
                }
            });
    });

    let mut hardware_type = d.door_hardware_type;
    ui.horizontal(|ui| {
        ui.label("Hardware");
        egui::ComboBox::from_id_salt("door_hardware")
            .selected_text(door_hardware_label(hardware_type))
            .show_ui(ui, |ui| {
                for (value, label) in DOOR_HARDWARE_OPTIONS {
                    if ui
                        .selectable_value(&mut hardware_type, *value, *label)
                        .changed()
                    {
                        clear_active_door_family_type_if_needed(state, &mut cmds);
                        cmds.push(Command::SetDefaultDoorHardwareType { hardware_type });
                    }
                }
            });
    });

    let mut style = d.door_style;
    ui.horizontal(|ui| {
        ui.label("Style");
        egui::ComboBox::from_id_salt("door_style")
            .selected_text(door_style_label(style))
            .show_ui(ui, |ui| {
                for (value, label) in DOOR_STYLE_OPTIONS {
                    if ui.selectable_value(&mut style, *value, *label).changed() {
                        clear_active_door_family_type_if_needed(state, &mut cmds);
                        cmds.push(Command::SetDefaultDoorStyle { style });
                    }
                }
            });
    });

    cmds
}

fn door_swing_label(swing: DoorSwing) -> &'static str {
    DOOR_SWING_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == swing).then_some(*label))
        .unwrap_or("Out Right")
}

fn door_hardware_label(hardware_type: DoorHardwareType) -> &'static str {
    DOOR_HARDWARE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == hardware_type).then_some(*label))
        .unwrap_or("Lever")
}

fn door_style_label(style: DoorStyle) -> &'static str {
    DOOR_STYLE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == style).then_some(*label))
        .unwrap_or("Flush")
}
