//! Window tool default properties panel.

use super::opening_family_types::{
    active_window_family_type, apply_window_family_to_defaults_commands,
    build_window_family_type_from_defaults, clear_active_window_family_type_if_needed,
    rename_family_type, updated_active_window_family_type_from_defaults, window_family_types,
};
use crate::widgets::labeled_drag_value;
use bcad_domain::Element;
use bcad_state::bim_defaults::{WindowHardwareType, WindowStyle};
use bcad_state::{AppState, Command};

const WINDOW_HARDWARE_OPTIONS: &[(WindowHardwareType, &str)] = &[
    (WindowHardwareType::Latch, "Latch"),
    (WindowHardwareType::Crank, "Crank"),
    (WindowHardwareType::None, "None"),
];

const WINDOW_STYLE_OPTIONS: &[(WindowStyle, &str)] = &[
    (WindowStyle::Picture, "Picture"),
    (WindowStyle::Casement, "Casement"),
    (WindowStyle::DoubleHung, "Double Hung"),
];

/// Show window default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;
    let window_types = window_family_types(state);
    let active_type = active_window_family_type(state);
    let mut selected_type_id = active_type
        .as_ref()
        .map(|entry| entry.element.meta.id.clone());

    ui.horizontal(|ui| {
        ui.label("Reusable Type");
        egui::ComboBox::from_id_salt("window_family_type")
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
                    cmds.push(Command::SetActiveWindowFamilyType { id: None });
                }
                for entry in &window_types {
                    let entry_id = Some(entry.element.meta.id.clone());
                    if ui
                        .selectable_value(
                            &mut selected_type_id,
                            entry_id,
                            entry.element.meta.name.as_str(),
                        )
                        .changed()
                    {
                        cmds.extend(apply_window_family_to_defaults_commands(entry));
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
            let family = build_window_family_type_from_defaults(state);
            let family_id = family.meta.id.clone();
            cmds.push(Command::CreateElement {
                element: Element::FamilyType(family),
            });
            cmds.push(Command::SetActiveWindowFamilyType {
                id: Some(family_id),
            });
        }

        if ui.button("Update Active Type").clicked() {
            if let Some(updated_family) = updated_active_window_family_type_from_defaults(state) {
                cmds.push(Command::UpdateElement {
                    id: updated_family.meta.id.clone(),
                    element: Element::FamilyType(updated_family),
                });
            }
        }
    });

    ui.separator();

    let mut width = d.window_width;
    if labeled_drag_value(ui, "Window Width", &mut width, 0.01, 0.3..=3.0) {
        clear_active_window_family_type_if_needed(state, &mut cmds);
        cmds.push(Command::SetDefaultWindowWidth { width });
    }

    let mut height = d.window_height;
    if labeled_drag_value(ui, "Window Height", &mut height, 0.01, 0.3..=3.0) {
        clear_active_window_family_type_if_needed(state, &mut cmds);
        cmds.push(Command::SetDefaultWindowHeight { height });
    }

    let mut sill = d.window_sill;
    if labeled_drag_value(ui, "Sill Height", &mut sill, 0.01, 0.0..=3.0) {
        clear_active_window_family_type_if_needed(state, &mut cmds);
        cmds.push(Command::SetDefaultWindowSill { sill });
    }

    let mut hardware_type = d.window_hardware_type;
    ui.horizontal(|ui| {
        ui.label("Hardware");
        egui::ComboBox::from_id_salt("window_hardware")
            .selected_text(window_hardware_label(hardware_type))
            .show_ui(ui, |ui| {
                for (value, label) in WINDOW_HARDWARE_OPTIONS {
                    if ui
                        .selectable_value(&mut hardware_type, *value, *label)
                        .changed()
                    {
                        clear_active_window_family_type_if_needed(state, &mut cmds);
                        cmds.push(Command::SetDefaultWindowHardwareType { hardware_type });
                    }
                }
            });
    });

    let mut style = d.window_style;
    ui.horizontal(|ui| {
        ui.label("Style");
        egui::ComboBox::from_id_salt("window_style")
            .selected_text(window_style_label(style))
            .show_ui(ui, |ui| {
                for (value, label) in WINDOW_STYLE_OPTIONS {
                    if ui.selectable_value(&mut style, *value, *label).changed() {
                        clear_active_window_family_type_if_needed(state, &mut cmds);
                        cmds.push(Command::SetDefaultWindowStyle { style });
                    }
                }
            });
    });

    cmds
}

fn window_hardware_label(hardware_type: WindowHardwareType) -> &'static str {
    WINDOW_HARDWARE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == hardware_type).then_some(*label))
        .unwrap_or("Latch")
}

fn window_style_label(style: WindowStyle) -> &'static str {
    WINDOW_STYLE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == style).then_some(*label))
        .unwrap_or("Picture")
}
