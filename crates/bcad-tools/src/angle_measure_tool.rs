//! Three-point angle measurement tool.
//!
//! Pick three points: A (first leg endpoint), B (vertex), C (second leg endpoint).
//! Computes the angle ABC in degrees. Display-only.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use glam::Vec2;
const ANGLE_ARC_RADIUS: f32 = 0.3;
const ANGLE_ARC_SEGMENTS: usize = 30;
const ANGLE_COLOR: [f32; 4] = [1.0, 0.6, 0.2, 1.0];

#[derive(Debug, Clone, Copy)]
enum AnglePhase {
    PickA,
    PickB,
    PickC,
    Complete,
}

pub struct AngleMeasureTool {
    phase: AnglePhase,
    base: ToolBase,
    pt_a: Option<Vec2>,
    pt_b: Option<Vec2>,
    pt_c: Option<Vec2>,
}

impl AngleMeasureTool {
    pub fn new() -> Self {
        Self {
            phase: AnglePhase::PickA,
            base: ToolBase::default(),
            pt_a: None,
            pt_b: None,
            pt_c: None,
        }
    }

    fn compute_angle(&self) -> Option<f64> {
        let a = self.pt_a?;
        let b = self.pt_b?;
        let c = self.pt_c?;
        let ba = a - b;
        let bc = c - b;
        let dot = ba.dot(bc);
        let mag = ba.length() * bc.length();
        if mag < 1e-6 {
            return None;
        }
        let cos = (dot / mag).clamp(-1.0, 1.0);
        Some((cos as f64).acos().to_degrees())
    }
}

impl Default for AngleMeasureTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for AngleMeasureTool {
    fn id(&self) -> ToolId {
        ToolId::MeasureAngle
    }

    fn display_name(&self) -> &str {
        "Angle Measure"
    }

    fn activate(&mut self) {
        self.reset();
    }

    fn deactivate(&mut self) {
        self.reset();
    }

    fn handle_input(
        &mut self,
        input: ToolInput,
        snap: &SnapContext,
        _ctx: &ToolContext,
    ) -> ToolAction {
        match input {
            ToolInput::PointerMove { plan_pos, .. } => {
                self.base
                    .update_cursor(plan_pos, snap, DEFAULT_SNAP_DISTANCE);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                self.base
                    .update_cursor(plan_pos, snap, DEFAULT_SNAP_DISTANCE);
                let pos = self.base.pos().unwrap_or(plan_pos);

                match self.phase {
                    AnglePhase::PickA | AnglePhase::Complete => {
                        self.pt_a = Some(pos);
                        self.pt_b = None;
                        self.pt_c = None;
                        self.phase = AnglePhase::PickB;
                        ToolAction::StateChanged
                    }
                    AnglePhase::PickB => {
                        self.pt_b = Some(pos);
                        self.phase = AnglePhase::PickC;
                        ToolAction::StateChanged
                    }
                    AnglePhase::PickC => {
                        self.pt_c = Some(pos);
                        self.phase = AnglePhase::Complete;
                        ToolAction::StateChanged
                    }
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if matches!(self.phase, AnglePhase::PickA) {
                    ToolAction::Deactivate
                } else {
                    self.reset();
                    ToolAction::StateChanged
                }
            }

            ToolInput::PointerLeave => {
                self.base.clear();
                ToolAction::StateChanged
            }

            _ => ToolAction::Nothing,
        }
    }

    fn preview_geometry(&self, _ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        // Point markers
        if let Some(a) = self.pt_a {
            geom.push(PreviewGeometry::Point {
                position: a,
                radius: 0.06,
                color: ANGLE_COLOR,
                shape: MarkerShape::Circle,
            });
        }
        if let Some(b) = self.pt_b {
            geom.push(PreviewGeometry::Point {
                position: b,
                radius: 0.08,
                color: ANGLE_COLOR,
                shape: MarkerShape::Diamond,
            });
        }
        if let Some(c) = self.pt_c {
            geom.push(PreviewGeometry::Point {
                position: c,
                radius: 0.06,
                color: ANGLE_COLOR,
                shape: MarkerShape::Circle,
            });
        }

        // Leg lines
        if let (Some(a), Some(b)) = (self.pt_a, self.pt_b) {
            geom.push(PreviewGeometry::Line {
                points: vec![a, b],
                color: ANGLE_COLOR,
                width: 1.5,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });
        }
        let c_or_cursor = self.pt_c.or(self.base.cursor_pos);
        if let (Some(b), Some(c)) = (self.pt_b, c_or_cursor) {
            if matches!(self.phase, AnglePhase::PickC | AnglePhase::Complete) {
                geom.push(PreviewGeometry::Line {
                    points: vec![b, c],
                    color: ANGLE_COLOR,
                    width: 1.5,
                    dashed: self.pt_c.is_none(),
                    dash_size: 0.2,
                    gap_size: 0.1,
                });
            }
        }

        // Rubber-band from A/B to cursor during picking
        if matches!(self.phase, AnglePhase::PickB) {
            if let (Some(a), Some(cursor)) = (self.pt_a, self.base.cursor_pos) {
                geom.push(PreviewGeometry::Line {
                    points: vec![a, cursor],
                    color: [1.0, 0.6, 0.2, 0.5],
                    width: 1.0,
                    dashed: true,
                    dash_size: 0.15,
                    gap_size: 0.1,
                });
            }
        }

        // Arc indicator at vertex B when complete
        if let (Some(a), Some(b), Some(c)) = (self.pt_a, self.pt_b, c_or_cursor) {
            if matches!(self.phase, AnglePhase::PickC | AnglePhase::Complete) {
                let ba = (a - b).normalize_or_zero();
                let bc = (c - b).normalize_or_zero();
                let start_angle = ba.y.atan2(ba.x);
                let end_angle = bc.y.atan2(bc.x);

                // Generate arc points
                let mut arc_pts = Vec::with_capacity(ANGLE_ARC_SEGMENTS + 1);
                for i in 0..=ANGLE_ARC_SEGMENTS {
                    let t = i as f32 / ANGLE_ARC_SEGMENTS as f32;
                    // Interpolate angle (shortest path)
                    let mut delta = end_angle - start_angle;
                    if delta > std::f32::consts::PI {
                        delta -= std::f32::consts::TAU;
                    } else if delta < -std::f32::consts::PI {
                        delta += std::f32::consts::TAU;
                    }
                    let angle = start_angle + delta * t;
                    arc_pts.push(b + Vec2::new(angle.cos(), angle.sin()) * ANGLE_ARC_RADIUS);
                }
                geom.push(PreviewGeometry::Line {
                    points: arc_pts,
                    color: [1.0, 0.6, 0.2, 0.7],
                    width: 1.0,
                    dashed: false,
                    dash_size: 0.0,
                    gap_size: 0.0,
                });

                // Angle label
                if let Some(angle_deg) = {
                    let ba_v = a - b;
                    let bc_v = c - b;
                    let dot = ba_v.dot(bc_v);
                    let mag = ba_v.length() * bc_v.length();
                    if mag > 1e-6 {
                        Some(((dot / mag).clamp(-1.0, 1.0) as f64).acos().to_degrees())
                    } else {
                        None
                    }
                } {
                    let mid_angle = {
                        let mut delta = end_angle - start_angle;
                        if delta > std::f32::consts::PI {
                            delta -= std::f32::consts::TAU;
                        } else if delta < -std::f32::consts::PI {
                            delta += std::f32::consts::TAU;
                        }
                        start_angle + delta * 0.5
                    };
                    let label_pos =
                        b + Vec2::new(mid_angle.cos(), mid_angle.sin()) * (ANGLE_ARC_RADIUS + 0.15);
                    geom.push(PreviewGeometry::Label {
                        position: label_pos,
                        text: format!("{:.1}\u{00b0}", angle_deg),
                        font_size: 12.0,
                        color: [1.0, 1.0, 1.0, 1.0],
                    });
                }
            }
        }

        // Cursor
        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => ANGLE_COLOR,
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.04,
                color,
                shape: MarkerShape::Circle,
            });
        }

        // Snap ring indicator
        if let Some(snap) = &self.base.snap_result {
            geom.push(PreviewGeometry::Point {
                position: snap.point,
                radius: 0.1,
                color: snap_type_color(snap.snap_type),
                shape: MarkerShape::Ring { inner_radius: 0.06 },
            });
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        match self.phase {
            AnglePhase::PickA => Some("Angle: Click first leg endpoint (A)".to_string()),
            AnglePhase::PickB => Some("Angle: Click vertex (B)".to_string()),
            AnglePhase::PickC => Some("Angle: Click second leg endpoint (C)".to_string()),
            AnglePhase::Complete => {
                if let Some(angle) = self.compute_angle() {
                    Some(format!("Angle: {:.2}\u{00b0} | Click to start new", angle))
                } else {
                    Some("Angle: invalid | Click to start new".to_string())
                }
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.phase = AnglePhase::PickA;
        self.pt_a = None;
        self.pt_b = None;
        self.pt_c = None;
        self.base.clear();
    }
}
