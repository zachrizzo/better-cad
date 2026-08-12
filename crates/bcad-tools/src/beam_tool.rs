//! Beam drawing tool.
//!
//! Two-point tool: click start, click end. The beam snaps to structural
//! supports (columns, walls, existing beams) for elevation resolution.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::{BeamElement, Element, ElementMeta};
use glam::Vec2;

const MIN_BEAM_LENGTH: f64 = 0.2;
const BEAM_COLOR: [f32; 4] = [0.2, 0.6, 1.0, 1.0];

#[derive(Debug, Clone)]
enum BeamState {
    Idle,
    Drawing { start: Vec2 },
}

pub struct BeamTool {
    state: BeamState,
    base: ToolBase,
    beam_count: u32,
    shift_held: bool,
}

impl BeamTool {
    pub fn new() -> Self {
        Self {
            state: BeamState::Idle,
            base: ToolBase::default(),
            beam_count: 0,
            shift_held: false,
        }
    }
}

impl Default for BeamTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for BeamTool {
    fn id(&self) -> ToolId {
        ToolId::Beam
    }

    fn display_name(&self) -> &str {
        "Beam"
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
            ToolInput::PointerMove {
                plan_pos, shift, ..
            } => {
                self.shift_held = shift;
                let mut pos = plan_pos;
                if let BeamState::Drawing { start } = &self.state {
                    if shift {
                        pos = apply_ortho_constraint(*start, pos);
                    }
                }
                self.base.update_cursor(pos, snap, DEFAULT_SNAP_DISTANCE);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                shift,
                ..
            } => {
                let mut pos = plan_pos;
                if let BeamState::Drawing { start } = &self.state {
                    if shift {
                        pos = apply_ortho_constraint(*start, pos);
                    }
                }
                self.base.update_cursor(pos, snap, DEFAULT_SNAP_DISTANCE);
                let snapped = self.base.pos().unwrap_or(pos);

                match &self.state {
                    BeamState::Idle => {
                        self.state = BeamState::Drawing { start: snapped };
                        ToolAction::StateChanged
                    }
                    BeamState::Drawing { start } => {
                        let s = *start;
                        let length = (snapped - s).length() as f64;
                        if length < MIN_BEAM_LENGTH {
                            return ToolAction::Nothing;
                        }

                        self.beam_count += 1;
                        let elevation = ctx.defaults.beam_elevation;
                        let element = Element::Beam(BeamElement {
                            meta: ElementMeta::new(format!("Beam {}", self.beam_count))
                                .with_level(ctx.active_level_id.clone()),
                            start: [s.x as f64, s.y as f64, elevation],
                            end: [snapped.x as f64, snapped.y as f64, elevation],
                            width: ctx.defaults.beam_width,
                            depth: ctx.defaults.beam_depth,
                            arc: None,
                            arc_segments: 24,
                        });
                        self.state = BeamState::Idle;
                        ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                    }
                }
            }

            ToolInput::RightClick { .. } => {
                if !matches!(self.state, BeamState::Idle) {
                    self.state = BeamState::Idle;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if !matches!(self.state, BeamState::Idle) {
                    self.state = BeamState::Idle;
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
                None => BEAM_COLOR,
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

        if let BeamState::Drawing { start } = &self.state {
            geom.push(PreviewGeometry::Point {
                position: *start,
                radius: 0.1,
                color: BEAM_COLOR,
                shape: MarkerShape::Circle,
            });

            if let Some(end) = self.base.cursor_pos {
                geom.push(PreviewGeometry::Line {
                    points: vec![*start, end],
                    color: BEAM_COLOR,
                    width: 2.0,
                    dashed: true,
                    dash_size: 0.3,
                    gap_size: 0.15,
                });

                // Cross-section outline at midpoint
                let dir = (end - *start).normalize();
                let perp = Vec2::new(-dir.y, dir.x);
                let hw = ctx.defaults.beam_width as f32 / 2.0;
                let mid = (*start + end) * 0.5;
                geom.push(PreviewGeometry::Line {
                    points: vec![mid - perp * hw, mid + perp * hw],
                    color: [0.2, 0.6, 1.0, 0.5],
                    width: 1.0,
                    dashed: false,
                    dash_size: 0.0,
                    gap_size: 0.0,
                });

                let length = (end - *start).length();
                geom.push(PreviewGeometry::Label {
                    position: mid + perp * 0.2,
                    text: format_length(length as f64, ctx.length_unit),
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
            BeamState::Idle => Some(format!(
                "Beam: Click to start | W={:.2}m D={:.2}m",
                ctx.defaults.beam_width, ctx.defaults.beam_depth
            )),
            BeamState::Drawing { .. } => {
                Some("Beam: Click to place end | Shift=ortho | Right-click=cancel".to_string())
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        matches!(self.state, BeamState::Drawing { .. })
    }

    fn reset(&mut self) {
        self.state = BeamState::Idle;
        self.base.clear();
        self.shift_held = false;
    }
}
