//! Room drawing tool.
//!
//! Click to add boundary points (minimum 3). Shows a closed polygon preview
//! with live area calculation. Right-click or double-click to finish.
//! On finish: emits a BatchCreate with wall elements for each edge, a floor
//! element, and a room element.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, FloorElement, RoomElement, WallElement};
use glam::Vec2;
const ROOM_CLOSE_THRESHOLD: f32 = 0.3;
const ROOM_COLOR: [f32; 4] = [0.4, 0.8, 0.4, 1.0];
const ROOM_FILL: [f32; 4] = [0.4, 0.8, 0.4, 0.15];
const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

/// Room drawing tool state machine.
#[derive(Debug, Clone)]
enum RoomState {
    /// No points placed yet.
    Idle,
    /// Points being placed (minimum 3 to finish).
    Drawing,
}

/// Room drawing tool. Click to add boundary points, right-click to finish.
pub struct RoomTool {
    points: Vec<Vec2>,
    cursor_pos: Vec2,
    base: ToolBase,
    state: RoomState,
    room_count: u32,
}

impl RoomTool {
    pub fn new() -> Self {
        Self {
            points: Vec::new(),
            cursor_pos: Vec2::ZERO,
            base: ToolBase::default(),
            state: RoomState::Idle,
            room_count: 0,
        }
    }

    /// Build all elements for the completed room polygon.
    fn build_room_elements(&mut self, ctx: &ToolContext) -> Vec<Element> {
        self.room_count += 1;
        let level_id = ctx.active_level_id.clone();
        let boundary: Vec<[f64; 2]> = self
            .points
            .iter()
            .map(|p| [p.x as f64, p.y as f64])
            .collect();

        let mut elements = Vec::new();

        // One wall per edge
        let n = self.points.len();
        for i in 0..n {
            let j = (i + 1) % n;
            let start = self.points[i];
            let end = self.points[j];
            elements.push(Element::Wall(WallElement {
                meta: ElementMeta::new(format!("Room {} Wall {}", self.room_count, i + 1))
                    .with_level(level_id.clone()),
                start: [start.x as f64, start.y as f64],
                end: [end.x as f64, end.y as f64],
                height: ctx.defaults.wall_height,
                thickness: ctx.defaults.wall_thickness,
                arc: None,
                arc_segments: 24,
            }));
        }

        // Floor element
        elements.push(Element::Floor(FloorElement {
            meta: ElementMeta::new(format!("Room {} Floor", self.room_count))
                .with_level(level_id.clone()),
            boundary: boundary.clone(),
            thickness: ctx.defaults.floor_thickness,
            boundary_segments: Vec::new(),
        }));

        // Room element
        elements.push(Element::Room(RoomElement {
            meta: ElementMeta::new(format!("Room {}", self.room_count))
                .with_level(level_id),
            boundary,
            boundary_segments: Vec::new(),
        }));

        elements
    }

    /// Finish drawing: emit BatchCreate with all room elements.
    fn finish_room(&mut self, ctx: &ToolContext) -> ToolAction {
        if self.points.len() < 3 {
            return ToolAction::Nothing;
        }
        let elements = self.build_room_elements(ctx);
        self.points.clear();
        self.state = RoomState::Idle;
        ToolAction::EmitCommands(vec![Command::BatchCreate(elements)])
    }
}

impl Default for RoomTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for RoomTool {
    fn id(&self) -> ToolId {
        ToolId::Room
    }

    fn display_name(&self) -> &str {
        "Room"
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
                self.cursor_pos = self.base.pos().unwrap_or(plan_pos);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                self.base.update_cursor(plan_pos, snap, DEFAULT_SNAP_DISTANCE);
                let pos = self.base.pos().unwrap_or(plan_pos);

                // If we have >= 3 points, check if clicking near first point to close
                if self.points.len() >= 3 {
                    let first = self.points[0];
                    if (pos - first).length() < ROOM_CLOSE_THRESHOLD {
                        return self.finish_room(ctx);
                    }
                }

                self.points.push(pos);
                self.state = RoomState::Drawing;
                ToolAction::StateChanged
            }

            ToolInput::RightClick { .. } | ToolInput::DoubleClick { .. } => {
                self.finish_room(ctx)
            }

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if self.points.is_empty() {
                    ToolAction::Deactivate
                } else {
                    self.points.clear();
                    self.state = RoomState::Idle;
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

        // Point markers for placed vertices
        for v in &self.points {
            geom.push(PreviewGeometry::Point {
                position: *v,
                radius: 0.06,
                color: ROOM_COLOR,
                shape: MarkerShape::Circle,
            });
        }

        // Build the full preview polygon (placed points + cursor)
        let mut preview_pts = self.points.clone();
        if !self.points.is_empty() {
            if let Some(cursor) = self.base.cursor_pos {
                preview_pts.push(cursor);
            }
        }

        // Edge lines (closed polygon)
        if preview_pts.len() >= 2 {
            let mut line_pts = preview_pts.clone();
            line_pts.push(preview_pts[0]); // close the polygon
            geom.push(PreviewGeometry::Line {
                points: line_pts,
                color: ROOM_COLOR,
                width: 1.5,
                dashed: true,
                dash_size: 0.2,
                gap_size: 0.1,
            });
        }

        // Filled polygon preview (when >= 3 points including cursor)
        if preview_pts.len() >= 3 {
            geom.push(PreviewGeometry::Polygon {
                vertices: preview_pts.clone(),
                color: ROOM_FILL,
            });

            // Area label at centroid
            let area = polygon_area(&preview_pts);
            let cx: f32 =
                preview_pts.iter().map(|v| v.x).sum::<f32>() / preview_pts.len() as f32;
            let cy: f32 =
                preview_pts.iter().map(|v| v.y).sum::<f32>() / preview_pts.len() as f32;
            geom.push(PreviewGeometry::Label {
                position: Vec2::new(cx, cy),
                text: format!("Area: {}", format_area(area, ctx.length_unit)),
                font_size: 12.0,
                color: WHITE,
            });
        }

        // Cursor marker
        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => ROOM_COLOR,
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.04,
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

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        match &self.state {
            RoomState::Idle => Some("Room: Click to place first boundary point".to_string()),
            RoomState::Drawing => {
                let n = self.points.len();
                if n < 3 {
                    Some(format!(
                        "Room: {} points placed | Need {} more | Esc=cancel",
                        n,
                        3 - n
                    ))
                } else {
                    Some(format!(
                        "Room: {} points | Click near first to close | Right-click=finish | Esc=cancel",
                        n
                    ))
                }
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        !self.points.is_empty()
    }

    fn reset(&mut self) {
        self.points.clear();
        self.cursor_pos = Vec2::ZERO;
        self.base.clear();
        self.state = RoomState::Idle;
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
    fn test_idle_state_on_new() {
        let tool = RoomTool::new();
        assert!(tool.points.is_empty());
        assert!(matches!(tool.state, RoomState::Idle));
    }

    #[test]
    fn test_click_adds_points() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        let action = tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(0.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );
        assert!(matches!(action, ToolAction::StateChanged));
        assert_eq!(tool.points.len(), 1);
        assert!(matches!(tool.state, RoomState::Drawing));

        tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(4.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );
        assert_eq!(tool.points.len(), 2);

        tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(4.0, 3.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );
        assert_eq!(tool.points.len(), 3);
    }

    #[test]
    fn test_right_click_finishes_with_enough_points() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // Place 3 points
        for pos in &[
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(4.0, 3.0),
        ] {
            tool.handle_input(
                ToolInput::Click {
                    plan_pos: *pos,
                    button: MouseButton::Left,
                    shift: false,
                    ctrl: false,
                    alt: false,
                },
                &snap,
                &ctx,
            );
        }
        assert_eq!(tool.points.len(), 3);

        // Right-click to finish
        let action = tool.handle_input(
            ToolInput::RightClick {
                plan_pos: Vec2::ZERO,
            },
            &snap,
            &ctx,
        );

        match action {
            ToolAction::EmitCommands(cmds) => {
                assert_eq!(cmds.len(), 1); // BatchCreate
                if let Command::BatchCreate(elements) = &cmds[0] {
                    // 3 walls + 1 floor + 1 room = 5 elements
                    assert_eq!(elements.len(), 5);
                    let walls = elements
                        .iter()
                        .filter(|e| matches!(e, Element::Wall(_)))
                        .count();
                    let floors = elements
                        .iter()
                        .filter(|e| matches!(e, Element::Floor(_)))
                        .count();
                    let rooms = elements
                        .iter()
                        .filter(|e| matches!(e, Element::Room(_)))
                        .count();
                    assert_eq!(walls, 3);
                    assert_eq!(floors, 1);
                    assert_eq!(rooms, 1);
                } else {
                    panic!("Expected BatchCreate command");
                }
            }
            _ => panic!("Expected EmitCommands"),
        }

        // Should reset to idle
        assert!(tool.points.is_empty());
        assert!(matches!(tool.state, RoomState::Idle));
    }

    #[test]
    fn test_right_click_with_fewer_than_3_points_does_nothing() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(0.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );
        tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(4.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        let action = tool.handle_input(
            ToolInput::RightClick {
                plan_pos: Vec2::ZERO,
            },
            &snap,
            &ctx,
        );
        assert!(matches!(action, ToolAction::Nothing));
    }

    #[test]
    fn test_close_by_clicking_near_first_point() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // Place 3 points
        for pos in &[
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(4.0, 3.0),
        ] {
            tool.handle_input(
                ToolInput::Click {
                    plan_pos: *pos,
                    button: MouseButton::Left,
                    shift: false,
                    ctrl: false,
                    alt: false,
                },
                &snap,
                &ctx,
            );
        }

        // Click near first point to close
        let action = tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(0.05, 0.05),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        assert!(matches!(action, ToolAction::EmitCommands(_)));
    }

    #[test]
    fn test_escape_cancels_drawing() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(0.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );
        assert_eq!(tool.points.len(), 1);

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

        assert!(matches!(action, ToolAction::StateChanged));
        assert!(tool.points.is_empty());
    }

    #[test]
    fn test_escape_from_idle_deactivates() {
        let mut tool = RoomTool::new();
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
    fn test_preview_geometry_with_points() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // Place 3 points
        for pos in &[
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(4.0, 3.0),
        ] {
            tool.handle_input(
                ToolInput::Click {
                    plan_pos: *pos,
                    button: MouseButton::Left,
                    shift: false,
                    ctrl: false,
                    alt: false,
                },
                &snap,
                &ctx,
            );
        }

        // Move cursor to get preview
        tool.handle_input(
            ToolInput::PointerMove {
                plan_pos: Vec2::new(0.0, 3.0),
                screen_pos: Vec2::ZERO,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        let geom = tool.preview_geometry(&ctx);
        // Should have: 3 point markers + closed line + polygon fill + area label + cursor
        assert!(geom.len() >= 5);

        // Verify there's a polygon and a label in the preview
        let has_polygon = geom.iter().any(|g| matches!(g, PreviewGeometry::Polygon { .. }));
        let has_label = geom.iter().any(|g| matches!(g, PreviewGeometry::Label { .. }));
        assert!(has_polygon);
        assert!(has_label);
    }

    #[test]
    fn test_room_elements_have_correct_level_id() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        for pos in &[
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(4.0, 3.0),
        ] {
            tool.handle_input(
                ToolInput::Click {
                    plan_pos: *pos,
                    button: MouseButton::Left,
                    shift: false,
                    ctrl: false,
                    alt: false,
                },
                &snap,
                &ctx,
            );
        }

        let action = tool.handle_input(
            ToolInput::RightClick {
                plan_pos: Vec2::ZERO,
            },
            &snap,
            &ctx,
        );

        if let ToolAction::EmitCommands(cmds) = action {
            if let Command::BatchCreate(elements) = &cmds[0] {
                for el in elements {
                    let meta = el.meta();
                    assert_eq!(
                        meta.level_id.as_ref().map(|l| l.as_ref()),
                        Some("level-1")
                    );
                }
            }
        }
    }

    #[test]
    fn test_walls_connect_consecutive_points() {
        let mut tool = RoomTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        let pts = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(4.0, 3.0),
            Vec2::new(0.0, 3.0),
        ];

        for pos in &pts {
            tool.handle_input(
                ToolInput::Click {
                    plan_pos: *pos,
                    button: MouseButton::Left,
                    shift: false,
                    ctrl: false,
                    alt: false,
                },
                &snap,
                &ctx,
            );
        }

        let action = tool.handle_input(
            ToolInput::RightClick {
                plan_pos: Vec2::ZERO,
            },
            &snap,
            &ctx,
        );

        if let ToolAction::EmitCommands(cmds) = action {
            if let Command::BatchCreate(elements) = &cmds[0] {
                let walls: Vec<&WallElement> = elements
                    .iter()
                    .filter_map(|e| {
                        if let Element::Wall(w) = e {
                            Some(w)
                        } else {
                            None
                        }
                    })
                    .collect();
                assert_eq!(walls.len(), 4);

                // Check wall 0: (0,0) -> (4,0)
                assert!((walls[0].start[0] - 0.0).abs() < 1e-6);
                assert!((walls[0].end[0] - 4.0).abs() < 1e-6);

                // Check wall 3 (closing): (0,3) -> (0,0)
                assert!((walls[3].start[0] - 0.0).abs() < 1e-6);
                assert!((walls[3].start[1] - 3.0).abs() < 1e-6);
                assert!((walls[3].end[0] - 0.0).abs() < 1e-6);
                assert!((walls[3].end[1] - 0.0).abs() < 1e-6);
            }
        }
    }
}
