//! Sketch state replacing `sketch-store.ts`.
//!
//! Contains sketch geometry (points, lines, circles, arcs), constraints,
//! drawing mode, selection within the sketch, and solver status.

use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Sketch geometry types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SketchPoint {
    pub id: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone)]
pub struct SketchLine {
    pub id: String,
    pub p1: String,
    pub p2: String,
}

#[derive(Debug, Clone)]
pub struct SketchCircle {
    pub id: String,
    pub center: String,
    pub radius: f64,
}

#[derive(Debug, Clone)]
pub struct SketchArc {
    pub id: String,
    pub center: String,
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone)]
pub struct SketchProfile {
    pub id: String,
    pub points: Vec<[f64; 2]>,
}

// ---------------------------------------------------------------------------
// Constraint types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SketchConstraintType {
    Coincident,
    Horizontal,
    Vertical,
    Distance,
    Fixed,
    Perpendicular,
    Parallel,
    Angle,
    Equal,
}

#[derive(Debug, Clone)]
pub struct SketchConstraint {
    pub id: String,
    pub constraint_type: SketchConstraintType,
    /// Point IDs involved (for Coincident, Distance, Fixed).
    pub points: Vec<String>,
    /// Line IDs involved (for Horizontal, Vertical, Perpendicular, etc.).
    pub lines: Vec<String>,
    /// Numeric value (distance, angle, fixed x).
    pub value: Option<f64>,
    /// Second numeric value (for Fixed: y coordinate).
    pub value2: Option<f64>,
}

// ---------------------------------------------------------------------------
// Drawing / constraint mode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SketchDrawMode {
    #[default]
    None,
    Line,
    Rectangle,
    Circle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SketchConstraintMode {
    #[default]
    None,
    Coincident,
    Horizontal,
    Vertical,
    Distance,
    Fixed,
    Perpendicular,
    Parallel,
    Angle,
    Equal,
}

// ---------------------------------------------------------------------------
// Selection within sketch
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct SketchSelection {
    pub point_ids: Vec<String>,
    pub line_ids: Vec<String>,
}

// ---------------------------------------------------------------------------
// Solver result
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ConstraintStatus {
    #[default]
    UnderConstrained,
    WellConstrained,
    OverConstrained,
}

#[derive(Debug, Clone)]
pub struct SolverResult {
    pub converged: bool,
    pub iterations: u32,
    pub residual: f64,
}

// ---------------------------------------------------------------------------
// SketchState (the composite struct)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct SketchState {
    pub active: bool,
    pub points: HashMap<String, SketchPoint>,
    pub lines: HashMap<String, SketchLine>,
    pub circles: HashMap<String, SketchCircle>,
    pub arcs: HashMap<String, SketchArc>,
    pub profiles: HashMap<String, SketchProfile>,
    pub constraints: HashMap<String, SketchConstraint>,

    // Drawing state
    pub draw_mode: SketchDrawMode,
    pub pending_point: Option<SketchPoint>,
    pub preview_point: Option<[f64; 2]>,
    pub line_chain_start: Option<String>,

    // Constraint mode
    pub constraint_mode: SketchConstraintMode,

    // Selection within sketch
    pub selection: SketchSelection,

    // Solver
    pub solver_status: ConstraintStatus,
    pub last_solver_result: Option<SolverResult>,
}

impl SketchState {
    /// Clear all sketch data, returning to a clean state.
    pub fn clear(&mut self) {
        *self = Self {
            active: self.active,
            ..Self::default()
        };
    }

    /// Deactivate the sketch, clearing transient drawing state but preserving geometry.
    pub fn deactivate(&mut self) {
        self.active = false;
        self.pending_point = None;
        self.preview_point = None;
        self.draw_mode = SketchDrawMode::None;
        self.constraint_mode = SketchConstraintMode::None;
        self.line_chain_start = None;
        self.selection = SketchSelection::default();
    }
}
