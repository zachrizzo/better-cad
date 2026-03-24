//! Slab/Floor tool.
//!
//! Two-point rectangle for Foundation, Floor, or Parking elements.
//! The slab_kind field determines which element type is produced.

use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, FloorElement, FoundationElement};
use glam::Vec2;

const MIN_FLOOR_DIMENSION: f64 = 0.2;
const SLAB_SNAP_THRESHOLD: f64 = 0.3;

/// Which element type this slab tool instance creates.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlabKind {
    Foundation,
    Floor,
    Parking,
}

impl SlabKind {
    fn color(self) -> [f32; 4] {
        match self {
            SlabKind::Foundation => [0.5, 0.5, 0.5, 1.0],
            SlabKind::Floor => [0.7, 0.6, 0.4, 1.0],
            SlabKind::Parking => [0.3, 0.3, 0.3, 1.0],
        }
    }

    fn label(self) -> &'static str {
        match self {
            SlabKind::Foundation => "Foundation",
            SlabKind::Floor => "Floor",
            SlabKind::Parking => "Parking",
        }
    }

    fn tool_id(self) -> ToolId {
        match self {
            SlabKind::Foundation => ToolId::Foundation,
            SlabKind::Floor => ToolId::Floor,
            SlabKind::Parking => ToolId::Parking,
        }
    }
}

#[derive(Debug, Clone)]
enum SlabState {
    Idle,
    Drawing { start_corner: Vec2 },
}

pub struct SlabTool {
    state: SlabState,
    slab_kind: SlabKind,
    base: ToolBase,
    slab_count: u32,
}

impl SlabTool {
    pub fn new(slab_kind: SlabKind) -> Self {
        Self {
            state: SlabState::Idle,
            slab_kind,
            base: ToolBase::default(),
            slab_count: 0,
        }
    }
}

impl Tool for SlabTool {
    fn id(&self) -> ToolId {
        self.slab_kind.tool_id()
    }

    fn display_name(&self) -> &str {
        self.slab_kind.label()
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
                self.base.update_cursor(plan_pos, snap, SLAB_SNAP_THRESHOLD);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                self.base.update_cursor(plan_pos, snap, SLAB_SNAP_THRESHOLD);
                let pos = self.base.pos().unwrap_or(plan_pos);

                match &self.state {
                    SlabState::Idle => {
                        self.state = SlabState::Drawing { start_corner: pos };
                        ToolAction::StateChanged
                    }
                    SlabState::Drawing { start_corner } => {
                        let sc = *start_corner;
                        let width = (pos.x - sc.x).abs() as f64;
                        let depth = (pos.y - sc.y).abs() as f64;
                        if width < MIN_FLOOR_DIMENSION || depth < MIN_FLOOR_DIMENSION {
                            return ToolAction::Nothing;
                        }

                        self.slab_count += 1;
                        let boundary = rect_boundary(sc, pos);

                        let level_id = ctx.active_level_id.clone();
                        let element = match self.slab_kind {
                            SlabKind::Foundation => Element::Foundation(FoundationElement {
                                meta: ElementMeta::new(format!("Foundation {}", self.slab_count))
                                    .with_level(level_id),
                                boundary,
                                thickness: ctx.defaults.floor_thickness,
                            }),
                            SlabKind::Floor => Element::Floor(FloorElement {
                                meta: ElementMeta::new(format!("Floor {}", self.slab_count))
                                    .with_level(level_id),
                                boundary,
                                thickness: ctx.defaults.floor_thickness,
                                boundary_segments: Vec::new(),
                            }),
                            SlabKind::Parking => Element::Floor(FloorElement {
                                meta: ElementMeta::new(format!("Parking {}", self.slab_count))
                                    .with_level(level_id)
                                    .with_type("parking_lot"),
                                boundary,
                                thickness: ctx.defaults.floor_thickness,
                                boundary_segments: Vec::new(),
                            }),
                        };

                        self.state = SlabState::Idle;
                        ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                    }
                }
            }

            ToolInput::RightClick { .. } => {
                if !matches!(self.state, SlabState::Idle) {
                    self.state = SlabState::Idle;
                    ToolAction::StateChanged
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if !matches!(self.state, SlabState::Idle) {
                    self.state = SlabState::Idle;
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
        let color = self.slab_kind.color();

        if let Some(pos) = self.base.cursor_pos {
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.06,
                color,
                shape: MarkerShape::Circle,
            });
        }

        if let SlabState::Drawing { start_corner } = &self.state {
            geom.push(PreviewGeometry::Point {
                position: *start_corner,
                radius: 0.1,
                color,
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

                // Filled rectangle preview
                geom.push(PreviewGeometry::Polygon {
                    vertices: vec![
                        Vec2::new(sc.x, sc.y),
                        Vec2::new(end.x, sc.y),
                        Vec2::new(end.x, end.y),
                        Vec2::new(sc.x, end.y),
                    ],
                    color: [color[0], color[1], color[2], 0.2],
                });

                // Outline
                geom.push(PreviewGeometry::Line {
                    points: rect,
                    color,
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

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        match &self.state {
            SlabState::Idle => Some(format!("{}: Click first corner", self.slab_kind.label())),
            SlabState::Drawing { .. } => Some(format!(
                "{}: Click second corner | Right-click=cancel",
                self.slab_kind.label()
            )),
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        matches!(self.state, SlabState::Drawing { .. })
    }

    fn reset(&mut self) {
        self.state = SlabState::Idle;
        self.base.clear();
    }
}
