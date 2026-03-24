use std::collections::BTreeMap;

use bcad_domain::{
    DoorElement, DoorHardwareType, DoorStyle, DoorSwing, Element, ElementMeta, FamilyTypeElement,
    TypeRef, WindowElement, WindowHardwareType, WindowStyle,
};
use bcad_state::{AppState, Command};
use serde::{Deserialize, Serialize};

const DOOR_FAMILY_CATEGORY: &str = "door";
const WINDOW_FAMILY_CATEGORY: &str = "window";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoorFamilyDefinition {
    pub width: f64,
    pub height: f64,
    pub sill_height: f64,
    pub swing: DoorSwing,
    pub hardware_type: DoorHardwareType,
    pub style: DoorStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowFamilyDefinition {
    pub width: f64,
    pub height: f64,
    pub sill_height: f64,
    pub hardware_type: WindowHardwareType,
    pub style: WindowStyle,
}

#[derive(Debug, Clone)]
pub struct DoorFamilyTypeEntry {
    pub element: FamilyTypeElement,
    pub definition: DoorFamilyDefinition,
}

#[derive(Debug, Clone)]
pub struct WindowFamilyTypeEntry {
    pub element: FamilyTypeElement,
    pub definition: WindowFamilyDefinition,
}

impl DoorFamilyDefinition {
    pub fn from_defaults(state: &AppState) -> Self {
        let d = &state.bim_defaults;
        Self {
            width: d.door_width,
            height: d.door_height,
            sill_height: d.door_sill,
            swing: state_door_swing_to_domain(d.door_swing),
            hardware_type: state_door_hardware_to_domain(d.door_hardware_type),
            style: state_door_style_to_domain(d.door_style),
        }
    }

    pub fn from_element(door: &DoorElement) -> Self {
        Self {
            width: door.width,
            height: door.height,
            sill_height: door.sill_height,
            swing: door.swing,
            hardware_type: door.hardware_type,
            style: door.style,
        }
    }
}

impl WindowFamilyDefinition {
    pub fn from_defaults(state: &AppState) -> Self {
        let d = &state.bim_defaults;
        Self {
            width: d.window_width,
            height: d.window_height,
            sill_height: d.window_sill,
            hardware_type: state_window_hardware_to_domain(d.window_hardware_type),
            style: state_window_style_to_domain(d.window_style),
        }
    }

    pub fn from_element(window: &WindowElement) -> Self {
        Self {
            width: window.width,
            height: window.height,
            sill_height: window.sill_height,
            hardware_type: window.hardware_type,
            style: window.style,
        }
    }
}

pub fn door_family_types(state: &AppState) -> Vec<DoorFamilyTypeEntry> {
    let mut entries: Vec<_> = state
        .document
        .prototype
        .project
        .elements
        .iter()
        .filter_map(|element| match element {
            Element::FamilyType(family) if family.category == DOOR_FAMILY_CATEGORY => {
                deserialize_family_definition::<DoorFamilyDefinition>(family).map(|definition| {
                    DoorFamilyTypeEntry {
                        element: family.clone(),
                        definition,
                    }
                })
            }
            _ => None,
        })
        .collect();
    entries.sort_by(|a, b| a.element.meta.name.cmp(&b.element.meta.name));
    entries
}

pub fn window_family_types(state: &AppState) -> Vec<WindowFamilyTypeEntry> {
    let mut entries: Vec<_> = state
        .document
        .prototype
        .project
        .elements
        .iter()
        .filter_map(|element| match element {
            Element::FamilyType(family) if family.category == WINDOW_FAMILY_CATEGORY => {
                deserialize_family_definition::<WindowFamilyDefinition>(family).map(|definition| {
                    WindowFamilyTypeEntry {
                        element: family.clone(),
                        definition,
                    }
                })
            }
            _ => None,
        })
        .collect();
    entries.sort_by(|a, b| a.element.meta.name.cmp(&b.element.meta.name));
    entries
}

pub fn active_door_family_type(state: &AppState) -> Option<DoorFamilyTypeEntry> {
    let active_id = state.ui.active_door_family_type_id.as_deref()?;
    door_family_types(state)
        .into_iter()
        .find(|entry| entry.element.meta.id == active_id)
}

pub fn active_window_family_type(state: &AppState) -> Option<WindowFamilyTypeEntry> {
    let active_id = state.ui.active_window_family_type_id.as_deref()?;
    window_family_types(state)
        .into_iter()
        .find(|entry| entry.element.meta.id == active_id)
}

pub fn apply_door_family_to_defaults_commands(entry: &DoorFamilyTypeEntry) -> Vec<Command> {
    vec![
        Command::SetActiveDoorFamilyType {
            id: Some(entry.element.meta.id.clone()),
        },
        Command::SetDefaultDoorWidth {
            width: entry.definition.width,
        },
        Command::SetDefaultDoorHeight {
            height: entry.definition.height,
        },
        Command::SetDefaultDoorSill {
            sill: entry.definition.sill_height,
        },
        Command::SetDefaultDoorSwing {
            swing: domain_door_swing_to_state(entry.definition.swing),
        },
        Command::SetDefaultDoorHardwareType {
            hardware_type: domain_door_hardware_to_state(entry.definition.hardware_type),
        },
        Command::SetDefaultDoorStyle {
            style: domain_door_style_to_state(entry.definition.style),
        },
    ]
}

pub fn apply_window_family_to_defaults_commands(entry: &WindowFamilyTypeEntry) -> Vec<Command> {
    vec![
        Command::SetActiveWindowFamilyType {
            id: Some(entry.element.meta.id.clone()),
        },
        Command::SetDefaultWindowWidth {
            width: entry.definition.width,
        },
        Command::SetDefaultWindowHeight {
            height: entry.definition.height,
        },
        Command::SetDefaultWindowSill {
            sill: entry.definition.sill_height,
        },
        Command::SetDefaultWindowHardwareType {
            hardware_type: domain_window_hardware_to_state(entry.definition.hardware_type),
        },
        Command::SetDefaultWindowStyle {
            style: domain_window_style_to_state(entry.definition.style),
        },
    ]
}

pub fn clear_active_door_family_type_if_needed(state: &AppState, cmds: &mut Vec<Command>) {
    if state.ui.active_door_family_type_id.is_some() {
        cmds.push(Command::SetActiveDoorFamilyType { id: None });
    }
}

pub fn clear_active_window_family_type_if_needed(state: &AppState, cmds: &mut Vec<Command>) {
    if state.ui.active_window_family_type_id.is_some() {
        cmds.push(Command::SetActiveWindowFamilyType { id: None });
    }
}

pub fn build_door_family_type_from_defaults(state: &AppState) -> FamilyTypeElement {
    FamilyTypeElement {
        meta: ElementMeta::new(next_family_type_name(state, "Door Type")),
        category: DOOR_FAMILY_CATEGORY.to_string(),
        parameters: serialize_family_definition(&DoorFamilyDefinition::from_defaults(state)),
    }
}

pub fn build_window_family_type_from_defaults(state: &AppState) -> FamilyTypeElement {
    FamilyTypeElement {
        meta: ElementMeta::new(next_family_type_name(state, "Window Type")),
        category: WINDOW_FAMILY_CATEGORY.to_string(),
        parameters: serialize_family_definition(&WindowFamilyDefinition::from_defaults(state)),
    }
}

pub fn build_door_family_type_from_element(
    state: &AppState,
    door: &DoorElement,
) -> FamilyTypeElement {
    FamilyTypeElement {
        meta: ElementMeta::new(next_family_type_name(state, "Door Type")),
        category: DOOR_FAMILY_CATEGORY.to_string(),
        parameters: serialize_family_definition(&DoorFamilyDefinition::from_element(door)),
    }
}

pub fn build_window_family_type_from_element(
    state: &AppState,
    window: &WindowElement,
) -> FamilyTypeElement {
    FamilyTypeElement {
        meta: ElementMeta::new(next_family_type_name(state, "Window Type")),
        category: WINDOW_FAMILY_CATEGORY.to_string(),
        parameters: serialize_family_definition(&WindowFamilyDefinition::from_element(window)),
    }
}

pub fn updated_active_door_family_type_from_defaults(
    state: &AppState,
) -> Option<FamilyTypeElement> {
    let mut family = active_door_family_type(state)?.element;
    family.parameters = serialize_family_definition(&DoorFamilyDefinition::from_defaults(state));
    Some(family)
}

pub fn updated_active_window_family_type_from_defaults(
    state: &AppState,
) -> Option<FamilyTypeElement> {
    let mut family = active_window_family_type(state)?.element;
    family.parameters = serialize_family_definition(&WindowFamilyDefinition::from_defaults(state));
    Some(family)
}

pub fn updated_door_family_type_from_element(
    family: &FamilyTypeElement,
    door: &DoorElement,
) -> FamilyTypeElement {
    let mut family = family.clone();
    family.parameters = serialize_family_definition(&DoorFamilyDefinition::from_element(door));
    family
}

pub fn updated_window_family_type_from_element(
    family: &FamilyTypeElement,
    window: &WindowElement,
) -> FamilyTypeElement {
    let mut family = family.clone();
    family.parameters = serialize_family_definition(&WindowFamilyDefinition::from_element(window));
    family
}

pub fn apply_door_family_to_element(door: &mut DoorElement, entry: &DoorFamilyTypeEntry) {
    door.width = entry.definition.width;
    door.height = entry.definition.height;
    door.sill_height = entry.definition.sill_height;
    door.swing = entry.definition.swing;
    door.hardware_type = entry.definition.hardware_type;
    door.style = entry.definition.style;
    door.meta.type_id = Some(TypeRef::from(entry.element.meta.id.clone()));
}

pub fn apply_window_family_to_element(window: &mut WindowElement, entry: &WindowFamilyTypeEntry) {
    window.width = entry.definition.width;
    window.height = entry.definition.height;
    window.sill_height = entry.definition.sill_height;
    window.hardware_type = entry.definition.hardware_type;
    window.style = entry.definition.style;
    window.meta.type_id = Some(TypeRef::from(entry.element.meta.id.clone()));
}

pub fn rename_family_type(family: &FamilyTypeElement, name: &str) -> FamilyTypeElement {
    let mut updated = family.clone();
    updated.meta.name = name.to_string();
    updated
}

fn next_family_type_name(state: &AppState, prefix: &str) -> String {
    let existing_names: Vec<_> = state
        .document
        .prototype
        .project
        .elements
        .iter()
        .filter_map(|element| match element {
            Element::FamilyType(family) => Some(family.meta.name.as_str()),
            _ => None,
        })
        .collect();

    let mut index = 1;
    loop {
        let candidate = format!("{prefix} {index}");
        if !existing_names.iter().any(|name| *name == candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn serialize_family_definition<T: Serialize>(
    definition: &T,
) -> BTreeMap<String, serde_json::Value> {
    let serde_json::Value::Object(map) =
        serde_json::to_value(definition).expect("family type definition should serialize")
    else {
        return BTreeMap::new();
    };
    map.into_iter().collect()
}

fn deserialize_family_definition<T>(family: &FamilyTypeElement) -> Option<T>
where
    T: for<'de> Deserialize<'de>,
{
    let map: serde_json::Map<String, serde_json::Value> =
        family.parameters.clone().into_iter().collect();
    serde_json::from_value(serde_json::Value::Object(map)).ok()
}

fn state_door_swing_to_domain(swing: bcad_state::bim_defaults::DoorSwing) -> DoorSwing {
    match swing {
        bcad_state::bim_defaults::DoorSwing::OutLeft => DoorSwing::OutLeft,
        bcad_state::bim_defaults::DoorSwing::OutRight => DoorSwing::OutRight,
        bcad_state::bim_defaults::DoorSwing::InLeft => DoorSwing::InLeft,
        bcad_state::bim_defaults::DoorSwing::InRight => DoorSwing::InRight,
    }
}

fn domain_door_swing_to_state(swing: DoorSwing) -> bcad_state::bim_defaults::DoorSwing {
    match swing {
        DoorSwing::OutLeft => bcad_state::bim_defaults::DoorSwing::OutLeft,
        DoorSwing::OutRight => bcad_state::bim_defaults::DoorSwing::OutRight,
        DoorSwing::InLeft => bcad_state::bim_defaults::DoorSwing::InLeft,
        DoorSwing::InRight => bcad_state::bim_defaults::DoorSwing::InRight,
    }
}

fn state_door_hardware_to_domain(
    hardware_type: bcad_state::bim_defaults::DoorHardwareType,
) -> DoorHardwareType {
    match hardware_type {
        bcad_state::bim_defaults::DoorHardwareType::None => DoorHardwareType::None,
        bcad_state::bim_defaults::DoorHardwareType::Knob => DoorHardwareType::Knob,
        bcad_state::bim_defaults::DoorHardwareType::Lever => DoorHardwareType::Lever,
        bcad_state::bim_defaults::DoorHardwareType::PullBar => DoorHardwareType::PullBar,
    }
}

fn domain_door_hardware_to_state(
    hardware_type: DoorHardwareType,
) -> bcad_state::bim_defaults::DoorHardwareType {
    match hardware_type {
        DoorHardwareType::None => bcad_state::bim_defaults::DoorHardwareType::None,
        DoorHardwareType::Knob => bcad_state::bim_defaults::DoorHardwareType::Knob,
        DoorHardwareType::Lever => bcad_state::bim_defaults::DoorHardwareType::Lever,
        DoorHardwareType::PullBar => bcad_state::bim_defaults::DoorHardwareType::PullBar,
    }
}

fn state_door_style_to_domain(style: bcad_state::bim_defaults::DoorStyle) -> DoorStyle {
    match style {
        bcad_state::bim_defaults::DoorStyle::Flush => DoorStyle::Flush,
        bcad_state::bim_defaults::DoorStyle::Panel => DoorStyle::Panel,
        bcad_state::bim_defaults::DoorStyle::Double => DoorStyle::Double,
    }
}

fn domain_door_style_to_state(style: DoorStyle) -> bcad_state::bim_defaults::DoorStyle {
    match style {
        DoorStyle::Flush => bcad_state::bim_defaults::DoorStyle::Flush,
        DoorStyle::Panel => bcad_state::bim_defaults::DoorStyle::Panel,
        DoorStyle::Double => bcad_state::bim_defaults::DoorStyle::Double,
    }
}

fn state_window_hardware_to_domain(
    hardware_type: bcad_state::bim_defaults::WindowHardwareType,
) -> WindowHardwareType {
    match hardware_type {
        bcad_state::bim_defaults::WindowHardwareType::None => WindowHardwareType::None,
        bcad_state::bim_defaults::WindowHardwareType::Latch => WindowHardwareType::Latch,
        bcad_state::bim_defaults::WindowHardwareType::Crank => WindowHardwareType::Crank,
    }
}

fn domain_window_hardware_to_state(
    hardware_type: WindowHardwareType,
) -> bcad_state::bim_defaults::WindowHardwareType {
    match hardware_type {
        WindowHardwareType::None => bcad_state::bim_defaults::WindowHardwareType::None,
        WindowHardwareType::Latch => bcad_state::bim_defaults::WindowHardwareType::Latch,
        WindowHardwareType::Crank => bcad_state::bim_defaults::WindowHardwareType::Crank,
    }
}

fn state_window_style_to_domain(style: bcad_state::bim_defaults::WindowStyle) -> WindowStyle {
    match style {
        bcad_state::bim_defaults::WindowStyle::Picture => WindowStyle::Picture,
        bcad_state::bim_defaults::WindowStyle::Casement => WindowStyle::Casement,
        bcad_state::bim_defaults::WindowStyle::DoubleHung => WindowStyle::DoubleHung,
    }
}

fn domain_window_style_to_state(style: WindowStyle) -> bcad_state::bim_defaults::WindowStyle {
    match style {
        WindowStyle::Picture => bcad_state::bim_defaults::WindowStyle::Picture,
        WindowStyle::Casement => bcad_state::bim_defaults::WindowStyle::Casement,
        WindowStyle::DoubleHung => bcad_state::bim_defaults::WindowStyle::DoubleHung,
    }
}
