//! BetterCAD Tool System
//!
//! This crate provides the complete drawing tool system for BetterCAD's native Rust UI.
//! Each tool is a state machine that processes input events and emits commands to mutate
//! the document. Tools produce preview geometry for overlay rendering.

pub mod angle_measure_tool;
pub mod area_measure_tool;
pub mod beam_tool;
pub mod column_tool;
pub mod dimension_tool;
pub mod door_tool;
pub mod input;
pub mod keyboard;
pub mod measure_tool;
pub mod path_measure_tool;
pub mod placement_tool;
pub mod roof_tool;
pub mod room_detection;
pub mod room_tool;
pub mod section_tool;
pub mod select_tool;
pub mod sketch_tool;
pub mod slab_tool;
pub mod snap;
pub mod spot_elevation_tool;
pub mod stair_tool;
pub mod text_tool;
pub mod tool_manager;
pub mod tool_trait;
pub mod wall_cleanup;
pub mod wall_tool;
pub mod window_tool;

// Re-exports for convenience.
pub use input::InputMapper;
pub use keyboard::{
    KeyboardShortcutSystem, Modifiers, ShortcutAction, ShortcutBinding, ShortcutContext,
};
pub use tool_manager::ToolManager;
pub use tool_trait::{
    BimDefaults, Command, CursorHint, KeyCode, LengthUnit, MarkerShape, MouseButton,
    PreviewGeometry, SnapContext, SnapMode, SnapResult, Tool, ToolAction, ToolContext, ToolId,
    ToolInput, ViewportMode,
};
