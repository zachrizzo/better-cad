//! Column placement tool.
//!
//! Click to place a column. Simple single-click placement with snap support.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::{ColumnElement, Element, ElementMeta};
use glam::Vec2;
const COLUMN_COLOR: [f32; 4] = [0.6, 0.4, 0.8, 1.0];

pub struct ColumnTool {
    base: ToolBase,
    column_count: u32,
}

impl ColumnTool {
    pub fn new() -> Self {
        Self {
            base: ToolBase::default(),
            column_count: 0,
        }
    }
}

impl Default for ColumnTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for ColumnTool {
    fn id(&self) -> ToolId {
        ToolId::Column
    }

    fn display_name(&self) -> &str {
        "Column"
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
                if let Some(pos) = self.base.pos() {
                    self.column_count += 1;
                    let element = Element::Column(ColumnElement {
                        meta: ElementMeta::new(format!("Column {}", self.column_count))
                            .with_level(ctx.active_level_id.clone()),
                        center: [pos.x as f64, pos.y as f64],
                        width: ctx.defaults.column_width,
                        depth: ctx.defaults.column_depth,
                        height: ctx.defaults.column_height,
                        diameter: None,
                        column_segments: 24,
                    });
                    ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => ToolAction::Deactivate,

            ToolInput::PointerLeave => {
                self.base.clear();
                ToolAction::StateChanged
            }

            _ => ToolAction::Nothing,
        }
    }

    fn preview_geometry(&self, ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        // Snap ring indicator
        if let Some(snap) = &self.base.snap_result {
            geom.push(PreviewGeometry::Point {
                position: snap.point,
                radius: 0.1,
                color: snap_type_color(snap.snap_type),
                shape: MarkerShape::Ring { inner_radius: 0.06 },
            });
        }

        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => COLUMN_COLOR,
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.06,
                color,
                shape: MarkerShape::Circle,
            });

            // Column footprint rectangle
            let hw = ctx.defaults.column_width as f32 / 2.0;
            let hd = ctx.defaults.column_depth as f32 / 2.0;
            let footprint = vec![
                Vec2::new(pos.x - hw, pos.y - hd),
                Vec2::new(pos.x + hw, pos.y - hd),
                Vec2::new(pos.x + hw, pos.y + hd),
                Vec2::new(pos.x - hw, pos.y + hd),
                Vec2::new(pos.x - hw, pos.y - hd),
            ];
            geom.push(PreviewGeometry::Line {
                points: footprint,
                color: COLUMN_COLOR,
                width: 1.5,
                dashed: true,
                dash_size: 0.2,
                gap_size: 0.1,
            });

            geom.push(PreviewGeometry::Label {
                position: pos + Vec2::new(0.0, hd + 0.15),
                text: format!(
                    "{}x{}",
                    format_length(ctx.defaults.column_width, ctx.length_unit),
                    format_length(ctx.defaults.column_depth, ctx.length_unit)
                ),
                font_size: 10.0,
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, ctx: &ToolContext) -> Option<String> {
        Some(format!(
            "Column: Click to place | W={:.2}m D={:.2}m H={:.2}m",
            ctx.defaults.column_width, ctx.defaults.column_depth, ctx.defaults.column_height
        ))
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.base.clear();
    }
}
