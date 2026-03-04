use std::collections::BTreeMap;
use std::fmt;
use std::ops::Deref;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

pub const PROTOTYPE_FORMAT: &str = "bettercad-model-v6";
pub const PROTOTYPE_VERSION: u32 = 6;

pub const STANDARD_LAYERS: &[(&str, &str)] = &[
    ("A-WALL", "Walls"),
    ("A-DOOR", "Doors"),
    ("A-WIND", "Windows"),
    ("A-FLOR", "Floors"),
    ("A-ROOF", "Roofs"),
    ("A-STRS", "Stairs"),
    ("A-CLNG", "Ceilings"),
    ("A-COLS", "Columns"),
    ("A-BEAM", "Beams"),
    ("A-FNDN", "Foundations"),
    ("E-POWR", "Electrical Power"),
    ("E-LITE", "Electrical Lighting"),
    ("P-FIXT", "Plumbing Fixtures"),
    ("S-GRID", "Structural Grid"),
    ("F-FURN", "Furniture"),
    ("L-SITE", "Site"),
    ("G-ANNO", "Annotations"),
    ("G-DIMS", "Dimensions"),
    ("G-TAGS", "Tags"),
];

macro_rules! define_ref_type {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self(value.to_string())
            }
        }

        impl Deref for $name {
            type Target = str;

            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(f)
            }
        }
    };
}

define_ref_type!(LevelRef);
define_ref_type!(HostRef);
define_ref_type!(TypeRef);
define_ref_type!(ParentRef);
define_ref_type!(MaterialRef);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatCapability {
    pub import: bool,
    pub export: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendCapabilities {
    pub formats: BTreeMap<String, FormatCapability>,
}

pub fn default_backend_capabilities() -> BackendCapabilities {
    let mut formats = BTreeMap::new();
    formats.insert(
        "step".to_string(),
        FormatCapability {
            import: true,
            export: true,
        },
    );
    formats.insert(
        "dxf".to_string(),
        FormatCapability {
            import: true,
            export: true,
        },
    );
    formats.insert(
        "ifc".to_string(),
        FormatCapability {
            import: true,
            export: true,
        },
    );
    formats.insert(
        "gltf".to_string(),
        FormatCapability {
            import: false,
            export: true,
        },
    );
    BackendCapabilities { formats }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementMeta {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level_id: Option<LevelRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_id: Option<HostRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_id: Option<TypeRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<ParentRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub material_id: Option<MaterialRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ifc_guid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub classification: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layer: Option<String>,
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
            material_id: None,
            ifc_guid: None,
            classification: None,
            layer: None,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoofType {
    Flat,
    Shed,
    Gable,
    Hip,
}

impl Default for RoofType {
    fn default() -> Self {
        Self::Flat
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoofElement {
    pub meta: ElementMeta,
    pub boundary: Vec<[f64; 2]>,
    pub thickness: f64,
    #[serde(default)]
    pub elevation: f64,
    #[serde(default = "default_roof_auto_elevation")]
    pub auto_elevation: bool,
    #[serde(default)]
    pub roof_type: RoofType,
    #[serde(default = "default_roof_pitch_degrees")]
    pub pitch_degrees: f64,
    #[serde(default)]
    pub ridge_angle_degrees: f64,
}

fn default_roof_auto_elevation() -> bool {
    true
}

fn default_roof_pitch_degrees() -> f64 {
    30.0
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StairType {
    Straight,
    Spiral,
}

impl Default for StairType {
    fn default() -> Self {
        Self::Straight
    }
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
    #[serde(default)]
    pub stair_type: StairType,
    #[serde(default = "default_spiral_turns")]
    pub spiral_turns: f64,
    #[serde(default = "default_stair_side_wall_thickness")]
    pub side_wall_thickness: f64,
}

fn default_stair_height() -> f64 {
    3.0
}

fn default_spiral_turns() -> f64 {
    1.0
}

fn default_stair_side_wall_thickness() -> f64 {
    0.12
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomElement {
    pub meta: ElementMeta,
    pub boundary: Vec<[f64; 2]>,
}

fn default_view_scale() -> f64 {
    1.0 / 50.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewElement {
    pub meta: ElementMeta,
    pub view_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cut_start: Option<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cut_end: Option<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cut_height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub elevation_direction: Option<String>,
    #[serde(default = "default_view_scale")]
    pub scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportPlacement {
    pub view_id: String,
    pub origin: [f64; 2],
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetElement {
    pub meta: ElementMeta,
    #[serde(default)]
    pub view_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub viewports: Vec<ViewportPlacement>,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ElectricalSymbolType {
    Outlet,
    Switch,
    LightFixture,
    Panel,
    SmokeDetector,
    JunctionBox,
    ThreeWaySwitch,
    DimmerSwitch,
    GfciOutlet,
    FloorOutlet,
    CeilingFan,
    Thermostat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlumbingSymbolType {
    Toilet,
    Sink,
    Bathtub,
    Shower,
    WaterHeater,
    HoseBib,
    FloorDrain,
    Dishwasher,
    WashingMachine,
    Urinal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FurnitureSymbolType {
    Desk,
    Chair,
    Table,
    Bed,
    Sofa,
    DiningTable,
    Bookshelf,
    Wardrobe,
    ToiletStall,
    ReceptionDesk,
    ConferenceTable,
    KitchenIsland,
    Refrigerator,
    Stove,
    Washer,
    Dryer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SiteDetailType {
    PropertyLine,
    Setback,
    Tree,
    ParkingSpace,
    Sidewalk,
    Driveway,
    Compass,
    ContourLine,
    Fence,
    Retaining,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TagType {
    Room,
    Door,
    Window,
    Wall,
    Column,
    Beam,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HatchPattern {
    Concrete,
    Insulation,
    Earth,
    Wood,
    Brick,
    Steel,
    Gravel,
    Glass,
    None,
}

impl Default for HatchPattern {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElectricalElement {
    pub meta: ElementMeta,
    pub symbol_type: String,
    pub position: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub circuit_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connected_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlumbingElement {
    pub meta: ElementMeta,
    pub symbol_type: String,
    pub position: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FurnitureElement {
    pub meta: ElementMeta,
    pub symbol_type: String,
    pub position: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
    #[serde(default = "default_furniture_width")]
    pub width: f64,
    #[serde(default = "default_furniture_depth")]
    pub depth: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HvacElement {
    pub meta: ElementMeta,
    pub symbol_type: String,
    pub position: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub depth: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FireSafetyElement {
    pub meta: ElementMeta,
    pub symbol_type: String,
    pub position: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityElement {
    pub meta: ElementMeta,
    pub symbol_type: String,
    pub position: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub depth: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CabinetElement {
    pub meta: ElementMeta,
    pub cabinet_type: String,
    pub position: [f64; 2],
    #[serde(default)]
    pub rotation: f64,
    #[serde(default = "default_cabinet_width")]
    pub width: f64,
    #[serde(default = "default_cabinet_depth")]
    pub depth: f64,
    #[serde(default = "default_cabinet_height")]
    pub height: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wall_id: Option<String>,
    #[serde(default)]
    pub door_count: u32,
    #[serde(default)]
    pub drawer_count: u32,
}

fn default_cabinet_width() -> f64 { 0.61 }
fn default_cabinet_depth() -> f64 { 0.61 }
fn default_cabinet_height() -> f64 { 0.91 }

fn default_furniture_width() -> f64 { 0.6 }
fn default_furniture_depth() -> f64 { 0.6 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteDetailElement {
    pub meta: ElementMeta,
    pub detail_type: SiteDetailType,
    #[serde(default)]
    pub points: Vec<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub elevation: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderAnnotationElement {
    pub meta: ElementMeta,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub text: String,
    #[serde(default = "default_arrow_type")]
    pub arrow_type: String,
}

fn default_arrow_type() -> String { "closed".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeynoteElement {
    pub meta: ElementMeta,
    pub position: [f64; 2],
    pub keynote_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagElement {
    pub meta: ElementMeta,
    pub position: [f64; 2],
    pub target_element_id: String,
    pub tag_type: TagType,
    #[serde(default = "default_auto_text")]
    pub auto_text: bool,
}

fn default_auto_text() -> bool { true }

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
    Electrical(ElectricalElement),
    Plumbing(PlumbingElement),
    Furniture(FurnitureElement),
    SiteDetail(SiteDetailElement),
    LeaderAnnotation(LeaderAnnotationElement),
    Keynote(KeynoteElement),
    Tag(TagElement),
    Hvac(HvacElement),
    FireSafety(FireSafetyElement),
    Accessibility(AccessibilityElement),
    Cabinet(CabinetElement),
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
            Element::Electrical(e) => &e.meta.id,
            Element::Plumbing(e) => &e.meta.id,
            Element::Furniture(e) => &e.meta.id,
            Element::SiteDetail(e) => &e.meta.id,
            Element::LeaderAnnotation(e) => &e.meta.id,
            Element::Keynote(e) => &e.meta.id,
            Element::Tag(e) => &e.meta.id,
            Element::Hvac(e) => &e.meta.id,
            Element::FireSafety(e) => &e.meta.id,
            Element::Accessibility(e) => &e.meta.id,
            Element::Cabinet(e) => &e.meta.id,
        }
    }

    pub fn meta(&self) -> &ElementMeta {
        match self {
            Element::Site(e) => &e.meta,
            Element::Level(e) => &e.meta,
            Element::Grid(e) => &e.meta,
            Element::Wall(e) => &e.meta,
            Element::Floor(e) => &e.meta,
            Element::Roof(e) => &e.meta,
            Element::Foundation(e) => &e.meta,
            Element::Column(e) => &e.meta,
            Element::Beam(e) => &e.meta,
            Element::Door(e) => &e.meta,
            Element::Window(e) => &e.meta,
            Element::Stair(e) => &e.meta,
            Element::Room(e) => &e.meta,
            Element::View(e) => &e.meta,
            Element::Sheet(e) => &e.meta,
            Element::Material(e) => &e.meta,
            Element::FamilyType(e) => &e.meta,
            Element::Generic(e) => &e.meta,
            Element::Electrical(e) => &e.meta,
            Element::Plumbing(e) => &e.meta,
            Element::Furniture(e) => &e.meta,
            Element::SiteDetail(e) => &e.meta,
            Element::LeaderAnnotation(e) => &e.meta,
            Element::Keynote(e) => &e.meta,
            Element::Tag(e) => &e.meta,
            Element::Hvac(e) => &e.meta,
            Element::FireSafety(e) => &e.meta,
            Element::Accessibility(e) => &e.meta,
            Element::Cabinet(e) => &e.meta,
        }
    }

    pub fn kind_name(&self) -> &'static str {
        match self {
            Element::Site(_) => "site",
            Element::Level(_) => "level",
            Element::Grid(_) => "grid",
            Element::Wall(_) => "wall",
            Element::Floor(_) => "floor",
            Element::Roof(_) => "roof",
            Element::Foundation(_) => "foundation",
            Element::Column(_) => "column",
            Element::Beam(_) => "beam",
            Element::Door(_) => "door",
            Element::Window(_) => "window",
            Element::Stair(_) => "stair",
            Element::Room(_) => "room",
            Element::View(_) => "view",
            Element::Sheet(_) => "sheet",
            Element::Material(_) => "material",
            Element::FamilyType(_) => "family_type",
            Element::Generic(_) => "generic",
            Element::Electrical(_) => "electrical",
            Element::Plumbing(_) => "plumbing",
            Element::Furniture(_) => "furniture",
            Element::SiteDetail(_) => "site_detail",
            Element::LeaderAnnotation(_) => "leader_annotation",
            Element::Keynote(_) => "keynote",
            Element::Tag(_) => "tag",
            Element::Hvac(_) => "hvac",
            Element::FireSafety(_) => "fire_safety",
            Element::Accessibility(_) => "accessibility",
            Element::Cabinet(_) => "cabinet",
        }
    }

    pub fn is_physical(&self) -> bool {
        matches!(
            self,
            Element::Wall(_)
                | Element::Floor(_)
                | Element::Roof(_)
                | Element::Foundation(_)
                | Element::Column(_)
                | Element::Beam(_)
                | Element::Door(_)
                | Element::Window(_)
                | Element::Stair(_)
                | Element::Room(_)
                | Element::Electrical(_)
                | Element::Plumbing(_)
                | Element::Furniture(_)
                | Element::Hvac(_)
                | Element::FireSafety(_)
                | Element::Accessibility(_)
                | Element::Cabinet(_)
        )
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
    #[error("validation failed: {0}")]
    ValidationError(String),
    #[error("delete blocked: {0}")]
    DeleteBlocked(String),
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
        let validation_result = {
            let created = self.project.elements.last().expect("pushed element");
            self.validate_element(created)
        };
        if let Err(err) = validation_result {
            self.project.elements.pop();
            return Err(err);
        }
        Ok(id)
    }

    pub fn update_element(&mut self, id: &str, element: Element) -> Result<(), DomainError> {
        if id != element.id() {
            return Err(DomainError::MissingElement(id.to_string()));
        }
        let Some(idx) = self.project.elements.iter().position(|e| e.id() == id) else {
            return Err(DomainError::MissingElement(id.to_string()));
        };
        let previous = self.project.elements[idx].clone();
        self.project.elements[idx] = element;
        let validation_result = {
            let updated = &self.project.elements[idx];
            self.validate_element(updated)
        };
        if let Err(err) = validation_result {
            self.project.elements[idx] = previous;
            return Err(err);
        }
        Ok(())
    }

    pub fn delete_element(&mut self, id: &str) -> Result<(), DomainError> {
        let Some(target) = self.project.elements.iter().find(|e| e.id() == id) else {
            return Err(DomainError::MissingElement(id.to_string()));
        };
        let mut delete_ids = vec![id.to_string()];

        if matches!(target, Element::Wall(_)) {
            for element in &self.project.elements {
                match element {
                    Element::Door(door) if door.wall_id == id => delete_ids.push(door.meta.id.clone()),
                    Element::Window(window) if window.wall_id == id => {
                        delete_ids.push(window.meta.id.clone())
                    }
                    _ => {}
                }
            }
        }

        for element in &self.project.elements {
            if delete_ids.iter().any(|delete_id| delete_id == element.id()) {
                continue;
            }
            let meta = element.meta();
            if meta.level_id.as_ref().map(|r| r.as_ref()) == Some(id) {
                return Err(DomainError::DeleteBlocked(format!(
                    "level {} is still referenced by element {}",
                    id,
                    element.id()
                )));
            }
            if meta.type_id.as_ref().map(|r| r.as_ref()) == Some(id) {
                return Err(DomainError::DeleteBlocked(format!(
                    "type {} is still referenced by element {}",
                    id,
                    element.id()
                )));
            }
            if meta.parent_id.as_ref().map(|r| r.as_ref()) == Some(id) {
                return Err(DomainError::DeleteBlocked(format!(
                    "parent {} is still referenced by element {}",
                    id,
                    element.id()
                )));
            }
            if meta.material_id.as_ref().map(|r| r.as_ref()) == Some(id) {
                return Err(DomainError::DeleteBlocked(format!(
                    "material {} is still referenced by element {}",
                    id,
                    element.id()
                )));
            }
            if meta.host_id.as_ref().map(|r| r.as_ref()) == Some(id) {
                return Err(DomainError::DeleteBlocked(format!(
                    "host {} is still referenced by element {}",
                    id,
                    element.id()
                )));
            }
        }

        self.project
            .elements
            .retain(|e| !delete_ids.iter().any(|delete_id| delete_id == e.id()));
        Ok(())
    }

    pub fn query_elements(&self) -> &[Element] {
        &self.project.elements
    }

    pub fn query_elements_ordered(&self) -> Vec<&Element> {
        let mut ordered: Vec<&Element> = self.project.elements.iter().collect();
        ordered.sort_by_key(|element| match element {
            Element::Level(_) => 0,
            Element::Site(_) | Element::Grid(_) | Element::Material(_) | Element::FamilyType(_) => 1,
            Element::Wall(_)
            | Element::Foundation(_)
            | Element::Floor(_)
            | Element::Column(_)
            | Element::Beam(_)
            | Element::Stair(_)
            | Element::Roof(_)
            | Element::Room(_) => 2,
            Element::Door(_) | Element::Window(_) => 3,
            Element::Electrical(_) | Element::Plumbing(_) | Element::Furniture(_) | Element::SiteDetail(_)
            | Element::Hvac(_) | Element::FireSafety(_) | Element::Accessibility(_) | Element::Cabinet(_) => 3,
            Element::View(_) | Element::Sheet(_) | Element::Generic(_) => 4,
            Element::LeaderAnnotation(_) | Element::Keynote(_) | Element::Tag(_) => 5,
        });
        ordered
    }

    fn find_element(&self, id: &str) -> Option<&Element> {
        self.project.elements.iter().find(|element| element.id() == id)
    }

    fn validate_common_refs(&self, meta: &ElementMeta, element_kind: &str) -> Result<(), DomainError> {
        if meta.id.trim().is_empty() {
            return Err(DomainError::ValidationError(format!(
                "{} id must be non-empty",
                element_kind
            )));
        }
        if meta.name.trim().is_empty() {
            return Err(DomainError::ValidationError(format!(
                "{} name must be non-empty",
                element_kind
            )));
        }

        if let Some(level_ref) = &meta.level_id {
            let Some(level) = self.find_element(level_ref.as_ref()) else {
                return Err(DomainError::ValidationError(format!(
                    "{} references missing level {}",
                    element_kind, level_ref
                )));
            };
            if !matches!(level, Element::Level(_)) {
                return Err(DomainError::ValidationError(format!(
                    "{} references non-level {} as level",
                    element_kind, level_ref
                )));
            }
            if level.id() == meta.id {
                return Err(DomainError::ValidationError(format!(
                    "{} cannot reference itself as level",
                    element_kind
                )));
            }
        }

        if let Some(host_ref) = &meta.host_id {
            let Some(host) = self.find_element(host_ref.as_ref()) else {
                return Err(DomainError::ValidationError(format!(
                    "{} references missing host {}",
                    element_kind, host_ref
                )));
            };
            if host.id() == meta.id {
                return Err(DomainError::ValidationError(format!(
                    "{} cannot reference itself as host",
                    element_kind
                )));
            }
        }

        if let Some(type_ref) = &meta.type_id {
            let Some(type_element) = self.find_element(type_ref.as_ref()) else {
                return Err(DomainError::ValidationError(format!(
                    "{} references missing type {}",
                    element_kind, type_ref
                )));
            };
            if !matches!(type_element, Element::FamilyType(_)) {
                return Err(DomainError::ValidationError(format!(
                    "{} type reference {} must point to a family_type",
                    element_kind, type_ref
                )));
            }
        }

        if let Some(parent_ref) = &meta.parent_id {
            let Some(parent) = self.find_element(parent_ref.as_ref()) else {
                return Err(DomainError::ValidationError(format!(
                    "{} references missing parent {}",
                    element_kind, parent_ref
                )));
            };
            if parent.id() == meta.id {
                return Err(DomainError::ValidationError(format!(
                    "{} cannot reference itself as parent",
                    element_kind
                )));
            }
        }

        if let Some(material_ref) = &meta.material_id {
            let Some(material) = self.find_element(material_ref.as_ref()) else {
                return Err(DomainError::ValidationError(format!(
                    "{} references missing material {}",
                    element_kind, material_ref
                )));
            };
            if !matches!(material, Element::Material(_)) {
                return Err(DomainError::ValidationError(format!(
                    "{} material reference {} must point to a material",
                    element_kind, material_ref
                )));
            }
        }

        Ok(())
    }

    fn validate_requires_level(&self, element: &Element, kind: &str) -> Result<(), DomainError> {
        if !element.is_physical() {
            return Ok(());
        }
        if element.meta().level_id.is_none() {
            return Err(DomainError::ValidationError(format!(
                "{} requires level_id",
                kind
            )));
        }
        Ok(())
    }

    fn validate_element(&self, element: &Element) -> Result<(), DomainError> {
        let kind = element.kind_name();
        self.validate_common_refs(element.meta(), kind)?;
        self.validate_requires_level(element, kind)?;

        match element {
            Element::Wall(wall) => {
                let len = (wall.end[0] - wall.start[0]).hypot(wall.end[1] - wall.start[1]);
                if len < 1e-6 {
                    return Err(DomainError::ValidationError(
                        "wall must have non-zero length".to_string(),
                    ));
                }
                if wall.height <= 0.0 || wall.thickness <= 0.0 {
                    return Err(DomainError::ValidationError(
                        "wall height and thickness must be > 0".to_string(),
                    ));
                }
            }
            Element::Floor(floor) => {
                if floor.boundary.len() < 3 {
                    return Err(DomainError::ValidationError(
                        "floor boundary must contain at least 3 points".to_string(),
                    ));
                }
                if floor.thickness <= 0.0 {
                    return Err(DomainError::ValidationError(
                        "floor thickness must be > 0".to_string(),
                    ));
                }
            }
            Element::Roof(roof) => {
                if roof.boundary.len() < 3 {
                    return Err(DomainError::ValidationError(
                        "roof boundary must contain at least 3 points".to_string(),
                    ));
                }
                if roof.thickness <= 0.0 {
                    return Err(DomainError::ValidationError(
                        "roof thickness must be > 0".to_string(),
                    ));
                }
                if !(0.0..=75.0).contains(&roof.pitch_degrees) {
                    return Err(DomainError::ValidationError(
                        "roof pitch must be in [0, 75] degrees".to_string(),
                    ));
                }
            }
            Element::Foundation(foundation) => {
                if foundation.boundary.len() < 3 {
                    return Err(DomainError::ValidationError(
                        "foundation boundary must contain at least 3 points".to_string(),
                    ));
                }
                if foundation.thickness <= 0.0 {
                    return Err(DomainError::ValidationError(
                        "foundation thickness must be > 0".to_string(),
                    ));
                }
            }
            Element::Column(column) => {
                if column.width <= 0.0 || column.depth <= 0.0 || column.height <= 0.0 {
                    return Err(DomainError::ValidationError(
                        "column width, depth, and height must be > 0".to_string(),
                    ));
                }
            }
            Element::Beam(beam) => {
                let len = (beam.end[0] - beam.start[0])
                    .hypot(beam.end[1] - beam.start[1])
                    .hypot(beam.end[2] - beam.start[2]);
                if len < 1e-6 {
                    return Err(DomainError::ValidationError(
                        "beam must have non-zero length".to_string(),
                    ));
                }
                if beam.width <= 0.0 || beam.depth <= 0.0 {
                    return Err(DomainError::ValidationError(
                        "beam width and depth must be > 0".to_string(),
                    ));
                }
            }
            Element::Door(door) => {
                if door.width <= 0.0 || door.height <= 0.0 || door.sill_height < 0.0 {
                    return Err(DomainError::ValidationError(
                        "door width/height must be > 0 and sill height must be >= 0".to_string(),
                    ));
                }
                if !(0.0..=1.0).contains(&door.position_along_wall) {
                    return Err(DomainError::ValidationError(
                        "door position_along_wall must be in [0, 1]".to_string(),
                    ));
                }
                let Some(host_id) = &door.meta.host_id else {
                    return Err(DomainError::ValidationError(
                        "door requires meta.host_id".to_string(),
                    ));
                };
                if host_id.as_ref() != door.wall_id {
                    return Err(DomainError::ValidationError(
                        "door host_id must match wall_id".to_string(),
                    ));
                }
                let Some(Element::Wall(wall)) = self.find_element(&door.wall_id) else {
                    return Err(DomainError::ValidationError(format!(
                        "door references missing wall {}",
                        door.wall_id
                    )));
                };
                let wall_len = (wall.end[0] - wall.start[0]).hypot(wall.end[1] - wall.start[1]);
                if wall_len < 1e-6 {
                    return Err(DomainError::ValidationError(
                        "door host wall has zero length".to_string(),
                    ));
                }
                let center = door.position_along_wall * wall_len;
                let half = door.width * 0.5;
                if half > wall_len || center < half || center > wall_len - half {
                    return Err(DomainError::ValidationError(
                        "door opening exceeds host wall bounds".to_string(),
                    ));
                }
            }
            Element::Window(window) => {
                if window.width <= 0.0 || window.height <= 0.0 || window.sill_height < 0.0 {
                    return Err(DomainError::ValidationError(
                        "window width/height must be > 0 and sill height must be >= 0".to_string(),
                    ));
                }
                if !(0.0..=1.0).contains(&window.position_along_wall) {
                    return Err(DomainError::ValidationError(
                        "window position_along_wall must be in [0, 1]".to_string(),
                    ));
                }
                let Some(host_id) = &window.meta.host_id else {
                    return Err(DomainError::ValidationError(
                        "window requires meta.host_id".to_string(),
                    ));
                };
                if host_id.as_ref() != window.wall_id {
                    return Err(DomainError::ValidationError(
                        "window host_id must match wall_id".to_string(),
                    ));
                }
                let Some(Element::Wall(wall)) = self.find_element(&window.wall_id) else {
                    return Err(DomainError::ValidationError(format!(
                        "window references missing wall {}",
                        window.wall_id
                    )));
                };
                let wall_len = (wall.end[0] - wall.start[0]).hypot(wall.end[1] - wall.start[1]);
                if wall_len < 1e-6 {
                    return Err(DomainError::ValidationError(
                        "window host wall has zero length".to_string(),
                    ));
                }
                let center = window.position_along_wall * wall_len;
                let half = window.width * 0.5;
                if half > wall_len || center < half || center > wall_len - half {
                    return Err(DomainError::ValidationError(
                        "window opening exceeds host wall bounds".to_string(),
                    ));
                }
            }
            Element::Stair(stair) => {
                if stair.width <= 0.0 || stair.risers == 0 || stair.total_height <= 0.0 {
                    return Err(DomainError::ValidationError(
                        "stair width/total_height must be > 0 and risers must be > 0".to_string(),
                    ));
                }
                let run = (stair.end[0] - stair.start[0]).hypot(stair.end[1] - stair.start[1]);
                if run < 1e-6 {
                    return Err(DomainError::ValidationError(
                        "stair must have non-zero run length".to_string(),
                    ));
                }
            }
            Element::Room(room) => {
                if room.boundary.len() < 3 {
                    return Err(DomainError::ValidationError(
                        "room boundary must contain at least 3 points".to_string(),
                    ));
                }
            }
            _ => {}
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_create_update_delete() {
        let mut state = PrototypeState::default();
        let level_id = "level-1".to_string();
        state
            .create_element(Element::Level(LevelElement {
                meta: ElementMeta {
                    id: level_id.clone(),
                    name: "Level 1".into(),
                    level_id: None,
                    host_id: None,
                    type_id: None,
                    parent_id: None,
                    material_id: None,
                    ifc_guid: None,
                    classification: None,
                    layer: None,
                },
                elevation: 0.0,
            }))
            .unwrap();

        let wall = Element::Wall(WallElement {
            meta: ElementMeta {
                id: Uuid::new_v4().to_string(),
                name: "Wall A".into(),
                level_id: Some(level_id.clone().into()),
                host_id: None,
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            start: [0.0, 0.0],
            end: [4.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        });
        let id = wall.id().to_string();
        state.create_element(wall).unwrap();
        assert_eq!(state.query_elements().len(), 2);

        let wall_update = Element::Wall(WallElement {
            meta: ElementMeta {
                id: id.clone(),
                name: "Wall A".into(),
                level_id: Some(level_id.into()),
                host_id: None,
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        });
        state.update_element(&id, wall_update).unwrap();
        state.delete_element(&id).unwrap();
        assert_eq!(state.query_elements().len(), 1);
    }

    #[test]
    fn test_hosted_window_requires_host_wall_and_level() {
        let mut state = PrototypeState::default();
        let level_id = "level-1".to_string();
        state
            .create_element(Element::Level(LevelElement {
                meta: ElementMeta {
                    id: level_id.clone(),
                    name: "Level 1".into(),
                    level_id: None,
                    host_id: None,
                    type_id: None,
                    parent_id: None,
                    material_id: None,
                    ifc_guid: None,
                    classification: None,
                    layer: None,
                },
                elevation: 0.0,
            }))
            .unwrap();

        let window = Element::Window(WindowElement {
            meta: ElementMeta {
                id: Uuid::new_v4().to_string(),
                name: "Window".into(),
                level_id: Some(level_id.into()),
                host_id: Some("missing-wall".into()),
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            wall_id: "missing-wall".into(),
            position_along_wall: 0.5,
            width: 1.2,
            height: 1.1,
            sill_height: 0.9,
        });

        assert!(state.create_element(window).is_err());
    }

    #[test]
    fn test_delete_wall_cascades_hosted_openings() {
        let mut state = PrototypeState::default();
        let level_id = "level-1".to_string();
        state
            .create_element(Element::Level(LevelElement {
                meta: ElementMeta {
                    id: level_id.clone(),
                    name: "Level 1".into(),
                    level_id: None,
                    host_id: None,
                    type_id: None,
                    parent_id: None,
                    material_id: None,
                    ifc_guid: None,
                    classification: None,
                    layer: None,
                },
                elevation: 0.0,
            }))
            .unwrap();

        let wall_id = Uuid::new_v4().to_string();
        state
            .create_element(Element::Wall(WallElement {
                meta: ElementMeta {
                    id: wall_id.clone(),
                    name: "Wall".into(),
                    level_id: Some(level_id.clone().into()),
                    host_id: None,
                    type_id: None,
                    parent_id: None,
                    material_id: None,
                    ifc_guid: None,
                    classification: None,
                    layer: None,
                },
                start: [0.0, 0.0],
                end: [5.0, 0.0],
                height: 3.0,
                thickness: 0.2,
            }))
            .unwrap();

        let door_id = Uuid::new_v4().to_string();
        state
            .create_element(Element::Door(DoorElement {
                meta: ElementMeta {
                    id: door_id.clone(),
                    name: "Door".into(),
                    level_id: Some(level_id.clone().into()),
                    host_id: Some(wall_id.clone().into()),
                    type_id: None,
                    parent_id: None,
                    material_id: None,
                    ifc_guid: None,
                    classification: None,
                    layer: None,
                },
                wall_id: wall_id.clone(),
                position_along_wall: 0.5,
                width: 0.9,
                height: 2.1,
                sill_height: 0.0,
                swing: DoorSwing::Right,
            }))
            .unwrap();

        state.delete_element(&wall_id).unwrap();

        assert!(state.find_element(&wall_id).is_none());
        assert!(state.find_element(&door_id).is_none());
    }

    #[test]
    fn test_default_backend_capabilities_matrix() {
        let caps = default_backend_capabilities();
        assert!(caps.formats.get("step").map(|c| c.import).unwrap_or(false));
        assert!(caps.formats.get("step").map(|c| c.export).unwrap_or(false));
        assert!(caps.formats.get("dxf").map(|c| c.import).unwrap_or(false));
        assert!(caps.formats.get("dxf").map(|c| c.export).unwrap_or(false));
        assert!(caps.formats.get("ifc").map(|c| c.import).unwrap_or(false));
        assert!(caps.formats.get("ifc").map(|c| c.export).unwrap_or(false));
        assert!(!caps.formats.get("gltf").map(|c| c.import).unwrap_or(true));
        assert!(caps.formats.get("gltf").map(|c| c.export).unwrap_or(false));
    }
}
