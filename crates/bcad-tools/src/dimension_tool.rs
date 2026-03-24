//! Dimension annotation tool.
//!
//! Two-point dimension with sub-modes: Aligned, Horizontal, Vertical,
//! Chain, Baseline, Ordinate.

use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, LevelRef};
use glam::Vec2;
use serde::{Deserialize, Serialize};

const DIMENSION_SNAP_DISTANCE: f64 = 0.2;
const DEFAULT_DIMENSION_OFFSET: f64 = 0.5;
const DIM_COLOR: [f32; 4] = [0.9, 0.3, 0.3, 1.0];

/// Sub-mode for the dimension tool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DimensionSubMode {
    Aligned,
    Horizontal,
    Vertical,
    Chain,
    Baseline,
    Ordinate,
}

#[derive(Debug, Clone)]
enum DimensionState {
    Idle,
    FirstPointSet { p1: Vec2 },
}

pub struct DimensionTool {
    state: DimensionState,
    sub_mode: DimensionSubMode,
    base: ToolBase,
    dim_count: u32,
    // Chain/baseline state
    baseline_origin: Option<Vec2>,
    baseline_count: u32,
    ordinate_datum: Option<Vec2>,
}

impl DimensionTool {
    pub fn new() -> Self {
        Self {
            state: DimensionState::Idle,
            sub_mode: DimensionSubMode::Aligned,
            base: ToolBase::default(),
            dim_count: 0,
            baseline_origin: None,
            baseline_count: 0,
            ordinate_datum: None,
        }
    }

    fn effective_p2(&self, p1: Vec2, click: Vec2) -> Vec2 {
        match self.sub_mode {
            DimensionSubMode::Horizontal => Vec2::new(click.x, p1.y),
            DimensionSubMode::Vertical => Vec2::new(p1.x, click.y),
            _ => click,
        }
    }

    fn create_dimension_element(
        &mut self,
        p1: Vec2,
        p2: Vec2,
        offset: f64,
        ctx: &ToolContext,
    ) -> Element {
        self.dim_count += 1;
        let dim_id = uuid::Uuid::new_v4().to_string();
        // We use a GenericElement to represent a dimension since bcad-domain
        // doesn't have a dedicated DimensionElement type. In practice the kernel
        // would have one.
        Element::Generic(bcad_domain::GenericElement {
            meta: ElementMeta {
                id: dim_id,
                name: format!("Dimension {}", self.dim_count),
                level_id: Some(LevelRef::from(ctx.active_level_id.clone())),
                host_id: None,
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: Some("G-DIMS".to_string()),
            },
            payload: serde_json::json!({
                "kind": "dimension",
                "p1": [p1.x, p1.y],
                "p2": [p2.x, p2.y],
                "offset": offset,
                "sub_mode": format!("{:?}", self.sub_mode),
            }),
        })
    }
}

impl Default for DimensionTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for DimensionTool {
    fn id(&self) -> ToolId {
        ToolId::Dimension
    }

    fn display_name(&self) -> &str {
        "Dimension"
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
                    .update_cursor(plan_pos, snap, DIMENSION_SNAP_DISTANCE);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                self.base
                    .update_cursor(plan_pos, snap, DIMENSION_SNAP_DISTANCE);
                let pos = self.base.pos().unwrap_or(plan_pos);
                self.sub_mode = ctx.defaults.dimension_sub_mode;

                match &self.state {
                    DimensionState::Idle => {
                        // Baseline: set origin on first click
                        if self.sub_mode == DimensionSubMode::Baseline
                            && self.baseline_origin.is_none()
                        {
                            self.baseline_origin = Some(pos);
                            self.baseline_count = 0;
                        }
                        // Ordinate: set datum on first click
                        if self.sub_mode == DimensionSubMode::Ordinate
                            && self.ordinate_datum.is_none()
                        {
                            self.ordinate_datum = Some(pos);
                        }
                        self.state = DimensionState::FirstPointSet { p1: pos };
                        ToolAction::StateChanged
                    }
                    DimensionState::FirstPointSet { p1 } => {
                        let p1 = *p1;
                        let p2 = self.effective_p2(p1, pos);
                        let dist = (p2 - p1).length();
                        if dist < 0.05 {
                            return ToolAction::Nothing;
                        }

                        let offset = match self.sub_mode {
                            DimensionSubMode::Baseline => {
                                let o = DEFAULT_DIMENSION_OFFSET + self.baseline_count as f64 * 0.3;
                                self.baseline_count += 1;
                                o
                            }
                            _ => DEFAULT_DIMENSION_OFFSET,
                        };

                        let (dim_p1, dim_p2) = match self.sub_mode {
                            DimensionSubMode::Baseline => (self.baseline_origin.unwrap_or(p1), p2),
                            DimensionSubMode::Ordinate => (self.ordinate_datum.unwrap_or(p1), p2),
                            _ => (p1, p2),
                        };

                        let element = self.create_dimension_element(dim_p1, dim_p2, offset, ctx);
                        let cmds = vec![Command::CreateElement(element)];

                        // Chain mode: p2 becomes new p1
                        match self.sub_mode {
                            DimensionSubMode::Chain => {
                                self.state = DimensionState::FirstPointSet { p1: p2 };
                            }
                            DimensionSubMode::Baseline => {
                                // Keep baseline_origin, go back to FirstPointSet
                                self.state = DimensionState::FirstPointSet {
                                    p1: self.baseline_origin.unwrap_or(p1),
                                };
                            }
                            _ => {
                                self.state = DimensionState::Idle;
                            }
                        }

                        ToolAction::EmitCommands(cmds)
                    }
                }
            }

            ToolInput::RightClick { .. } => {
                // End chain/baseline/ordinate
                self.state = DimensionState::Idle;
                self.baseline_origin = None;
                self.baseline_count = 0;
                self.ordinate_datum = None;
                ToolAction::StateChanged
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if matches!(self.state, DimensionState::Idle) {
                    ToolAction::Deactivate
                } else {
                    self.state = DimensionState::Idle;
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
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.06,
                color: DIM_COLOR,
                shape: MarkerShape::Circle,
            });
        }

        if let DimensionState::FirstPointSet { p1 } = &self.state {
            geom.push(PreviewGeometry::Point {
                position: *p1,
                radius: 0.08,
                color: DIM_COLOR,
                shape: MarkerShape::Circle,
            });

            if let Some(cursor) = self.base.cursor_pos {
                let p2 = self.effective_p2(*p1, cursor);
                geom.push(PreviewGeometry::Line {
                    points: vec![*p1, p2],
                    color: DIM_COLOR,
                    width: 1.5,
                    dashed: true,
                    dash_size: 0.2,
                    gap_size: 0.1,
                });

                let dist = (p2 - *p1).length();
                let mid = (*p1 + p2) * 0.5;
                geom.push(PreviewGeometry::Label {
                    position: mid + Vec2::new(0.0, 0.15),
                    text: format_length(dist as f64, ctx.length_unit),
                    font_size: 12.0,
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
        let mode_label = match self.sub_mode {
            DimensionSubMode::Aligned => "Aligned",
            DimensionSubMode::Horizontal => "Horizontal",
            DimensionSubMode::Vertical => "Vertical",
            DimensionSubMode::Chain => "Chain",
            DimensionSubMode::Baseline => "Baseline",
            DimensionSubMode::Ordinate => "Ordinate",
        };
        match &self.state {
            DimensionState::Idle => Some(format!("Dimension ({}): Click first point", mode_label)),
            DimensionState::FirstPointSet { .. } => {
                Some(format!("Dimension ({}): Click second point", mode_label))
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        matches!(self.state, DimensionState::FirstPointSet { .. })
    }

    fn reset(&mut self) {
        self.state = DimensionState::Idle;
        self.base.clear();
        self.baseline_origin = None;
        self.baseline_count = 0;
        self.ordinate_datum = None;
    }
}
