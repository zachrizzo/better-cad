//! Generic placement tool for furniture, plumbing, electrical, HVAC,
//! fire safety, accessibility, and cabinet elements.
//!
//! Click to place, R key rotates by 90 degrees.

use crate::snap::DEFAULT_SNAP_DISTANCE;
use crate::tool_trait::*;
use bcad_domain::*;
use glam::Vec2;

/// Which placement category this tool instance handles.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlacementCategory {
    Furniture,
    Plumbing,
    Electrical,
    Cabinet,
    Hvac,
    FireSafety,
    Accessibility,
}

impl PlacementCategory {
    pub fn tool_id(self) -> ToolId {
        match self {
            Self::Furniture => ToolId::Furniture,
            Self::Plumbing => ToolId::Plumbing,
            Self::Electrical => ToolId::Electrical,
            Self::Cabinet => ToolId::Cabinet,
            Self::Hvac => ToolId::Hvac,
            Self::FireSafety => ToolId::FireSafety,
            Self::Accessibility => ToolId::Accessibility,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Furniture => "Furniture",
            Self::Plumbing => "Plumbing",
            Self::Electrical => "Electrical",
            Self::Cabinet => "Cabinet",
            Self::Hvac => "HVAC",
            Self::FireSafety => "Fire Safety",
            Self::Accessibility => "Accessibility",
        }
    }

    pub fn color(self) -> [f32; 4] {
        match self {
            Self::Furniture => [0.8, 0.6, 0.3, 1.0],
            Self::Plumbing => [0.3, 0.5, 0.9, 1.0],
            Self::Electrical => [0.9, 0.9, 0.2, 1.0],
            Self::Cabinet => [0.6, 0.4, 0.2, 1.0],
            Self::Hvac => [0.5, 0.8, 0.5, 1.0],
            Self::FireSafety => [1.0, 0.3, 0.3, 1.0],
            Self::Accessibility => [0.3, 0.3, 0.9, 1.0],
        }
    }

}

pub struct PlacementTool {
    category: PlacementCategory,
    base: ToolBase,
    placement_count: u32,
    rotation: f64,
}

impl PlacementTool {
    pub fn new(category: PlacementCategory) -> Self {
        Self {
            category,
            base: ToolBase::default(),
            placement_count: 0,
            rotation: 0.0,
        }
    }

    fn create_element(&mut self, pos: Vec2, ctx: &ToolContext) -> Element {
        self.placement_count += 1;
        let meta = ElementMeta::new(format!("{} {}", self.category.label(), self.placement_count))
            .with_level(ctx.active_level_id.clone());
        let position = [pos.x as f64, pos.y as f64];

        match self.category {
            PlacementCategory::Furniture => {
                let (width, depth) = furniture_size(&ctx.defaults.furniture_type);
                Element::Furniture(FurnitureElement {
                    meta,
                    symbol_type: ctx.defaults.furniture_type.clone(),
                    position,
                    rotation: self.rotation,
                    width,
                    depth,
                })
            }
            PlacementCategory::Plumbing => Element::Plumbing(PlumbingElement {
                meta,
                symbol_type: ctx.defaults.plumbing_type.clone(),
                position,
                rotation: self.rotation,
            }),
            PlacementCategory::Electrical => Element::Electrical(ElectricalElement {
                meta,
                symbol_type: ctx.defaults.electrical_type.clone(),
                position,
                rotation: self.rotation,
                circuit_id: None,
                connected_to: None,
            }),
            PlacementCategory::Cabinet => Element::Cabinet(CabinetElement {
                meta,
                cabinet_type: ctx.defaults.cabinet_type.clone(),
                position,
                rotation: self.rotation,
                width: 0.61,
                depth: 0.61,
                height: 0.91,
                wall_id: None,
                door_count: ctx.defaults.cabinet_door_count,
                drawer_count: ctx.defaults.cabinet_drawer_count,
            }),
            PlacementCategory::Hvac => Element::Hvac(HvacElement {
                meta,
                symbol_type: ctx.defaults.hvac_type.clone(),
                position,
                rotation: self.rotation,
                width: None,
                depth: None,
            }),
            PlacementCategory::FireSafety => Element::FireSafety(FireSafetyElement {
                meta,
                symbol_type: ctx.defaults.fire_safety_type.clone(),
                position,
                rotation: self.rotation,
            }),
            PlacementCategory::Accessibility => Element::Accessibility(AccessibilityElement {
                meta,
                symbol_type: ctx.defaults.accessibility_type.clone(),
                position,
                rotation: self.rotation,
                width: None,
                depth: None,
            }),
        }
    }
}

impl Tool for PlacementTool {
    fn id(&self) -> ToolId {
        self.category.tool_id()
    }

    fn display_name(&self) -> &str {
        self.category.label()
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
                    let element = self.create_element(pos, ctx);
                    ToolAction::EmitCommands(vec![Command::CreateElement(element)])
                } else {
                    ToolAction::Nothing
                }
            }

            ToolInput::KeyDown {
                key: KeyCode::R, ..
            } => {
                self.rotation = (self.rotation + 90.0) % 360.0;
                ToolAction::StateChanged
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
        let base_color = self.category.color();

        if let Some(pos) = self.base.cursor_pos {
            let color = match &self.base.snap_result {
                Some(s) => snap_type_color(s.snap_type),
                None => base_color,
            };
            geom.push(PreviewGeometry::Point {
                position: pos,
                radius: 0.1,
                color,
                shape: MarkerShape::Circle,
            });

            // Snap ring indicator
            if let Some(snap) = &self.base.snap_result {
                geom.push(PreviewGeometry::Point {
                    position: snap.point,
                    radius: 0.15,
                    color: snap_type_color(snap.snap_type),
                    shape: MarkerShape::Ring { inner_radius: 0.1 },
                });
            }

            // Rotation indicator line
            let angle_rad = (self.rotation as f32).to_radians();
            let dir = Vec2::new(angle_rad.cos(), angle_rad.sin());
            geom.push(PreviewGeometry::Line {
                points: vec![pos, pos + dir * 0.3],
                color: base_color,
                width: 2.0,
                dashed: false,
                dash_size: 0.0,
                gap_size: 0.0,
            });

            geom.push(PreviewGeometry::Label {
                position: pos + Vec2::new(0.0, 0.2),
                text: format!("{} | R={:.0}\u{00b0}", self.category.label(), self.rotation),
                font_size: 10.0,
                color: [1.0, 1.0, 1.0, 1.0],
            });
        }

        geom
    }

    fn cursor_hint(&self) -> CursorHint {
        CursorHint::Crosshair
    }

    fn status_text(&self, _ctx: &ToolContext) -> Option<String> {
        Some(format!(
            "{}: Click to place | R=rotate | Rot={:.0}\u{00b0}",
            self.category.label(),
            self.rotation
        ))
    }

    fn wants_pointer_capture(&self) -> bool {
        false
    }

    fn reset(&mut self) {
        self.base.clear();
    }
}

fn furniture_size(symbol_type: &str) -> (f64, f64) {
    match symbol_type {
        "desk" => (1.5, 0.75),
        "chair" => (0.5, 0.5),
        "table" => (1.2, 0.8),
        "bed" => (2.0, 1.5),
        "sofa" => (2.2, 0.9),
        "dining_table" => (1.8, 0.9),
        "bookshelf" => (1.0, 0.3),
        "wardrobe" => (1.2, 0.6),
        "toilet_stall" => (0.9, 1.5),
        "reception_desk" => (2.4, 0.8),
        "conference_table" => (3.0, 1.2),
        "kitchen_island" => (2.0, 1.0),
        "refrigerator" => (0.7, 0.7),
        "stove" => (0.76, 0.65),
        "washer" | "dryer" => (0.6, 0.6),
        "nightstand" => (0.5, 0.45),
        "coffee_table" => (1.2, 0.6),
        "tv_console" => (1.8, 0.45),
        "console_table" => (1.4, 0.4),
        "bench" => (1.5, 0.45),
        "ottoman" => (0.7, 0.7),
        "vanity" => (1.2, 0.55),
        _ => (0.6, 0.6),
    }
}
