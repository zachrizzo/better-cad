//! Section cut tool.
//!
//! Two-point tool: click start, click end to define a section cut line.
//! Creates a saved view and switches to it.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, LevelRef, ViewElement};
use glam::Vec2;
const SECTION_COLOR: [f32; 4] = [0.9, 0.2, 0.2, 1.0];

#[derive(Debug, Clone)]
enum SectionState {
    Idle,
    FirstPointSet { first: Vec2 },
}

pub struct SectionTool {
    state: SectionState,
    base: ToolBase,
    section_count: u32,
}

impl SectionTool {
    pub fn new() -> Self {
        Self {
            state: SectionState::Idle,
            base: ToolBase::default(),
            section_count: 0,
        }
    }
}

impl Default for SectionTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for SectionTool {
    fn id(&self) -> ToolId {
        ToolId::Section
    }

    fn display_name(&self) -> &str {
        "Section"
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
                    SectionState::Idle => {
                        self.state = SectionState::FirstPointSet { first: pos };
                        ToolAction::StateChanged
                    }
                    SectionState::FirstPointSet { first } => {
                        let p1 = *first;
                        let p2 = pos;
                        if (p2 - p1).length() < 0.1 {
                            return ToolAction::Nothing;
                        }

                        self.section_count += 1;
                        let view_id = uuid::Uuid::new_v4().to_string();
                        let element = Element::View(ViewElement {
                            meta: ElementMeta {
                                id: view_id.clone(),
                                name: format!("Section {}", self.section_count),
                                level_id: Some(LevelRef::from(ctx.active_level_id.clone())),
                                host_id: None,
                                type_id: None,
                                parent_id: None,
                                material_id: None,
                                ifc_guid: None,
                                classification: None,
                                layer: None,
                            },
                            view_type: "section".to_string(),
                            cut_start: Some([p1.x as f64, p1.y as f64]),
                            cut_end: Some([p2.x as f64, p2.y as f64]),
                            cut_height: None,
                            elevation_direction: None,
                            scale: 1.0 / 50.0,
                        });

                        self.state = SectionState::Idle;
                        ToolAction::EmitCommands(vec![
                            Command::CreateElement(element),
                            Command::SetActiveTool(ToolId::Select),
                        ])
                    }
                }
            }

            ToolInput::RightClick { .. } => {
                if !matches!(self.state, SectionState::Idle) {
                    self.state = SectionState::Idle;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if !matches!(self.state, SectionState::Idle) {
                    self.state = SectionState::Idle;
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

    fn preview_geometry(&self, _ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => SECTION_COLOR,
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

        if let SectionState::FirstPointSet { first } = &self.state {
            geom.push(PreviewGeometry::Point {
                position: *first,
                radius: 0.1,
                color: SECTION_COLOR,
                shape: MarkerShape::Square,
            });

            if let Some(end) = self.base.cursor_pos {
                // Section cut line
                geom.push(PreviewGeometry::Line {
                    points: vec![*first, end],
                    color: SECTION_COLOR,
                    width: 2.5,
                    dashed: true,
                    dash_size: 0.4,
                    gap_size: 0.2,
                });

                // Direction arrow (perpendicular tick at midpoint)
                let dir = (end - *first).normalize_or_zero();
                let perp = Vec2::new(-dir.y, dir.x);
                let mid = (*first + end) * 0.5;
                geom.push(PreviewGeometry::Line {
                    points: vec![mid, mid + perp * 0.3],
                    color: SECTION_COLOR,
                    width: 2.0,
                    dashed: false,
                    dash_size: 0.0,
                    gap_size: 0.0,
                });
            }
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        match &self.state {
            SectionState::Idle => Some("Section: Click to set start of cut line".to_string()),
            SectionState::FirstPointSet { .. } => {
                Some("Section: Click to set end of cut line".to_string())
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        matches!(self.state, SectionState::FirstPointSet { .. })
    }

    fn reset(&mut self) {
        self.state = SectionState::Idle;
        self.base.clear();
    }
}
