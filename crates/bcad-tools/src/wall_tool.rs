//! Wall drawing tool.
//!
//! The most complex tool: supports chain drawing, ortho constraint (Shift),
//! snap to endpoints/grid, and wall-wall snap.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, WallElement};
use glam::Vec2;

// Constants from the spec.
const MIN_WALL_LENGTH: f64 = 0.2;
const WALL_COLOR: [f32; 4] = [1.0, 0.667, 0.0, 1.0]; // #ffaa00
const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum WallState {
    /// No points placed. Waiting for first click.
    Idle,
    /// First point placed. Rubber-banding to cursor for second point.
    Drawing { start: Vec2 },
    /// Like Drawing, but the start point came from the end of the previous
    /// wall segment. Right-click ends chain and returns to Idle.
    ChainDrawing { start: Vec2 },
}

/// Wall drawing tool.
pub struct WallTool {
    state: WallState,
    base: ToolBase,
    shift_held: bool,
    wall_count: u32,
}

impl WallTool {
    pub fn new() -> Self {
        Self {
            state: WallState::Idle,
            base: ToolBase::default(),
            shift_held: false,
            wall_count: 0,
        }
    }

    fn pending_start(&self) -> Option<Vec2> {
        match &self.state {
            WallState::Idle => None,
            WallState::Drawing { start } | WallState::ChainDrawing { start } => Some(*start),
        }
    }

    /// Apply ortho and snap to get the effective cursor position.
    fn get_constrained_pos(&self, raw: Vec2, shift: bool, snap: &SnapContext, ctx: &ToolContext) -> Vec2 {
        let mut point = raw;

        // Apply ortho constraint if shift held and we have a start point
        if let Some(start) = self.pending_start() {
            if shift {
                point = apply_ortho_constraint(start, point);
            }
        }

        // Try discrete snap points first (endpoints, midpoints)
        if let Some(result) = snap.find_nearest(point, DEFAULT_SNAP_DISTANCE) {
            return result.point;
        }

        // Then try continuous wall edge snap — find nearest point on any wall edge
        if let Some(edge_pt) = nearest_point_on_wall_edge(point, ctx, DEFAULT_SNAP_DISTANCE as f32) {
            return edge_pt;
        }

        point
    }

    fn create_wall_element(&mut self, start: Vec2, end: Vec2, ctx: &ToolContext) -> Vec<Command> {
        self.wall_count += 1;
        let meta = ElementMeta::new(format!("Wall {}", self.wall_count))
            .with_level(ctx.active_level_id.clone());
        let wall_id = meta.id.clone();
        let element = Element::Wall(WallElement {
            meta,
            start: [start.x as f64, start.y as f64],
            end: [end.x as f64, end.y as f64],
            height: ctx.defaults.wall_height,
            thickness: ctx.defaults.wall_thickness,
            arc: None,
            arc_segments: 24,
        });

        vec![
            Command::CreateElement(element),
            Command::AutoJoinWalls {
                wall_id,
                level_id: Some(ctx.active_level_id.clone()),
            },
        ]
    }
}

/// Find the nearest point on any wall's edge (both sides + centerline) to the cursor.
/// Returns None if no wall edge is within `max_dist`.
fn nearest_point_on_wall_edge(cursor: Vec2, ctx: &ToolContext, max_dist: f32) -> Option<Vec2> {
    let mut best_point: Option<Vec2> = None;
    let mut best_dist = max_dist;

    for element in &ctx.elements {
        let wall = match element {
            bcad_domain::Element::Wall(w) => w,
            _ => continue,
        };

        let ws = Vec2::new(wall.start[0] as f32, wall.start[1] as f32);
        let we = Vec2::new(wall.end[0] as f32, wall.end[1] as f32);
        let wdir = we - ws;
        let wlen = wdir.length();
        if wlen < 1e-6 { continue; }
        let wunit = wdir / wlen;
        let wnorm = Vec2::new(-wunit.y, wunit.x);
        let half_t = wall.thickness as f32 * 0.5;

        // Check 3 lines: centerline, left edge, right edge
        let lines: [(Vec2, Vec2); 3] = [
            (ws, we),                                                    // centerline
            (ws + wnorm * half_t, we + wnorm * half_t),                 // left edge
            (ws - wnorm * half_t, we - wnorm * half_t),                 // right edge
        ];

        for (ls, le) in &lines {
            let seg = *le - *ls;
            let seg_len = seg.length();
            if seg_len < 1e-6 { continue; }
            // Project cursor onto this line segment
            let t = ((cursor - *ls).dot(seg)) / (seg_len * seg_len);
            let t_clamped = t.clamp(0.0, 1.0);
            let closest = *ls + seg * t_clamped;
            let dist = (cursor - closest).length();
            if dist < best_dist {
                best_dist = dist;
                best_point = Some(closest);
            }
        }
    }

    best_point
}

impl Default for WallTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for WallTool {
    fn id(&self) -> ToolId {
        ToolId::Wall
    }

    fn display_name(&self) -> &str {
        "Wall"
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
                let pos = self.get_constrained_pos(plan_pos, shift, snap, ctx);
                self.base.cursor_pos = Some(pos);
                // Update snap result
                if let Some(r) = snap.find_nearest(pos, DEFAULT_SNAP_DISTANCE) {
                    self.base.snap_result = Some(r);
                } else {
                    self.base.snap_result = None;
                }
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                shift,
                ..
            } => {
                let pos = self.get_constrained_pos(plan_pos, shift, snap, ctx);

                match &self.state {
                    WallState::Idle => {
                        self.state = WallState::Drawing { start: pos };
                        ToolAction::StateChanged
                    }
                    WallState::Drawing { start } | WallState::ChainDrawing { start } => {
                        let s = *start;
                        let length = (pos - s).length() as f64;
                        if length < MIN_WALL_LENGTH {
                            return ToolAction::Nothing;
                        }
                        let cmds = self.create_wall_element(s, pos, ctx);
                        self.state = WallState::ChainDrawing { start: pos };
                        ToolAction::EmitCommands(cmds)
                    }
                }
            }

            ToolInput::RightClick { .. } => match &self.state {
                WallState::Drawing { .. } | WallState::ChainDrawing { .. } => {
                    self.state = WallState::Idle;
                    ToolAction::StateChanged
                }
                WallState::Idle => ToolAction::Nothing,
            },

            ToolInput::KeyDown {
                key: KeyCode::Escape,
                ..
            } => {
                if !matches!(self.state, WallState::Idle) {
                    self.state = WallState::Idle;
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

        // Cursor marker
        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => WALL_COLOR,
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.06,
                color,
                shape: MarkerShape::Circle,
            });
        }

        // Snap indicator
        if let Some(snap) = &self.base.snap_result {
            geom.push(PreviewGeometry::Point {
                position: snap.point,
                radius: 0.1,
                color: snap_type_color(snap.snap_type),
                shape: MarkerShape::Ring { inner_radius: 0.06 },
            });
        }

        if let Some(start) = self.pending_start() {
            // Start point marker
            geom.push(PreviewGeometry::Point {
                position: start,
                radius: 0.1,
                color: WALL_COLOR,
                shape: MarkerShape::Circle,
            });

            if let Some(end) = self.base.cursor_pos {
                let dx = end.x - start.x;
                let dy = end.y - start.y;
                let len = (dx * dx + dy * dy).sqrt();

                // Center-line preview (dashed)
                geom.push(PreviewGeometry::Line {
                    points: vec![start, end],
                    color: WALL_COLOR,
                    width: 2.0,
                    dashed: true,
                    dash_size: 0.3,
                    gap_size: 0.15,
                });

                // Thickness footprint outline (with junction corner adjustment)
                if len > 1e-6 {
                    let thickness = ctx.defaults.wall_thickness as f32;
                    let nx = -dy / len * (thickness / 2.0);
                    let ny = dx / len * (thickness / 2.0);

                    // Default rectangle corners
                    let mut p0 = Vec2::new(start.x + nx, start.y + ny); // start left
                    let mut p1 = Vec2::new(start.x - nx, start.y - ny); // start right
                    let mut p2 = Vec2::new(end.x - nx, end.y - ny);     // end right
                    let mut p3 = Vec2::new(end.x + nx, end.y + ny);     // end left

                    // Check if start or end snaps to an existing wall endpoint
                    // and compute junction corners for the preview
                    let eps = DEFAULT_SNAP_DISTANCE as f32;
                    for element in &ctx.elements {
                        if let Element::Wall(other) = element {
                            if other.arc.is_some() {
                                continue;
                            }
                            let os = Vec2::new(other.start[0] as f32, other.start[1] as f32);
                            let oe = Vec2::new(other.end[0] as f32, other.end[1] as f32);

                            let other_dx = oe.x - os.x;
                            let other_dy = oe.y - os.y;
                            let other_len = (other_dx * other_dx + other_dy * other_dy).sqrt();
                            if other_len < 1e-6 {
                                continue;
                            }

                            // Skip parallel walls
                            let cross_dirs = (dx / len) * (other_dy / other_len) - (dy / len) * (other_dx / other_len);
                            if cross_dirs.abs() < 0.05 {
                                continue;
                            }

                            let other_nx = -other_dy / other_len * (other.thickness as f32 / 2.0);
                            let other_ny = other_dx / other_len * (other.thickness as f32 / 2.0);

                            let start_near_os = (start - os).length() < eps;
                            let start_near_oe = (start - oe).length() < eps;
                            let end_near_os = (end - os).length() < eps;
                            let end_near_oe = (end - oe).length() < eps;

                            // Start junction
                            if start_near_os || start_near_oe {
                                let other_away = if start_near_os {
                                    [other_dx / other_len, other_dy / other_len]
                                } else {
                                    [-other_dx / other_len, -other_dy / other_len]
                                };
                                let cross = (dx / len) * other_away[1] - (dy / len) * other_away[0];

                                let this_left = [start.x + nx, start.y + ny];
                                let this_right = [start.x - nx, start.y - ny];
                                let this_d = [dx / len, dy / len];
                                let other_left = [os.x + other_nx, os.y + other_ny];
                                let other_right = [os.x - other_nx, os.y - other_ny];
                                let other_d = [other_dx / other_len, other_dy / other_len];

                                if cross > 0.0 {
                                    if let (Some(o), Some(i)) = (
                                        ll_intersect_f32(this_left, this_d, other_right, other_d),
                                        ll_intersect_f32(this_right, this_d, other_left, other_d),
                                    ) {
                                        p0 = Vec2::new(o[0], o[1]);
                                        p1 = Vec2::new(i[0], i[1]);
                                    }
                                } else {
                                    if let (Some(o), Some(i)) = (
                                        ll_intersect_f32(this_right, this_d, other_left, other_d),
                                        ll_intersect_f32(this_left, this_d, other_right, other_d),
                                    ) {
                                        p0 = Vec2::new(i[0], i[1]);
                                        p1 = Vec2::new(o[0], o[1]);
                                    }
                                }
                            }

                            // End junction
                            if end_near_os || end_near_oe {
                                let other_away = if end_near_os {
                                    [other_dx / other_len, other_dy / other_len]
                                } else {
                                    [-other_dx / other_len, -other_dy / other_len]
                                };
                                let cross = (-dx / len) * other_away[1] - (-dy / len) * other_away[0];

                                let this_left = [start.x + nx, start.y + ny];
                                let this_right = [start.x - nx, start.y - ny];
                                let this_d = [dx / len, dy / len];
                                let other_left = [os.x + other_nx, os.y + other_ny];
                                let other_right = [os.x - other_nx, os.y - other_ny];
                                let other_d = [other_dx / other_len, other_dy / other_len];

                                if cross > 0.0 {
                                    if let (Some(o), Some(i)) = (
                                        ll_intersect_f32(this_right, this_d, other_left, other_d),
                                        ll_intersect_f32(this_left, this_d, other_right, other_d),
                                    ) {
                                        p2 = Vec2::new(o[0], o[1]);
                                        p3 = Vec2::new(i[0], i[1]);
                                    }
                                } else {
                                    if let (Some(o), Some(i)) = (
                                        ll_intersect_f32(this_left, this_d, other_right, other_d),
                                        ll_intersect_f32(this_right, this_d, other_left, other_d),
                                    ) {
                                        p2 = Vec2::new(i[0], i[1]);
                                        p3 = Vec2::new(o[0], o[1]);
                                    }
                                }
                            }
                        }
                    }

                    let footprint = vec![p0, p1, p2, p3, p0];
                    geom.push(PreviewGeometry::Line {
                        points: footprint,
                        color: [1.0, 0.8, 0.4, 1.0],
                        width: 1.0,
                        dashed: false,
                        dash_size: 0.0,
                        gap_size: 0.0,
                    });
                }

                // Length measurement label
                let mid = (start + end) * 0.5;
                geom.push(PreviewGeometry::Label {
                    position: mid,
                    text: format_length(len as f64, ctx.length_unit),
                    font_size: 12.0,
                    color: WHITE,
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
            WallState::Idle => Some(format!(
                "Wall: Click to start | H={:.2}m T={:.2}m",
                ctx.defaults.wall_height, ctx.defaults.wall_thickness
            )),
            WallState::Drawing { .. } => Some(
                "Wall: Click to place end point | Shift=ortho | Right-click=cancel".to_string(),
            ),
            WallState::ChainDrawing { .. } => {
                Some("Wall: Click to continue chain | Right-click=finish".to_string())
            }
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        !matches!(self.state, WallState::Idle)
    }

    fn reset(&mut self) {
        self.state = WallState::Idle;
        self.base.clear();
        self.shift_held = false;
    }
}

/// Line-line intersection for f32 edge lines used in the preview footprint.
/// Each line is defined by a point and a direction vector (both [f32; 2]).
/// Returns `None` if lines are near-parallel.
fn ll_intersect_f32(p1: [f32; 2], d1: [f32; 2], p2: [f32; 2], d2: [f32; 2]) -> Option<[f32; 2]> {
    let cross = d1[0] * d2[1] - d1[1] * d2[0];
    if cross.abs() < 1e-6 {
        return None;
    }
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    let t = (dx * d2[1] - dy * d2[0]) / cross;
    Some([p1[0] + t * d1[0], p1[1] + t * d1[1]])
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
    fn test_idle_to_drawing_on_click() {
        let mut tool = WallTool::new();
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
        assert!(tool.pending_start().is_some());
    }

    #[test]
    fn test_drawing_to_chain_on_second_click() {
        let mut tool = WallTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // First click at origin
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

        // Move pointer to set cursor
        tool.handle_input(
            ToolInput::PointerMove {
                plan_pos: Vec2::new(5.0, 0.0),
                screen_pos: Vec2::ZERO,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        // Second click at (5, 0) - should create wall
        let action = tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(5.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        assert!(matches!(action, ToolAction::EmitCommands(_)));
        if let ToolAction::EmitCommands(cmds) = action {
            assert_eq!(cmds.len(), 2); // CreateElement + AutoJoinWalls
        }
        // Should now be in chain drawing
        assert!(tool.pending_start().is_some());
    }

    #[test]
    fn test_too_short_wall_rejected() {
        let mut tool = WallTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // First click
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

        // Second click too close
        let action = tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(0.1, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        assert!(matches!(action, ToolAction::Nothing));
    }

    #[test]
    fn test_right_click_cancels() {
        let mut tool = WallTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // Start drawing
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

        assert!(tool.pending_start().is_some());

        // Right-click cancels
        let action = tool.handle_input(
            ToolInput::RightClick {
                plan_pos: Vec2::ZERO,
            },
            &snap,
            &ctx,
        );

        assert!(matches!(action, ToolAction::StateChanged));
        assert!(tool.pending_start().is_none());
    }

    #[test]
    fn test_escape_resets_to_idle() {
        let mut tool = WallTool::new();
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
        assert!(tool.pending_start().is_none());
    }

    #[test]
    fn test_ortho_constraint() {
        let start = Vec2::new(0.0, 0.0);
        let end = Vec2::new(3.0, 1.0);
        let constrained = apply_ortho_constraint(start, end);
        // dx > dy, so should lock to horizontal
        assert!((constrained.y - 0.0).abs() < 1e-5);
        assert!((constrained.x - 3.0).abs() < 1e-5);

        let end2 = Vec2::new(1.0, 3.0);
        let constrained2 = apply_ortho_constraint(start, end2);
        // dy > dx, so should lock to vertical
        assert!((constrained2.x - 0.0).abs() < 1e-5);
        assert!((constrained2.y - 3.0).abs() < 1e-5);
    }

    #[test]
    fn test_chain_drawing_right_click_finishes() {
        let mut tool = WallTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // First click
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

        // Second click, creates wall, enters chain
        tool.handle_input(
            ToolInput::Click {
                plan_pos: Vec2::new(3.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        // Should be in chain drawing
        assert!(tool.pending_start().is_some());

        // Right-click finishes chain
        tool.handle_input(
            ToolInput::RightClick {
                plan_pos: Vec2::ZERO,
            },
            &snap,
            &ctx,
        );

        assert!(tool.pending_start().is_none());
    }

    #[test]
    fn test_preview_geometry_in_drawing_state() {
        let mut tool = WallTool::new();
        let snap = make_snap();
        let ctx = make_ctx();

        // Start drawing
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

        // Move cursor
        tool.handle_input(
            ToolInput::PointerMove {
                plan_pos: Vec2::new(5.0, 0.0),
                screen_pos: Vec2::ZERO,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        let geom = tool.preview_geometry(&ctx);
        // Should have: cursor marker, start point, center line, footprint, label
        assert!(geom.len() >= 4);
    }
}
