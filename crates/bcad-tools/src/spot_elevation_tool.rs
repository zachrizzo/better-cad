//! Spot elevation tool.
//!
//! Simplest tool: single-click to place an elevation marker.

use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, LevelRef};
use glam::Vec2;

const SPOT_SNAP_DISTANCE: f64 = 0.3;
const SPOT_COLOR: [f32; 4] = [0.9, 0.6, 0.1, 1.0];

pub struct SpotElevationTool {
    base: ToolBase,
    spot_count: u32,
}

impl SpotElevationTool {
    pub fn new() -> Self {
        Self {
            base: ToolBase::default(),
            spot_count: 0,
        }
    }
}

impl Default for SpotElevationTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for SpotElevationTool {
    fn id(&self) -> ToolId {
        ToolId::SpotElevation
    }

    fn display_name(&self) -> &str {
        "Spot Elevation"
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
                self.base.update_cursor(plan_pos, snap, SPOT_SNAP_DISTANCE);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                self.base.update_cursor(plan_pos, snap, SPOT_SNAP_DISTANCE);
                let pos = self.base.pos().unwrap_or(plan_pos);

                self.spot_count += 1;
                let spot_id = uuid::Uuid::new_v4().to_string();
                let element = Element::Generic(bcad_domain::GenericElement {
                    meta: ElementMeta {
                        id: spot_id,
                        name: format!("Spot Elevation {}", self.spot_count),
                        level_id: Some(LevelRef::from(ctx.active_level_id.clone())),
                        host_id: None,
                        type_id: None,
                        parent_id: None,
                        material_id: None,
                        ifc_guid: None,
                        classification: None,
                        layer: Some("G-ANNO".to_string()),
                    },
                    payload: serde_json::json!({
                        "kind": "spot_elevation",
                        "position": [pos.x, pos.y],
                        "elevation": ctx.active_level_elevation,
                        "symbol_style": "circle",
                    }),
                });
                ToolAction::EmitCommands(vec![Command::CreateElement(element)])
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

        if let Some(pos) = self.base.cursor_pos {
            // Elevation marker circle
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.15,
                color: SPOT_COLOR,
                shape: MarkerShape::Ring { inner_radius: 0.1 },
            });

            // Cross inside
            geom.push(PreviewGeometry::Line {
                points: vec![pos - Vec2::new(0.08, 0.0), pos + Vec2::new(0.08, 0.0)],
                color: SPOT_COLOR,
                width: 1.0,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });
            geom.push(PreviewGeometry::Line {
                points: vec![pos - Vec2::new(0.0, 0.08), pos + Vec2::new(0.0, 0.08)],
                color: SPOT_COLOR,
                width: 1.0,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });

            // Elevation label
            geom.push(PreviewGeometry::Label {
                position: pos + Vec2::new(0.0, 0.25),
                text: format!("EL {:.2} m", ctx.active_level_elevation),
                font_size: 11.0,
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
            "Spot Elevation: Click to place | EL={:.2}m",
            ctx.active_level_elevation
        ))
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.base.clear();
    }
}
