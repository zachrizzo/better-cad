//! Sketch drawing tool.
//!
//! Sub-modes: None (select), Rectangle, Line, Circle.
//! Emits sketch elements as GenericElement with sketch payload.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, LevelRef};
use glam::Vec2;
use serde::{Deserialize, Serialize};
const MIN_RECT_SIDE: f64 = 1e-5;
const SKETCH_COLOR: [f32; 4] = [0.3, 0.9, 0.3, 1.0];

/// Sketch sub-mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SketchDrawMode {
    None,
    Rectangle,
    Line,
    Circle,
}

#[derive(Debug, Clone)]
enum SketchState {
    Idle,
    PendingPoint { start: Vec2 },
}

pub struct SketchTool {
    draw_mode: SketchDrawMode,
    state: SketchState,
    base: ToolBase,
    sketch_count: u32,
}

impl SketchTool {
    pub fn new() -> Self {
        Self {
            draw_mode: SketchDrawMode::None,
            state: SketchState::Idle,
            base: ToolBase::default(),
            sketch_count: 0,
        }
    }
}

impl Default for SketchTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for SketchTool {
    fn id(&self) -> ToolId {
        ToolId::Sketch
    }

    fn display_name(&self) -> &str {
        "Sketch"
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
        ctx: &ToolContext,
    ) -> ToolAction {
        self.draw_mode = ctx.defaults.sketch_draw_mode;

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

                match self.draw_mode {
                    SketchDrawMode::None => {
                        // Selection mode: handled externally
                        ToolAction::Nothing
                    }
                    SketchDrawMode::Rectangle => match &self.state {
                        SketchState::Idle => {
                            self.state = SketchState::PendingPoint { start: pos };
                            ToolAction::StateChanged
                        }
                        SketchState::PendingPoint { start } => {
                            let s = *start;
                            let w = (pos.x - s.x).abs() as f64;
                            let h = (pos.y - s.y).abs() as f64;
                            if w < MIN_RECT_SIDE || h < MIN_RECT_SIDE {
                                return ToolAction::Nothing;
                            }
                            self.sketch_count += 1;
                            let element = Element::Generic(bcad_domain::GenericElement {
                                meta: ElementMeta {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    name: format!("Sketch Rect {}", self.sketch_count),
                                    level_id: Some(LevelRef::from(ctx.active_level_id.clone())),
                                    host_id: None,
                                    type_id: None,
                                    parent_id: None,
                                    material_id: None,
                                    ifc_guid: None,
                                    classification: None,
                                    layer: None,
                                },
                                payload: serde_json::json!({
                                    "kind": "sketch_rectangle",
                                    "corner1": [s.x, s.y],
                                    "corner2": [pos.x, pos.y],
                                }),
                            });
                            self.state = SketchState::Idle;
                            ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                        }
                    },
                    SketchDrawMode::Line => {
                        match &self.state {
                            SketchState::Idle => {
                                self.state = SketchState::PendingPoint { start: pos };
                                ToolAction::StateChanged
                            }
                            SketchState::PendingPoint { start } => {
                                let s = *start;
                                if (pos - s).length() < 1e-4 {
                                    return ToolAction::Nothing;
                                }
                                self.sketch_count += 1;
                                let element = Element::Generic(bcad_domain::GenericElement {
                                    meta: ElementMeta {
                                        id: uuid::Uuid::new_v4().to_string(),
                                        name: format!("Sketch Line {}", self.sketch_count),
                                        level_id: Some(LevelRef::from(ctx.active_level_id.clone())),
                                        host_id: None,
                                        type_id: None,
                                        parent_id: None,
                                        material_id: None,
                                        ifc_guid: None,
                                        classification: None,
                                        layer: None,
                                    },
                                    payload: serde_json::json!({
                                        "kind": "sketch_line",
                                        "start": [s.x, s.y],
                                        "end": [pos.x, pos.y],
                                    }),
                                });
                                // Chain: end becomes new start
                                self.state = SketchState::PendingPoint { start: pos };
                                ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                            }
                        }
                    }
                    SketchDrawMode::Circle => match &self.state {
                        SketchState::Idle => {
                            self.state = SketchState::PendingPoint { start: pos };
                            ToolAction::StateChanged
                        }
                        SketchState::PendingPoint { start } => {
                            let center = *start;
                            let radius = (pos - center).length() as f64;
                            if radius < MIN_RECT_SIDE {
                                return ToolAction::Nothing;
                            }
                            self.sketch_count += 1;
                            let element = Element::Generic(bcad_domain::GenericElement {
                                meta: ElementMeta {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    name: format!("Sketch Circle {}", self.sketch_count),
                                    level_id: Some(LevelRef::from(ctx.active_level_id.clone())),
                                    host_id: None,
                                    type_id: None,
                                    parent_id: None,
                                    material_id: None,
                                    ifc_guid: None,
                                    classification: None,
                                    layer: None,
                                },
                                payload: serde_json::json!({
                                    "kind": "sketch_circle",
                                    "center": [center.x, center.y],
                                    "radius": radius,
                                }),
                            });
                            self.state = SketchState::Idle;
                            ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                        }
                    },
                }
            }

            ToolInput::RightClick { .. } => {
                if !matches!(self.state, SketchState::Idle) {
                    self.state = SketchState::Idle;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if !matches!(self.state, SketchState::Idle) {
                    self.state = SketchState::Idle;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Deactivate
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
                None => SKETCH_COLOR,
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.05,
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

        if let SketchState::PendingPoint { start } = &self.state {
            geom.push(PreviewGeometry::Point {
                position: *start,
                radius: 0.08,
                color: SKETCH_COLOR,
                shape: MarkerShape::Circle,
            });

            if let Some(cursor) = self.base.cursor_pos {
                match self.draw_mode {
                    SketchDrawMode::Rectangle => {
                        let s = *start;
                        let rect = vec![
                            Vec2::new(s.x, s.y),
                            Vec2::new(cursor.x, s.y),
                            Vec2::new(cursor.x, cursor.y),
                            Vec2::new(s.x, cursor.y),
                            Vec2::new(s.x, s.y),
                        ];
                        geom.push(PreviewGeometry::Line {
                            points: rect,
                            color: SKETCH_COLOR,
                            width: 1.5,
                            dashed: true,
                            dash_size: 0.15,
                            gap_size: 0.1,
                        });
                    }
                    SketchDrawMode::Line => {
                        geom.push(PreviewGeometry::Line {
                            points: vec![*start, cursor],
                            color: SKETCH_COLOR,
                            width: 1.5,
                            dashed: true,
                            dash_size: 0.15,
                            gap_size: 0.1,
                        });
                        let dist = (cursor - *start).length();
                        let mid = (*start + cursor) * 0.5;
                        geom.push(PreviewGeometry::Label {
                            position: mid,
                            text: format_length(dist as f64, ctx.length_unit),
                            font_size: 10.0,
                            color: [1.0, 1.0, 1.0, 0.8],
                        });
                    }
                    SketchDrawMode::Circle => {
                        let center = *start;
                        let radius = (cursor - center).length();
                        // Circle as polyline
                        let segments = 64;
                        let mut circle_pts = Vec::with_capacity(segments + 1);
                        for i in 0..=segments {
                            let angle = (i as f32 / segments as f32) * std::f32::consts::TAU;
                            circle_pts.push(center + Vec2::new(angle.cos(), angle.sin()) * radius);
                        }
                        geom.push(PreviewGeometry::Line {
                            points: circle_pts,
                            color: SKETCH_COLOR,
                            width: 1.5,
                            dashed: true,
                            dash_size: 0.15,
                            gap_size: 0.1,
                        });
                        // Radius line
                        geom.push(PreviewGeometry::Line {
                            points: vec![center, cursor],
                            color: [0.3, 0.9, 0.3, 0.5],
                            width: 0.5,
                            dashed: true,
                            dash_size: 0.1,
                            gap_size: 0.05,
                        });
                        geom.push(PreviewGeometry::Label {
                            position: (center + cursor) * 0.5,
                            text: format!("r={}", format_length(radius as f64, ctx.length_unit)),
                            font_size: 10.0,
                            color: [1.0, 1.0, 1.0, 0.8],
                        });
                    }
                    SketchDrawMode::None => {}
                }
            }
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        let mode_label = match self.draw_mode {
            SketchDrawMode::None => "Select",
            SketchDrawMode::Rectangle => "Rectangle",
            SketchDrawMode::Line => "Line",
            SketchDrawMode::Circle => "Circle",
        };
        match &self.state {
            SketchState::Idle => Some(format!("Sketch ({}): Click to start", mode_label)),
            SketchState::PendingPoint { .. } => {
                Some(format!("Sketch ({}): Click to complete", mode_label))
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        matches!(self.state, SketchState::PendingPoint { .. })
    }

    fn reset(&mut self) {
        self.state = SketchState::Idle;
        self.base.clear();
    }
}
