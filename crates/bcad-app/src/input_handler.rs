//! Raw input normalization — converts winit keyboard/mouse events to the
//! types expected by the camera and tool systems.
//!
//! All functions here are pure (no mutable state) and are pulled out of
//! `event_loop` to keep that file focused on coordination logic.

use bcad_render::camera::MouseButton as CameraMouseButton;
use bcad_tools::tool_trait::{KeyCode, MouseButton};
use winit::keyboard::{Key, NamedKey};

// ---------------------------------------------------------------------------
// Mouse button conversion
// ---------------------------------------------------------------------------

/// Map a winit mouse button to the camera system's `MouseButton` type.
pub(crate) fn winit_mouse_button_to_camera_button(
    button: winit::event::MouseButton,
) -> CameraMouseButton {
    match button {
        winit::event::MouseButton::Left => CameraMouseButton::Left,
        winit::event::MouseButton::Middle => CameraMouseButton::Middle,
        winit::event::MouseButton::Right => CameraMouseButton::Right,
        _ => CameraMouseButton::Left,
    }
}

/// Map a winit mouse button to the tool system's `MouseButton` type.
pub(crate) fn winit_mouse_button_to_tool_button(
    button: winit::event::MouseButton,
) -> MouseButton {
    match button {
        winit::event::MouseButton::Left => MouseButton::Left,
        winit::event::MouseButton::Middle => MouseButton::Middle,
        winit::event::MouseButton::Right => MouseButton::Right,
        _ => MouseButton::Left,
    }
}

// ---------------------------------------------------------------------------
// Keyboard conversion
// ---------------------------------------------------------------------------

/// Map a winit logical key to the tool system's `KeyCode`.
///
/// Returns `None` for keys that the tool system does not handle.
pub(crate) fn winit_key_to_tool_key(key: &Key) -> Option<KeyCode> {
    match key {
        Key::Named(n) => match n {
            NamedKey::Escape => Some(KeyCode::Escape),
            NamedKey::Enter => Some(KeyCode::Enter),
            NamedKey::Space => Some(KeyCode::Space),
            NamedKey::Backspace => Some(KeyCode::Backspace),
            NamedKey::Delete => Some(KeyCode::Delete),
            NamedKey::Tab => Some(KeyCode::Tab),
            NamedKey::ArrowUp => Some(KeyCode::ArrowUp),
            NamedKey::ArrowDown => Some(KeyCode::ArrowDown),
            NamedKey::ArrowLeft => Some(KeyCode::ArrowLeft),
            NamedKey::ArrowRight => Some(KeyCode::ArrowRight),
            NamedKey::Shift => Some(KeyCode::ShiftLeft),
            NamedKey::Control => Some(KeyCode::ControlLeft),
            NamedKey::Alt => Some(KeyCode::AltLeft),
            NamedKey::F1 => Some(KeyCode::F1),
            NamedKey::F2 => Some(KeyCode::F2),
            NamedKey::F3 => Some(KeyCode::F3),
            NamedKey::F4 => Some(KeyCode::F4),
            NamedKey::F5 => Some(KeyCode::F5),
            NamedKey::F6 => Some(KeyCode::F6),
            NamedKey::F7 => Some(KeyCode::F7),
            NamedKey::F8 => Some(KeyCode::F8),
            NamedKey::F9 => Some(KeyCode::F9),
            NamedKey::F10 => Some(KeyCode::F10),
            NamedKey::F11 => Some(KeyCode::F11),
            NamedKey::F12 => Some(KeyCode::F12),
            _ => None,
        },
        Key::Character(c) => {
            let ch = c.chars().next()?;
            match ch.to_ascii_lowercase() {
                'a' => Some(KeyCode::A),
                'b' => Some(KeyCode::B),
                'c' => Some(KeyCode::C),
                'd' => Some(KeyCode::D),
                'e' => Some(KeyCode::E),
                'f' => Some(KeyCode::F),
                'g' => Some(KeyCode::G),
                'h' => Some(KeyCode::H),
                'i' => Some(KeyCode::I),
                'j' => Some(KeyCode::J),
                'k' => Some(KeyCode::K),
                'l' => Some(KeyCode::L),
                'm' => Some(KeyCode::M),
                'n' => Some(KeyCode::N),
                'o' => Some(KeyCode::O),
                'p' => Some(KeyCode::P),
                'q' => Some(KeyCode::Q),
                'r' => Some(KeyCode::R),
                's' => Some(KeyCode::S),
                't' => Some(KeyCode::T),
                'u' => Some(KeyCode::U),
                'v' => Some(KeyCode::V),
                'w' => Some(KeyCode::W),
                'x' => Some(KeyCode::X),
                'y' => Some(KeyCode::Y),
                'z' => Some(KeyCode::Z),
                '0' => Some(KeyCode::Key0),
                '1' => Some(KeyCode::Key1),
                '2' => Some(KeyCode::Key2),
                '3' => Some(KeyCode::Key3),
                '4' => Some(KeyCode::Key4),
                '5' => Some(KeyCode::Key5),
                '6' => Some(KeyCode::Key6),
                '7' => Some(KeyCode::Key7),
                '8' => Some(KeyCode::Key8),
                '9' => Some(KeyCode::Key9),
                _ => None,
            }
        }
        _ => None,
    }
}
