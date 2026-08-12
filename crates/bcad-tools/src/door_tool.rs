//! Door placement tool.
//!
//! Hover near a wall to show a door preview, click to place.
//! The door is projected onto the nearest wall and clamped so it
//! doesn't extend past wall endpoints.

use crate::snap::{project_point_onto_segment, DEFAULT_SNAP_DISTANCE};
use crate::tool_trait::*;
use bcad_domain::{DoorElement, DoorHardwareType, DoorStyle, DoorSwing, Element, ElementMeta};
use glam::Vec2;

const DOOR_ATTACH_DISTANCE: f32 = 0.8;
const DOOR_END_CLEARANCE: f64 = 0.05;
const DOOR_COLOR: [f32; 4] = [0.4, 0.8, 1.0, 1.0];

/// Candidate for door placement on a wall.
#[derive(Debug, Clone)]
struct DoorCandidate {
    wall_id: String,
    position_along_wall: f64,
    center: Vec2,
    direction: Vec2,
    width: f64,
}

pub struct DoorTool {
    base: ToolBase,
    candidate: Option<DoorCandidate>,
    door_count: u32,
}

impl DoorTool {
    pub fn new() -> Self {
        Self {
            base: ToolBase::default(),
            candidate: None,
            door_count: 0,
        }
    }

    fn find_candidate(&self, pos: Vec2, ctx: &ToolContext) -> Option<DoorCandidate> {
        let mut best: Option<(f32, DoorCandidate)> = None;

        for element in &ctx.elements {
            if let Element::Wall(w) = element {
                // Only walls on the active level
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

                if dist > DOOR_ATTACH_DISTANCE {
                    continue;
                }

                let wall_length = (we - ws).length() as f64;
                let door_width = ctx.defaults.door_width;

                // Clamp t so door doesn't extend past wall ends
                let min_t = ((door_width / 2.0 + DOOR_END_CLEARANCE) / wall_length) as f32;
                let max_t = 1.0 - min_t;
                if min_t >= max_t {
                    continue; // Wall too short for this door
                }
                let clamped_t = t.clamp(min_t, max_t);
                let center = ws + (we - ws) * clamped_t;
                let direction = (we - ws).normalize();

                if best.as_ref().map_or(true, |(bd, _)| dist < *bd) {
                    best = Some((
                        dist,
                        DoorCandidate {
                            wall_id: w.meta.id.clone(),
                            position_along_wall: clamped_t as f64,
                            center,
                            direction,
                            width: door_width,
                        },
                    ));
                }
            }
        }

        best.map(|(_, c)| c)
    }

    fn swing_preview_geometry(cand: &DoorCandidate, swing: DoorSwing) -> (Vec2, f32, f32, Vec2) {
        let dir = cand.direction;
        let perp = Vec2::new(-dir.y, dir.x);
        let half_w = cand.width as f32 / 2.0;
        let hinge = if swing.hinge_on_start() {
            cand.center - dir * half_w
        } else {
            cand.center + dir * half_w
        };

        let closed_dir = if swing.hinge_on_start() { dir } else { -dir };
        let open_dir = if swing.opens_towards_positive_normal() {
            perp
        } else {
            -perp
        };

        let start_angle = closed_dir.y.atan2(closed_dir.x);
        let mut end_angle = open_dir.y.atan2(open_dir.x);
        let delta = end_angle - start_angle;
        if delta > std::f32::consts::PI {
            end_angle -= std::f32::consts::TAU;
        } else if delta < -std::f32::consts::PI {
            end_angle += std::f32::consts::TAU;
        }

        let open_pos = hinge + open_dir * cand.width as f32;
        (hinge, start_angle, end_angle, open_pos)
    }
}

impl Default for DoorTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for DoorTool {
    fn id(&self) -> ToolId {
        ToolId::Door
    }

    fn display_name(&self) -> &str {
        "Door"
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
                    self.door_count += 1;
                    let mut meta = ElementMeta::new(format!("Door {}", self.door_count))
                        .with_level(ctx.active_level_id.clone())
                        .with_host(cand.wall_id.clone());
                    if let Some(ref type_id) = ctx.active_door_family_type_id {
                        meta = meta.with_type(type_id.clone());
                    }
                    let element = Element::Door(DoorElement {
                        meta,
                        wall_id: cand.wall_id.clone(),
                        position_along_wall: cand.position_along_wall,
                        width: ctx.defaults.door_width,
                        height: ctx.defaults.door_height,
                        sill_height: ctx.defaults.door_sill,
                        swing: ctx.defaults.door_swing,
                        hardware_type: ctx.defaults.door_hardware_type,
                        style: ctx.defaults.door_style,
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
            let (hinge, start_angle, end_angle, open_pos) =
                Self::swing_preview_geometry(cand, ctx.defaults.door_swing);

            // Wall opening line
            let left = cand.center - dir * half_w;
            let right = cand.center + dir * half_w;
            geom.push(PreviewGeometry::Line {
                points: vec![left, right],
                color: DOOR_COLOR,
                width: 3.0,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });

            // Swing arc (quarter circle from hinge to open position)
            let swing_radius = cand.width as f32;
            geom.push(PreviewGeometry::Arc {
                center: hinge,
                radius: swing_radius,
                start_angle,
                end_angle,
                color: [0.4, 0.8, 1.0, 0.5],
                width: 1.0,
                dashed: true,
            });

            // Swing line
            geom.push(PreviewGeometry::Line {
                points: vec![hinge, open_pos],
                color: DOOR_COLOR,
                width: 1.0,
                dashed: true,
                dash_size: 0.2,
                gap_size: 0.1,
            });

            // Width label
            geom.push(PreviewGeometry::Label {
                position: cand.center + perp * 0.3,
                text: format_length(cand.width, ctx.length_unit),
                font_size: 11.0,
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }

        // Cursor marker
        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => {
                    if self.candidate.is_some() {
                        DOOR_COLOR
                    } else {
                        [0.5, 0.5, 0.5, 1.0]
                    }
                }
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
                "Door: Click to place | W={:.2}m H={:.2}m | {} | {} | {}",
                ctx.defaults.door_width,
                ctx.defaults.door_height,
                door_swing_label(ctx.defaults.door_swing),
                door_hardware_label(ctx.defaults.door_hardware_type),
                door_style_label(ctx.defaults.door_style),
            ))
        } else {
            Some("Door: Hover near a wall to place".to_string())
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

fn door_swing_label(swing: DoorSwing) -> &'static str {
    match swing {
        DoorSwing::OutLeft => "Out Left",
        DoorSwing::OutRight => "Out Right",
        DoorSwing::InLeft => "In Left",
        DoorSwing::InRight => "In Right",
    }
}

fn door_hardware_label(hardware_type: DoorHardwareType) -> &'static str {
    match hardware_type {
        DoorHardwareType::None => "No Hardware",
        DoorHardwareType::Knob => "Knob",
        DoorHardwareType::Lever => "Lever",
        DoorHardwareType::PullBar => "Pull Bar",
    }
}

fn door_style_label(style: DoorStyle) -> &'static str {
    match style {
        DoorStyle::Flush => "Flush",
        DoorStyle::Panel => "Panel",
        DoorStyle::Double => "Double",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate() -> DoorCandidate {
        DoorCandidate {
            wall_id: "wall-1".to_string(),
            position_along_wall: 0.5,
            center: Vec2::new(5.0, 0.0),
            direction: Vec2::X,
            width: 1.0,
        }
    }

    #[test]
    fn swing_preview_geometry_distinguishes_in_out_and_hinge_side() {
        let cand = candidate();

        let (out_left_hinge, _, _, out_left_open) =
            DoorTool::swing_preview_geometry(&cand, DoorSwing::OutLeft);
        let (in_left_hinge, _, _, in_left_open) =
            DoorTool::swing_preview_geometry(&cand, DoorSwing::InLeft);
        let (out_right_hinge, _, _, out_right_open) =
            DoorTool::swing_preview_geometry(&cand, DoorSwing::OutRight);

        assert_eq!(out_left_hinge, Vec2::new(4.5, 0.0));
        assert_eq!(in_left_hinge, out_left_hinge);
        assert_eq!(out_right_hinge, Vec2::new(5.5, 0.0));
        assert!(out_left_open.y > out_left_hinge.y);
        assert!(in_left_open.y < in_left_hinge.y);
        assert!(out_right_open.y > out_right_hinge.y);
    }
}
