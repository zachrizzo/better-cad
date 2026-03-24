//! BIM tool defaults replacing the persisted portion of `bim-store.ts`.
//!
//! Every default value matches the TypeScript store EXACTLY.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Symbol type enums not in bcad-domain (defined here for state use)
// ---------------------------------------------------------------------------

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
    Nightstand,
    CoffeeTable,
    TvConsole,
    ConsoleTable,
    Bench,
    Ottoman,
    Vanity,
    Microwave,
    Oven,
    RangeHood,
    Plant,
    Mirror,
    Fireplace,
    CoffeeMaker,
    Artwork,
}

impl Default for FurnitureSymbolType {
    fn default() -> Self {
        Self::Desk
    }
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

impl Default for PlumbingSymbolType {
    fn default() -> Self {
        Self::Toilet
    }
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

impl Default for ElectricalSymbolType {
    fn default() -> Self {
        Self::Outlet
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CabinetType {
    Base,
    Upper,
    Tall,
    CornerBase,
    CornerUpper,
    CornerTall,
    SinkBase,
    LazySusan,
    BlindCorner,
    Pantry,
    DrawerBase,
    ApplianceGarage,
}

impl Default for CabinetType {
    fn default() -> Self {
        Self::Base
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HvacSymbolType {
    SupplyVent,
    ReturnVent,
    Thermostat,
    ExhaustFan,
    Ductwork,
    MiniSplit,
    AirHandler,
    CondensingUnit,
    Damper,
    Diffuser,
}

impl Default for HvacSymbolType {
    fn default() -> Self {
        Self::SupplyVent
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FireSafetySymbolType {
    FireExtinguisher,
    SprinklerHead,
    ExitSign,
    PullStation,
    SmokeAlarm,
    FireAlarmPanel,
    FireHoseCabinet,
    Annunciator,
}

impl Default for FireSafetySymbolType {
    fn default() -> Self {
        Self::FireExtinguisher
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccessibilitySymbolType {
    Wheelchair,
    Ramp,
    GrabBar,
    AccessibleParking,
    TactileWarning,
    AdaRestroom,
    HearingLoop,
}

impl Default for AccessibilitySymbolType {
    fn default() -> Self {
        Self::Wheelchair
    }
}

// ---------------------------------------------------------------------------
// DoorSwing, StairType, RoofType, SketchExtrudeMode
// (State-level enums that mirror domain but are decoupled)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorSwing {
    #[serde(alias = "left")]
    OutLeft,
    #[serde(alias = "right")]
    OutRight,
    InLeft,
    InRight,
}

impl Default for DoorSwing {
    fn default() -> Self {
        Self::OutRight
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorHardwareType {
    None,
    Knob,
    Lever,
    PullBar,
}

impl Default for DoorHardwareType {
    fn default() -> Self {
        Self::Lever
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DoorStyle {
    Flush,
    Panel,
    Double,
}

impl Default for DoorStyle {
    fn default() -> Self {
        Self::Flush
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowHardwareType {
    None,
    Latch,
    Crank,
}

impl Default for WindowHardwareType {
    fn default() -> Self {
        Self::Latch
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowStyle {
    Picture,
    Casement,
    DoubleHung,
}

impl Default for WindowStyle {
    fn default() -> Self {
        Self::Picture
    }
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
        Self::Gable
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SketchExtrudeMode {
    Walls,
    Solid,
}

impl Default for SketchExtrudeMode {
    fn default() -> Self {
        Self::Walls
    }
}

// ---------------------------------------------------------------------------
// BimDefaults  (the composite struct -- all persisted)
// ---------------------------------------------------------------------------

/// All BIM tool defaults. Every value matches the TypeScript `bim-store.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BimDefaults {
    // -- Wall --
    pub wall_height: f64,
    pub wall_thickness: f64,
    // -- Door --
    pub door_width: f64,
    pub door_height: f64,
    pub door_sill: f64,
    pub door_swing: DoorSwing,
    #[serde(default)]
    pub door_hardware_type: DoorHardwareType,
    #[serde(default)]
    pub door_style: DoorStyle,
    // -- Floor --
    pub floor_thickness: f64,
    // -- Stair --
    pub stair_width: f64,
    pub stair_risers: u32,
    pub stair_height: f64,
    pub stair_type: StairType,
    pub spiral_turns: f64,
    pub stair_side_wall_thickness: f64,
    // -- Window --
    pub window_width: f64,
    pub window_height: f64,
    pub window_sill: f64,
    #[serde(default)]
    pub window_hardware_type: WindowHardwareType,
    #[serde(default)]
    pub window_style: WindowStyle,
    // -- Column --
    pub column_width: f64,
    pub column_depth: f64,
    pub column_height: f64,
    // -- Beam --
    pub beam_width: f64,
    pub beam_depth: f64,
    pub beam_elevation: f64,
    // -- Roof --
    pub roof_thickness: f64,
    pub roof_elevation: f64,
    pub roof_auto_elevation: bool,
    pub roof_type: RoofType,
    pub roof_pitch_degrees: f64,
    pub roof_ridge_angle_degrees: f64,
    // -- Furniture --
    pub furniture_type: FurnitureSymbolType,
    pub furniture_rotation: f64,
    // -- Plumbing --
    pub plumbing_type: PlumbingSymbolType,
    pub plumbing_rotation: f64,
    // -- Electrical --
    pub electrical_type: ElectricalSymbolType,
    pub electrical_rotation: f64,
    // -- Cabinet --
    pub cabinet_type: CabinetType,
    pub cabinet_rotation: f64,
    pub cabinet_door_count: u32,
    pub cabinet_drawer_count: u32,
    // -- HVAC --
    pub hvac_type: HvacSymbolType,
    pub hvac_rotation: f64,
    // -- Fire Safety --
    pub fire_safety_type: FireSafetySymbolType,
    pub fire_safety_rotation: f64,
    // -- Accessibility --
    pub accessibility_type: AccessibilitySymbolType,
    pub accessibility_rotation: f64,
    // -- Sketch extrude --
    pub auto_extrude_sketch: bool,
    pub sketch_extrude_mode: SketchExtrudeMode,
}

impl Default for BimDefaults {
    fn default() -> Self {
        Self {
            // Wall
            wall_height: 3.0,
            wall_thickness: 0.2,
            // Door
            door_width: 0.9,
            door_height: 2.1,
            door_sill: 0.0,
            door_swing: DoorSwing::OutRight,
            door_hardware_type: DoorHardwareType::Lever,
            door_style: DoorStyle::Flush,
            // Floor
            floor_thickness: 0.25,
            // Stair
            stair_width: 1.1,
            stair_risers: 16,
            stair_height: 3.0,
            stair_type: StairType::Straight,
            spiral_turns: 1.0,
            stair_side_wall_thickness: 0.12,
            // Window
            window_width: 1.2,
            window_height: 1.2,
            window_sill: 0.9,
            window_hardware_type: WindowHardwareType::Latch,
            window_style: WindowStyle::Picture,
            // Column
            column_width: 0.3,
            column_depth: 0.3,
            column_height: 3.0,
            // Beam
            beam_width: 0.2,
            beam_depth: 0.4,
            beam_elevation: 3.0,
            // Roof
            roof_thickness: 0.3,
            roof_elevation: 3.0,
            roof_auto_elevation: true,
            roof_type: RoofType::Gable,
            roof_pitch_degrees: 30.0,
            roof_ridge_angle_degrees: 0.0,
            // Furniture
            furniture_type: FurnitureSymbolType::Desk,
            furniture_rotation: 0.0,
            // Plumbing
            plumbing_type: PlumbingSymbolType::Toilet,
            plumbing_rotation: 0.0,
            // Electrical
            electrical_type: ElectricalSymbolType::Outlet,
            electrical_rotation: 0.0,
            // Cabinet
            cabinet_type: CabinetType::Base,
            cabinet_rotation: 0.0,
            cabinet_door_count: 2,
            cabinet_drawer_count: 0,
            // HVAC
            hvac_type: HvacSymbolType::SupplyVent,
            hvac_rotation: 0.0,
            // Fire Safety
            fire_safety_type: FireSafetySymbolType::FireExtinguisher,
            fire_safety_rotation: 0.0,
            // Accessibility
            accessibility_type: AccessibilitySymbolType::Wheelchair,
            accessibility_rotation: 0.0,
            // Sketch extrude
            auto_extrude_sketch: false,
            sketch_extrude_mode: SketchExtrudeMode::Walls,
        }
    }
}

// ---------------------------------------------------------------------------
// BimTransientState  (non-persisted runtime data from bim-store)
// ---------------------------------------------------------------------------

/// Transient BIM data: shadow wall/door maps and pending wall start.
#[derive(Debug, Clone, Default)]
pub struct BimTransientState {
    pub walls: std::collections::HashMap<String, WallData>,
    pub doors: std::collections::HashMap<String, DoorData>,
    pub pending_wall_start: Option<[f64; 2]>,
}

#[derive(Debug, Clone)]
pub struct WallData {
    pub id: String,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub height: f64,
    pub thickness: f64,
}

#[derive(Debug, Clone)]
pub struct DoorData {
    pub id: String,
    pub wall_id: String,
    pub position_along_wall: f64,
    pub center: [f64; 2],
    pub direction: [f64; 2],
    pub width: f64,
    pub height: f64,
    pub sill_height: f64,
}

/// Patch struct for partial wall updates.
#[derive(Debug, Clone, Default)]
pub struct WallDataPatch {
    pub start: Option<[f64; 2]>,
    pub end: Option<[f64; 2]>,
    pub height: Option<f64>,
    pub thickness: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wall_height_default() {
        let d = BimDefaults::default();
        assert!((d.wall_height - 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn wall_thickness_default() {
        let d = BimDefaults::default();
        assert!((d.wall_thickness - 0.2).abs() < f64::EPSILON);
    }

    #[test]
    fn door_width_default() {
        let d = BimDefaults::default();
        assert!((d.door_width - 0.9).abs() < f64::EPSILON);
    }

    #[test]
    fn door_height_default() {
        let d = BimDefaults::default();
        assert!((d.door_height - 2.1).abs() < f64::EPSILON);
    }

    #[test]
    fn floor_thickness_default() {
        let d = BimDefaults::default();
        assert!((d.floor_thickness - 0.25).abs() < f64::EPSILON);
    }

    #[test]
    fn stair_width_default() {
        let d = BimDefaults::default();
        assert!((d.stair_width - 1.1).abs() < f64::EPSILON);
    }

    #[test]
    fn stair_risers_default() {
        let d = BimDefaults::default();
        assert_eq!(d.stair_risers, 16);
    }

    #[test]
    fn window_width_default() {
        let d = BimDefaults::default();
        assert!((d.window_width - 1.2).abs() < f64::EPSILON);
    }

    #[test]
    fn window_sill_default() {
        let d = BimDefaults::default();
        assert!((d.window_sill - 0.9).abs() < f64::EPSILON);
    }

    #[test]
    fn column_width_default() {
        let d = BimDefaults::default();
        assert!((d.column_width - 0.3).abs() < f64::EPSILON);
    }

    #[test]
    fn beam_depth_default() {
        let d = BimDefaults::default();
        assert!((d.beam_depth - 0.4).abs() < f64::EPSILON);
    }

    #[test]
    fn roof_pitch_degrees_default() {
        let d = BimDefaults::default();
        assert!((d.roof_pitch_degrees - 30.0).abs() < f64::EPSILON);
    }

    #[test]
    fn door_swing_default_is_out_right() {
        assert_eq!(DoorSwing::default(), DoorSwing::OutRight);
    }

    #[test]
    fn door_hardware_default_is_lever() {
        assert_eq!(DoorHardwareType::default(), DoorHardwareType::Lever);
    }

    #[test]
    fn door_style_default_is_flush() {
        assert_eq!(DoorStyle::default(), DoorStyle::Flush);
    }

    #[test]
    fn door_swing_deserializes_legacy_left_right_values() {
        let legacy_left: DoorSwing = serde_json::from_str("\"left\"").unwrap();
        let legacy_right: DoorSwing = serde_json::from_str("\"right\"").unwrap();

        assert_eq!(legacy_left, DoorSwing::OutLeft);
        assert_eq!(legacy_right, DoorSwing::OutRight);
    }

    #[test]
    fn window_hardware_default_is_latch() {
        assert_eq!(WindowHardwareType::default(), WindowHardwareType::Latch);
    }

    #[test]
    fn window_style_default_is_picture() {
        assert_eq!(WindowStyle::default(), WindowStyle::Picture);
    }

    #[test]
    fn stair_type_default_is_straight() {
        assert_eq!(StairType::default(), StairType::Straight);
    }

    #[test]
    fn roof_type_default_is_gable() {
        assert_eq!(RoofType::default(), RoofType::Gable);
    }

    #[test]
    fn sketch_extrude_mode_default_is_walls() {
        assert_eq!(SketchExtrudeMode::default(), SketchExtrudeMode::Walls);
    }

    #[test]
    fn furniture_type_default_is_desk() {
        assert_eq!(FurnitureSymbolType::default(), FurnitureSymbolType::Desk);
    }

    #[test]
    fn bim_transient_default_is_empty() {
        let t = BimTransientState::default();
        assert!(t.walls.is_empty());
        assert!(t.doors.is_empty());
        assert!(t.pending_wall_start.is_none());
    }
}
