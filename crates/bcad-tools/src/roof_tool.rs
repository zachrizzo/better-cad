//! Roof drawing tool.
//!
//! Two-point rectangle tool. Click first corner, click second corner
//! to define the roof footprint rectangle.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, RoofElement};
use glam::Vec2;

const MIN_ROOF_DIMENSION: f64 = 0.2;
const ROOF_COLOR: [f32; 4] = [0.8, 0.4, 0.2, 1.0];

#[derive(Debug, Clone)]
enum RoofState {
    Idle,
    Drawing { start_corner: Vec2 },
}

pub struct RoofTool {
    state: RoofState,
    base: ToolBase,
    roof_count: u32,
}

impl RoofTool {
    pub fn new() -> Self {
        Self {
            state: RoofState::Idle,
            base: ToolBase::default(),
            roof_count: 0,
        }
    }
}

impl Default for RoofTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for RoofTool {
    fn id(&self) -> ToolId {
        ToolId::Roof
    }

    fn display_name(&self) -> &str {
        "Roof"
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
                self.base.update_cursor(plan_pos, snap, DEFAULT_SNAP_DISTANCE);
                let pos = self.base.pos().unwrap_or(plan_pos);

                match &self.state {
                    RoofState::Idle => {
                        self.state = RoofState::Drawing { start_corner: pos };
                        ToolAction::StateChanged
                    }
                    RoofState::Drawing { start_corner } => {
                        let sc = *start_corner;
                        let width = (pos.x - sc.x).abs() as f64;
                        let depth = (pos.y - sc.y).abs() as f64;
                        if width < MIN_ROOF_DIMENSION || depth < MIN_ROOF_DIMENSION {
                            return ToolAction::Nothing;
                        }

                        self.roof_count += 1;
                        let boundary = rect_boundary(sc, pos);
                        let element = Element::Roof(RoofElement {
                            meta: ElementMeta::new(format!("Roof {}", self.roof_count))
                                .with_level(ctx.active_level_id.clone()),
                            boundary,
                            thickness: ctx.defaults.roof_thickness,
                            elevation: ctx.defaults.roof_elevation,
                            auto_elevation: ctx.defaults.roof_auto_elevation,
                            roof_type: ctx.defaults.roof_type,
                            pitch_degrees: ctx.defaults.roof_pitch_degrees,
                            ridge_angle_degrees: ctx.defaults.roof_ridge_angle_degrees,
                        });
                        self.state = RoofState::Idle;
                        ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                    }
                }
            }

            ToolInput::RightClick { .. } => {
                if !matches!(self.state, RoofState::Idle) {
                    self.state = RoofState::Idle;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if !matches!(self.state, RoofState::Idle) {
                    self.state = RoofState::Idle;
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
                None => ROOF_COLOR,
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

        if let RoofState::Drawing { start_corner } = &self.state {
            geom.push(PreviewGeometry::Point {
                position: *start_corner,
                radius: 0.1,
                color: ROOF_COLOR,
                shape: MarkerShape::Circle,
            });

            if let Some(end) = self.base.cursor_pos {
                let sc = *start_corner;
                let rect = vec![
                    Vec2::new(sc.x, sc.y),
                    Vec2::new(end.x, sc.y),
                    Vec2::new(end.x, end.y),
                    Vec2::new(sc.x, end.y),
                    Vec2::new(sc.x, sc.y),
                ];
                geom.push(PreviewGeometry::Line {
                    points: rect,
                    color: ROOF_COLOR,
                    width: 2.0,
                    dashed: true,
                    dash_size: 0.3,
                    gap_size: 0.15,
                });

                let width = (end.x - sc.x).abs();
                let depth = (end.y - sc.y).abs();
                let mid = (sc + end) * 0.5;
                geom.push(PreviewGeometry::Label {
                    position: mid,
                    text: format!(
                        "{}x{}",
                        format_length(width as f64, ctx.length_unit),
                        format_length(depth as f64, ctx.length_unit)
                    ),
                    font_size: 11.0,
                    color: [1.0, 1.0, 1.0, 1.0],
                });
            }
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, ctx: &ToolContext) -> Option<String> {
        match &self.state {
            RoofState::Idle => Some(format!(
                "Roof: Click first corner | Pitch={:.0}deg",
                ctx.defaults.roof_pitch_degrees
            )),
            RoofState::Drawing { .. } => {
                Some("Roof: Click second corner | Right-click=cancel".to_string())
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        matches!(self.state, RoofState::Drawing { .. })
    }

    fn reset(&mut self) {
        self.state = RoofState::Idle;
        self.base.clear();
    }
}
