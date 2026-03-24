//! Path (cumulative polyline) measurement tool.
//!
//! Click to add points. Shows segment distances and cumulative total.
//! Right-click or double-click to finish. Display-only.

use crate::tool_trait::*;
use glam::Vec2;

const PATH_SNAP_THRESHOLD: f64 = 0.3;
const PATH_COLOR: [f32; 4] = [0.0, 0.8, 0.9, 1.0];

pub struct PathMeasureTool {
    base: ToolBase,
    points: Vec<Vec2>,
    finished: bool,
}

impl PathMeasureTool {
    pub fn new() -> Self {
        Self {
            base: ToolBase::default(),
            points: Vec::new(),
            finished: false,
        }
    }

    fn total_distance(&self) -> f64 {
        let mut total = 0.0_f64;
        for i in 1..self.points.len() {
            total += (self.points[i] - self.points[i - 1]).length() as f64;
        }
        total
    }
}

impl Default for PathMeasureTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for PathMeasureTool {
    fn id(&self) -> ToolId {
        ToolId::MeasurePath
    }

    fn display_name(&self) -> &str {
        "Path Measure"
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
                self.base.update_cursor(plan_pos, snap, PATH_SNAP_THRESHOLD);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                if self.finished {
                    self.points.clear();
                    self.finished = false;
                }
                self.base.update_cursor(plan_pos, snap, PATH_SNAP_THRESHOLD);
                let pos = self.base.pos().unwrap_or(plan_pos);
                self.points.push(pos);
                ToolAction::StateChanged
            }

            ToolInput::DoubleClick { plan_pos, .. } => {
                if self.points.len() >= 2 {
                    self.finished = true;
                }
                let _ = plan_pos;
                ToolAction::StateChanged
            }

            ToolInput::RightClick { .. } => {
                if self.points.len() >= 2 {
                    self.finished = true;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if self.points.is_empty() {
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

    fn preview_geometry(&self, ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        // Draw path polyline
        if self.points.len() >= 2 {
            geom.push(PreviewGeometry::Line {
                points: self.points.clone(),
                color: PATH_COLOR,
                width: 1.5,
                dashed: true,
                dash_size: 0.2,
                gap_size: 0.1,
            });
        }

        // Draw segment labels
        for i in 1..self.points.len() {
            let seg_len = (self.points[i] - self.points[i - 1]).length();
            let mid = (self.points[i] + self.points[i - 1]) * 0.5;
            geom.push(PreviewGeometry::Label {
                position: mid,
                text: format_length(seg_len as f64, ctx.length_unit),
                font_size: 10.0,
                color: [0.8, 0.8, 0.8, 1.0],
            });
        }

        // Point markers
        for pt in &self.points {
            geom.push(PreviewGeometry::Point {
                position: *pt,
                radius: 0.06,
                color: PATH_COLOR,
                shape: MarkerShape::Circle,
            });
        }

        // Rubber-band to cursor
        if !self.finished {
            if let (Some(last), Some(cursor)) = (self.points.last(), self.base.cursor_pos) {
                geom.push(PreviewGeometry::Line {
                    points: vec![*last, cursor],
                    color: [0.0, 0.8, 0.9, 0.5],
                    width: 1.0,
                    dashed: true,
                    dash_size: 0.15,
                    gap_size: 0.1,
                });
            }
        }

        // Total distance label
        if self.points.len() >= 2 {
            let last = self.points.last().unwrap();
            geom.push(PreviewGeometry::Label {
                position: *last + Vec2::new(0.0, 0.25),
                text: format!(
                    "Total: {}",
                    format_length(self.total_distance(), ctx.length_unit)
                ),
                font_size: 12.0,
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }

        // Cursor
        if let Some(pos) = self.base.cursor_pos {
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.04,
                color: PATH_COLOR,
                shape: MarkerShape::Circle,
            });
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        if self.finished {
            Some(format!(
                "Total path: {:.3} m | Click to start new",
                self.total_distance()
            ))
        } else if self.points.is_empty() {
            Some("Path Measure: Click to start".to_string())
        } else {
            Some(format!(
                "Path Measure: {} points, total {:.3} m | Right-click=finish",
                self.points.len(),
                self.total_distance()
            ))
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.points.clear();
        self.finished = false;
        self.base.clear();
    }
}
