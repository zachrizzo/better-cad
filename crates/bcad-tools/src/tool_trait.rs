//! Core Tool trait and supporting types.

use bcad_domain::Element;
use glam::{Mat4, Vec2, Vec3};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// ToolId
// ---------------------------------------------------------------------------

/// Unique identifier for each tool kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolId {
    Select,
    Wall,
    ArcWall,
    Door,
    Window,
    Column,
    Beam,
    Roof,
    Stair,
    Floor,
    Foundation,
    Parking,
    Sketch,
    Dimension,
    Measure,
    MeasurePath,
    MeasureArea,
    MeasureAngle,
    SpotElevation,
    Section,
    Room,
    Text,
    Furniture,
    Plumbing,
    Electrical,
    Cabinet,
    Hvac,
    FireSafety,
    Accessibility,
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/// Mouse button identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

/// Virtual key codes used by the tool system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KeyCode {
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,
    Key0,
    Key1,
    Key2,
    Key3,
    Key4,
    Key5,
    Key6,
    Key7,
    Key8,
    Key9,
    Escape,
    Enter,
    Space,
    Backspace,
    Delete,
    Tab,
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ShiftLeft,
    ShiftRight,
    ControlLeft,
    ControlRight,
    AltLeft,
    AltRight,
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,
}

/// Input events that tools receive (already coordinate-transformed).
#[derive(Debug, Clone)]
pub enum ToolInput {
    PointerMove {
        plan_pos: Vec2,
        screen_pos: Vec2,
        shift: bool,
        ctrl: bool,
        alt: bool,
    },
    Click {
        plan_pos: Vec2,
        button: MouseButton,
        shift: bool,
        ctrl: bool,
        alt: bool,
    },
    DoubleClick {
        plan_pos: Vec2,
        button: MouseButton,
    },
    RightClick {
        plan_pos: Vec2,
    },
    KeyDown {
        key: KeyCode,
        shift: bool,
        ctrl: bool,
        alt: bool,
    },
    KeyUp {
        key: KeyCode,
    },
    PointerLeave,
    Scroll {
        delta: f32,
    },
}

// ---------------------------------------------------------------------------
// Snap types (tool-local types parallel to bcad-snap; kept here so
// bcad-tools does not depend on bcad-snap at compile time)
// ---------------------------------------------------------------------------

/// Snap mode describes what kind of geometric feature was snapped to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SnapMode {
    Endpoint,
    Midpoint,
    Center,
    Intersection,
    Nearest,
    Perpendicular,
    Grid,
    Edge,
    Foundation,
    Mesh,
}

/// Result of a snap query.
#[derive(Debug, Clone)]
pub struct SnapResult {
    pub point: Vec2,
    pub snap_type: SnapMode,
    pub source_element_id: Option<String>,
}

/// Snap context passed to tools so they can resolve snap candidates.
pub struct SnapContext {
    pub candidates: Vec<SnapCandidate>,
    pub enabled: bool,
    pub grid_spacing: f64,
}

/// A snap candidate with its point and supported modes.
#[derive(Debug, Clone)]
pub struct SnapCandidate {
    pub point: Vec2,
    pub modes: Vec<SnapMode>,
    pub source_element_id: Option<String>,
}

impl SnapContext {
    pub fn new() -> Self {
        Self {
            candidates: Vec::new(),
            enabled: true,
            grid_spacing: 0.25,
        }
    }

    /// Priority of a snap mode (lower = higher priority, same scale as spatial hash).
    fn mode_priority(mode: SnapMode) -> u32 {
        match mode {
            SnapMode::Endpoint => 0,
            SnapMode::Center => 1,
            SnapMode::Intersection => 2,
            SnapMode::Midpoint => 3,
            SnapMode::Perpendicular => 4,
            SnapMode::Nearest => 5,
            SnapMode::Edge | SnapMode::Foundation | SnapMode::Mesh | SnapMode::Grid => 6,
        }
    }

    /// Find the nearest snap candidate within threshold distance.
    ///
    /// Uses **priority-first** selection: within the threshold radius, a higher-
    /// priority type (e.g. Endpoint) always beats a lower-priority type (e.g.
    /// Nearest) even when the lower-priority candidate is physically closer.
    /// Distance is only used to break ties within the same priority level.
    pub fn find_nearest(&self, point: Vec2, threshold: f64) -> Option<SnapResult> {
        if !self.enabled || self.candidates.is_empty() {
            return None;
        }
        let threshold_sq = (threshold * threshold) as f32;
        // best = (priority, dist_sq, index)
        let mut best: Option<(u32, f32, usize)> = None;
        for (i, c) in self.candidates.iter().enumerate() {
            let d_sq = (point - c.point).length_squared();
            if d_sq > threshold_sq {
                continue;
            }
            let pri = c.modes
                .iter()
                .map(|m| Self::mode_priority(*m))
                .min()
                .unwrap_or(6);
            let dominated = match best {
                None => true,
                Some((bp, bd, _)) => pri < bp || (pri == bp && d_sq < bd),
            };
            if dominated {
                best = Some((pri, d_sq, i));
            }
        }
        best.map(|(_, _, idx)| {
            let c = &self.candidates[idx];
            SnapResult {
                point: c.point,
                snap_type: c.modes.first().copied().unwrap_or(SnapMode::Nearest),
                source_element_id: c.source_element_id.clone(),
            }
        })
    }

    /// Find nearest snap candidate filtered by allowed modes.
    ///
    /// Uses the same priority-first selection as [`find_nearest`].
    pub fn find_nearest_filtered(
        &self,
        point: Vec2,
        allowed_modes: &[SnapMode],
        threshold: f64,
    ) -> Option<SnapResult> {
        if !self.enabled || self.candidates.is_empty() {
            return None;
        }
        let threshold_sq = (threshold * threshold) as f32;
        // best = (priority, dist_sq, index, matched_mode)
        let mut best: Option<(u32, f32, usize, SnapMode)> = None;
        for (i, c) in self.candidates.iter().enumerate() {
            let matching_mode = c.modes.iter().find(|m| allowed_modes.contains(m));
            if let Some(&mode) = matching_mode {
                let d_sq = (point - c.point).length_squared();
                if d_sq > threshold_sq {
                    continue;
                }
                let pri = Self::mode_priority(mode);
                let dominated = match best {
                    None => true,
                    Some((bp, bd, _, _)) => pri < bp || (pri == bp && d_sq < bd),
                };
                if dominated {
                    best = Some((pri, d_sq, i, mode));
                }
            }
        }
        best.map(|(_, _, idx, mode)| {
            let c = &self.candidates[idx];
            SnapResult {
                point: c.point,
                snap_type: mode,
                source_element_id: c.source_element_id.clone(),
            }
        })
    }
}

impl Default for SnapContext {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// ToolAction (output from tools)
// ---------------------------------------------------------------------------

/// Command emitted by tools to mutate the document.
#[derive(Debug, Clone)]
pub enum Command {
    /// Create a new element.
    CreateElement(Element),
    /// Update an existing element.
    UpdateElement { id: String, element: Element },
    /// Delete an element.
    DeleteElement(String),
    /// Create multiple elements atomically.
    BatchCreate(Vec<Element>),
    /// Auto-join walls near the given wall.
    AutoJoinWalls {
        wall_id: String,
        level_id: Option<String>,
    },
    /// Set the active tool.
    SetActiveTool(ToolId),
    /// Undo the last action.
    Undo,
    /// Redo the last undone action.
    Redo,
    /// Save the document.
    Save,
    /// Load a document.
    Load,
    /// Duplicate the selected element.
    Duplicate,
    /// Delete the selected element.
    DeleteSelected,
    /// Rotate the selected element.
    RotateSelected,
    /// Move an element by a delta in the XZ plane.
    MoveElement {
        id: String,
        delta_x: f64,
        delta_z: f64,
    },
    /// Select an element or clear the current selection.
    SelectElement { id: Option<String> },
}

/// The result of a tool processing an input event.
#[derive(Debug)]
pub enum ToolAction {
    /// No state change, no commands.
    Nothing,
    /// Tool state changed, preview needs re-render.
    StateChanged,
    /// Tool wants to emit one or more commands to the kernel.
    EmitCommands(Vec<Command>),
    /// Tool is requesting deactivation (switch to Select).
    Deactivate,
    /// Tool wants to change to a different tool.
    SwitchTool(ToolId),
}

// ---------------------------------------------------------------------------
// Preview geometry
// ---------------------------------------------------------------------------

/// Marker shape for point preview.
#[derive(Debug, Clone, Copy)]
pub enum MarkerShape {
    Circle,
    Ring { inner_radius: f32 },
    Diamond,
    Square,
    Hexagon,
}

/// Preview geometry that tools produce for overlay rendering.
#[derive(Debug, Clone)]
pub enum PreviewGeometry {
    /// A point marker.
    Point {
        position: Vec2,
        radius: f32,
        color: [f32; 4],
        shape: MarkerShape,
    },
    /// A polyline.
    Line {
        points: Vec<Vec2>,
        color: [f32; 4],
        width: f32,
        dashed: bool,
        dash_size: f32,
        gap_size: f32,
    },
    /// A closed polygon fill.
    Polygon {
        vertices: Vec<Vec2>,
        color: [f32; 4],
    },
    /// A text label at a position.
    Label {
        position: Vec2,
        text: String,
        font_size: f32,
        color: [f32; 4],
    },
    /// An arc segment.
    Arc {
        center: Vec2,
        radius: f32,
        start_angle: f32,
        end_angle: f32,
        color: [f32; 4],
        width: f32,
        dashed: bool,
    },
    /// A 3D mesh preview.
    Mesh3D {
        vertices: Vec<Vec3>,
        indices: Vec<u32>,
        color: [f32; 4],
        transform: Mat4,
    },
}

// ---------------------------------------------------------------------------
// Cursor hint
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CursorHint {
    Default,
    Crosshair,
    Pointer,
    Move,
    NotAllowed,
    Custom(u32),
}

// ---------------------------------------------------------------------------
// Length unit
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LengthUnit {
    Meters,
    Feet,
    Inches,
    Millimeters,
    Centimeters,
}

/// Viewport mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewportMode {
    View2D,
    View3D,
}

// ---------------------------------------------------------------------------
// BimDefaults
// ---------------------------------------------------------------------------

/// Default BIM parameters drawn from user settings.
#[derive(Debug, Clone)]
pub struct BimDefaults {
    pub wall_height: f64,
    pub wall_thickness: f64,
    pub door_width: f64,
    pub door_height: f64,
    pub door_sill: f64,
    pub door_swing: bcad_domain::DoorSwing,
    pub door_hardware_type: bcad_domain::DoorHardwareType,
    pub door_style: bcad_domain::DoorStyle,
    pub window_width: f64,
    pub window_height: f64,
    pub window_sill: f64,
    pub window_hardware_type: bcad_domain::WindowHardwareType,
    pub window_style: bcad_domain::WindowStyle,
    pub column_width: f64,
    pub column_depth: f64,
    pub column_height: f64,
    pub beam_width: f64,
    pub beam_depth: f64,
    pub beam_elevation: f64,
    pub roof_thickness: f64,
    pub roof_elevation: f64,
    pub roof_auto_elevation: bool,
    pub roof_type: bcad_domain::RoofType,
    pub roof_pitch_degrees: f64,
    pub roof_ridge_angle_degrees: f64,
    pub stair_width: f64,
    pub stair_risers: u32,
    pub stair_height: f64,
    pub stair_type: bcad_domain::StairType,
    pub spiral_turns: f64,
    pub stair_side_wall_thickness: f64,
    pub floor_thickness: f64,
    pub furniture_type: String,
    pub furniture_rotation: f64,
    pub plumbing_type: String,
    pub plumbing_rotation: f64,
    pub electrical_type: String,
    pub electrical_rotation: f64,
    pub cabinet_type: String,
    pub cabinet_rotation: f64,
    pub cabinet_door_count: u32,
    pub cabinet_drawer_count: u32,
    pub hvac_type: String,
    pub hvac_rotation: f64,
    pub fire_safety_type: String,
    pub fire_safety_rotation: f64,
    pub accessibility_type: String,
    pub accessibility_rotation: f64,
    pub dimension_sub_mode: crate::dimension_tool::DimensionSubMode,
    pub sketch_draw_mode: crate::sketch_tool::SketchDrawMode,
}

impl Default for BimDefaults {
    fn default() -> Self {
        Self {
            wall_height: 3.0,
            wall_thickness: 0.2,
            door_width: 0.9,
            door_height: 2.1,
            door_sill: 0.0,
            door_swing: bcad_domain::DoorSwing::OutRight,
            door_hardware_type: bcad_domain::DoorHardwareType::Lever,
            door_style: bcad_domain::DoorStyle::Flush,
            window_width: 1.2,
            window_height: 1.2,
            window_sill: 0.9,
            window_hardware_type: bcad_domain::WindowHardwareType::Latch,
            window_style: bcad_domain::WindowStyle::Picture,
            column_width: 0.3,
            column_depth: 0.3,
            column_height: 3.0,
            beam_width: 0.2,
            beam_depth: 0.4,
            beam_elevation: 3.0,
            roof_thickness: 0.3,
            roof_elevation: 3.0,
            roof_auto_elevation: true,
            roof_type: bcad_domain::RoofType::Gable,
            roof_pitch_degrees: 30.0,
            roof_ridge_angle_degrees: 0.0,
            stair_width: 1.1,
            stair_risers: 16,
            stair_height: 3.0,
            stair_type: bcad_domain::StairType::Straight,
            spiral_turns: 1.0,
            stair_side_wall_thickness: 0.12,
            floor_thickness: 0.25,
            furniture_type: "desk".to_string(),
            furniture_rotation: 0.0,
            plumbing_type: "toilet".to_string(),
            plumbing_rotation: 0.0,
            electrical_type: "outlet".to_string(),
            electrical_rotation: 0.0,
            cabinet_type: "base".to_string(),
            cabinet_rotation: 0.0,
            cabinet_door_count: 2,
            cabinet_drawer_count: 0,
            hvac_type: "supply_vent".to_string(),
            hvac_rotation: 0.0,
            fire_safety_type: "fire_extinguisher".to_string(),
            fire_safety_rotation: 0.0,
            accessibility_type: "wheelchair".to_string(),
            accessibility_rotation: 0.0,
            dimension_sub_mode: crate::dimension_tool::DimensionSubMode::Aligned,
            sketch_draw_mode: crate::sketch_tool::SketchDrawMode::None,
        }
    }
}

// ---------------------------------------------------------------------------
// ToolContext
// ---------------------------------------------------------------------------

/// Read-only context providing access to document state, settings, and active level.
pub struct ToolContext {
    pub elements: Vec<Element>,
    pub active_level_id: String,
    pub active_level_elevation: f64,
    pub active_surface_elevation: f64,
    pub defaults: BimDefaults,
    pub length_unit: LengthUnit,
    pub viewport_mode: ViewportMode,
    pub selected_element_id: Option<String>,
    pub active_door_family_type_id: Option<String>,
    pub active_window_family_type_id: Option<String>,
}

impl Default for ToolContext {
    fn default() -> Self {
        Self {
            elements: Vec::new(),
            active_level_id: String::new(),
            active_level_elevation: 0.0,
            active_surface_elevation: 0.0,
            defaults: BimDefaults::default(),
            length_unit: LengthUnit::Meters,
            viewport_mode: ViewportMode::View2D,
            selected_element_id: None,
            active_door_family_type_id: None,
            active_window_family_type_id: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Tool trait
// ---------------------------------------------------------------------------

/// The main trait that every drawing tool implements.
pub trait Tool: Send + Sync {
    /// Unique identifier for this tool.
    fn id(&self) -> ToolId;

    /// Human-readable name for UI display.
    fn display_name(&self) -> &str;

    /// Called when this tool becomes the active tool.
    fn activate(&mut self);

    /// Called when this tool is being replaced by another tool.
    fn deactivate(&mut self);

    /// Process an input event. Returns what action the tool wants to take.
    fn handle_input(
        &mut self,
        input: ToolInput,
        snap: &SnapContext,
        ctx: &ToolContext,
    ) -> ToolAction;

    /// Generate preview geometry for the current frame.
    fn preview_geometry(&self, ctx: &ToolContext) -> Vec<PreviewGeometry>;

    /// Return the current cursor hint.
    fn cursor_hint(&self) -> CursorHint;

    /// Return status text for the status bar.
    fn status_text(&self, ctx: &ToolContext) -> Option<String>;

    /// Whether this tool wants to capture pointer events exclusively
    /// (prevents orbit/pan while drawing).
    fn wants_pointer_capture(&self) -> bool;

    /// Reset to initial state without deactivating.
    fn reset(&mut self);
}

// ---------------------------------------------------------------------------
// Helper: ToolBase
// ---------------------------------------------------------------------------

/// Common base fields shared by most tools.
#[derive(Debug, Clone, Default)]
pub struct ToolBase {
    pub cursor_pos: Option<Vec2>,
    pub snap_result: Option<SnapResult>,
}

impl ToolBase {
    pub fn update_cursor(&mut self, pos: Vec2, snap: &SnapContext, threshold: f64) {
        if let Some(result) = snap.find_nearest(pos, threshold) {
            self.cursor_pos = Some(result.point);
            self.snap_result = Some(result);
        } else {
            self.cursor_pos = Some(pos);
            self.snap_result = None;
        }
    }

    pub fn clear(&mut self) {
        self.cursor_pos = None;
        self.snap_result = None;
    }

    /// Get the snapped (or raw) position, if any.
    pub fn pos(&self) -> Option<Vec2> {
        self.cursor_pos
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/// Format a length value with the given unit.
pub fn format_length(meters: f64, unit: LengthUnit) -> String {
    match unit {
        LengthUnit::Meters => format!("{:.2} m", meters),
        LengthUnit::Feet => format!("{:.2} ft", meters * 3.28084),
        LengthUnit::Inches => format!("{:.1} in", meters * 39.3701),
        LengthUnit::Millimeters => format!("{:.0} mm", meters * 1000.0),
        LengthUnit::Centimeters => format!("{:.1} cm", meters * 100.0),
    }
}

/// Format an area value with the given unit.
pub fn format_area(sq_meters: f64, unit: LengthUnit) -> String {
    match unit {
        LengthUnit::Meters => format!("{:.2} m\u{00b2}", sq_meters),
        LengthUnit::Feet => format!("{:.2} ft\u{00b2}", sq_meters * 10.7639),
        LengthUnit::Inches => format!("{:.1} in\u{00b2}", sq_meters * 1550.0031),
        LengthUnit::Millimeters => format!("{:.0} mm\u{00b2}", sq_meters * 1_000_000.0),
        LengthUnit::Centimeters => format!("{:.1} cm\u{00b2}", sq_meters * 10_000.0),
    }
}

/// Apply ortho constraint: snap the end point to horizontal or vertical from start.
pub fn apply_ortho_constraint(start: Vec2, end: Vec2) -> Vec2 {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    if dx.abs() >= dy.abs() {
        Vec2::new(end.x, start.y)
    } else {
        Vec2::new(start.x, end.y)
    }
}

/// Snap-type color for preview markers.
pub fn snap_type_color(snap_type: SnapMode) -> [f32; 4] {
    match snap_type {
        SnapMode::Endpoint => [0.0, 1.0, 0.533, 1.0], // #00ff88
        SnapMode::Edge => [0.0, 0.8, 1.0, 1.0],       // #00ccff
        SnapMode::Foundation => [0.133, 0.773, 0.369, 1.0], // #22c55e
        SnapMode::Mesh => [0.733, 0.525, 0.988, 1.0], // #bb86fc
        SnapMode::Midpoint => [1.0, 0.667, 0.0, 1.0], // #ffaa00
        SnapMode::Center => [1.0, 0.42, 0.42, 1.0],   // #ff6b6b
        SnapMode::Intersection => [1.0, 0.2, 0.2, 1.0], // #ff3333
        SnapMode::Grid => [0.6, 0.6, 0.6, 1.0],
        SnapMode::Nearest => [0.8, 0.8, 0.8, 1.0],
        SnapMode::Perpendicular => [0.5, 0.5, 1.0, 1.0],
    }
}

/// Compute the polygon area using the shoelace formula. Returns positive area.
pub fn polygon_area(vertices: &[Vec2]) -> f64 {
    let n = vertices.len();
    if n < 3 {
        return 0.0;
    }
    let mut area = 0.0_f64;
    for i in 0..n {
        let j = (i + 1) % n;
        area += (vertices[i].x as f64) * (vertices[j].y as f64);
        area -= (vertices[j].x as f64) * (vertices[i].y as f64);
    }
    (area / 2.0).abs()
}

/// Compute the perimeter of a polygon.
pub fn polygon_perimeter(vertices: &[Vec2]) -> f64 {
    let n = vertices.len();
    if n < 2 {
        return 0.0;
    }
    let mut perim = 0.0_f64;
    for i in 0..n {
        let j = (i + 1) % n;
        perim += (vertices[j] - vertices[i]).length() as f64;
    }
    perim
}

/// Build a CCW rectangle boundary from two opposite corners.
/// Used by roof, floor, foundation, and parking tools.
pub fn rect_boundary(c1: Vec2, c2: Vec2) -> Vec<[f64; 2]> {
    let min_x = c1.x.min(c2.x) as f64;
    let max_x = c1.x.max(c2.x) as f64;
    let min_y = c1.y.min(c2.y) as f64;
    let max_y = c1.y.max(c2.y) as f64;
    vec![
        [min_x, min_y],
        [max_x, min_y],
        [max_x, max_y],
        [min_x, max_y],
    ]
}
