//! Text annotation placement tool.
//!
//! Simple click-to-place tool that creates a Generic element with text
//! annotation data. The user can then select it and edit in the property panel.

use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, GenericElement, LevelRef};
use glam::Vec2;

const TEXT_SNAP_THRESHOLD: f64 = 0.3;
const TEXT_COLOR: [f32; 4] = [0.9, 0.9, 0.3, 1.0];
const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

/// Text annotation placement tool.
pub struct TextTool {
    cursor_pos: Vec2,
    base: ToolBase,
    text_count: u32,
}

impl TextTool {
    pub fn new() -> Self {
        Self {
            cursor_pos: Vec2::ZERO,
            base: ToolBase::default(),
            text_count: 0,
        }
    }

    fn create_text_element(&mut self, pos: Vec2, ctx: &ToolContext) -> Element {
        self.text_count += 1;
        Element::Generic(GenericElement {
            meta: ElementMeta {
                id: uuid::Uuid::new_v4().to_string(),
                name: format!("Text Annotation {}", self.text_count),
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
                "type": "text_annotation",
                "content": "Text",
                "font_size": 0.3,
                "position": [pos.x as f64, pos.y as f64],
            }),
        })
    }
}

impl Default for TextTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for TextTool {
    fn id(&self) -> ToolId {
        ToolId::Text
    }

    fn display_name(&self) -> &str {
        "Text"
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
                self.base.update_cursor(plan_pos, snap, TEXT_SNAP_THRESHOLD);
                self.cursor_pos = self.base.pos().unwrap_or(plan_pos);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                self.base.update_cursor(plan_pos, snap, TEXT_SNAP_THRESHOLD);
                let pos = self.base.pos().unwrap_or(plan_pos);
                let element = self.create_text_element(pos, ctx);
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

    fn preview_geometry(&self, _ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        if let Some(pos) = self.base.cursor_pos {
            // "Aa" text preview at cursor
            geom.push(PreviewGeometry::Label {
                position: pos,
                text: "Aa".to_string(),
                font_size: 14.0,
                color: TEXT_COLOR,
            });

            // Cursor crosshair marker
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.05,
                color: TEXT_COLOR,
                shape: MarkerShape::Circle,
            });

            // Label hint
            geom.push(PreviewGeometry::Label {
                position: pos + Vec2::new(0.0, -0.2),
                text: "Click to place text".to_string(),
                font_size: 10.0,
                color: WHITE,
            });
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        Some("Text: Click to place annotation | Esc=cancel".to_string())
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.cursor_pos = Vec2::ZERO;
        self.base.clear();
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_snap() -> SnapContext {
        SnapContext::new()
    }

    fn make_ctx() -> ToolContext {
        let mut ctx = ToolContext::default();
        ctx.active_level_id = "level-1".to_string();
        ctx
    }

    #[test]
    fn test_click_creates_element() {
        let mut tool = TextTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        let action = tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(3.0, 2.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        match action {
            ToolAction::EmitCommands(cmds) => {
                assert_eq!(cmds.len(), 1);
                if let Command::CreateElement(Element::Generic(ge)) = &cmds[0] {
                    assert_eq!(ge.meta.name, "Text Annotation 1");
                    assert_eq!(
                        ge.meta.level_id.as_ref().map(|l| l.as_ref()),
                        Some("level-1")
                    );
                    assert_eq!(ge.payload["type"], "text_annotation");
                    assert_eq!(ge.payload["content"], "Text");
                    assert_eq!(ge.payload["font_size"], 0.3);
                    assert_eq!(ge.meta.layer.as_deref(), Some("G-ANNO"));
                } else {
                    panic!("Expected CreateElement with Generic element");
                }
            }
            _ => panic!("Expected EmitCommands"),
        }
    }

    #[test]
    fn test_escape_deactivates() {
        let mut tool = TextTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        let action = tool.handle_input(
            ToolInput::KeyDown {
                key: KeyCode::Escape,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        assert!(matches!(action, ToolAction::Deactivate));
    }

    #[test]
    fn test_preview_shows_text_at_cursor() {
        let mut tool = TextTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        tool.handle_input(
            ToolInput::PointerMove {
                plan_pos: Vec2::new(1.0, 2.0),
                screen_pos: Vec2::ZERO,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        let geom = tool.preview_geometry(&ctx);
        assert!(!geom.is_empty());

        // Check for "Aa" label
        let has_aa = geom.iter().any(|g| {
            if let PreviewGeometry::Label { text, .. } = g {
                text == "Aa"
            } else {
                false
            }
        });
        assert!(has_aa);
    }

    #[test]
    fn test_multiple_placements_increment_count() {
        let mut tool = TextTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // First placement
        tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(1.0, 1.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        // Second placement
        let action = tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(3.0, 3.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        if let ToolAction::EmitCommands(cmds) = action {
            if let Command::CreateElement(Element::Generic(ge)) = &cmds[0] {
                assert_eq!(ge.meta.name, "Text Annotation 2");
            }
        }
    }
}
