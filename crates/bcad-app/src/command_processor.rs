//! Central command processor: dispatches `Command` variants to mutate `AppState`.
//!
//! All state changes flow through this module. The event loop collects commands
//! from the egui UI and the tool system, then passes them here.

use bcad_state::history::HistoryEntry;
use bcad_state::{AppState, ChangeFlags, Command};

/// Process a batch of commands, mutating `AppState` accordingly.
/// Returns the set of `ChangeFlags` indicating which state slices changed.
pub fn process_commands(commands: Vec<Command>, state: &mut AppState) -> ChangeFlags {
    let mut flags = ChangeFlags::empty();

    for cmd in commands {
        flags |= dispatch_one(cmd, state);
    }

    // Update the change flags on state so UI subscribers can react
    state.change_flags = flags;
    if !flags.is_empty() {
        state.last_change_at = std::time::Instant::now();
    }

    flags
}

/// Get the current time as epoch milliseconds (for history entries).
fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Dispatch a single command without pushing to history.
/// Used by undo/redo to replay inverse/forward commands.
fn dispatch_one_no_history(cmd: Command, state: &mut AppState) -> ChangeFlags {
    match cmd {
        Command::CreateElement { element } => {
            let id = element.meta().id.clone();
            state.document.prototype.project.elements.push(element);
            state
                .document
                .append_transaction(bcad_state::document_state::TransactionAction::Create, &id);
            ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT
        }
        Command::UpdateElement { id, element } => {
            if let Some(existing) = state
                .document
                .prototype
                .project
                .elements
                .iter_mut()
                .find(|e| e.meta().id == id)
            {
                *existing = element;
            }
            state
                .document
                .append_transaction(bcad_state::document_state::TransactionAction::Update, &id);
            ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT
        }
        Command::DeleteElement { id } => {
            state
                .document
                .prototype
                .project
                .elements
                .retain(|e| e.meta().id != id);
            state
                .document
                .append_transaction(bcad_state::document_state::TransactionAction::Delete, &id);
            ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT
        }
        // For compound commands during undo/redo, recurse without history
        Command::Compound { commands, .. } => {
            let mut flags = ChangeFlags::empty();
            for sub_cmd in commands {
                flags |= dispatch_one_no_history(sub_cmd, state);
            }
            flags
        }
        // For any other command dispatched during undo/redo, use normal dispatch
        other => dispatch_one(other, state),
    }
}

/// Dispatch a single command, returning the affected change flags.
fn dispatch_one(cmd: Command, state: &mut AppState) -> ChangeFlags {
    match cmd {
        // ---- Document / Entity ----
        Command::SetProjectMeta { name, units } => {
            state.document.prototype.project.name = name;
            state.document.prototype.project.units = units;
            ChangeFlags::DOCUMENT
        }
        Command::ClearProject => {
            state.document = Default::default();
            state.history.clear();
            state.clipboard = None;
            ChangeFlags::DOCUMENT
                | ChangeFlags::ELEMENTS
                | ChangeFlags::MESHES
                | ChangeFlags::HISTORY
        }
        Command::CreateElement { element } => {
            let id = element.meta().id.clone();
            let label = format!("Create {}", element.meta().name);
            // Push history entry: inverse is to delete, forward is to re-create
            state.history.push(HistoryEntry {
                label,
                inverse: Command::DeleteElement { id: id.clone() },
                forward: Command::CreateElement {
                    element: element.clone(),
                },
                timestamp: now_millis(),
            });
            state.document.prototype.project.elements.push(element);
            state
                .document
                .append_transaction(bcad_state::document_state::TransactionAction::Create, &id);
            ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT | ChangeFlags::HISTORY
        }
        Command::UpdateElement { id, element } => {
            // Capture old element for undo before overwriting
            let old_element = state
                .document
                .prototype
                .project
                .elements
                .iter()
                .find(|e| e.meta().id == id)
                .cloned();
            if let Some(ref old) = old_element {
                let label = format!("Update {}", old.meta().name);
                state.history.push(HistoryEntry {
                    label,
                    inverse: Command::UpdateElement {
                        id: id.clone(),
                        element: old.clone(),
                    },
                    forward: Command::UpdateElement {
                        id: id.clone(),
                        element: element.clone(),
                    },
                    timestamp: now_millis(),
                });
            }
            if let Some(existing) = state
                .document
                .prototype
                .project
                .elements
                .iter_mut()
                .find(|e| e.meta().id == id)
            {
                *existing = element;
            }
            state
                .document
                .append_transaction(bcad_state::document_state::TransactionAction::Update, &id);
            ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT | ChangeFlags::HISTORY
        }
        Command::DeleteElement { id } => {
            // Capture element before deletion for undo
            let old_element = state
                .document
                .prototype
                .project
                .elements
                .iter()
                .find(|e| e.meta().id == id)
                .cloned();
            if let Some(ref old) = old_element {
                let label = format!("Delete {}", old.meta().name);
                state.history.push(HistoryEntry {
                    label,
                    inverse: Command::CreateElement {
                        element: old.clone(),
                    },
                    forward: Command::DeleteElement { id: id.clone() },
                    timestamp: now_millis(),
                });
            }
            state
                .document
                .prototype
                .project
                .elements
                .retain(|e| e.meta().id != id);
            state
                .document
                .append_transaction(bcad_state::document_state::TransactionAction::Delete, &id);
            ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT | ChangeFlags::HISTORY
        }
        Command::SyncElements { elements } => {
            state.document.prototype.project.elements = elements;
            ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT
        }

        // ---- Document-store specific ----
        Command::SetProjectName { name } => {
            state.document.prototype.project.name = name;
            ChangeFlags::DOCUMENT
        }
        Command::AddCadMesh { id, mesh } => {
            state.document.cad_meshes.insert(id, mesh);
            ChangeFlags::MESHES
        }
        Command::RemoveCadMesh { id } => {
            state.document.cad_meshes.remove(&id);
            ChangeFlags::MESHES
        }
        Command::ClearCadMeshes => {
            state.document.cad_meshes.clear();
            ChangeFlags::MESHES
        }
        Command::SetBoxParams { params } => {
            state.document.box_params = params;
            ChangeFlags::DOCUMENT
        }

        // ---- UI State ----
        Command::SetViewMode { mode } => {
            state.ui.view_mode = mode;
            ChangeFlags::UI
        }
        Command::SetActiveTool { tool } => {
            state.ui.active_tool = tool;
            if tool != bcad_state::ui_state::ToolType::Dimension {
                state.ui.dimension_sub_mode = bcad_state::ui_state::DimensionSubMode::Aligned;
            }
            state.sketch.active = tool == bcad_state::ui_state::ToolType::Sketch;
            ChangeFlags::UI
        }
        Command::SetDimensionSubMode { mode } => {
            state.ui.dimension_sub_mode = mode;
            ChangeFlags::UI
        }
        Command::ToggleGrid => {
            state.ui.show_grid = !state.ui.show_grid;
            ChangeFlags::UI
        }
        Command::ToggleSnap => {
            state.ui.snap_enabled = !state.ui.snap_enabled;
            ChangeFlags::UI
        }
        Command::SelectBody { id } => {
            state.ui.selected_body_id = id;
            ChangeFlags::UI | ChangeFlags::SELECTION
        }
        Command::ToggleTheme => {
            state.ui.theme = match state.ui.theme {
                bcad_state::ui_state::Theme::Dark => bcad_state::ui_state::Theme::Light,
                bcad_state::ui_state::Theme::Light => bcad_state::ui_state::Theme::Dark,
            };
            ChangeFlags::UI
        }
        Command::SetActiveRightTab { tab } => {
            state.ui.active_right_tab = tab;
            ChangeFlags::UI
        }
        Command::SetPlanSymbolProfile { profile } => {
            state.ui.plan_symbol_profile = profile;
            ChangeFlags::UI
        }
        Command::SetAnnotationDensity { density } => {
            state.ui.annotation_density = density;
            ChangeFlags::UI
        }
        Command::SetShowFurnitureLabels { show } => {
            state.ui.show_furniture_labels = show;
            ChangeFlags::UI
        }
        Command::SetShowMepText { show } => {
            state.ui.show_mep_text = show;
            ChangeFlags::UI
        }
        Command::SetActiveDoorFamilyType { id } => {
            state.ui.active_door_family_type_id = id;
            ChangeFlags::UI
        }
        Command::SetActiveWindowFamilyType { id } => {
            state.ui.active_window_family_type_id = id;
            ChangeFlags::UI
        }

        // ---- Selection ----
        Command::SelectElements { .. } => ChangeFlags::SELECTION,
        Command::DeselectElements { .. } => ChangeFlags::SELECTION,
        Command::ClearSelection => ChangeFlags::SELECTION,
        Command::SetSelectionKindFilter { .. } => ChangeFlags::SELECTION,
        Command::SetSelectionLayerFilter { .. } => ChangeFlags::SELECTION,
        Command::SetSelectionState { .. } => ChangeFlags::SELECTION,

        // ---- Settings ----
        Command::SetLengthUnit { unit } => {
            state.settings.length_unit = unit;
            ChangeFlags::SETTINGS
        }
        Command::SetLightingPreset { preset } => {
            state.settings.lighting_preset = preset;
            ChangeFlags::SETTINGS
        }
        Command::SetMeasurementSnapMode { .. } => ChangeFlags::SETTINGS,
        Command::ToggleWallsVisible => {
            state.settings.walls_visible = !state.settings.walls_visible;
            ChangeFlags::SETTINGS
        }
        Command::SetDefaultDimensionStyle { style } => {
            state.settings.default_dimension_style = style;
            ChangeFlags::SETTINGS
        }
        Command::SetDimensionPrecision { precision } => {
            state.settings.dimension_precision = precision;
            ChangeFlags::SETTINGS
        }
        Command::SetDimensionFractional { fractional } => {
            state.settings.dimension_fractional = fractional;
            ChangeFlags::SETTINGS
        }
        Command::SetWallReferenceMode { mode } => {
            state.settings.wall_reference_mode = mode;
            ChangeFlags::SETTINGS
        }
        Command::SetWallFinishThickness { thickness } => {
            state.settings.wall_finish_thickness = thickness;
            ChangeFlags::SETTINGS
        }

        // ---- BIM Defaults ----
        Command::SetDefaultWallHeight { height } => {
            state.bim_defaults.wall_height = height;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultWallThickness { thickness } => {
            state.bim_defaults.wall_thickness = thickness;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultDoorWidth { width } => {
            state.bim_defaults.door_width = width;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultDoorHeight { height } => {
            state.bim_defaults.door_height = height;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultDoorSill { sill } => {
            state.bim_defaults.door_sill = sill;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultDoorSwing { swing } => {
            state.bim_defaults.door_swing = swing;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultDoorHardwareType { hardware_type } => {
            state.bim_defaults.door_hardware_type = hardware_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultDoorStyle { style } => {
            state.bim_defaults.door_style = style;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultFloorThickness { thickness } => {
            state.bim_defaults.floor_thickness = thickness;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultStairWidth { width } => {
            state.bim_defaults.stair_width = width;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultStairRisers { risers } => {
            state.bim_defaults.stair_risers = risers;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultStairHeight { height } => {
            state.bim_defaults.stair_height = height;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultStairType { stair_type } => {
            state.bim_defaults.stair_type = stair_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultSpiralTurns { turns } => {
            state.bim_defaults.spiral_turns = turns;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultStairSideWallThickness { thickness } => {
            state.bim_defaults.stair_side_wall_thickness = thickness;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultWindowWidth { width } => {
            state.bim_defaults.window_width = width;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultWindowHeight { height } => {
            state.bim_defaults.window_height = height;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultWindowSill { sill } => {
            state.bim_defaults.window_sill = sill;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultWindowHardwareType { hardware_type } => {
            state.bim_defaults.window_hardware_type = hardware_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultWindowStyle { style } => {
            state.bim_defaults.window_style = style;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultColumnWidth { width } => {
            state.bim_defaults.column_width = width;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultColumnDepth { depth } => {
            state.bim_defaults.column_depth = depth;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultColumnHeight { height } => {
            state.bim_defaults.column_height = height;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultBeamWidth { width } => {
            state.bim_defaults.beam_width = width;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultBeamDepth { depth } => {
            state.bim_defaults.beam_depth = depth;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultBeamElevation { elevation } => {
            state.bim_defaults.beam_elevation = elevation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultRoofThickness { thickness } => {
            state.bim_defaults.roof_thickness = thickness;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultRoofElevation { elevation } => {
            state.bim_defaults.roof_elevation = elevation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultRoofAutoElevation { enabled } => {
            state.bim_defaults.roof_auto_elevation = enabled;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultRoofType { roof_type } => {
            state.bim_defaults.roof_type = roof_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultRoofPitchDegrees { degrees } => {
            state.bim_defaults.roof_pitch_degrees = degrees;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultRoofRidgeAngleDegrees { degrees } => {
            state.bim_defaults.roof_ridge_angle_degrees = degrees;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultFurnitureType { furniture_type } => {
            state.bim_defaults.furniture_type = furniture_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultFurnitureRotation { rotation } => {
            state.bim_defaults.furniture_rotation = rotation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultPlumbingType { plumbing_type } => {
            state.bim_defaults.plumbing_type = plumbing_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultPlumbingRotation { rotation } => {
            state.bim_defaults.plumbing_rotation = rotation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultElectricalType { electrical_type } => {
            state.bim_defaults.electrical_type = electrical_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultElectricalRotation { rotation } => {
            state.bim_defaults.electrical_rotation = rotation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultCabinetType { cabinet_type } => {
            state.bim_defaults.cabinet_type = cabinet_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultCabinetRotation { rotation } => {
            state.bim_defaults.cabinet_rotation = rotation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultCabinetDoorCount { count } => {
            state.bim_defaults.cabinet_door_count = count;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultCabinetDrawerCount { count } => {
            state.bim_defaults.cabinet_drawer_count = count;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultHvacType { hvac_type } => {
            state.bim_defaults.hvac_type = hvac_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultHvacRotation { rotation } => {
            state.bim_defaults.hvac_rotation = rotation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultFireSafetyType { fire_safety_type } => {
            state.bim_defaults.fire_safety_type = fire_safety_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultFireSafetyRotation { rotation } => {
            state.bim_defaults.fire_safety_rotation = rotation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultAccessibilityType { accessibility_type } => {
            state.bim_defaults.accessibility_type = accessibility_type;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetDefaultAccessibilityRotation { rotation } => {
            state.bim_defaults.accessibility_rotation = rotation;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetAutoExtrudeSketch { enabled } => {
            state.bim_defaults.auto_extrude_sketch = enabled;
            ChangeFlags::BIM_DEFAULTS
        }
        Command::SetSketchExtrudeMode { mode } => {
            state.bim_defaults.sketch_extrude_mode = mode;
            ChangeFlags::BIM_DEFAULTS
        }

        // ---- BIM Transient ----
        Command::AddBimWall { .. } => ChangeFlags::BIM_TRANSIENT,
        Command::UpdateBimWall { .. } => ChangeFlags::BIM_TRANSIENT,
        Command::RemoveBimWall { .. } => ChangeFlags::BIM_TRANSIENT,
        Command::AddBimDoor { .. } => ChangeFlags::BIM_TRANSIENT,
        Command::RemoveBimDoor { .. } => ChangeFlags::BIM_TRANSIENT,
        Command::SetPendingWallStart { .. } => ChangeFlags::BIM_TRANSIENT,

        // ---- Levels ----
        // LevelState is a plain data struct; mutation is done directly.
        Command::AddLevel { name, elevation } => {
            let id = uuid::Uuid::new_v4().to_string();
            state.levels.levels.push(bcad_state::level_state::Level {
                id,
                name,
                elevation,
                visibility: bcad_state::level_state::LevelVisibility::Visible,
            });
            ChangeFlags::LEVELS
        }
        Command::RemoveLevel { id } => {
            state.levels.levels.retain(|l| l.id != id);
            ChangeFlags::LEVELS
        }
        Command::RenameLevel { id, name } => {
            if let Some(level) = state.levels.levels.iter_mut().find(|l| l.id == id) {
                level.name = name;
            }
            ChangeFlags::LEVELS
        }
        Command::SetLevelElevation { id, elevation } => {
            if let Some(level) = state.levels.levels.iter_mut().find(|l| l.id == id) {
                level.elevation = elevation;
            }
            ChangeFlags::LEVELS
        }
        Command::ReorderLevel { .. } => ChangeFlags::LEVELS,
        Command::SetActiveLevel { id } => {
            state.levels.active_level_id = id;
            ChangeFlags::LEVELS
        }
        Command::ToggleLevelVisibility { id } => {
            if let Some(level) = state.levels.levels.iter_mut().find(|l| l.id == id) {
                level.visibility = level.visibility.next();
            }
            ChangeFlags::LEVELS
        }
        Command::SetLevelVisibility { id, visibility } => {
            if let Some(level) = state.levels.levels.iter_mut().find(|l| l.id == id) {
                level.visibility = visibility;
            }
            ChangeFlags::LEVELS
        }
        Command::SyncFromKernelLevels { .. } => ChangeFlags::LEVELS,

        // ---- Layers ----
        Command::SetLayerVisibility { .. } => ChangeFlags::LAYERS,
        Command::SetLayerLocked { .. } => ChangeFlags::LAYERS,
        Command::SetActiveLayer { .. } => ChangeFlags::LAYERS,
        Command::ToggleLayerVisibility { .. } => ChangeFlags::LAYERS,
        Command::SetLayerPreset { .. } => ChangeFlags::LAYERS,

        // ---- Sketch ----
        Command::ActivateSketch => {
            state.sketch.active = true;
            ChangeFlags::SKETCH
        }
        Command::DeactivateSketch => {
            state.sketch.active = false;
            ChangeFlags::SKETCH
        }
        Command::SetSketchDrawMode { .. } => ChangeFlags::SKETCH,
        Command::SetSketchConstraintMode { .. } => ChangeFlags::SKETCH,
        Command::AddSketchPoint { .. } => ChangeFlags::SKETCH,
        Command::UpdateSketchPoint { .. } => ChangeFlags::SKETCH,
        Command::AddSketchLine { .. } => ChangeFlags::SKETCH,
        Command::AddSketchCircle { .. } => ChangeFlags::SKETCH,
        Command::AddSketchProfile { .. } => ChangeFlags::SKETCH,
        Command::SetSketchPendingPoint { .. } => ChangeFlags::SKETCH,
        Command::SetSketchPreviewPoint { .. } => ChangeFlags::SKETCH,
        Command::SetSketchLineChainStart { .. } => ChangeFlags::SKETCH,
        Command::SelectSketchPoint { .. } => ChangeFlags::SKETCH,
        Command::SelectSketchLine { .. } => ChangeFlags::SKETCH,
        Command::ClearSketchSelection => ChangeFlags::SKETCH,
        Command::ToggleSketchPointSelection { .. } => ChangeFlags::SKETCH,
        Command::ToggleSketchLineSelection { .. } => ChangeFlags::SKETCH,
        Command::AddSketchConstraint { .. } => ChangeFlags::SKETCH,
        Command::RemoveSketchConstraint { .. } => ChangeFlags::SKETCH,
        Command::RunSketchSolver => ChangeFlags::SKETCH,
        Command::ClearSketch => {
            state.sketch.clear();
            ChangeFlags::SKETCH
        }

        // ---- Views ----
        Command::AddSavedView { view } => {
            state.views.views.insert(view.id.clone(), view);
            ChangeFlags::VIEWS
        }
        Command::RemoveSavedView { id } => {
            state.views.views.remove(&id);
            if state.views.active_view_id.as_deref() == Some(id.as_str()) {
                state.views.active_view_id = None;
            }
            ChangeFlags::VIEWS
        }
        Command::UpdateSavedView { id, patch } => {
            if let Some(view) = state.views.views.get_mut(&id) {
                if let Some(name) = patch.name {
                    view.name = name;
                }
                if let Some(cut_line_start) = patch.cut_line_start {
                    view.cut_line_start = Some(cut_line_start);
                }
                if let Some(cut_line_end) = patch.cut_line_end {
                    view.cut_line_end = Some(cut_line_end);
                }
                if let Some(direction) = patch.direction {
                    view.direction = Some(direction);
                }
                if let Some(camera_position) = patch.camera_position {
                    view.camera_position = camera_position;
                }
                if let Some(camera_target) = patch.camera_target {
                    view.camera_target = camera_target;
                }
            }
            ChangeFlags::VIEWS
        }
        Command::SetActiveView { id } => {
            state.views.active_view_id =
                id.filter(|view_id| state.views.views.contains_key(view_id));
            if let Some(active_view_id) = &state.views.active_view_id {
                if let Some(view) = state.views.views.get(active_view_id) {
                    state.camera.position = view.camera_position;
                    state.camera.target = view.camera_target;
                    state.camera.revision = state.camera.revision.saturating_add(1);
                    return ChangeFlags::VIEWS | ChangeFlags::CAMERA;
                }
            }
            ChangeFlags::VIEWS
        }

        // ---- Camera ----
        Command::SetCamera { position, target } => {
            state.camera.position = position;
            state.camera.target = target;
            state.camera.revision = state.camera.revision.saturating_add(1);
            ChangeFlags::CAMERA
        }
        Command::SetScreenshot { png_data } => {
            state.camera.last_screenshot = Some(png_data);
            ChangeFlags::CAMERA
        }

        // ---- Materials ----
        Command::SetMaterials { .. } => ChangeFlags::MATERIALS,
        Command::SetBodyMaterial { .. } => ChangeFlags::MATERIALS,
        Command::SelectMaterial { .. } => ChangeFlags::MATERIALS,

        // ---- Measurement ----
        Command::SetMeasurementCursor { cursor } => {
            state.measurement.cursor = cursor;
            ChangeFlags::MEASUREMENT
        }
        Command::SetToolReadout { readout } => {
            state.measurement.tool_readout = readout;
            ChangeFlags::MEASUREMENT
        }
        Command::RequestMeasurementReset => ChangeFlags::MEASUREMENT,
        Command::ClearMeasurement => {
            state.measurement = Default::default();
            ChangeFlags::MEASUREMENT
        }

        // ---- Chat ----
        Command::CreateChat => ChangeFlags::CHAT,
        Command::DeleteChat { .. } => ChangeFlags::CHAT,
        Command::SetActiveChat { .. } => ChangeFlags::CHAT,
        Command::SetChatUiMessages { .. } => ChangeFlags::CHAT,
        Command::SetChatApiMessages { .. } => ChangeFlags::CHAT,
        Command::SetChatPlanMode { .. } => ChangeFlags::CHAT,
        Command::SetChatTitle { .. } => ChangeFlags::CHAT,
        Command::SetIsStreaming { streaming } => {
            state.chat.is_streaming = streaming;
            ChangeFlags::CHAT
        }
        Command::SetStreamingAssistantId { .. } => ChangeFlags::CHAT,
        Command::StopGeneration => {
            state.chat.is_streaming = false;
            ChangeFlags::CHAT
        }

        // ---- Clipboard operations ----
        Command::CopySelected => {
            if let Some(ref sel_id) = state.ui.selected_body_id {
                if let Some(el) = state
                    .document
                    .prototype
                    .project
                    .elements
                    .iter()
                    .find(|e| e.meta().id == *sel_id)
                {
                    state.clipboard = Some(el.clone());
                    log::info!("Copied element '{}' to clipboard", el.meta().name);
                }
            }
            ChangeFlags::UI
        }
        Command::PasteFromClipboard => {
            if let Some(source) = state.clipboard.clone() {
                insert_cloned_element(source, "Paste", state)
            } else {
                ChangeFlags::empty()
            }
        }
        Command::DuplicateSelected => {
            let source = state.ui.selected_body_id.as_ref().and_then(|sel_id| {
                state
                    .document
                    .prototype
                    .project
                    .elements
                    .iter()
                    .find(|e| e.meta().id == *sel_id)
                    .cloned()
            });
            if let Some(el) = source {
                insert_cloned_element(el, "Duplicate", state)
            } else {
                ChangeFlags::empty()
            }
        }

        // ---- Undo / Redo ----
        Command::Undo => {
            if let Some(entry) = state.history.pop_undo() {
                let inverse = entry.inverse.clone();
                dispatch_one_no_history(inverse, state);
                state.history.push_redo(entry);
            }
            ChangeFlags::HISTORY | ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT
        }
        Command::Redo => {
            if let Some(entry) = state.history.pop_redo() {
                let forward = entry.forward.clone();
                dispatch_one_no_history(forward, state);
                state.history.push_undo(entry);
            }
            ChangeFlags::HISTORY | ChangeFlags::ELEMENTS | ChangeFlags::DOCUMENT
        }

        // ---- Compound ----
        Command::Compound { label: _, commands } => {
            let mut flags = ChangeFlags::empty();
            for sub_cmd in commands {
                flags |= dispatch_one(sub_cmd, state);
            }
            flags
        }

        // ---- Chat ----
        Command::SendChatMessage { content } => {
            log::info!("Chat message: {}", content);
            ChangeFlags::CHAT
        }
        Command::SetPlanMode { enabled } => {
            if let Some(chat_id) = &state.chat.active_chat_id {
                if let Some(chat) = state.chat.chats.get_mut(chat_id) {
                    chat.plan_mode = enabled;
                }
            }
            ChangeFlags::CHAT
        }
        Command::ClearChat => {
            let new_chat = bcad_state::chat_state::new_chat();
            let new_id = new_chat.id.clone();
            state.chat.chats.insert(new_id.clone(), new_chat);
            state.chat.active_chat_id = Some(new_id);
            state.chat.is_streaming = false;
            ChangeFlags::CHAT
        }

        // ---- Move element ----
        Command::MoveElement {
            id,
            delta_x,
            delta_z,
        } => {
            log::debug!("MoveElement {} by ({}, {})", id, delta_x, delta_z);
            // TODO: look up element, offset position, update
            ChangeFlags::ELEMENTS
        }

        // ---- Wall auto-join ----
        Command::AutoJoinWalls { wall_id, level_id } => {
            auto_join_walls(&wall_id, level_id.as_deref(), state)
        }
    }
}

/// Clone an element with a new ID and offset, insert it into the document,
/// push a history entry, and select the new element. Used by both
/// PasteFromClipboard and DuplicateSelected.
fn insert_cloned_element(
    source: bcad_domain::Element,
    action_label: &str,
    state: &mut AppState,
) -> ChangeFlags {
    let mut cloned = source;
    let new_id = uuid::Uuid::new_v4().to_string();
    crate::command_translator::set_element_id_and_offset(&mut cloned, &new_id, 0.5);
    let label = format!("{} {}", action_label, cloned.meta().name);
    state.history.push(HistoryEntry {
        label,
        inverse: Command::DeleteElement { id: new_id.clone() },
        forward: Command::CreateElement {
            element: cloned.clone(),
        },
        timestamp: now_millis(),
    });
    let id = cloned.meta().id.clone();
    state.document.prototype.project.elements.push(cloned);
    state.document.append_transaction(
        bcad_state::document_state::TransactionAction::Create,
        &id,
    );
    state.ui.selected_body_id = Some(new_id);
    ChangeFlags::ELEMENTS
        | ChangeFlags::DOCUMENT
        | ChangeFlags::HISTORY
        | ChangeFlags::UI
        | ChangeFlags::SELECTION
}

/// Run wall auto-join after a wall has been created.
///
/// Collects all wall elements (optionally filtered by level), runs the
/// `auto_join_endpoints` algorithm from `bcad_tools::wall_cleanup`, and
/// applies any endpoint modifications back into state.
fn auto_join_walls(
    wall_id: &str,
    level_id: Option<&str>,
    state: &mut AppState,
) -> ChangeFlags {
    use bcad_tools::wall_cleanup::{auto_join_endpoints, WallData};

    let elements = &state.document.prototype.project.elements;

    // Verify the newly created wall exists in state
    let has_wall = elements.iter().any(|e| e.meta().id == wall_id);
    if !has_wall {
        return ChangeFlags::empty();
    }

    // Collect wall data, optionally filtering by level
    let wall_data: Vec<WallData> = elements
        .iter()
        .filter_map(|e| {
            if let bcad_domain::Element::Wall(w) = e {
                if level_id.map_or(true, |lid| {
                    w.meta.level_id.as_deref() == Some(lid)
                }) {
                    Some(WallData {
                        id: w.meta.id.clone(),
                        start: w.start,
                        end: w.end,
                        height: w.height,
                        thickness: w.thickness,
                    })
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect();

    let result = auto_join_endpoints(&wall_data, None);

    if result.modified.is_empty() {
        return ChangeFlags::empty();
    }

    // Apply modifications back to elements
    for (modified_id, new_start, new_end) in &result.modified {
        if let Some(bcad_domain::Element::Wall(w)) = state
            .document
            .prototype
            .project
            .elements
            .iter_mut()
            .find(|e| e.meta().id == *modified_id)
        {
            w.start = *new_start;
            w.end = *new_end;
        }
    }

    log::debug!(
        "Auto-joined {} wall endpoint(s) near wall {}",
        result.join_count,
        wall_id
    );

    ChangeFlags::ELEMENTS
}
