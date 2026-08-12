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
    let cap = |import, export| FormatCapability { import, export };
    BackendCapabilities {
        formats: BTreeMap::from([
            ("step".to_string(), cap(true, true)),
            ("dxf".to_string(), cap(true, true)),
            ("ifc".to_string(), cap(true, true)),
            ("gltf".to_string(), cap(false, true)),
        ]),
    }
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

    /// Builder: set the level ID.
    pub fn with_level(mut self, level_id: impl Into<LevelRef>) -> Self {
        self.level_id = Some(level_id.into());
        self
    }

    /// Builder: set the host ID (e.g. door/window hosted on a wall).
    pub fn with_host(mut self, host_id: impl Into<HostRef>) -> Self {
        self.host_id = Some(host_id.into());
        self
    }

    /// Builder: set the family type ID.
    pub fn with_type(mut self, type_id: impl Into<TypeRef>) -> Self {
        self.type_id = Some(type_id.into());
        self
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

/// Exact arc parameters for curved geometry.
/// Angles are in radians, measured counter-clockwise from the positive X axis.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ArcDef {
    pub center: [f64; 2],
    pub radius: f64,
    pub start_angle: f64,
    pub end_angle: f64,
}

/// A single segment in a mixed straight/curved boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "seg_type", rename_all = "snake_case")]
pub enum BoundarySegment {
    Line { end: [f64; 2] },
    Arc { end: [f64; 2], arc: ArcDef },
}

fn default_arc_segments() -> u32 {
    24
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallElement {
    pub meta: ElementMeta,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub height: f64,
    pub thickness: f64,
    /// When `Some`, the wall centerline follows an arc from `start` to `end`.
    /// When `None`, the wall is a straight line segment (backward compatible).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arc: Option<ArcDef>,
    /// Number of tessellation segments for curved walls (default 24).
    #[serde(default = "default_arc_segments")]
    pub arc_segments: u32,
}

/// Pre-computed wall direction, normal, and center point at a given position.
pub struct WallGeometry {
    /// Unit vector along the wall direction (start to end).
    pub axis_u: [f64; 2],
    /// Unit normal perpendicular to the wall direction.
    pub axis_v: [f64; 2],
    /// Wall centerline length.
    pub length: f64,
}

impl WallElement {
    /// Compute the wall's direction vectors and centerline length.
    ///
    /// Returns `None` if the wall has zero (or near-zero) length.
    pub fn geometry(&self) -> Option<WallGeometry> {
        let dx = self.end[0] - self.start[0];
        let dy = self.end[1] - self.start[1];
        let length = (dx * dx + dy * dy).sqrt();
        if length < 1e-8 {
            return None;
        }
        let ux = dx / length;
        let uy = dy / length;
        Some(WallGeometry {
            axis_u: [ux, uy],
            axis_v: [-uy, ux],
            length,
        })
    }

    /// Compute the world-space XY position at a fractional offset along the wall.
    ///
    /// `t` is in [0, 1], where 0 is `self.start` and 1 is `self.end`.
    pub fn point_along(&self, t: f64) -> [f64; 2] {
        [
            self.start[0] + (self.end[0] - self.start[0]) * t,
            self.start[1] + (self.end[1] - self.start[1]) * t,
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FloorElement {
    pub meta: ElementMeta,
    pub boundary: Vec<[f64; 2]>,
    pub thickness: f64,
    /// Mixed straight/curved boundary. When non-empty, overrides `boundary` for
    /// mesh generation, 2D rendering, and export.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub boundary_segments: Vec<BoundarySegment>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoofType {
    #[default]
    Flat,
    Shed,
    Gable,
    Hip,
    BarrelVault,
    Dome,
    Conical,
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

fn default_column_segments() -> u32 {
    24
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnElement {
    pub meta: ElementMeta,
    pub center: [f64; 2],
    pub width: f64,
    pub depth: f64,
    pub height: f64,
    /// When `Some`, the column has a circular cross-section with this diameter.
    /// `width` and `depth` are ignored when `diameter` is set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diameter: Option<f64>,
    /// Number of tessellation segments for circular columns (default 24).
    #[serde(default = "default_column_segments")]
    pub column_segments: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamElement {
    pub meta: ElementMeta,
    pub start: [f64; 3],
    pub end: [f64; 3],
    pub width: f64,
    pub depth: f64,
    /// When `Some`, the beam follows an arc path (center/radius in XY plane).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arc: Option<ArcDef>,
    /// Number of tessellation segments for curved beams (default 24).
    #[serde(default = "default_arc_segments")]
    pub arc_segments: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorSwing {
    #[serde(alias = "left")]
    OutLeft,
    #[serde(alias = "right")]
    #[default]
    OutRight,
    InLeft,
    InRight,
}

impl DoorSwing {
    pub fn hinge_on_start(self) -> bool {
        matches!(self, Self::OutLeft | Self::InLeft)
    }

    pub fn opens_towards_positive_normal(self) -> bool {
        matches!(self, Self::OutLeft | Self::OutRight)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorHardwareType {
    None,
    Knob,
    #[default]
    Lever,
    PullBar,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorStyle {
    #[default]
    Flush,
    Panel,
    Double,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowHardwareType {
    None,
    #[default]
    Latch,
    Crank,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowStyle {
    #[default]
    Picture,
    Casement,
    DoubleHung,
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
    #[serde(default)]
    pub hardware_type: DoorHardwareType,
    #[serde(default)]
    pub style: DoorStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowElement {
    pub meta: ElementMeta,
    pub wall_id: String,
    pub position_along_wall: f64,
    pub width: f64,
    pub height: f64,
    pub sill_height: f64,
    #[serde(default)]
    pub hardware_type: WindowHardwareType,
    #[serde(default)]
    pub style: WindowStyle,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StairType {
    #[default]
    Straight,
    Spiral,
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
    /// Mixed straight/curved boundary. When non-empty, overrides `boundary`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub boundary_segments: Vec<BoundarySegment>,
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
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
    #[default]
    None,
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

fn default_cabinet_width() -> f64 {
    0.61
}
fn default_cabinet_depth() -> f64 {
    0.61
}
fn default_cabinet_height() -> f64 {
    0.91
}

fn default_furniture_width() -> f64 {
    0.6
}
fn default_furniture_depth() -> f64 {
    0.6
}

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

fn default_arrow_type() -> String {
    "closed".to_string()
}

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

fn default_auto_text() -> bool {
    true
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

/// Dispatch through every `Element` variant, binding the inner struct to `$e`.
///
/// Every element type carries a `.meta` field, so this macro eliminates the
/// need to list all 28 variants by hand in accessor methods.
macro_rules! for_each_element {
    ($self:expr, $e:ident => $body:expr) => {
        match $self {
            Element::Site($e) => $body,
            Element::Level($e) => $body,
            Element::Grid($e) => $body,
            Element::Wall($e) => $body,
            Element::Floor($e) => $body,
            Element::Roof($e) => $body,
            Element::Foundation($e) => $body,
            Element::Column($e) => $body,
            Element::Beam($e) => $body,
            Element::Door($e) => $body,
            Element::Window($e) => $body,
            Element::Stair($e) => $body,
            Element::Room($e) => $body,
            Element::View($e) => $body,
            Element::Sheet($e) => $body,
            Element::Material($e) => $body,
            Element::FamilyType($e) => $body,
            Element::Generic($e) => $body,
            Element::Electrical($e) => $body,
            Element::Plumbing($e) => $body,
            Element::Furniture($e) => $body,
            Element::SiteDetail($e) => $body,
            Element::LeaderAnnotation($e) => $body,
            Element::Keynote($e) => $body,
            Element::Tag($e) => $body,
            Element::Hvac($e) => $body,
            Element::FireSafety($e) => $body,
            Element::Accessibility($e) => $body,
            Element::Cabinet($e) => $body,
        }
    };
}

impl Element {
    pub fn id(&self) -> &str {
        &self.meta().id
    }

    pub fn meta(&self) -> &ElementMeta {
        for_each_element!(self, e => &e.meta)
    }

    pub fn meta_mut(&mut self) -> &mut ElementMeta {
        for_each_element!(self, e => &mut e.meta)
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
                    Element::Door(door) if door.wall_id == id => {
                        delete_ids.push(door.meta.id.clone())
                    }
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
            let ref_fields: &[(&str, Option<&str>)] = &[
                ("level", meta.level_id.as_deref()),
                ("type", meta.type_id.as_deref()),
                ("parent", meta.parent_id.as_deref()),
                ("material", meta.material_id.as_deref()),
                ("host", meta.host_id.as_deref()),
            ];
            for &(role, ref_value) in ref_fields {
                if ref_value == Some(id) {
                    return Err(DomainError::DeleteBlocked(format!(
                        "{} {} is still referenced by element {}",
                        role,
                        id,
                        element.id()
                    )));
                }
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
            Element::Site(_) | Element::Grid(_) | Element::Material(_) | Element::FamilyType(_) => {
                1
            }
            Element::Wall(_)
            | Element::Foundation(_)
            | Element::Floor(_)
            | Element::Column(_)
            | Element::Beam(_)
            | Element::Stair(_)
            | Element::Roof(_)
            | Element::Room(_) => 2,
            Element::Door(_) | Element::Window(_) => 3,
            Element::Electrical(_)
            | Element::Plumbing(_)
            | Element::Furniture(_)
            | Element::SiteDetail(_)
            | Element::Hvac(_)
            | Element::FireSafety(_)
            | Element::Accessibility(_)
            | Element::Cabinet(_) => 3,
            Element::View(_) | Element::Sheet(_) | Element::Generic(_) => 4,
            Element::LeaderAnnotation(_) | Element::Keynote(_) | Element::Tag(_) => 5,
        });
        ordered
    }

    fn find_element(&self, id: &str) -> Option<&Element> {
        self.project
            .elements
            .iter()
            .find(|element| element.id() == id)
    }

    fn validate_common_refs(
        &self,
        meta: &ElementMeta,
        element_kind: &str,
    ) -> Result<(), DomainError> {
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

        // Validate each optional reference field: check existence, self-reference,
        // and (where applicable) that the target is the correct element kind.
        type RefCheck<'a> = (&'a str, Option<&'a str>, Option<fn(&Element) -> bool>);
        let ref_checks: &[RefCheck<'_>] = &[
            (
                "level",
                meta.level_id.as_deref(),
                Some(|e: &Element| matches!(e, Element::Level(_))),
            ),
            ("host", meta.host_id.as_deref(), None),
            (
                "type",
                meta.type_id.as_deref(),
                Some(|e: &Element| matches!(e, Element::FamilyType(_))),
            ),
            ("parent", meta.parent_id.as_deref(), None),
            (
                "material",
                meta.material_id.as_deref(),
                Some(|e: &Element| matches!(e, Element::Material(_))),
            ),
        ];

        for &(role, ref_value, type_check) in ref_checks {
            let Some(ref_id) = ref_value else { continue };
            let Some(target) = self.find_element(ref_id) else {
                return Err(DomainError::ValidationError(format!(
                    "{} references missing {} {}",
                    element_kind, role, ref_id
                )));
            };
            if target.id() == meta.id {
                return Err(DomainError::ValidationError(format!(
                    "{} cannot reference itself as {}",
                    element_kind, role
                )));
            }
            if let Some(check) = type_check {
                if !check(target) {
                    return Err(DomainError::ValidationError(format!(
                        "{} {} reference {} must point to a {}",
                        element_kind, role, ref_id, role
                    )));
                }
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

    /// Validate a wall-hosted opening (door or window).
    ///
    /// Shared logic for both door and window validation: checks dimensions,
    /// position, host reference, and wall bounds.
    #[allow(clippy::too_many_arguments)]
    fn validate_wall_hosted_opening(
        &self,
        kind: &str,
        meta: &ElementMeta,
        wall_id: &str,
        width: f64,
        height: f64,
        sill_height: f64,
        position_along_wall: f64,
    ) -> Result<(), DomainError> {
        if width <= 0.0 || height <= 0.0 || sill_height < 0.0 {
            return Err(DomainError::ValidationError(format!(
                "{} width/height must be > 0 and sill height must be >= 0",
                kind
            )));
        }
        if !(0.0..=1.0).contains(&position_along_wall) {
            return Err(DomainError::ValidationError(format!(
                "{} position_along_wall must be in [0, 1]",
                kind
            )));
        }
        let Some(host_id) = &meta.host_id else {
            return Err(DomainError::ValidationError(format!(
                "{} requires meta.host_id",
                kind
            )));
        };
        if host_id.as_ref() != wall_id {
            return Err(DomainError::ValidationError(format!(
                "{} host_id must match wall_id",
                kind
            )));
        }
        let Some(Element::Wall(wall)) = self.find_element(wall_id) else {
            return Err(DomainError::ValidationError(format!(
                "{} references missing wall {}",
                kind, wall_id
            )));
        };
        let wall_len = (wall.end[0] - wall.start[0]).hypot(wall.end[1] - wall.start[1]);
        if wall_len < 1e-6 {
            return Err(DomainError::ValidationError(format!(
                "{} host wall has zero length",
                kind
            )));
        }
        let center = position_along_wall * wall_len;
        let half = width * 0.5;
        if half > wall_len || center < half || center > wall_len - half {
            return Err(DomainError::ValidationError(format!(
                "{} opening exceeds host wall bounds",
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
                self.validate_wall_hosted_opening(
                    "door",
                    &door.meta,
                    &door.wall_id,
                    door.width,
                    door.height,
                    door.sill_height,
                    door.position_along_wall,
                )?;
            }
            Element::Window(window) => {
                self.validate_wall_hosted_opening(
                    "window",
                    &window.meta,
                    &window.wall_id,
                    window.width,
                    window.height,
                    window.sill_height,
                    window.position_along_wall,
                )?;
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

// ---------------------------------------------------------------------------
// Polygon geometry utilities
// ---------------------------------------------------------------------------

/// Compute the area of a 2D polygon using the shoelace formula.
///
/// Returns the absolute (unsigned) area. Works for both CW and CCW winding.
pub fn polygon_area(boundary: &[[f64; 2]]) -> f64 {
    polygon_signed_area(boundary).abs()
}

/// Compute the signed area of a 2D polygon using the shoelace formula.
///
/// Positive for CCW winding, negative for CW.
pub fn polygon_signed_area(boundary: &[[f64; 2]]) -> f64 {
    let n = boundary.len();
    if n < 3 {
        return 0.0;
    }
    let mut sum = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        sum += boundary[i][0] * boundary[j][1] - boundary[j][0] * boundary[i][1];
    }
    sum / 2.0
}

/// Compute the perimeter of a 2D polygon.
pub fn polygon_perimeter(boundary: &[[f64; 2]]) -> f64 {
    let n = boundary.len();
    if n < 2 {
        return 0.0;
    }
    let mut sum = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        let dx = boundary[j][0] - boundary[i][0];
        let dy = boundary[j][1] - boundary[i][1];
        sum += (dx * dx + dy * dy).sqrt();
    }
    sum
}

/// Compute the centroid (average of vertices) of a 2D polygon.
pub fn polygon_centroid(boundary: &[[f64; 2]]) -> [f64; 2] {
    if boundary.is_empty() {
        return [0.0, 0.0];
    }
    let n = boundary.len() as f64;
    let mut cx = 0.0;
    let mut cy = 0.0;
    for &[x, y] in boundary {
        cx += x;
        cy += y;
    }
    [cx / n, cy / n]
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
            arc: None,
            arc_segments: 24,
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
            arc: None,
            arc_segments: 24,
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
            hardware_type: WindowHardwareType::Latch,
            style: WindowStyle::Picture,
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
                arc: None,
                arc_segments: 24,
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
                swing: DoorSwing::OutRight,
                hardware_type: DoorHardwareType::Lever,
                style: DoorStyle::Flush,
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

    #[test]
    fn door_swing_deserializes_legacy_left_right_values() {
        let legacy_left: DoorSwing = serde_json::from_str("\"left\"").unwrap();
        let legacy_right: DoorSwing = serde_json::from_str("\"right\"").unwrap();

        assert_eq!(legacy_left, DoorSwing::OutLeft);
        assert_eq!(legacy_right, DoorSwing::OutRight);
    }

    #[test]
    fn polygon_area_rectangle() {
        let pts = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 3.0], [0.0, 3.0]];
        assert!((polygon_area(&pts) - 12.0).abs() < 1e-9);
    }

    #[test]
    fn polygon_area_cw_winding() {
        let pts = vec![[0.0, 0.0], [0.0, 3.0], [4.0, 3.0], [4.0, 0.0]];
        assert!((polygon_area(&pts) - 12.0).abs() < 1e-9);
    }

    #[test]
    fn polygon_signed_area_ccw_is_positive() {
        let pts = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 3.0], [0.0, 3.0]];
        assert!(polygon_signed_area(&pts) > 0.0);
    }

    #[test]
    fn polygon_area_degenerate() {
        assert!((polygon_area(&[]) - 0.0).abs() < 1e-9);
        assert!((polygon_area(&[[0.0, 0.0], [1.0, 0.0]]) - 0.0).abs() < 1e-9);
    }

    #[test]
    fn polygon_perimeter_square() {
        let pts = vec![[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]];
        assert!((polygon_perimeter(&pts) - 8.0).abs() < 1e-9);
    }

    #[test]
    fn polygon_centroid_rectangle() {
        let pts = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 2.0], [0.0, 2.0]];
        let c = polygon_centroid(&pts);
        assert!((c[0] - 2.0).abs() < 1e-9);
        assert!((c[1] - 1.0).abs() < 1e-9);
    }

    #[test]
    fn polygon_centroid_empty() {
        let c = polygon_centroid(&[]);
        assert!((c[0]).abs() < 1e-9);
        assert!((c[1]).abs() < 1e-9);
    }
}
