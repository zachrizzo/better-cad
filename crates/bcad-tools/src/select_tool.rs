//! Selection tool.
//!
//! Click to select an element (by proximity picking). Click empty space
//! to deselect. This is the default tool.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::Element;
use glam::Vec2;

const SELECT_PICK_THRESHOLD: f32 = 0.3;
const SELECT_COLOR: [f32; 4] = [0.3, 0.7, 1.0, 1.0];

// Gizmo constants
const GIZMO_ARM_LENGTH: f32 = 0.8;
const GIZMO_HIT_THRESHOLD: f32 = 0.15;
const GIZMO_RED: [f32; 4] = [1.0, 0.2, 0.2, 1.0]; // X axis
const GIZMO_BLUE: [f32; 4] = [0.2, 0.2, 1.0, 1.0]; // Z axis
const GIZMO_GREEN: [f32; 4] = [0.2, 0.9, 0.2, 1.0]; // center dot

/// Which gizmo axis is being dragged (if any).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GizmoAxis {
    X,
    Z,
}

pub struct SelectTool {
    base: ToolBase,
    /// Which gizmo axis is currently being dragged.
    dragging_axis: Option<GizmoAxis>,
    /// The plan position when the drag started.
    drag_start: Option<Vec2>,
    /// Accumulated drag delta for the current drag gesture.
    drag_accumulated: Vec2,
}

impl SelectTool {
    pub fn new() -> Self {
        Self {
            base: ToolBase::default(),
            dragging_axis: None,
            drag_start: None,
            drag_accumulated: Vec2::ZERO,
        }
    }

    /// Check if the cursor position is near a gizmo axis arrow emanating
    /// from the given center. Returns the axis if within threshold.
    fn hit_test_gizmo(pos: Vec2, center: Vec2) -> Option<GizmoAxis> {
        // X axis arm: center -> center + (GIZMO_ARM_LENGTH, 0)
        let x_end = center + Vec2::new(GIZMO_ARM_LENGTH, 0.0);
        if point_to_segment_dist(pos, center, x_end) < GIZMO_HIT_THRESHOLD {
            return Some(GizmoAxis::X);
        }
        // Z axis arm: center -> center + (0, GIZMO_ARM_LENGTH)
        // In plan view, Z maps to Y on screen.
        let z_end = center + Vec2::new(0.0, GIZMO_ARM_LENGTH);
        if point_to_segment_dist(pos, center, z_end) < GIZMO_HIT_THRESHOLD {
            return Some(GizmoAxis::Z);
        }
        None
    }

    /// Simple proximity pick: find the nearest element to the given position.
    fn pick_element<'a>(pos: Vec2, elements: &'a [Element]) -> Option<&'a str> {
        let mut best: Option<(f32, &str)> = None;

        for element in elements {
            let center = element_center(element);
            if let Some(c) = center {
                let dist = (pos - c).length();
                if dist < SELECT_PICK_THRESHOLD {
                    if best.as_ref().map_or(true, |(bd, _)| dist < *bd) {
                        best = Some((dist, element.id()));
                    }
                }
            }
        }

        best.map(|(_, id)| id)
    }
}

impl Default for SelectTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Distance from a point to a line segment.
fn point_to_segment_dist(p: Vec2, a: Vec2, b: Vec2) -> f32 {
    let ab = b - a;
    let ap = p - a;
    let len_sq = ab.length_squared();
    if len_sq < 1e-8 {
        return ap.length();
    }
    let t = (ap.dot(ab) / len_sq).clamp(0.0, 1.0);
    let closest = a + ab * t;
    (p - closest).length()
}

/// Compute the 2D center of an element for picking purposes.
fn element_center(element: &Element) -> Option<Vec2> {
    match element {
        Element::Wall(w) => {
            let mid_x = (w.start[0] + w.end[0]) / 2.0;
            let mid_y = (w.start[1] + w.end[1]) / 2.0;
            Some(Vec2::new(mid_x as f32, mid_y as f32))
        }
        Element::Column(c) => Some(Vec2::new(c.center[0] as f32, c.center[1] as f32)),
        Element::Beam(b) => {
            let mid_x = (b.start[0] + b.end[0]) / 2.0;
            let mid_y = (b.start[1] + b.end[1]) / 2.0;
            Some(Vec2::new(mid_x as f32, mid_y as f32))
        }
        Element::Stair(s) => {
            let mid_x = (s.start[0] + s.end[0]) / 2.0;
            let mid_y = (s.start[1] + s.end[1]) / 2.0;
            Some(Vec2::new(mid_x as f32, mid_y as f32))
        }
        Element::Floor(f) => boundary_centroid(&f.boundary),
        Element::Foundation(f) => boundary_centroid(&f.boundary),
        Element::Roof(r) => boundary_centroid(&r.boundary),
        Element::Room(r) => boundary_centroid(&r.boundary),
        Element::Furniture(f) => Some(Vec2::new(f.position[0] as f32, f.position[1] as f32)),
        Element::Plumbing(p) => Some(Vec2::new(p.position[0] as f32, p.position[1] as f32)),
        Element::Electrical(e) => Some(Vec2::new(e.position[0] as f32, e.position[1] as f32)),
        Element::Hvac(h) => Some(Vec2::new(h.position[0] as f32, h.position[1] as f32)),
        Element::FireSafety(f) => Some(Vec2::new(f.position[0] as f32, f.position[1] as f32)),
        Element::Accessibility(a) => Some(Vec2::new(a.position[0] as f32, a.position[1] as f32)),
        Element::Cabinet(c) => Some(Vec2::new(c.position[0] as f32, c.position[1] as f32)),
        _ => None,
    }
}

fn boundary_centroid(boundary: &[[f64; 2]]) -> Option<Vec2> {
    if boundary.is_empty() {
        return None;
    }
    let n = boundary.len() as f64;
    let cx = boundary.iter().map(|p| p[0]).sum::<f64>() / n;
    let cy = boundary.iter().map(|p| p[1]).sum::<f64>() / n;
    Some(Vec2::new(cx as f32, cy as f32))
}

impl Tool for SelectTool {
    fn id(&self) -> ToolId {
        ToolId::Select
    }

    fn display_name(&self) -> &str {
        "Select"
    }

    fn activate(&mut self) {
        self.base.clear();
    }

    fn deactivate(&mut self) {
        self.base.clear();
    }

    fn handle_input(
        &mut self,
        input: ToolInput,
        snap: &SnapContext,
        ctx: &ToolContext,
    ) -> ToolAction {
        match input {
            ToolInput::PointerMove { plan_pos, .. } => {
                self.base
                    .update_cursor(plan_pos, snap, DEFAULT_SNAP_DISTANCE);

                // If dragging a gizmo axis, accumulate delta
                if let (Some(axis), Some(start)) = (self.dragging_axis, self.drag_start) {
                    let raw_delta = plan_pos - start;
                    let constrained = match axis {
                        GizmoAxis::X => Vec2::new(raw_delta.x, 0.0),
                        GizmoAxis::Z => Vec2::new(0.0, raw_delta.y),
                    };
                    self.drag_accumulated = constrained;
                }

                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                // If we were dragging, finish the drag and emit a move command
                if let Some(_axis) = self.dragging_axis {
                    let delta = self.drag_accumulated;
                    self.dragging_axis = None;
                    self.drag_start = None;
                    self.drag_accumulated = Vec2::ZERO;

                    if let Some(ref sel_id) = ctx.selected_element_id {
                        if delta.length() > 0.01 {
                            return ToolAction::EmitCommands(vec![Command::MoveElement {
                                id: sel_id.clone(),
                                delta_x: delta.x as f64,
                                delta_z: delta.y as f64,
                            }]);
                        }
                    }
                    return ToolAction::StateChanged;
                }

                // Check if clicking on a gizmo arm of the selected element
                if let Some(ref sel_id) = ctx.selected_element_id {
                    if let Some(element) = ctx.elements.iter().find(|e| e.id() == sel_id.as_str()) {
                        if let Some(center) = element_center(element) {
                            if let Some(axis) = Self::hit_test_gizmo(plan_pos, center) {
                                self.dragging_axis = Some(axis);
                                self.drag_start = Some(plan_pos);
                                self.drag_accumulated = Vec2::ZERO;
                                return ToolAction::StateChanged;
                            }
                        }
                    }
                }

                // Normal pick
                let picked = Self::pick_element(plan_pos, &ctx.elements).map(|id| id.to_string());
                ToolAction::EmitCommands(vec![Command::SelectElement { id: picked }])
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                // Cancel drag or deselect
                if self.dragging_axis.is_some() {
                    self.dragging_axis = None;
                    self.drag_start = None;
                    self.drag_accumulated = Vec2::ZERO;
                }
                ToolAction::StateChanged
            }

            ToolInput::KeyDown {
                key: KeyCode::Delete,
                ..
            }
            | ToolInput::KeyDown {
                key: KeyCode::Backspace,
                ..
            } => {
                if ctx.selected_element_id.is_some() {
                    ToolAction::EmitCommands(vec![Command::DeleteSelected])
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::PointerLeave => {
                self.base.clear();
                self.dragging_axis = None;
                self.drag_start = None;
                self.drag_accumulated = Vec2::ZERO;
                ToolAction::StateChanged
            }

            _ => ToolAction::Nothing,
        }
    }

    fn preview_geometry(&self, ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        // Highlight selected element and draw gizmo
        if let Some(ref sel_id) = ctx.selected_element_id {
            if let Some(element) = ctx.elements.iter().find(|e| e.id() == sel_id) {
                if let Some(center) = element_center(element) {
                    // Selection ring
                    geom.push(PreviewGeometry::Point {
                        position: center,
                        radius: 0.15,
                        color: SELECT_COLOR,
                        shape: MarkerShape::Ring { inner_radius: 0.1 },
                    });

                    // Move gizmo: apply drag offset if dragging
                    let gizmo_center = center + self.drag_accumulated;

                    // Green center dot
                    geom.push(PreviewGeometry::Point {
                        position: gizmo_center,
                        radius: 0.06,
                        color: GIZMO_GREEN,
                        shape: MarkerShape::Circle,
                    });

                    // Red X-axis arrow line
                    let x_end = gizmo_center + Vec2::new(GIZMO_ARM_LENGTH, 0.0);
                    geom.push(PreviewGeometry::Line {
                        points: vec![gizmo_center, x_end],
                        color: GIZMO_RED,
                        width: 2.0,
                        dashed: false,
                        dash_size: 0.0,
                        gap_size: 0.0,
                    });
                    // X arrow tip
                    geom.push(PreviewGeometry::Point {
                        position: x_end,
                        radius: 0.05,
                        color: GIZMO_RED,
                        shape: MarkerShape::Diamond,
                    });

                    // Blue Z-axis arrow line (Z maps to Y in plan view)
                    let z_end = gizmo_center + Vec2::new(0.0, GIZMO_ARM_LENGTH);
                    geom.push(PreviewGeometry::Line {
                        points: vec![gizmo_center, z_end],
                        color: GIZMO_BLUE,
                        width: 2.0,
                        dashed: false,
                        dash_size: 0.0,
                        gap_size: 0.0,
                    });
                    // Z arrow tip
                    geom.push(PreviewGeometry::Point {
                        position: z_end,
                        radius: 0.05,
                        color: GIZMO_BLUE,
                        shape: MarkerShape::Diamond,
                    });
                }
            }
        }

        // Cursor
        if let Some(pos) = self.base.cursor_pos {
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.04,
                color: [0.8, 0.8, 0.8, 0.5],
                shape: MarkerShape::Circle,
            });
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Default
    }

    fn status_text(&self, ctx: &ToolContext) -> Option<String> {
        if let Some(ref id) = ctx.selected_element_id {
            Some(format!("Selected: {} | Del=delete | R=rotate", id))
        } else {
            Some("Select: Click an element".to_string())
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        self.dragging_axis.is_some()
    }

    fn reset(&mut self) {
        self.base.clear();
        self.dragging_axis = None;
        self.drag_start = None;
        self.drag_accumulated = Vec2::ZERO;
    }
}
