//! Tool manager: owns all tool instances, routes input to the active tool,
//! and collects commands.

use crate::angle_measure_tool::AngleMeasureTool;
use crate::area_measure_tool::AreaMeasureTool;
use crate::beam_tool::BeamTool;
use crate::column_tool::ColumnTool;
use crate::dimension_tool::DimensionTool;
use crate::door_tool::DoorTool;
use crate::measure_tool::MeasureTool;
use crate::path_measure_tool::PathMeasureTool;
use crate::placement_tool::{PlacementCategory, PlacementTool};
use crate::roof_tool::RoofTool;
use crate::room_tool::RoomTool;
use crate::section_tool::SectionTool;
use crate::select_tool::SelectTool;
use crate::sketch_tool::SketchTool;
use crate::slab_tool::{SlabKind, SlabTool};
use crate::spot_elevation_tool::SpotElevationTool;
use crate::stair_tool::StairTool;
use crate::text_tool::TextTool;
use crate::tool_trait::*;
use crate::wall_tool::WallTool;
use crate::window_tool::WindowTool;
use std::collections::HashMap;

/// Disposition of an event after tool processing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventDisposition {
    /// The tool consumed the event (prevents orbit/pan).
    Consumed,
    /// The tool did not consume the event (allow orbit/pan).
    NotConsumed,
}

/// The tool manager owns all tool instances and dispatches input events.
pub struct ToolManager {
    tools: HashMap<ToolId, Box<dyn Tool>>,
    active_tool_id: ToolId,
    /// Commands collected from the last dispatch.
    pending_commands: Vec<Command>,
}

impl ToolManager {
    /// Create a new ToolManager with all tools registered.
    pub fn new() -> Self {
        let mut tools: HashMap<ToolId, Box<dyn Tool>> = HashMap::new();

        // Register all tools
        tools.insert(ToolId::Select, Box::new(SelectTool::new()));
        tools.insert(ToolId::Wall, Box::new(WallTool::new()));
        tools.insert(ToolId::Door, Box::new(DoorTool::new()));
        tools.insert(ToolId::Window, Box::new(WindowTool::new()));
        tools.insert(ToolId::Column, Box::new(ColumnTool::new()));
        tools.insert(ToolId::Beam, Box::new(BeamTool::new()));
        tools.insert(ToolId::Roof, Box::new(RoofTool::new()));
        tools.insert(ToolId::Stair, Box::new(StairTool::new()));
        tools.insert(
            ToolId::Foundation,
            Box::new(SlabTool::new(SlabKind::Foundation)),
        );
        tools.insert(ToolId::Floor, Box::new(SlabTool::new(SlabKind::Floor)));
        tools.insert(ToolId::Parking, Box::new(SlabTool::new(SlabKind::Parking)));
        tools.insert(ToolId::Measure, Box::new(MeasureTool::new()));
        tools.insert(ToolId::MeasurePath, Box::new(PathMeasureTool::new()));
        tools.insert(ToolId::MeasureArea, Box::new(AreaMeasureTool::new()));
        tools.insert(ToolId::MeasureAngle, Box::new(AngleMeasureTool::new()));
        tools.insert(ToolId::Dimension, Box::new(DimensionTool::new()));
        tools.insert(ToolId::SpotElevation, Box::new(SpotElevationTool::new()));
        tools.insert(ToolId::Section, Box::new(SectionTool::new()));
        tools.insert(ToolId::Sketch, Box::new(SketchTool::new()));
        tools.insert(
            ToolId::Furniture,
            Box::new(PlacementTool::new(PlacementCategory::Furniture)),
        );
        tools.insert(
            ToolId::Plumbing,
            Box::new(PlacementTool::new(PlacementCategory::Plumbing)),
        );
        tools.insert(
            ToolId::Electrical,
            Box::new(PlacementTool::new(PlacementCategory::Electrical)),
        );
        tools.insert(
            ToolId::Cabinet,
            Box::new(PlacementTool::new(PlacementCategory::Cabinet)),
        );
        tools.insert(
            ToolId::Hvac,
            Box::new(PlacementTool::new(PlacementCategory::Hvac)),
        );
        tools.insert(
            ToolId::FireSafety,
            Box::new(PlacementTool::new(PlacementCategory::FireSafety)),
        );
        tools.insert(
            ToolId::Accessibility,
            Box::new(PlacementTool::new(PlacementCategory::Accessibility)),
        );

        // Room and Text tools
        tools.insert(ToolId::Room, Box::new(RoomTool::new()));
        tools.insert(ToolId::Text, Box::new(TextTool::new()));

        let mut mgr = Self {
            tools,
            active_tool_id: ToolId::Select,
            pending_commands: Vec::new(),
        };

        // Activate the default tool
        if let Some(tool) = mgr.tools.get_mut(&ToolId::Select) {
            tool.activate();
        }

        mgr
    }

    /// Get the active tool's ID.
    pub fn active_tool_id(&self) -> ToolId {
        self.active_tool_id
    }

    /// Get a reference to the active tool.
    pub fn active_tool(&self) -> &dyn Tool {
        self.tools
            .get(&self.active_tool_id)
            .expect("active tool must exist")
            .as_ref()
    }

    /// Switch to a different tool.
    pub fn set_active_tool(&mut self, tool_id: ToolId) {
        if tool_id == self.active_tool_id {
            return;
        }

        // Deactivate current
        if let Some(current) = self.tools.get_mut(&self.active_tool_id) {
            current.deactivate();
        }

        // Activate new
        self.active_tool_id = tool_id;
        if let Some(new_tool) = self.tools.get_mut(&tool_id) {
            new_tool.activate();
        }
    }

    /// Dispatch an input event to the active tool.
    /// Returns the event disposition and any emitted commands can be retrieved
    /// via `take_commands()`.
    pub fn dispatch_input(
        &mut self,
        input: ToolInput,
        snap: &SnapContext,
        ctx: &ToolContext,
    ) -> EventDisposition {
        let tool = self
            .tools
            .get_mut(&self.active_tool_id)
            .expect("active tool must exist");

        let action = tool.handle_input(input, snap, ctx);

        match action {
            ToolAction::Nothing => {
                if tool.wants_pointer_capture() {
                    EventDisposition::Consumed
                } else {
                    EventDisposition::NotConsumed
                }
            }
            ToolAction::StateChanged => EventDisposition::Consumed,
            ToolAction::EmitCommands(cmds) => {
                // Process SetActiveTool commands inline
                let mut tool_switch = None;
                for cmd in cmds {
                    if let Command::SetActiveTool(id) = &cmd {
                        tool_switch = Some(*id);
                    } else {
                        self.pending_commands.push(cmd);
                    }
                }
                if let Some(new_tool) = tool_switch {
                    self.set_active_tool(new_tool);
                }
                EventDisposition::Consumed
            }
            ToolAction::Deactivate => {
                self.set_active_tool(ToolId::Select);
                EventDisposition::Consumed
            }
            ToolAction::SwitchTool(id) => {
                self.set_active_tool(id);
                EventDisposition::Consumed
            }
        }
    }

    /// Take any pending commands (empties the internal buffer).
    pub fn take_commands(&mut self) -> Vec<Command> {
        std::mem::take(&mut self.pending_commands)
    }

    /// Get preview geometry from the active tool.
    pub fn preview_geometry(&self, ctx: &ToolContext) -> Vec<PreviewGeometry> {
        self.active_tool().preview_geometry(ctx)
    }

    /// Get cursor hint from the active tool.
    pub fn cursor_hint(&self) -> CursorHint {
        self.active_tool().cursor_hint()
    }

    /// Get status text from the active tool.
    pub fn status_text(&self, ctx: &ToolContext) -> Option<String> {
        self.active_tool().status_text(ctx)
    }

    /// Reset the active tool to its initial state.
    pub fn reset_active_tool(&mut self) {
        if let Some(tool) = self.tools.get_mut(&self.active_tool_id) {
            tool.reset();
        }
    }
}

impl Default for ToolManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_manager_default_is_select() {
        let mgr = ToolManager::new();
        assert_eq!(mgr.active_tool_id(), ToolId::Select);
    }

    #[test]
    fn test_switch_tool() {
        let mut mgr = ToolManager::new();
        mgr.set_active_tool(ToolId::Wall);
        assert_eq!(mgr.active_tool_id(), ToolId::Wall);
        assert_eq!(mgr.active_tool().display_name(), "Wall");
    }

    #[test]
    fn test_all_tools_registered() {
        let mgr = ToolManager::new();
        let expected_tools = vec![
            ToolId::Select,
            ToolId::Wall,
            ToolId::Door,
            ToolId::Window,
            ToolId::Column,
            ToolId::Beam,
            ToolId::Roof,
            ToolId::Stair,
            ToolId::Foundation,
            ToolId::Floor,
            ToolId::Parking,
            ToolId::Measure,
            ToolId::MeasurePath,
            ToolId::MeasureArea,
            ToolId::MeasureAngle,
            ToolId::Dimension,
            ToolId::SpotElevation,
            ToolId::Section,
            ToolId::Sketch,
            ToolId::Furniture,
            ToolId::Plumbing,
            ToolId::Electrical,
            ToolId::Cabinet,
            ToolId::Hvac,
            ToolId::FireSafety,
            ToolId::Accessibility,
            ToolId::Room,
            ToolId::Text,
        ];
        for tool_id in expected_tools {
            mgr.tools
                .get(&tool_id)
                .unwrap_or_else(|| panic!("Tool {:?} not registered", tool_id));
        }
    }

    #[test]
    fn test_dispatch_creates_commands() {
        let mut mgr = ToolManager::new();
        let snap = SnapContext::new();
        let mut ctx = ToolContext::default();
        ctx.active_level_id = "level-1".to_string();

        mgr.set_active_tool(ToolId::Wall);

        // Click to start
        mgr.dispatch_input(
            ToolInput::Click {
                plan_pos: glam::Vec2::new(0.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        // Click to finish wall
        mgr.dispatch_input(
            ToolInput::Click {
                plan_pos: glam::Vec2::new(5.0, 0.0),
                button: MouseButton::Left,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        let cmds = mgr.take_commands();
        assert!(!cmds.is_empty());
    }

    #[test]
    fn test_deactivate_switches_to_select() {
        let mut mgr = ToolManager::new();
        let snap = SnapContext::new();
        let ctx = ToolContext::default();

        mgr.set_active_tool(ToolId::Measure);

        // Escape from idle should deactivate
        mgr.dispatch_input(
            ToolInput::KeyDown {
                key: KeyCode::Escape,
                shift: false,
                ctrl: false,
                alt: false,
            },
            &snap,
            &ctx,
        );

        assert_eq!(mgr.active_tool_id(), ToolId::Select);
    }
}
