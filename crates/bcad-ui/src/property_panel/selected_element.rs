//! Property editor for a selected element.
//!
//! Displays element info (type, ID, name) and type-specific editable
//! properties. All changes return `Command::UpdateElement`.

use super::opening_family_types::{
    apply_door_family_to_element, apply_window_family_to_element,
    build_door_family_type_from_element, build_window_family_type_from_element, door_family_types,
    rename_family_type, updated_door_family_type_from_element,
    updated_window_family_type_from_element, window_family_types,
};
use crate::widgets::labeled_drag_value;
use bcad_domain::Element;
use bcad_state::{AppState, Command};

const DOOR_SWING_OPTIONS: &[(bcad_domain::DoorSwing, &str)] = &[
    (bcad_domain::DoorSwing::OutLeft, "Out Left"),
    (bcad_domain::DoorSwing::OutRight, "Out Right"),
    (bcad_domain::DoorSwing::InLeft, "In Left"),
    (bcad_domain::DoorSwing::InRight, "In Right"),
];

const DOOR_HARDWARE_OPTIONS: &[(bcad_domain::DoorHardwareType, &str)] = &[
    (bcad_domain::DoorHardwareType::Lever, "Lever"),
    (bcad_domain::DoorHardwareType::Knob, "Knob"),
    (bcad_domain::DoorHardwareType::PullBar, "Pull Bar"),
    (bcad_domain::DoorHardwareType::None, "None"),
];

const DOOR_STYLE_OPTIONS: &[(bcad_domain::DoorStyle, &str)] = &[
    (bcad_domain::DoorStyle::Flush, "Flush"),
    (bcad_domain::DoorStyle::Panel, "Panel"),
    (bcad_domain::DoorStyle::Double, "Double"),
];

const WINDOW_HARDWARE_OPTIONS: &[(bcad_domain::WindowHardwareType, &str)] = &[
    (bcad_domain::WindowHardwareType::Latch, "Latch"),
    (bcad_domain::WindowHardwareType::Crank, "Crank"),
    (bcad_domain::WindowHardwareType::None, "None"),
];

const WINDOW_STYLE_OPTIONS: &[(bcad_domain::WindowStyle, &str)] = &[
    (bcad_domain::WindowStyle::Picture, "Picture"),
    (bcad_domain::WindowStyle::Casement, "Casement"),
    (bcad_domain::WindowStyle::DoubleHung, "Double Hung"),
];

/// Show properties for the currently selected element.
/// Returns commands for any edits (UpdateElement, DeleteElement, etc.).
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();

    // Find the selected element
    let selected_id = match &state.ui.selected_body_id {
        Some(id) => id.clone(),
        None => return cmds,
    };

    let element = state
        .document
        .prototype
        .project
        .elements
        .iter()
        .find(|e| e.id() == selected_id);

    let element = match element {
        Some(e) => e.clone(),
        None => {
            ui.label("Selected element not found.");
            return cmds;
        }
    };

    ui.label(egui::RichText::new("Selected Element").strong().size(13.0));

    // Element info
    ui.label(format!("Kind: {}", element.kind_name()));
    ui.label(format!(
        "ID: {}",
        &element.id()[..8.min(element.id().len())]
    ));

    // Name (editable)
    let meta = element.meta();
    let mut name = meta.name.clone();
    ui.horizontal(|ui| {
        ui.label("Name");
        if ui.text_edit_singleline(&mut name).changed() {
            let mut updated = element.clone();
            update_meta_name(&mut updated, &name);
            cmds.push(Command::UpdateElement {
                id: selected_id.clone(),
                element: updated,
            });
        }
    });

    ui.separator();

    // Type-specific property editors
    match &element {
        Element::Wall(w) => {
            let mut height = w.height;
            if labeled_drag_value(ui, "Height", &mut height, 0.05, 0.1..=20.0) {
                let mut updated = element.clone();
                if let Element::Wall(ref mut ww) = updated {
                    ww.height = height;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut thickness = w.thickness;
            if labeled_drag_value(ui, "Thickness", &mut thickness, 0.01, 0.05..=2.0) {
                let mut updated = element.clone();
                if let Element::Wall(ref mut ww) = updated {
                    ww.thickness = thickness;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
        }
        Element::Door(d) => {
            let door_types = door_family_types(state);
            let current_type = d
                .meta
                .type_id
                .as_ref()
                .and_then(|type_id| {
                    door_types
                        .iter()
                        .find(|entry| entry.element.meta.id == type_id.as_ref())
                })
                .cloned();
            let mut selected_type_id = current_type
                .as_ref()
                .map(|entry| entry.element.meta.id.clone());

            ui.horizontal(|ui| {
                ui.label("Reusable Type");
                egui::ComboBox::from_id_salt("selected_door_type")
                    .selected_text(
                        current_type
                            .as_ref()
                            .map(|entry| entry.element.meta.name.as_str())
                            .unwrap_or("Custom"),
                    )
                    .show_ui(ui, |ui| {
                        if ui
                            .selectable_value(&mut selected_type_id, None, "Custom")
                            .changed()
                        {
                            let mut updated = element.clone();
                            if let Element::Door(ref mut dd) = updated {
                                dd.meta.type_id = None;
                            }
                            cmds.push(Command::UpdateElement {
                                id: selected_id.clone(),
                                element: updated,
                            });
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
                                let mut updated = element.clone();
                                if let Element::Door(ref mut dd) = updated {
                                    apply_door_family_to_element(dd, entry);
                                }
                                cmds.push(Command::UpdateElement {
                                    id: selected_id.clone(),
                                    element: updated,
                                });
                            }
                        }
                    });
            });

            if let Some(current_type) = current_type.as_ref() {
                let mut family_name = current_type.element.meta.name.clone();
                ui.horizontal(|ui| {
                    ui.label("Type Name");
                    if ui.text_edit_singleline(&mut family_name).changed()
                        && family_name != current_type.element.meta.name
                    {
                        cmds.push(Command::UpdateElement {
                            id: current_type.element.meta.id.clone(),
                            element: Element::FamilyType(rename_family_type(
                                &current_type.element,
                                &family_name,
                            )),
                        });
                    }
                });
            }

            ui.horizontal(|ui| {
                if ui.button("Save as New Type").clicked() {
                    let family = build_door_family_type_from_element(state, d);
                    let family_id = family.meta.id.clone();
                    let mut updated = element.clone();
                    if let Element::Door(ref mut dd) = updated {
                        dd.meta.type_id = Some(bcad_domain::TypeRef::from(family_id.clone()));
                    }
                    cmds.push(Command::CreateElement {
                        element: Element::FamilyType(family),
                    });
                    cmds.push(Command::UpdateElement {
                        id: selected_id.clone(),
                        element: updated,
                    });
                    cmds.push(Command::SetActiveDoorFamilyType {
                        id: Some(family_id),
                    });
                }

                if ui.button("Update Type").clicked() {
                    if let Some(current_type) = current_type.as_ref() {
                        let updated_family =
                            updated_door_family_type_from_element(&current_type.element, d);
                        cmds.push(Command::UpdateElement {
                            id: updated_family.meta.id.clone(),
                            element: Element::FamilyType(updated_family),
                        });
                        cmds.push(Command::SetActiveDoorFamilyType {
                            id: Some(current_type.element.meta.id.clone()),
                        });
                    }
                }
            });

            ui.separator();

            let mut width = d.width;
            if labeled_drag_value(ui, "Width", &mut width, 0.01, 0.3..=3.0) {
                let mut updated = element.clone();
                if let Element::Door(ref mut dd) = updated {
                    dd.width = width;
                    dd.meta.type_id = None;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut height = d.height;
            if labeled_drag_value(ui, "Height", &mut height, 0.01, 0.5..=4.0) {
                let mut updated = element.clone();
                if let Element::Door(ref mut dd) = updated {
                    dd.height = height;
                    dd.meta.type_id = None;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut sill = d.sill_height;
            if labeled_drag_value(ui, "Sill Height", &mut sill, 0.01, 0.0..=3.0) {
                let mut updated = element.clone();
                if let Element::Door(ref mut dd) = updated {
                    dd.sill_height = sill;
                    dd.meta.type_id = None;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut swing = d.swing;
            ui.horizontal(|ui| {
                ui.label("Swing");
                egui::ComboBox::from_id_salt("selected_door_swing")
                    .selected_text(door_swing_label(swing))
                    .show_ui(ui, |ui| {
                        for (value, label) in DOOR_SWING_OPTIONS {
                            if ui.selectable_value(&mut swing, *value, *label).changed() {
                                let mut updated = element.clone();
                                if let Element::Door(ref mut dd) = updated {
                                    dd.swing = swing;
                                    dd.meta.type_id = None;
                                }
                                cmds.push(Command::UpdateElement {
                                    id: selected_id.clone(),
                                    element: updated,
                                });
                            }
                        }
                    });
            });

            let mut hardware_type = d.hardware_type;
            ui.horizontal(|ui| {
                ui.label("Hardware");
                egui::ComboBox::from_id_salt("selected_door_hardware")
                    .selected_text(door_hardware_label(hardware_type))
                    .show_ui(ui, |ui| {
                        for (value, label) in DOOR_HARDWARE_OPTIONS {
                            if ui
                                .selectable_value(&mut hardware_type, *value, *label)
                                .changed()
                            {
                                let mut updated = element.clone();
                                if let Element::Door(ref mut dd) = updated {
                                    dd.hardware_type = hardware_type;
                                    dd.meta.type_id = None;
                                }
                                cmds.push(Command::UpdateElement {
                                    id: selected_id.clone(),
                                    element: updated,
                                });
                            }
                        }
                    });
            });

            let mut style = d.style;
            ui.horizontal(|ui| {
                ui.label("Style");
                egui::ComboBox::from_id_salt("selected_door_style")
                    .selected_text(door_style_label(style))
                    .show_ui(ui, |ui| {
                        for (value, label) in DOOR_STYLE_OPTIONS {
                            if ui.selectable_value(&mut style, *value, *label).changed() {
                                let mut updated = element.clone();
                                if let Element::Door(ref mut dd) = updated {
                                    dd.style = style;
                                    dd.meta.type_id = None;
                                }
                                cmds.push(Command::UpdateElement {
                                    id: selected_id.clone(),
                                    element: updated,
                                });
                            }
                        }
                    });
            });
        }
        Element::Window(w) => {
            let window_types = window_family_types(state);
            let current_type = w
                .meta
                .type_id
                .as_ref()
                .and_then(|type_id| {
                    window_types
                        .iter()
                        .find(|entry| entry.element.meta.id == type_id.as_ref())
                })
                .cloned();
            let mut selected_type_id = current_type
                .as_ref()
                .map(|entry| entry.element.meta.id.clone());

            ui.horizontal(|ui| {
                ui.label("Reusable Type");
                egui::ComboBox::from_id_salt("selected_window_type")
                    .selected_text(
                        current_type
                            .as_ref()
                            .map(|entry| entry.element.meta.name.as_str())
                            .unwrap_or("Custom"),
                    )
                    .show_ui(ui, |ui| {
                        if ui
                            .selectable_value(&mut selected_type_id, None, "Custom")
                            .changed()
                        {
                            let mut updated = element.clone();
                            if let Element::Window(ref mut ww) = updated {
                                ww.meta.type_id = None;
                            }
                            cmds.push(Command::UpdateElement {
                                id: selected_id.clone(),
                                element: updated,
                            });
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
                                let mut updated = element.clone();
                                if let Element::Window(ref mut ww) = updated {
                                    apply_window_family_to_element(ww, entry);
                                }
                                cmds.push(Command::UpdateElement {
                                    id: selected_id.clone(),
                                    element: updated,
                                });
                            }
                        }
                    });
            });

            if let Some(current_type) = current_type.as_ref() {
                let mut family_name = current_type.element.meta.name.clone();
                ui.horizontal(|ui| {
                    ui.label("Type Name");
                    if ui.text_edit_singleline(&mut family_name).changed()
                        && family_name != current_type.element.meta.name
                    {
                        cmds.push(Command::UpdateElement {
                            id: current_type.element.meta.id.clone(),
                            element: Element::FamilyType(rename_family_type(
                                &current_type.element,
                                &family_name,
                            )),
                        });
                    }
                });
            }

            ui.horizontal(|ui| {
                if ui.button("Save as New Type").clicked() {
                    let family = build_window_family_type_from_element(state, w);
                    let family_id = family.meta.id.clone();
                    let mut updated = element.clone();
                    if let Element::Window(ref mut ww) = updated {
                        ww.meta.type_id = Some(bcad_domain::TypeRef::from(family_id.clone()));
                    }
                    cmds.push(Command::CreateElement {
                        element: Element::FamilyType(family),
                    });
                    cmds.push(Command::UpdateElement {
                        id: selected_id.clone(),
                        element: updated,
                    });
                    cmds.push(Command::SetActiveWindowFamilyType {
                        id: Some(family_id),
                    });
                }

                if ui.button("Update Type").clicked() {
                    if let Some(current_type) = current_type.as_ref() {
                        let updated_family =
                            updated_window_family_type_from_element(&current_type.element, w);
                        cmds.push(Command::UpdateElement {
                            id: updated_family.meta.id.clone(),
                            element: Element::FamilyType(updated_family),
                        });
                        cmds.push(Command::SetActiveWindowFamilyType {
                            id: Some(current_type.element.meta.id.clone()),
                        });
                    }
                }
            });

            ui.separator();

            let mut width = w.width;
            if labeled_drag_value(ui, "Width", &mut width, 0.01, 0.3..=3.0) {
                let mut updated = element.clone();
                if let Element::Window(ref mut ww) = updated {
                    ww.width = width;
                    ww.meta.type_id = None;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut height = w.height;
            if labeled_drag_value(ui, "Height", &mut height, 0.01, 0.3..=3.0) {
                let mut updated = element.clone();
                if let Element::Window(ref mut ww) = updated {
                    ww.height = height;
                    ww.meta.type_id = None;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut sill = w.sill_height;
            if labeled_drag_value(ui, "Sill Height", &mut sill, 0.01, 0.0..=3.0) {
                let mut updated = element.clone();
                if let Element::Window(ref mut ww) = updated {
                    ww.sill_height = sill;
                    ww.meta.type_id = None;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }

            let mut hardware_type = w.hardware_type;
            ui.horizontal(|ui| {
                ui.label("Hardware");
                egui::ComboBox::from_id_salt("selected_window_hardware")
                    .selected_text(window_hardware_label(hardware_type))
                    .show_ui(ui, |ui| {
                        for (value, label) in WINDOW_HARDWARE_OPTIONS {
                            if ui
                                .selectable_value(&mut hardware_type, *value, *label)
                                .changed()
                            {
                                let mut updated = element.clone();
                                if let Element::Window(ref mut ww) = updated {
                                    ww.hardware_type = hardware_type;
                                    ww.meta.type_id = None;
                                }
                                cmds.push(Command::UpdateElement {
                                    id: selected_id.clone(),
                                    element: updated,
                                });
                            }
                        }
                    });
            });

            let mut style = w.style;
            ui.horizontal(|ui| {
                ui.label("Style");
                egui::ComboBox::from_id_salt("selected_window_style")
                    .selected_text(window_style_label(style))
                    .show_ui(ui, |ui| {
                        for (value, label) in WINDOW_STYLE_OPTIONS {
                            if ui.selectable_value(&mut style, *value, *label).changed() {
                                let mut updated = element.clone();
                                if let Element::Window(ref mut ww) = updated {
                                    ww.style = style;
                                    ww.meta.type_id = None;
                                }
                                cmds.push(Command::UpdateElement {
                                    id: selected_id.clone(),
                                    element: updated,
                                });
                            }
                        }
                    });
            });
        }
        Element::Floor(f) => {
            let mut thickness = f.thickness;
            if labeled_drag_value(ui, "Thickness", &mut thickness, 0.01, 0.01..=5.0) {
                let mut updated = element.clone();
                if let Element::Floor(ref mut ff) = updated {
                    ff.thickness = thickness;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
        }
        Element::Column(c) => {
            let mut width = c.width;
            if labeled_drag_value(ui, "Width", &mut width, 0.01, 0.05..=5.0) {
                let mut updated = element.clone();
                if let Element::Column(ref mut cc) = updated {
                    cc.width = width;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut depth = c.depth;
            if labeled_drag_value(ui, "Depth", &mut depth, 0.01, 0.05..=5.0) {
                let mut updated = element.clone();
                if let Element::Column(ref mut cc) = updated {
                    cc.depth = depth;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut height = c.height;
            if labeled_drag_value(ui, "Height", &mut height, 0.05, 0.1..=20.0) {
                let mut updated = element.clone();
                if let Element::Column(ref mut cc) = updated {
                    cc.height = height;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
        }
        Element::Beam(b) => {
            let mut width = b.width;
            if labeled_drag_value(ui, "Width", &mut width, 0.01, 0.05..=5.0) {
                let mut updated = element.clone();
                if let Element::Beam(ref mut bb) = updated {
                    bb.width = width;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut depth = b.depth;
            if labeled_drag_value(ui, "Depth", &mut depth, 0.01, 0.05..=5.0) {
                let mut updated = element.clone();
                if let Element::Beam(ref mut bb) = updated {
                    bb.depth = depth;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
        }
        Element::Stair(s) => {
            let mut width = s.width;
            if labeled_drag_value(ui, "Width", &mut width, 0.01, 0.3..=5.0) {
                let mut updated = element.clone();
                if let Element::Stair(ref mut ss) = updated {
                    ss.width = width;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut risers = s.risers as f64;
            if labeled_drag_value(ui, "Risers", &mut risers, 1.0, 2.0..=64.0) {
                let mut updated = element.clone();
                if let Element::Stair(ref mut ss) = updated {
                    ss.risers = risers as u32;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut height = s.total_height;
            if labeled_drag_value(ui, "Height", &mut height, 0.05, 0.5..=20.0) {
                let mut updated = element.clone();
                if let Element::Stair(ref mut ss) = updated {
                    ss.total_height = height;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
        }
        Element::Roof(r) => {
            let mut thickness = r.thickness;
            if labeled_drag_value(ui, "Thickness", &mut thickness, 0.01, 0.01..=5.0) {
                let mut updated = element.clone();
                if let Element::Roof(ref mut rr) = updated {
                    rr.thickness = thickness;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut elevation = r.elevation;
            if labeled_drag_value(ui, "Elevation", &mut elevation, 0.05, 0.0..=50.0) {
                let mut updated = element.clone();
                if let Element::Roof(ref mut rr) = updated {
                    rr.elevation = elevation;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut pitch = r.pitch_degrees;
            if labeled_drag_value(ui, "Pitch (deg)", &mut pitch, 1.0, 0.0..=75.0) {
                let mut updated = element.clone();
                if let Element::Roof(ref mut rr) = updated {
                    rr.pitch_degrees = pitch;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
            let mut ridge = r.ridge_angle_degrees;
            if labeled_drag_value(ui, "Ridge (deg)", &mut ridge, 1.0, 0.0..=360.0) {
                let mut updated = element.clone();
                if let Element::Roof(ref mut rr) = updated {
                    rr.ridge_angle_degrees = ridge;
                }
                cmds.push(Command::UpdateElement {
                    id: selected_id.clone(),
                    element: updated,
                });
            }
        }
        _ => {
            ui.label("No editable properties for this element type.");
        }
    }

    // Material assignment dropdown
    if element.is_physical() {
        ui.separator();
        let current_material_id = element.meta().material_id.as_ref().map(|m| m.0.as_str());
        let mut selected_mat = current_material_id.unwrap_or("").to_string();

        ui.horizontal(|ui| {
            ui.label("Material");
            egui::ComboBox::from_id_salt("element_material")
                .selected_text(
                    state
                        .materials
                        .materials
                        .get(&selected_mat)
                        .map(|m| m.name.as_str())
                        .unwrap_or("(none)"),
                )
                .show_ui(ui, |ui| {
                    if ui
                        .selectable_value(&mut selected_mat, String::new(), "(none)")
                        .changed()
                    {
                        let mut updated = element.clone();
                        set_meta_material(&mut updated, None);
                        cmds.push(Command::UpdateElement {
                            id: selected_id.clone(),
                            element: updated,
                        });
                    }
                    for (mid, mat) in &state.materials.materials {
                        if ui
                            .selectable_value(&mut selected_mat, mid.clone(), &mat.name)
                            .changed()
                        {
                            let mut updated = element.clone();
                            set_meta_material(&mut updated, Some(selected_mat.clone()));
                            cmds.push(Command::UpdateElement {
                                id: selected_id.clone(),
                                element: updated,
                            });
                        }
                    }
                });
        });
    }

    // Level assignment dropdown
    if !state.levels.levels.is_empty() {
        let current_level = element.meta().level_id.as_ref().map(|l| l.0.as_str());
        let mut selected_level = current_level.unwrap_or("").to_string();

        ui.horizontal(|ui| {
            ui.label("Level");
            egui::ComboBox::from_id_salt("element_level")
                .selected_text(
                    state
                        .levels
                        .levels
                        .iter()
                        .find(|l| l.id == selected_level)
                        .map(|l| l.name.as_str())
                        .unwrap_or("(none)"),
                )
                .show_ui(ui, |ui| {
                    if ui
                        .selectable_value(&mut selected_level, String::new(), "(none)")
                        .changed()
                    {
                        let mut updated = element.clone();
                        set_meta_level(&mut updated, None);
                        cmds.push(Command::UpdateElement {
                            id: selected_id.clone(),
                            element: updated,
                        });
                    }
                    for level in &state.levels.levels {
                        let label = format!("{} ({:.2}m)", level.name, level.elevation);
                        if ui
                            .selectable_value(&mut selected_level, level.id.clone(), label)
                            .changed()
                        {
                            let mut updated = element.clone();
                            set_meta_level(&mut updated, Some(selected_level.clone()));
                            cmds.push(Command::UpdateElement {
                                id: selected_id.clone(),
                                element: updated,
                            });
                        }
                    }
                });
        });
    }

    // Delete button
    ui.separator();
    if ui
        .button(egui::RichText::new("Delete Element").color(egui::Color32::from_rgb(220, 50, 50)))
        .clicked()
    {
        cmds.push(Command::DeleteElement { id: selected_id });
    }

    cmds
}

// ---------------------------------------------------------------------------
// Helpers to mutate meta fields on a cloned Element
// ---------------------------------------------------------------------------

fn update_meta_name(element: &mut Element, name: &str) {
    match element {
        Element::Site(e) => e.meta.name = name.to_string(),
        Element::Level(e) => e.meta.name = name.to_string(),
        Element::Grid(e) => e.meta.name = name.to_string(),
        Element::Wall(e) => e.meta.name = name.to_string(),
        Element::Floor(e) => e.meta.name = name.to_string(),
        Element::Roof(e) => e.meta.name = name.to_string(),
        Element::Foundation(e) => e.meta.name = name.to_string(),
        Element::Column(e) => e.meta.name = name.to_string(),
        Element::Beam(e) => e.meta.name = name.to_string(),
        Element::Door(e) => e.meta.name = name.to_string(),
        Element::Window(e) => e.meta.name = name.to_string(),
        Element::Stair(e) => e.meta.name = name.to_string(),
        Element::Room(e) => e.meta.name = name.to_string(),
        Element::View(e) => e.meta.name = name.to_string(),
        Element::Sheet(e) => e.meta.name = name.to_string(),
        Element::Material(e) => e.meta.name = name.to_string(),
        Element::FamilyType(e) => e.meta.name = name.to_string(),
        Element::Generic(e) => e.meta.name = name.to_string(),
        Element::Electrical(e) => e.meta.name = name.to_string(),
        Element::Plumbing(e) => e.meta.name = name.to_string(),
        Element::Furniture(e) => e.meta.name = name.to_string(),
        Element::SiteDetail(e) => e.meta.name = name.to_string(),
        Element::LeaderAnnotation(e) => e.meta.name = name.to_string(),
        Element::Keynote(e) => e.meta.name = name.to_string(),
        Element::Tag(e) => e.meta.name = name.to_string(),
        Element::Hvac(e) => e.meta.name = name.to_string(),
        Element::FireSafety(e) => e.meta.name = name.to_string(),
        Element::Accessibility(e) => e.meta.name = name.to_string(),
        Element::Cabinet(e) => e.meta.name = name.to_string(),
    }
}

fn set_meta_material(element: &mut Element, material_id: Option<String>) {
    let mat_ref = material_id.map(bcad_domain::MaterialRef);
    match element {
        Element::Site(e) => e.meta.material_id = mat_ref,
        Element::Level(e) => e.meta.material_id = mat_ref,
        Element::Grid(e) => e.meta.material_id = mat_ref,
        Element::Wall(e) => e.meta.material_id = mat_ref,
        Element::Floor(e) => e.meta.material_id = mat_ref,
        Element::Roof(e) => e.meta.material_id = mat_ref,
        Element::Foundation(e) => e.meta.material_id = mat_ref,
        Element::Column(e) => e.meta.material_id = mat_ref,
        Element::Beam(e) => e.meta.material_id = mat_ref,
        Element::Door(e) => e.meta.material_id = mat_ref,
        Element::Window(e) => e.meta.material_id = mat_ref,
        Element::Stair(e) => e.meta.material_id = mat_ref,
        Element::Room(e) => e.meta.material_id = mat_ref,
        Element::View(e) => e.meta.material_id = mat_ref,
        Element::Sheet(e) => e.meta.material_id = mat_ref,
        Element::Material(e) => e.meta.material_id = mat_ref,
        Element::FamilyType(e) => e.meta.material_id = mat_ref,
        Element::Generic(e) => e.meta.material_id = mat_ref,
        Element::Electrical(e) => e.meta.material_id = mat_ref,
        Element::Plumbing(e) => e.meta.material_id = mat_ref,
        Element::Furniture(e) => e.meta.material_id = mat_ref,
        Element::SiteDetail(e) => e.meta.material_id = mat_ref,
        Element::LeaderAnnotation(e) => e.meta.material_id = mat_ref,
        Element::Keynote(e) => e.meta.material_id = mat_ref,
        Element::Tag(e) => e.meta.material_id = mat_ref,
        Element::Hvac(e) => e.meta.material_id = mat_ref,
        Element::FireSafety(e) => e.meta.material_id = mat_ref,
        Element::Accessibility(e) => e.meta.material_id = mat_ref,
        Element::Cabinet(e) => e.meta.material_id = mat_ref,
    }
}

fn set_meta_level(element: &mut Element, level_id: Option<String>) {
    let level_ref = level_id.map(bcad_domain::LevelRef);
    match element {
        Element::Site(e) => e.meta.level_id = level_ref,
        Element::Level(e) => e.meta.level_id = level_ref,
        Element::Grid(e) => e.meta.level_id = level_ref,
        Element::Wall(e) => e.meta.level_id = level_ref,
        Element::Floor(e) => e.meta.level_id = level_ref,
        Element::Roof(e) => e.meta.level_id = level_ref,
        Element::Foundation(e) => e.meta.level_id = level_ref,
        Element::Column(e) => e.meta.level_id = level_ref,
        Element::Beam(e) => e.meta.level_id = level_ref,
        Element::Door(e) => e.meta.level_id = level_ref,
        Element::Window(e) => e.meta.level_id = level_ref,
        Element::Stair(e) => e.meta.level_id = level_ref,
        Element::Room(e) => e.meta.level_id = level_ref,
        Element::View(e) => e.meta.level_id = level_ref,
        Element::Sheet(e) => e.meta.level_id = level_ref,
        Element::Material(e) => e.meta.level_id = level_ref,
        Element::FamilyType(e) => e.meta.level_id = level_ref,
        Element::Generic(e) => e.meta.level_id = level_ref,
        Element::Electrical(e) => e.meta.level_id = level_ref,
        Element::Plumbing(e) => e.meta.level_id = level_ref,
        Element::Furniture(e) => e.meta.level_id = level_ref,
        Element::SiteDetail(e) => e.meta.level_id = level_ref,
        Element::LeaderAnnotation(e) => e.meta.level_id = level_ref,
        Element::Keynote(e) => e.meta.level_id = level_ref,
        Element::Tag(e) => e.meta.level_id = level_ref,
        Element::Hvac(e) => e.meta.level_id = level_ref,
        Element::FireSafety(e) => e.meta.level_id = level_ref,
        Element::Accessibility(e) => e.meta.level_id = level_ref,
        Element::Cabinet(e) => e.meta.level_id = level_ref,
    }
}

fn door_swing_label(swing: bcad_domain::DoorSwing) -> &'static str {
    DOOR_SWING_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == swing).then_some(*label))
        .unwrap_or("Out Right")
}

fn door_hardware_label(hardware_type: bcad_domain::DoorHardwareType) -> &'static str {
    DOOR_HARDWARE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == hardware_type).then_some(*label))
        .unwrap_or("Lever")
}

fn door_style_label(style: bcad_domain::DoorStyle) -> &'static str {
    DOOR_STYLE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == style).then_some(*label))
        .unwrap_or("Flush")
}

fn window_hardware_label(hardware_type: bcad_domain::WindowHardwareType) -> &'static str {
    WINDOW_HARDWARE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == hardware_type).then_some(*label))
        .unwrap_or("Latch")
}

fn window_style_label(style: bcad_domain::WindowStyle) -> &'static str {
    WINDOW_STYLE_OPTIONS
        .iter()
        .find_map(|(value, label)| (*value == style).then_some(*label))
        .unwrap_or("Picture")
}
