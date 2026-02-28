use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

pub const PROTOTYPE_FORMAT: &str = "bettercad-prototype-v2";
pub const PROTOTYPE_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementMeta {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

impl ElementMeta {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            level_id: None,
            host_id: None,
            type_id: None,
            parent_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteElement {
    pub meta: ElementMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LevelElement {
    pub meta: ElementMeta,
    pub elevation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridElement {
    pub meta: ElementMeta,
    pub start: [f64; 2],
    pub end: [f64; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallElement {
    pub meta: ElementMeta,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub height: f64,
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FloorElement {
    pub meta: ElementMeta,
    pub boundary: Vec<[f64; 2]>,
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoofElement {
    pub meta: ElementMeta,
    pub boundary: Vec<[f64; 2]>,
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundationElement {
    pub meta: ElementMeta,
    pub boundary: Vec<[f64; 2]>,
    pub thickness: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnElement {
    pub meta: ElementMeta,
    pub center: [f64; 2],
    pub width: f64,
    pub depth: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamElement {
    pub meta: ElementMeta,
    pub start: [f64; 3],
    pub end: [f64; 3],
    pub width: f64,
    pub depth: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorSwing {
    Left,
    Right,
}

impl Default for DoorSwing {
    fn default() -> Self {
        Self::Right
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoorElement {
    pub meta: ElementMeta,
    pub wall_id: String,
    pub position_along_wall: f64,
    pub width: f64,
    pub height: f64,
    pub sill_height: f64,
    #[serde(default)]
    pub swing: DoorSwing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowElement {
    pub meta: ElementMeta,
    pub wall_id: String,
    pub position_along_wall: f64,
    pub width: f64,
    pub height: f64,
    pub sill_height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StairElement {
    pub meta: ElementMeta,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub width: f64,
    pub risers: u32,
    #[serde(default = "default_stair_height")]
    pub total_height: f64,
}

fn default_stair_height() -> f64 {
    3.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomElement {
    pub meta: ElementMeta,
    pub boundary: Vec<[f64; 2]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewElement {
    pub meta: ElementMeta,
    pub view_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetElement {
    pub meta: ElementMeta,
    pub view_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialElement {
    pub meta: ElementMeta,
    pub base_color: [f32; 4],
    pub metallic: f32,
    pub roughness: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamilyTypeElement {
    pub meta: ElementMeta,
    pub category: String,
    #[serde(default)]
    pub parameters: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenericElement {
    pub meta: ElementMeta,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Element {
    Site(SiteElement),
    Level(LevelElement),
    Grid(GridElement),
    Wall(WallElement),
    Floor(FloorElement),
    Roof(RoofElement),
    Foundation(FoundationElement),
    Column(ColumnElement),
    Beam(BeamElement),
    Door(DoorElement),
    Window(WindowElement),
    Stair(StairElement),
    Room(RoomElement),
    View(ViewElement),
    Sheet(SheetElement),
    Material(MaterialElement),
    FamilyType(FamilyTypeElement),
    Generic(GenericElement),
}

impl Element {
    pub fn id(&self) -> &str {
        match self {
            Element::Site(e) => &e.meta.id,
            Element::Level(e) => &e.meta.id,
            Element::Grid(e) => &e.meta.id,
            Element::Wall(e) => &e.meta.id,
            Element::Floor(e) => &e.meta.id,
            Element::Roof(e) => &e.meta.id,
            Element::Foundation(e) => &e.meta.id,
            Element::Column(e) => &e.meta.id,
            Element::Beam(e) => &e.meta.id,
            Element::Door(e) => &e.meta.id,
            Element::Window(e) => &e.meta.id,
            Element::Stair(e) => &e.meta.id,
            Element::Room(e) => &e.meta.id,
            Element::View(e) => &e.meta.id,
            Element::Sheet(e) => &e.meta.id,
            Element::Material(e) => &e.meta.id,
            Element::FamilyType(e) => &e.meta.id,
            Element::Generic(e) => &e.meta.id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrototypeProject {
    pub format: String,
    pub version: u32,
    pub name: String,
    pub units: String,
    pub elements: Vec<Element>,
}

impl PrototypeProject {
    pub fn new(name: impl Into<String>, units: impl Into<String>) -> Self {
        Self {
            format: PROTOTYPE_FORMAT.to_string(),
            version: PROTOTYPE_VERSION,
            name: name.into(),
            units: units.into(),
            elements: Vec::new(),
        }
    }
}

#[derive(Debug, Error)]
pub enum DomainError {
    #[error("element with id {0} already exists")]
    DuplicateElement(String),
    #[error("element with id {0} was not found")]
    MissingElement(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrototypeState {
    pub project: PrototypeProject,
}

impl Default for PrototypeState {
    fn default() -> Self {
        Self {
            project: PrototypeProject::new("Untitled", "m"),
        }
    }
}

impl PrototypeState {
    pub fn reset(&mut self, name: impl Into<String>, units: impl Into<String>) {
        self.project = PrototypeProject::new(name, units);
    }

    pub fn create_element(&mut self, element: Element) -> Result<String, DomainError> {
        if self.project.elements.iter().any(|e| e.id() == element.id()) {
            return Err(DomainError::DuplicateElement(element.id().to_string()));
        }
        let id = element.id().to_string();
        self.project.elements.push(element);
        Ok(id)
    }

    pub fn update_element(&mut self, id: &str, element: Element) -> Result<(), DomainError> {
        if id != element.id() {
            return Err(DomainError::MissingElement(id.to_string()));
        }
        let Some(idx) = self.project.elements.iter().position(|e| e.id() == id) else {
            return Err(DomainError::MissingElement(id.to_string()));
        };
        self.project.elements[idx] = element;
        Ok(())
    }

    pub fn delete_element(&mut self, id: &str) -> Result<(), DomainError> {
        let Some(idx) = self.project.elements.iter().position(|e| e.id() == id) else {
            return Err(DomainError::MissingElement(id.to_string()));
        };
        self.project.elements.remove(idx);
        Ok(())
    }

    pub fn query_elements(&self) -> &[Element] {
        &self.project.elements
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_create_update_delete() {
        let mut state = PrototypeState::default();
        let wall = Element::Wall(WallElement {
            meta: ElementMeta::new("Wall A"),
            start: [0.0, 0.0],
            end: [4.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        });
        let id = wall.id().to_string();
        state.create_element(wall).unwrap();
        assert_eq!(state.query_elements().len(), 1);

        let wall_update = Element::Wall(WallElement {
            meta: ElementMeta {
                id: id.clone(),
                name: "Wall A".into(),
                level_id: None,
                host_id: None,
                type_id: None,
                parent_id: None,
            },
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        });
        state.update_element(&id, wall_update).unwrap();
        state.delete_element(&id).unwrap();
        assert!(state.query_elements().is_empty());
    }
}
