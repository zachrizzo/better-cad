//! Window placement tool.
//!
//! Structurally identical to the Door tool, but produces WindowElement
//! and has no swing direction.

use crate::snap::project_point_onto_segment;
use crate::tool_trait::*;
use bcad_domain::{Element, ElementMeta, WindowElement, WindowHardwareType, WindowStyle};
use glam::Vec2;

const WINDOW_ATTACH_DISTANCE: f32 = 0.8;
const WINDOW_END_CLEARANCE: f64 = 0.05;
const WINDOW_SNAP_THRESHOLD: f64 = 0.3;
const WINDOW_COLOR: [f32; 4] = [0.3, 0.7, 1.0, 1.0];

#[derive(Debug, Clone)]
struct WindowCandidate {
    wall_id: String,
    position_along_wall: f64,
    center: Vec2,
    direction: Vec2,
    width: f64,
}

pub struct WindowTool {
    base: ToolBase,
    candidate: Option<WindowCandidate>,
    window_count: u32,
}

impl WindowTool {
    pub fn new() -> Self {
        Self {
            base: ToolBase::default(),
            candidate: None,
            window_count: 0,
        }
    }

    fn find_candidate(&self, pos: Vec2, ctx: &ToolContext) -> Option<WindowCandidate> {
        let mut best: Option<(f32, WindowCandidate)> = None;

        for element in &ctx.elements {
            if let Element::Wall(w) = element {
                let on_level = w
                    .meta
                    .level_id
                    .as_ref()
                    .map_or(false, |lid| lid.as_ref() == ctx.active_level_id);
                if !on_level {
                    continue;
                }

                let ws = Vec2::new(w.start[0] as f32, w.start[1] as f32);
                let we = Vec2::new(w.end[0] as f32, w.end[1] as f32);
                let (t, projected) = project_point_onto_segment(pos, ws, we);
                let dist = (pos - projected).length();

                if dist > WINDOW_ATTACH_DISTANCE {
                    continue;
                }

                let wall_length = (we - ws).length() as f64;
                let window_width = ctx.defaults.window_width;

                let min_t = ((window_width / 2.0 + WINDOW_END_CLEARANCE) / wall_length) as f32;
                let max_t = 1.0 - min_t;
                if min_t >= max_t {
                    continue;
                }
                let clamped_t = t.clamp(min_t, max_t);
                let center = ws + (we - ws) * clamped_t;
                let direction = (we - ws).normalize();

                if best.as_ref().map_or(true, |(bd, _)| dist < *bd) {
                    best = Some((
                        dist,
                        WindowCandidate {
                            wall_id: w.meta.id.clone(),
                            position_along_wall: clamped_t as f64,
                            center,
                            direction,
                            width: window_width,
                        },
                    ));
                }
            }
        }

        best.map(|(_, c)| c)
    }
}

impl Default for WindowTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for WindowTool {
    fn id(&self) -> ToolId {
        ToolId::Window
    }

    fn display_name(&self) -> &str {
        "Window"
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
                    .update_cursor(plan_pos, snap, WINDOW_SNAP_THRESHOLD);
                self.candidate = self.find_candidate(plan_pos, ctx);
                ToolAction::StateChanged
            }

            ToolInput::Click {
                plan_pos,
                button: MouseButton::Left,
                ..
            } => {
                self.candidate = self.find_candidate(plan_pos, ctx);
                if let Some(ref cand) = self.candidate {
                    self.window_count += 1;
                    let mut meta = ElementMeta::new(format!("Window {}", self.window_count))
                        .with_level(ctx.active_level_id.clone())
                        .with_host(cand.wall_id.clone());
                    if let Some(ref type_id) = ctx.active_window_family_type_id {
                        meta = meta.with_type(type_id.clone());
                    }
                    let element = Element::Window(WindowElement {
                        meta,
                        wall_id: cand.wall_id.clone(),
                        position_along_wall: cand.position_along_wall,
                        width: ctx.defaults.window_width,
                        height: ctx.defaults.window_height,
                        sill_height: ctx.defaults.window_sill,
                        hardware_type: ctx.defaults.window_hardware_type,
                        style: ctx.defaults.window_style,
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
                self.candidate = None;
                ToolAction::StateChanged
            }

            _ => ToolAction::Nothing,
        }
    }

    fn preview_geometry(&self, ctx: &ToolContext) -> Vec<PreviewGeometry> {
        let mut geom = Vec::new();

        if let Some(ref cand) = self.candidate {
            let half_w = cand.width as f32 / 2.0;
            let dir = cand.direction;
            let perp = Vec2::new(-dir.y, dir.x);

            // Window opening line
            let left = cand.center - dir * half_w;
            let right = cand.center + dir * half_w;
            geom.push(PreviewGeometry::Line {
                points: vec![left, right],
                color: WINDOW_COLOR,
                width: 3.0,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });

            // Glass pane lines (two parallel lines offset from center)
            let offset = 0.04_f32;
            geom.push(PreviewGeometry::Line {
                points: vec![left + perp * offset, right + perp * offset],
                color: [0.5, 0.8, 1.0, 0.7],
                width: 1.0,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });
            geom.push(PreviewGeometry::Line {
                points: vec![left - perp * offset, right - perp * offset],
                color: [0.5, 0.8, 1.0, 0.7],
                width: 1.0,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });

            geom.push(PreviewGeometry::Label {
                position: cand.center + perp * 0.3,
                text: format_length(cand.width, ctx.length_unit),
                font_size: 11.0,
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }

        if let Some(pos) = self.base.cursor_pos {
            let color = if self.candidate.is_some() {
                WINDOW_COLOR
            } else {
                [0.5, 0.5, 0.5, 1.0]
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.06,
                color,
                shape: MarkerShape::Circle,
            });
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        if self.candidate.is_some() {
            CursorHint::Crosshair
        } else {
            CursorHint::Default
        }
    }

    fn status_text(&self, ctx: &ToolContext) -> Option<String> {
        if self.candidate.is_some() {
            Some(format!(
                "Window: Click to place | W={:.2}m H={:.2}m Sill={:.2}m | {} | {}",
                ctx.defaults.window_width,
                ctx.defaults.window_height,
                ctx.defaults.window_sill,
                window_hardware_label(ctx.defaults.window_hardware_type),
                window_style_label(ctx.defaults.window_style),
            ))
        } else {
            Some("Window: Hover near a wall to place".to_string())
        }
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.base.clear();
        self.candidate = None;
    }
}

fn window_hardware_label(hardware_type: WindowHardwareType) -> &'static str {
    match hardware_type {
        WindowHardwareType::None => "No Hardware",
        WindowHardwareType::Latch => "Latch",
        WindowHardwareType::Crank => "Crank",
    }
}

fn window_style_label(style: WindowStyle) -> &'static str {
    match style {
        WindowStyle::Picture => "Picture",
        WindowStyle::Casement => "Casement",
        WindowStyle::DoubleHung => "Double Hung",
    }
}
