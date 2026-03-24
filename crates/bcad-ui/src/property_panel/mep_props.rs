//! MEP (Mechanical/Electrical/Plumbing/Fire/Accessibility) default properties.
//!
//! Each MEP category shares the same pattern: type dropdown + rotation.

use crate::widgets::labeled_drag_value;
use bcad_state::bim_defaults::*;
use bcad_state::{AppState, Command};

// ---- Plumbing ----

pub fn show_plumbing(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut ptype = d.plumbing_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("plumbing_type")
            .selected_text(plumbing_label(ptype))
            .show_ui(ui, |ui| {
                for v in ALL_PLUMBING {
                    if ui
                        .selectable_value(&mut ptype, *v, plumbing_label(*v))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultPlumbingType {
                            plumbing_type: ptype,
                        });
                    }
                }
            });
    });

    let mut rot = d.plumbing_rotation;
    if labeled_drag_value(ui, "Rotation", &mut rot, 1.0, 0.0..=360.0) {
        cmds.push(Command::SetDefaultPlumbingRotation { rotation: rot });
    }

    cmds
}

// ---- Electrical ----

pub fn show_electrical(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut etype = d.electrical_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("electrical_type")
            .selected_text(electrical_label(etype))
            .show_ui(ui, |ui| {
                for v in ALL_ELECTRICAL {
                    if ui
                        .selectable_value(&mut etype, *v, electrical_label(*v))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultElectricalType {
                            electrical_type: etype,
                        });
                    }
                }
            });
    });

    let mut rot = d.electrical_rotation;
    if labeled_drag_value(ui, "Rotation", &mut rot, 1.0, 0.0..=360.0) {
        cmds.push(Command::SetDefaultElectricalRotation { rotation: rot });
    }

    cmds
}

// ---- HVAC ----

pub fn show_hvac(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut htype = d.hvac_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("hvac_type")
            .selected_text(hvac_label(htype))
            .show_ui(ui, |ui| {
                for v in ALL_HVAC {
                    if ui
                        .selectable_value(&mut htype, *v, hvac_label(*v))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultHvacType { hvac_type: htype });
                    }
                }
            });
    });

    let mut rot = d.hvac_rotation;
    if labeled_drag_value(ui, "Rotation", &mut rot, 1.0, 0.0..=360.0) {
        cmds.push(Command::SetDefaultHvacRotation { rotation: rot });
    }

    cmds
}

// ---- Fire Safety ----

pub fn show_fire_safety(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut ftype = d.fire_safety_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("fire_safety_type")
            .selected_text(fire_safety_label(ftype))
            .show_ui(ui, |ui| {
                for v in ALL_FIRE_SAFETY {
                    if ui
                        .selectable_value(&mut ftype, *v, fire_safety_label(*v))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultFireSafetyType {
                            fire_safety_type: ftype,
                        });
                    }
                }
            });
    });

    let mut rot = d.fire_safety_rotation;
    if labeled_drag_value(ui, "Rotation", &mut rot, 1.0, 0.0..=360.0) {
        cmds.push(Command::SetDefaultFireSafetyRotation { rotation: rot });
    }

    cmds
}

// ---- Accessibility ----

pub fn show_accessibility(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    let mut atype = d.accessibility_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("accessibility_type")
            .selected_text(accessibility_label(atype))
            .show_ui(ui, |ui| {
                for v in ALL_ACCESSIBILITY {
                    if ui
                        .selectable_value(&mut atype, *v, accessibility_label(*v))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultAccessibilityType {
                            accessibility_type: atype,
                        });
                    }
                }
            });
    });

    let mut rot = d.accessibility_rotation;
    if labeled_drag_value(ui, "Rotation", &mut rot, 1.0, 0.0..=360.0) {
        cmds.push(Command::SetDefaultAccessibilityRotation { rotation: rot });
    }

    cmds
}

// ---------------------------------------------------------------------------
// Enum variant tables and label helpers
// ---------------------------------------------------------------------------

const ALL_PLUMBING: &[PlumbingSymbolType] = &[
    PlumbingSymbolType::Toilet,
    PlumbingSymbolType::Sink,
    PlumbingSymbolType::Bathtub,
    PlumbingSymbolType::Shower,
    PlumbingSymbolType::WaterHeater,
    PlumbingSymbolType::HoseBib,
    PlumbingSymbolType::FloorDrain,
    PlumbingSymbolType::Dishwasher,
    PlumbingSymbolType::WashingMachine,
    PlumbingSymbolType::Urinal,
];

fn plumbing_label(p: PlumbingSymbolType) -> &'static str {
    match p {
        PlumbingSymbolType::Toilet => "Toilet",
        PlumbingSymbolType::Sink => "Sink",
        PlumbingSymbolType::Bathtub => "Bathtub",
        PlumbingSymbolType::Shower => "Shower",
        PlumbingSymbolType::WaterHeater => "Water Heater",
        PlumbingSymbolType::HoseBib => "Hose Bib",
        PlumbingSymbolType::FloorDrain => "Floor Drain",
        PlumbingSymbolType::Dishwasher => "Dishwasher",
        PlumbingSymbolType::WashingMachine => "Washing Machine",
        PlumbingSymbolType::Urinal => "Urinal",
    }
}

const ALL_ELECTRICAL: &[ElectricalSymbolType] = &[
    ElectricalSymbolType::Outlet,
    ElectricalSymbolType::Switch,
    ElectricalSymbolType::LightFixture,
    ElectricalSymbolType::Panel,
    ElectricalSymbolType::SmokeDetector,
    ElectricalSymbolType::JunctionBox,
    ElectricalSymbolType::ThreeWaySwitch,
    ElectricalSymbolType::DimmerSwitch,
    ElectricalSymbolType::GfciOutlet,
    ElectricalSymbolType::FloorOutlet,
    ElectricalSymbolType::CeilingFan,
    ElectricalSymbolType::Thermostat,
];

fn electrical_label(e: ElectricalSymbolType) -> &'static str {
    match e {
        ElectricalSymbolType::Outlet => "Outlet",
        ElectricalSymbolType::Switch => "Switch",
        ElectricalSymbolType::LightFixture => "Light Fixture",
        ElectricalSymbolType::Panel => "Panel",
        ElectricalSymbolType::SmokeDetector => "Smoke Detector",
        ElectricalSymbolType::JunctionBox => "Junction Box",
        ElectricalSymbolType::ThreeWaySwitch => "Three-Way Switch",
        ElectricalSymbolType::DimmerSwitch => "Dimmer Switch",
        ElectricalSymbolType::GfciOutlet => "GFCI Outlet",
        ElectricalSymbolType::FloorOutlet => "Floor Outlet",
        ElectricalSymbolType::CeilingFan => "Ceiling Fan",
        ElectricalSymbolType::Thermostat => "Thermostat",
    }
}

const ALL_HVAC: &[HvacSymbolType] = &[
    HvacSymbolType::SupplyVent,
    HvacSymbolType::ReturnVent,
    HvacSymbolType::Thermostat,
    HvacSymbolType::ExhaustFan,
    HvacSymbolType::Ductwork,
    HvacSymbolType::MiniSplit,
    HvacSymbolType::AirHandler,
    HvacSymbolType::CondensingUnit,
    HvacSymbolType::Damper,
    HvacSymbolType::Diffuser,
];

fn hvac_label(h: HvacSymbolType) -> &'static str {
    match h {
        HvacSymbolType::SupplyVent => "Supply Vent",
        HvacSymbolType::ReturnVent => "Return Vent",
        HvacSymbolType::Thermostat => "Thermostat",
        HvacSymbolType::ExhaustFan => "Exhaust Fan",
        HvacSymbolType::Ductwork => "Ductwork",
        HvacSymbolType::MiniSplit => "Mini Split",
        HvacSymbolType::AirHandler => "Air Handler",
        HvacSymbolType::CondensingUnit => "Condensing Unit",
        HvacSymbolType::Damper => "Damper",
        HvacSymbolType::Diffuser => "Diffuser",
    }
}

const ALL_FIRE_SAFETY: &[FireSafetySymbolType] = &[
    FireSafetySymbolType::FireExtinguisher,
    FireSafetySymbolType::SprinklerHead,
    FireSafetySymbolType::ExitSign,
    FireSafetySymbolType::PullStation,
    FireSafetySymbolType::SmokeAlarm,
    FireSafetySymbolType::FireAlarmPanel,
    FireSafetySymbolType::FireHoseCabinet,
    FireSafetySymbolType::Annunciator,
];

fn fire_safety_label(f: FireSafetySymbolType) -> &'static str {
    match f {
        FireSafetySymbolType::FireExtinguisher => "Fire Extinguisher",
        FireSafetySymbolType::SprinklerHead => "Sprinkler Head",
        FireSafetySymbolType::ExitSign => "Exit Sign",
        FireSafetySymbolType::PullStation => "Pull Station",
        FireSafetySymbolType::SmokeAlarm => "Smoke Alarm",
        FireSafetySymbolType::FireAlarmPanel => "Fire Alarm Panel",
        FireSafetySymbolType::FireHoseCabinet => "Fire Hose Cabinet",
        FireSafetySymbolType::Annunciator => "Annunciator",
    }
}

const ALL_ACCESSIBILITY: &[AccessibilitySymbolType] = &[
    AccessibilitySymbolType::Wheelchair,
    AccessibilitySymbolType::Ramp,
    AccessibilitySymbolType::GrabBar,
    AccessibilitySymbolType::AccessibleParking,
    AccessibilitySymbolType::TactileWarning,
    AccessibilitySymbolType::AdaRestroom,
    AccessibilitySymbolType::HearingLoop,
];

fn accessibility_label(a: AccessibilitySymbolType) -> &'static str {
    match a {
        AccessibilitySymbolType::Wheelchair => "Wheelchair",
        AccessibilitySymbolType::Ramp => "Ramp",
        AccessibilitySymbolType::GrabBar => "Grab Bar",
        AccessibilitySymbolType::AccessibleParking => "Accessible Parking",
        AccessibilitySymbolType::TactileWarning => "Tactile Warning",
        AccessibilitySymbolType::AdaRestroom => "ADA Restroom",
        AccessibilitySymbolType::HearingLoop => "Hearing Loop",
    }
}
