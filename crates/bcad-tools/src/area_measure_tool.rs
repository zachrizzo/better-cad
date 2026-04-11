//! Polygon area measurement tool.
//!
//! Click to add vertices. Close the polygon by clicking near the first
//! vertex, right-clicking, or double-clicking. Display-only.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use glam::Vec2;
const AREA_CLOSE_THRESHOLD: f32 = 0.3;
const AREA_COLOR: [f32; 4] = [0.2, 0.7, 1.0, 1.0];
const AREA_FILL: [f32; 4] = [0.2, 0.7, 1.0, 0.15];

pub struct AreaMeasureTool {
    base: ToolBase,
    vertices: Vec<Vec2>,
    closed: bool,
}

impl AreaMeasureTool {
    pub fn new() -> Self {
        Self {
            base: ToolBase::default(),
            vertices: Vec::new(),
            closed: false,
        }
    }
}

impl Default for AreaMeasureTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for AreaMeasureTool {
    fn id(&self) -> ToolId {
        ToolId::MeasureArea
    }

    fn display_name(&self) -> &str {
        "Area Measure"
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
                self.base.update_cursor(plan_pos, snap, DEFAULT_SNAP_DISTANCE);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                if self.closed {
                    self.vertices.clear();
                    self.closed = false;
                }
                self.base.update_cursor(plan_pos, snap, DEFAULT_SNAP_DISTANCE);
                let pos = self.base.pos().unwrap_or(plan_pos);

                // Check if closing
                if self.vertices.len() >= 3 {
                    let first = self.vertices[0];
                    if (pos - first).length() < AREA_CLOSE_THRESHOLD {
                        self.closed = true;
                        return ToolAction::StateChanged;
                    }
                }

                self.vertices.push(pos);
                ToolAction::StateChanged
            }

            ToolInput::DoubleClick { .. } | ToolInput::RightClick { .. } => {
                if self.vertices.len() >= 3 {
                    self.closed = true;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if self.vertices.is_empty() {
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

        // Vertex markers
        for v in &self.vertices {
            geom.push(PreviewGeometry::Point {
                position: *v,
                radius: 0.06,
                color: AREA_COLOR,
                shape: MarkerShape::Circle,
            });
        }

        if self.vertices.len() >= 2 {
            let mut line_pts = self.vertices.clone();
            if self.closed {
                line_pts.push(self.vertices[0]);
            }
            geom.push(PreviewGeometry::Line {
                points: line_pts,
                color: AREA_COLOR,
                width: 1.5,
                dashed: !self.closed,
                dash_size: 0.2,
                gap_size: 0.1,
            });
        }

        // Rubber-band to cursor
        if !self.closed {
            if let (Some(last), Some(cursor)) = (self.vertices.last(), self.base.cursor_pos) {
                geom.push(PreviewGeometry::Line {
                    points: vec![*last, cursor],
                    color: [0.2, 0.7, 1.0, 0.5],
                    width: 1.0,
                    dashed: true,
                    dash_size: 0.15,
                    gap_size: 0.1,
                });
            }
        }

        // Filled polygon and measurements when closed
        if self.closed && self.vertices.len() >= 3 {
            geom.push(PreviewGeometry::Polygon {
                vertices: self.vertices.clone(),
                color: AREA_FILL,
            });

            let area = polygon_area(&self.vertices);
            let perimeter = polygon_perimeter(&self.vertices);

            // Centroid label
            let cx: f32 =
                self.vertices.iter().map(|v| v.x).sum::<f32>() / self.vertices.len() as f32;
            let cy: f32 =
                self.vertices.iter().map(|v| v.y).sum::<f32>() / self.vertices.len() as f32;
            geom.push(PreviewGeometry::Label {
                position: Vec2::new(cx, cy),
                text: format!(
                    "Area: {} | Perimeter: {}",
                    format_area(area, ctx.length_unit),
                    format_length(perimeter, ctx.length_unit)
                ),
                font_size: 12.0,
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }

        // Cursor
        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => AREA_COLOR,
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
        if self.closed {
            let area = polygon_area(&self.vertices);
            Some(format!("Area: {:.3} m\u{00b2} | Click to start new", area))
        } else if self.vertices.is_empty() {
            Some("Area Measure: Click to add first vertex".to_string())
        } else {
            Some(format!(
                "Area Measure: {} vertices | Click near first to close | Right-click=close",
                self.vertices.len()
            ))
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.vertices.clear();
        self.closed = false;
        self.base.clear();
    }
}
