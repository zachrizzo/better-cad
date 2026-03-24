//! Input mapper: converts raw input events to ToolInput with coordinate
//! transforms and modifier key tracking.

use crate::tool_trait::{KeyCode, MouseButton, ToolInput, ViewportMode};
use glam::Vec2;

/// Tracks modifier key state and converts raw events to ToolInput.
pub struct InputMapper {
    pub viewport_mode: ViewportMode,
    shift_held: bool,
    ctrl_held: bool,
    alt_held: bool,
}

impl InputMapper {
    pub fn new() -> Self {
        Self {
            viewport_mode: ViewportMode::View2D,
            shift_held: false,
            ctrl_held: false,
            alt_held: false,
        }
    }

    /// Convert a raw screen-space pointer position to plan-space.
    ///
    /// In the native desktop app, the event loop performs its own coordinate
    /// projection (orthographic unproject for 2D, ray-plane intersection for
    /// 3D) and passes pre-transformed `plan_pos` directly in `ToolInput`.
    /// This method is therefore only relevant for WASM/Tauri frontends that
    /// route raw screen coordinates through `InputMapper`.
    ///
    /// In **2D mode** the caller should pass already-unprojected plan
    /// coordinates, so this is a pass-through.
    ///
    /// In **3D mode** the caller must perform a ray-plane intersection
    /// (using the camera's inverse view-projection matrix against Y=0)
    /// *before* calling this, and pass the resulting plan position.
    /// If the caller cannot do that, screen_pos is returned as a fallback.
    pub fn screen_to_plan(&self, screen_pos: Vec2) -> Vec2 {
        // Both modes: the caller is expected to provide plan-space coords.
        // The ViewportMode distinction is kept for future per-mode logic.
        screen_pos
    }

    /// Update modifier state from a key event.
    pub fn update_modifiers_down(&mut self, key: KeyCode) {
        match key {
            KeyCode::ShiftLeft | KeyCode::ShiftRight => self.shift_held = true,
            KeyCode::ControlLeft | KeyCode::ControlRight => self.ctrl_held = true,
            KeyCode::AltLeft | KeyCode::AltRight => self.alt_held = true,
            _ => {}
        }
    }

    pub fn update_modifiers_up(&mut self, key: KeyCode) {
        match key {
            KeyCode::ShiftLeft | KeyCode::ShiftRight => self.shift_held = false,
            KeyCode::ControlLeft | KeyCode::ControlRight => self.ctrl_held = false,
            KeyCode::AltLeft | KeyCode::AltRight => self.alt_held = false,
            _ => {}
        }
    }

    /// Create a PointerMove ToolInput from screen coordinates.
    pub fn make_pointer_move(&self, screen_pos: Vec2) -> ToolInput {
        let plan_pos = self.screen_to_plan(screen_pos);
        ToolInput::PointerMove {
            plan_pos,
            screen_pos,
            shift: self.shift_held,
            ctrl: self.ctrl_held,
            alt: self.alt_held,
        }
    }

    /// Create a Click ToolInput from screen coordinates.
    pub fn make_click(&self, screen_pos: Vec2, button: MouseButton) -> ToolInput {
        let plan_pos = self.screen_to_plan(screen_pos);
        if button == MouseButton::Right {
            ToolInput::RightClick { plan_pos }
        } else {
            ToolInput::Click {
                plan_pos,
                button,
                shift: self.shift_held,
                ctrl: self.ctrl_held,
                alt: self.alt_held,
            }
        }
    }

    /// Create a DoubleClick ToolInput.
    pub fn make_double_click(&self, screen_pos: Vec2, button: MouseButton) -> ToolInput {
        let plan_pos = self.screen_to_plan(screen_pos);
        ToolInput::DoubleClick { plan_pos, button }
    }

    /// Create a KeyDown ToolInput.
    pub fn make_key_down(&mut self, key: KeyCode) -> ToolInput {
        self.update_modifiers_down(key);
        ToolInput::KeyDown {
            key,
            shift: self.shift_held,
            ctrl: self.ctrl_held,
            alt: self.alt_held,
        }
    }

    /// Create a KeyUp ToolInput.
    pub fn make_key_up(&mut self, key: KeyCode) -> ToolInput {
        self.update_modifiers_up(key);
        ToolInput::KeyUp { key }
    }

    /// Get current modifier state.
    pub fn modifiers(&self) -> crate::keyboard::Modifiers {
        crate::keyboard::Modifiers {
            ctrl: self.ctrl_held,
            shift: self.shift_held,
            alt: self.alt_held,
        }
    }
}

impl Default for InputMapper {
    fn default() -> Self {
        Self::new()
    }
}
