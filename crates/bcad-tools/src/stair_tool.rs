//! Stair drawing tool.
//!
//! Two-point tool with straight/spiral modes. Click start, click end.

use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, StairElement, StairType};
use glam::Vec2;

const MIN_STAIR_RUN: f64 = 0.4;
const STAIR_SNAP_THRESHOLD: f64 = 0.3;
const STAIR_COLOR: [f32; 4] = [0.4, 0.7, 0.3, 1.0];

#[derive(Debug, Clone)]
enum StairState {
    Idle,
    Drawing { start: Vec2 },
}

pub struct StairTool {
    state: StairState,
    base: ToolBase,
    stair_count: u32,
    shift_held: bool,
}

impl StairTool {
    pub fn new() -> Self {
        Self {
            state: StairState::Idle,
            base: ToolBase::default(),
            stair_count: 0,
            shift_held: false,
        }
    }
}

impl Default for StairTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for StairTool {
    fn id(&self) -> ToolId {
        ToolId::Stair
    }

    fn display_name(&self) -> &str {
        "Stair"
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
                if let StairState::Drawing { start } = &self.state {
                    if shift && ctx.defaults.stair_type == StairType::Straight {
                        pos = apply_ortho_constraint(*start, pos);
                    }
                }
                self.base.update_cursor(pos, snap, STAIR_SNAP_THRESHOLD);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                shift,
                ..
            } => {
                let mut pos = plan_pos;
                if let StairState::Drawing { start } = &self.state {
                    if shift && ctx.defaults.stair_type == StairType::Straight {
                        pos = apply_ortho_constraint(*start, pos);
                    }
                }
                self.base.update_cursor(pos, snap, STAIR_SNAP_THRESHOLD);
                let snapped = self.base.pos().unwrap_or(pos);

                match &self.state {
                    StairState::Idle => {
                        self.state = StairState::Drawing { start: snapped };
                        ToolAction::StateChanged
                    }
                    StairState::Drawing { start } => {
                        let s = *start;
                        let run = (snapped - s).length() as f64;
                        if run < MIN_STAIR_RUN {
                            return ToolAction::Nothing;
                        }

                        self.stair_count += 1;
                        let element = Element::Stair(StairElement {
                            meta: ElementMeta::new(format!("Stair {}", self.stair_count))
                                .with_level(ctx.active_level_id.clone()),
                            start: [s.x as f64, s.y as f64],
                            end: [snapped.x as f64, snapped.y as f64],
                            width: ctx.defaults.stair_width,
                            risers: ctx.defaults.stair_risers,
                            total_height: ctx.defaults.stair_height,
                            stair_type: ctx.defaults.stair_type,
                            spiral_turns: ctx.defaults.spiral_turns,
                            side_wall_thickness: ctx.defaults.stair_side_wall_thickness,
                        });
                        self.state = StairState::Idle;
                        ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                    }
                }
            }

            ToolInput::RightClick { .. } => {
                if !matches!(self.state, StairState::Idle) {
                    self.state = StairState::Idle;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if !matches!(self.state, StairState::Idle) {
                    self.state = StairState::Idle;
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
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.06,
                color: STAIR_COLOR,
                shape: MarkerShape::Circle,
            });
        }

        if let StairState::Drawing { start } = &self.state {
            geom.push(PreviewGeometry::Point {
                position: *start,
                radius: 0.1,
                color: STAIR_COLOR,
                shape: MarkerShape::Circle,
            });

            if let Some(end) = self.base.cursor_pos {
                let dir = (end - *start).normalize_or_zero();
                let perp = Vec2::new(-dir.y, dir.x);
                let hw = ctx.defaults.stair_width as f32 / 2.0;

                // Stair outline
                let outline = vec![
                    *start + perp * hw,
                    *start - perp * hw,
                    end - perp * hw,
                    end + perp * hw,
                    *start + perp * hw,
                ];
                geom.push(PreviewGeometry::Line {
                    points: outline,
                    color: STAIR_COLOR,
                    width: 1.5,
                    dashed: true,
                    dash_size: 0.2,
                    gap_size: 0.1,
                });

                // Center line
                geom.push(PreviewGeometry::Line {
                    points: vec![*start, end],
                    color: STAIR_COLOR,
                    width: 1.0,
                    dashed: true,
                    dash_size: 0.3,
                    gap_size: 0.15,
                });

                // Riser lines
                let run = (end - *start).length();
                let risers = ctx.defaults.stair_risers;
                if risers > 0 && run > 0.01 {
                    let step = 1.0 / risers as f32;
                    for i in 0..=risers {
                        let t = step * i as f32;
                        let p = *start + (end - *start) * t;
                        geom.push(PreviewGeometry::Line {
                            points: vec![p + perp * hw, p - perp * hw],
                            color: [0.4, 0.7, 0.3, 0.5],
                            width: 0.5,
                            dashed: false,
                            dash_size: 0.0,
                            gap_size: 0.0,
                        });
                    }
                }

                let mid = (*start + end) * 0.5;
                geom.push(PreviewGeometry::Label {
                    position: mid + perp * (hw + 0.2),
                    text: format_length(run as f64, ctx.length_unit),
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
            StairState::Idle => Some(format!(
                "Stair: Click to start | Risers={} H={:.2}m",
                ctx.defaults.stair_risers, ctx.defaults.stair_height
            )),
            StairState::Drawing { .. } => {
                Some("Stair: Click to place end | Right-click=cancel".to_string())
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        matches!(self.state, StairState::Drawing { .. })
    }

    fn reset(&mut self) {
        self.state = StairState::Idle;
        self.base.clear();
        self.shift_held = false;
    }
}
