//! Command enum: every possible user-initiated mutation as a data object.
//!
//! This is the single entry point for all state changes. Every set*/toggle*/
//! add*/remove* from every Zustand store maps to exactly one Command variant.

use std::collections::HashSet;

use bcad_domain::Element;

use crate::bim_defaults::*;
use crate::chat_state::*;
use crate::document_state::*;
use crate::level_state::*;
use crate::material_state::*;
use crate::selection::SelectionState;
use crate::settings::*;
use crate::sketch_state::*;
use crate::ui_state::*;
use crate::view_state::*;

/// Every user-initiated mutation as a data object.
#[derive(Debug, Clone)]
pub enum Command {
    // ======================================================================
    // Document / Entity commands (from entity-store)
    // ======================================================================
    /// `entity-store.setProjectMeta(name, units)`
    SetProjectMeta {
        name: String,
        units: String,
    },
    /// `entity-store.clearProject()`
    ClearProject,
    /// `entity-store.upsertElement(element, 'create')`
    CreateElement {
        element: Element,
    },
    /// `entity-store.upsertElement(element, 'update')`
    UpdateElement {
        id: String,
        element: Element,
    },
    /// `entity-store.removeElement(elementId)` (compound -- cascades hosted)
    DeleteElement {
        id: String,
    },
    /// `entity-store.setElements(elements)` -- bulk sync from kernel
    SyncElements {
        elements: Vec<Element>,
    },

    // ======================================================================
    // Document-store specific
    // ======================================================================
    /// `document-store.setProjectName(name)`
    SetProjectName {
        name: String,
    },
    /// `document-store.addCadMesh(id, mesh)`
    AddCadMesh {
        id: String,
        mesh: CadMeshData,
    },
    /// `document-store.removeCadMesh(id)`
    RemoveCadMesh {
        id: String,
    },
    /// `document-store.clearCadMeshes()`
    ClearCadMeshes,
    /// `document-store.setBoxParams(params)` + `history-store.setBoxParams`
    SetBoxParams {
        params: BoxParams,
    },

    // ======================================================================
    // UI State commands (from ui-store)
    // ======================================================================
    /// `ui-store.setViewMode(mode)`
    SetViewMode {
        mode: ViewMode,
    },
    /// `ui-store.setActiveTool(tool)` -- resets dimension sub-mode if not Dimension
    SetActiveTool {
        tool: ToolType,
    },
    /// `ui-store.setDimensionSubMode(mode)`
    SetDimensionSubMode {
        mode: DimensionSubMode,
    },
    /// `ui-store.toggleGrid()`
    ToggleGrid,
    /// `ui-store.toggleSnap()`
    ToggleSnap,
    /// `ui-store.selectBody(id)`
    SelectBody {
        id: Option<String>,
    },
    /// `ui-store.toggleTheme()`
    ToggleTheme,
    /// `ui-store.setActiveRightTab(tab)`
    SetActiveRightTab {
        tab: RightTab,
    },
    /// `ui-store.setPlanSymbolProfile(profile)`
    SetPlanSymbolProfile {
        profile: PlanSymbolProfileId,
    },
    /// `ui-store.setAnnotationDensity(density)`
    SetAnnotationDensity {
        density: AnnotationDensity,
    },
    /// `ui-store.setShowFurnitureLabels(show)`
    SetShowFurnitureLabels {
        show: bool,
    },
    /// `ui-store.setShowMepText(show)`
    SetShowMepText {
        show: bool,
    },
    /// Set the active reusable door type for placement.
    SetActiveDoorFamilyType {
        id: Option<String>,
    },
    /// Set the active reusable window type for placement.
    SetActiveWindowFamilyType {
        id: Option<String>,
    },

    // ======================================================================
    // Selection commands
    // ======================================================================
    /// Select one or more elements, optionally additive.
    SelectElements {
        ids: Vec<String>,
        additive: bool,
    },
    /// Deselect specific elements.
    DeselectElements {
        ids: Vec<String>,
    },
    /// Clear all selection.
    ClearSelection,
    /// Set selection kind filter.
    SetSelectionKindFilter {
        kinds: HashSet<String>,
    },
    /// Set selection layer filter.
    SetSelectionLayerFilter {
        layers: HashSet<String>,
    },
    /// Replace selection state entirely.
    SetSelectionState {
        state: SelectionState,
    },

    // ======================================================================
    // Settings commands (from settings-store) -- all persisted
    // ======================================================================
    SetLengthUnit {
        unit: LengthUnit,
    },
    SetLightingPreset {
        preset: LightingPreset,
    },
    SetMeasurementSnapMode {
        tool: MeasurementSnapTool,
        mode: MeasurementSnapMode,
        enabled: bool,
    },
    ToggleWallsVisible,
    SetDefaultDimensionStyle {
        style: DimensionStyleId,
    },
    SetDimensionPrecision {
        precision: u8,
    },
    SetDimensionFractional {
        fractional: bool,
    },
    SetWallReferenceMode {
        mode: WallFace,
    },
    SetWallFinishThickness {
        thickness: f64,
    },

    // ======================================================================
    // BIM Default commands (from bim-store setters) -- all persisted
    // ======================================================================
    SetDefaultWallHeight {
        height: f64,
    },
    SetDefaultWallThickness {
        thickness: f64,
    },
    SetDefaultDoorWidth {
        width: f64,
    },
    SetDefaultDoorHeight {
        height: f64,
    },
    SetDefaultDoorSill {
        sill: f64,
    },
    SetDefaultDoorSwing {
        swing: DoorSwing,
    },
    SetDefaultDoorHardwareType {
        hardware_type: DoorHardwareType,
    },
    SetDefaultDoorStyle {
        style: DoorStyle,
    },
    SetDefaultFloorThickness {
        thickness: f64,
    },
    SetDefaultStairWidth {
        width: f64,
    },
    SetDefaultStairRisers {
        risers: u32,
    },
    SetDefaultStairHeight {
        height: f64,
    },
    SetDefaultStairType {
        stair_type: StairType,
    },
    SetDefaultSpiralTurns {
        turns: f64,
    },
    SetDefaultStairSideWallThickness {
        thickness: f64,
    },
    SetDefaultWindowWidth {
        width: f64,
    },
    SetDefaultWindowHeight {
        height: f64,
    },
    SetDefaultWindowSill {
        sill: f64,
    },
    SetDefaultWindowHardwareType {
        hardware_type: WindowHardwareType,
    },
    SetDefaultWindowStyle {
        style: WindowStyle,
    },
    SetDefaultColumnWidth {
        width: f64,
    },
    SetDefaultColumnDepth {
        depth: f64,
    },
    SetDefaultColumnHeight {
        height: f64,
    },
    SetDefaultBeamWidth {
        width: f64,
    },
    SetDefaultBeamDepth {
        depth: f64,
    },
    SetDefaultBeamElevation {
        elevation: f64,
    },
    SetDefaultRoofThickness {
        thickness: f64,
    },
    SetDefaultRoofElevation {
        elevation: f64,
    },
    SetDefaultRoofAutoElevation {
        enabled: bool,
    },
    SetDefaultRoofType {
        roof_type: RoofType,
    },
    SetDefaultRoofPitchDegrees {
        degrees: f64,
    },
    SetDefaultRoofRidgeAngleDegrees {
        degrees: f64,
    },
    SetDefaultFurnitureType {
        furniture_type: FurnitureSymbolType,
    },
    SetDefaultFurnitureRotation {
        rotation: f64,
    },
    SetDefaultPlumbingType {
        plumbing_type: PlumbingSymbolType,
    },
    SetDefaultPlumbingRotation {
        rotation: f64,
    },
    SetDefaultElectricalType {
        electrical_type: ElectricalSymbolType,
    },
    SetDefaultElectricalRotation {
        rotation: f64,
    },
    SetDefaultCabinetType {
        cabinet_type: CabinetType,
    },
    SetDefaultCabinetRotation {
        rotation: f64,
    },
    SetDefaultCabinetDoorCount {
        count: u32,
    },
    SetDefaultCabinetDrawerCount {
        count: u32,
    },
    SetDefaultHvacType {
        hvac_type: HvacSymbolType,
    },
    SetDefaultHvacRotation {
        rotation: f64,
    },
    SetDefaultFireSafetyType {
        fire_safety_type: FireSafetySymbolType,
    },
    SetDefaultFireSafetyRotation {
        rotation: f64,
    },
    SetDefaultAccessibilityType {
        accessibility_type: AccessibilitySymbolType,
    },
    SetDefaultAccessibilityRotation {
        rotation: f64,
    },
    SetAutoExtrudeSketch {
        enabled: bool,
    },
    SetSketchExtrudeMode {
        mode: SketchExtrudeMode,
    },

    // ======================================================================
    // BIM Transient commands (from bim-store wall/door ops)
    // ======================================================================
    AddBimWall {
        wall: WallData,
    },
    UpdateBimWall {
        id: String,
        patch: WallDataPatch,
    },
    RemoveBimWall {
        id: String,
    },
    AddBimDoor {
        door: DoorData,
    },
    RemoveBimDoor {
        id: String,
    },
    SetPendingWallStart {
        point: Option<[f64; 2]>,
    },

    // ======================================================================
    // Level commands (from level-store)
    // ======================================================================
    AddLevel {
        name: String,
        elevation: f64,
    },
    RemoveLevel {
        id: String,
    },
    RenameLevel {
        id: String,
        name: String,
    },
    SetLevelElevation {
        id: String,
        elevation: f64,
    },
    ReorderLevel {
        id: String,
        new_index: usize,
    },
    SetActiveLevel {
        id: String,
    },
    ToggleLevelVisibility {
        id: String,
    },
    SetLevelVisibility {
        id: String,
        visibility: LevelVisibility,
    },
    SyncFromKernelLevels {
        levels: Vec<KernelLevelSnapshot>,
        preferred_active: Option<String>,
    },

    // ======================================================================
    // Layer commands (from layer-store)
    // ======================================================================
    SetLayerVisibility {
        id: String,
        visible: bool,
    },
    SetLayerLocked {
        id: String,
        locked: bool,
    },
    SetActiveLayer {
        id: String,
    },
    ToggleLayerVisibility {
        id: String,
    },
    SetLayerPreset {
        preset: String,
    },

    // ======================================================================
    // Sketch commands (from sketch-store)
    // ======================================================================
    ActivateSketch,
    DeactivateSketch,
    SetSketchDrawMode {
        mode: SketchDrawMode,
    },
    SetSketchConstraintMode {
        mode: SketchConstraintMode,
    },
    AddSketchPoint {
        id: String,
        x: f64,
        y: f64,
    },
    UpdateSketchPoint {
        id: String,
        x: f64,
        y: f64,
    },
    AddSketchLine {
        id: String,
        p1: String,
        p2: String,
    },
    AddSketchCircle {
        id: String,
        center: String,
        radius: f64,
    },
    AddSketchProfile {
        profile: SketchProfile,
    },
    SetSketchPendingPoint {
        point: Option<SketchPoint>,
    },
    SetSketchPreviewPoint {
        point: Option<[f64; 2]>,
    },
    SetSketchLineChainStart {
        id: Option<String>,
    },
    SelectSketchPoint {
        id: String,
        additive: bool,
    },
    SelectSketchLine {
        id: String,
        additive: bool,
    },
    ClearSketchSelection,
    ToggleSketchPointSelection {
        id: String,
    },
    ToggleSketchLineSelection {
        id: String,
    },
    /// Side-effect: runs solver after.
    AddSketchConstraint {
        constraint: SketchConstraint,
    },
    /// Side-effect: runs solver after.
    RemoveSketchConstraint {
        id: String,
    },
    RunSketchSolver,
    ClearSketch,

    // ======================================================================
    // View commands (from view-store)
    // ======================================================================
    AddSavedView {
        view: SavedView,
    },
    RemoveSavedView {
        id: String,
    },
    UpdateSavedView {
        id: String,
        patch: SavedViewPatch,
    },
    SetActiveView {
        id: Option<String>,
    },

    // ======================================================================
    // Camera commands (from camera-store)
    // ======================================================================
    SetCamera {
        position: [f64; 3],
        target: [f64; 3],
    },
    SetScreenshot {
        png_data: Vec<u8>,
    },

    // ======================================================================
    // Material commands (from material-store)
    // ======================================================================
    SetMaterials {
        materials: Vec<PbrMaterial>,
    },
    SetBodyMaterial {
        body_id: String,
        material_id: String,
    },
    SelectMaterial {
        id: Option<String>,
    },

    // ======================================================================
    // Measurement commands (from measurement-store)
    // ======================================================================
    SetMeasurementCursor {
        cursor: Option<[f64; 3]>,
    },
    SetToolReadout {
        readout: Option<String>,
    },
    RequestMeasurementReset,
    ClearMeasurement,

    // ======================================================================
    // Chat commands (from chat-store)
    // ======================================================================
    CreateChat,
    DeleteChat {
        id: String,
    },
    SetActiveChat {
        id: String,
    },
    SetChatUiMessages {
        chat_id: String,
        messages: Vec<UiChatMessage>,
    },
    SetChatApiMessages {
        chat_id: String,
        messages: Vec<ApiMessage>,
    },
    SetChatPlanMode {
        chat_id: String,
        enabled: bool,
    },
    SetChatTitle {
        chat_id: String,
        title: String,
    },
    SetIsStreaming {
        streaming: bool,
    },
    SetStreamingAssistantId {
        id: Option<String>,
    },
    StopGeneration,
    /// Send a user chat message (content only -- backend streaming handled separately).
    SendChatMessage {
        content: String,
    },
    /// Toggle plan mode for the active chat.
    SetPlanMode {
        enabled: bool,
    },
    /// Clear the active chat and start fresh.
    ClearChat,

    // ======================================================================
    // Element manipulation
    // ======================================================================
    /// Move an element by a delta in the XZ plane.
    MoveElement {
        id: String,
        delta_x: f64,
        delta_z: f64,
    },
    /// Auto-join nearby wall endpoints after a wall is created.
    /// Must be processed AFTER the corresponding CreateElement so the new wall
    /// is already present in `AppState`.
    AutoJoinWalls {
        wall_id: String,
        level_id: Option<String>,
    },

    // ======================================================================
    // Clipboard operations
    // ======================================================================
    /// Copy the currently selected element to the clipboard.
    CopySelected,
    /// Paste the clipboard element with an offset, creating a new element.
    PasteFromClipboard,
    /// Duplicate the selected element in one step (copy + paste).
    DuplicateSelected,

    // ======================================================================
    // Undo / Redo
    // ======================================================================
    Undo,
    Redo,

    // ======================================================================
    // Compound (multiple sub-commands, single undo step)
    // ======================================================================
    Compound {
        label: String,
        commands: Vec<Command>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify that representative Command variants from each category
    /// can be constructed. This catches missing imports and compile errors.
    #[test]
    fn construct_document_commands() {
        let _ = Command::SetProjectMeta {
            name: "P".into(),
            units: "m".into(),
        };
        let _ = Command::ClearProject;
        let _ = Command::DeleteElement { id: "e1".into() };
        let _ = Command::SetProjectName { name: "N".into() };
        let _ = Command::ClearCadMeshes;
        let _ = Command::RemoveCadMesh { id: "m1".into() };
        let _ = Command::SetBoxParams {
            params: BoxParams {
                width: 1.0,
                height: 1.0,
                depth: 1.0,
            },
        };
    }

    #[test]
    fn construct_ui_commands() {
        let _ = Command::SetViewMode {
            mode: ViewMode::ThreeD,
        };
        let _ = Command::SetActiveTool {
            tool: ToolType::Wall,
        };
        let _ = Command::SetDimensionSubMode {
            mode: DimensionSubMode::Chain,
        };
        let _ = Command::ToggleGrid;
        let _ = Command::ToggleSnap;
        let _ = Command::SelectBody {
            id: Some("b1".into()),
        };
        let _ = Command::ToggleTheme;
        let _ = Command::SetActiveRightTab {
            tab: RightTab::Chat,
        };
        let _ = Command::SetShowFurnitureLabels { show: true };
        let _ = Command::SetShowMepText { show: false };
        let _ = Command::SetActiveDoorFamilyType {
            id: Some("door-type-1".into()),
        };
        let _ = Command::SetActiveWindowFamilyType {
            id: Some("window-type-1".into()),
        };
    }

    #[test]
    fn construct_selection_commands() {
        let _ = Command::SelectElements {
            ids: vec!["a".into()],
            additive: false,
        };
        let _ = Command::DeselectElements { ids: vec![] };
        let _ = Command::ClearSelection;
        let _ = Command::SetSelectionKindFilter {
            kinds: HashSet::new(),
        };
        let _ = Command::SetSelectionLayerFilter {
            layers: HashSet::new(),
        };
    }

    #[test]
    fn construct_settings_commands() {
        let _ = Command::SetLengthUnit {
            unit: LengthUnit::Ft,
        };
        let _ = Command::SetLightingPreset {
            preset: LightingPreset::Studio,
        };
        let _ = Command::ToggleWallsVisible;
        let _ = Command::SetDimensionPrecision { precision: 4 };
        let _ = Command::SetWallReferenceMode {
            mode: WallFace::StudInner,
        };
    }

    #[test]
    fn construct_bim_default_commands() {
        let _ = Command::SetDefaultWallHeight { height: 3.5 };
        let _ = Command::SetDefaultDoorSwing {
            swing: DoorSwing::OutLeft,
        };
        let _ = Command::SetDefaultDoorHardwareType {
            hardware_type: DoorHardwareType::Knob,
        };
        let _ = Command::SetDefaultDoorStyle {
            style: DoorStyle::Panel,
        };
        let _ = Command::SetDefaultWindowHardwareType {
            hardware_type: WindowHardwareType::Crank,
        };
        let _ = Command::SetDefaultWindowStyle {
            style: WindowStyle::DoubleHung,
        };
        let _ = Command::SetDefaultStairType {
            stair_type: StairType::Spiral,
        };
        let _ = Command::SetDefaultRoofType {
            roof_type: RoofType::Hip,
        };
        let _ = Command::SetDefaultFurnitureType {
            furniture_type: FurnitureSymbolType::Sofa,
        };
        let _ = Command::SetAutoExtrudeSketch { enabled: true };
    }

    #[test]
    fn construct_level_commands() {
        let _ = Command::AddLevel {
            name: "Level 3".into(),
            elevation: 9.0,
        };
        let _ = Command::RemoveLevel { id: "l1".into() };
        let _ = Command::SetActiveLevel { id: "l2".into() };
        let _ = Command::ToggleLevelVisibility { id: "l1".into() };
    }

    #[test]
    fn construct_sketch_commands() {
        let _ = Command::ActivateSketch;
        let _ = Command::DeactivateSketch;
        let _ = Command::SetSketchDrawMode {
            mode: SketchDrawMode::Line,
        };
        let _ = Command::AddSketchPoint {
            id: "p1".into(),
            x: 0.0,
            y: 0.0,
        };
        let _ = Command::ClearSketch;
    }

    #[test]
    fn construct_undo_redo() {
        let _ = Command::Undo;
        let _ = Command::Redo;
    }

    #[test]
    fn construct_compound_with_inner_commands() {
        let compound = Command::Compound {
            label: "batch op".into(),
            commands: vec![
                Command::ClearProject,
                Command::SetViewMode {
                    mode: ViewMode::TwoD,
                },
                Command::SetDefaultWallHeight { height: 4.0 },
            ],
        };
        if let Command::Compound { commands, label } = compound {
            assert_eq!(label, "batch op");
            assert_eq!(commands.len(), 3);
        } else {
            panic!("expected Compound");
        }
    }

    #[test]
    fn command_is_clone() {
        let cmd = Command::SetProjectName {
            name: "test".into(),
        };
        let cloned = cmd.clone();
        // Debug output should match
        assert_eq!(format!("{:?}", cmd), format!("{:?}", cloned));
    }
}
