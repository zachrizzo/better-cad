//! Two-point distance measurement tool.
//!
//! Click two points to measure the distance between them. Display-only,
//! does not create any persistent element.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use glam::Vec2;
const MEASURE_COLOR: [f32; 4] = [0.0, 0.9, 0.5, 1.0];
const MEASURE_DASH: [f32; 4] = [0.0, 0.9, 0.5, 0.7];

#[derive(Debug, Clone)]
enum MeasureState {
    Idle,
    FirstPointSet { pt1: Vec2 },
    Complete { pt1: Vec2, pt2: Vec2 },
}

pub struct MeasureTool {
    state: MeasureState,
    base: ToolBase,
}

impl MeasureTool {
    pub fn new() -> Self {
        Self {
            state: MeasureState::Idle,
            base: ToolBase::default(),
        }
    }
}

impl Default for MeasureTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for MeasureTool {
    fn id(&self) -> ToolId {
        ToolId::Measure
    }

    fn display_name(&self) -> &str {
        "Measure"
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

                match &self.state {
                    MeasureState::Idle => {
                        self.state = MeasureState::FirstPointSet { pt1: pos };
                        ToolAction::StateChanged
                    }
                    MeasureState::FirstPointSet { pt1 } => {
                        self.state = MeasureState::Complete {
                            pt1: *pt1,
                            pt2: pos,
                        };
                        ToolAction::StateChanged
                    }
                    MeasureState::Complete { .. } => {
                        // Start new measurement
                        self.state = MeasureState::FirstPointSet { pt1: pos };
                        ToolAction::StateChanged
                    }
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if matches!(self.state, MeasureState::Idle) {
                    ToolAction::Deactivate
                } else {
                    self.state = MeasureState::Idle;
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

    fn preview_geometry(&self, ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => MEASURE_COLOR,
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.06,
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

        match &self.state {
            MeasureState::FirstPointSet { pt1 } => {
                geom.push(PreviewGeometry::Point {
                    position: *pt1,
                    radius: 0.08,
                    color: MEASURE_COLOR,
                    shape: MarkerShape::Circle,
                });
                if let Some(end) = self.base.cursor_pos {
                    geom.push(PreviewGeometry::Line {
                        points: vec![*pt1, end],
                        color: MEASURE_DASH,
                        width: 1.5,
                        dashed: true,
                        dash_size: 0.2,
                        gap_size: 0.1,
                    });
                    let dist = (*pt1 - end).length();
                    let mid = (*pt1 + end) * 0.5;
                    geom.push(PreviewGeometry::Label {
                        position: mid,
                        text: format_length(dist as f64, ctx.length_unit),
                        font_size: 12.0,
                        color: [1.0, 1.0, 1.0, 1.0],
                    });
                }
            }
            MeasureState::Complete { pt1, pt2 } => {
                geom.push(PreviewGeometry::Point {
                    position: *pt1,
                    radius: 0.08,
                    color: MEASURE_COLOR,
                    shape: MarkerShape::Circle,
                });
                geom.push(PreviewGeometry::Point {
                    position: *pt2,
                    radius: 0.08,
                    color: MEASURE_COLOR,
                    shape: MarkerShape::Circle,
                });
                geom.push(PreviewGeometry::Line {
                    points: vec![*pt1, *pt2],
                    color: MEASURE_COLOR,
                    width: 1.5,
                    dashed: true,
                    dash_size: 0.2,
                    gap_size: 0.1,
                });
                let dist = (*pt1 - *pt2).length();
                let mid = (*pt1 + *pt2) * 0.5;
                geom.push(PreviewGeometry::Label {
                    position: mid,
                    text: format_length(dist as f64, ctx.length_unit),
                    font_size: 13.0,
                    color: [1.0, 1.0, 1.0, 1.0],
                });
            }
            _ => {}
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        match &self.state {
            MeasureState::Idle => Some("Measure: Click first point".to_string()),
            MeasureState::FirstPointSet { .. } => Some("Measure: Click second point".to_string()),
            MeasureState::Complete { pt1, pt2 } => {
                let dist = (*pt1 - *pt2).length();
                Some(format!("Distance: {:.3} m | Click to start new", dist))
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.state = MeasureState::Idle;
        self.base.clear();
    }
}
