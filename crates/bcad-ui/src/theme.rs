//! Polished dark & light theme for BetterCAD.
//!
//! Provides a professional CAD-application aesthetic inspired by Blender,
//! Fusion 360 and Rhino — not the default egui look.
//!
//! # Color design system
//!
//! ```text
//!                      Dark                 Light
//! bg_primary           #0d1117              #ffffff
//! bg_secondary         #161b22              #f6f8fa
//! bg_tertiary          #1c2333              #eaeef2
//! bg_elevated          #21262d              #d0d7de
//! text_primary         #e6edf3              #1f2328
//! text_secondary       #8b949e              #656d76
//! text_muted           #484f58              #8c959f
//! accent               #58a6ff              #0969da
//! accent_hover         #79c0ff              #0550ae
//! success              #39d353              #1a7f37
//! danger               #f85149              #cf222e
//! border               #30363d              #d0d7de
//! border_subtle        #21262d              #e6e8eb
//! ```

use bcad_state::ui_state::Theme;
use egui::{Color32, CornerRadius, FontFamily, FontId, Margin, Shadow, Stroke, Vec2, Visuals};
use std::collections::BTreeMap;

// ============================================================================
// Color palette
// ============================================================================

/// A resolved color palette for one theme variant.
pub struct ThemeColors {
    // --- backgrounds (layered from deepest to most elevated) ---
    pub bg_primary: Color32,
    pub bg_secondary: Color32,
    pub bg_tertiary: Color32,
    pub bg_elevated: Color32,

    // --- text ---
    pub text_primary: Color32,
    pub text_secondary: Color32,
    pub text_muted: Color32,

    // --- accents ---
    pub accent: Color32,
    pub accent_hover: Color32,
    pub success: Color32,
    pub danger: Color32,
    pub warning: Color32,

    // --- borders ---
    pub border: Color32,
    pub border_subtle: Color32,

    // --- status bar ---
    pub status_text: Color32,

    // --- shadows ---
    pub shadow_color: Color32,
}

/// Dark theme — professional deep navy palette.
pub const DARK: ThemeColors = ThemeColors {
    bg_primary: Color32::from_rgb(0x0d, 0x11, 0x17),
    bg_secondary: Color32::from_rgb(0x16, 0x1b, 0x22),
    bg_tertiary: Color32::from_rgb(0x1c, 0x23, 0x33),
    bg_elevated: Color32::from_rgb(0x21, 0x26, 0x2d),

    text_primary: Color32::from_rgb(0xe6, 0xed, 0xf3),
    text_secondary: Color32::from_rgb(0x8b, 0x94, 0x9e),
    text_muted: Color32::from_rgb(0x48, 0x4f, 0x58),

    accent: Color32::from_rgb(0x58, 0xa6, 0xff),
    accent_hover: Color32::from_rgb(0x79, 0xc0, 0xff),
    success: Color32::from_rgb(0x39, 0xd3, 0x53),
    danger: Color32::from_rgb(0xf8, 0x51, 0x49),
    warning: Color32::from_rgb(0xd2, 0x9a, 0x22),

    border: Color32::from_rgb(0x30, 0x36, 0x3d),
    border_subtle: Color32::from_rgb(0x21, 0x26, 0x2d),

    status_text: Color32::from_rgb(0x8b, 0x94, 0x9e),

    shadow_color: Color32::from_black_alpha(100),
};

/// Light theme — clean, airy professional palette.
pub const LIGHT: ThemeColors = ThemeColors {
    bg_primary: Color32::from_rgb(0xff, 0xff, 0xff),
    bg_secondary: Color32::from_rgb(0xf6, 0xf8, 0xfa),
    bg_tertiary: Color32::from_rgb(0xea, 0xee, 0xf2),
    bg_elevated: Color32::from_rgb(0xd0, 0xd7, 0xde),

    text_primary: Color32::from_rgb(0x1f, 0x23, 0x28),
    text_secondary: Color32::from_rgb(0x65, 0x6d, 0x76),
    text_muted: Color32::from_rgb(0x8c, 0x95, 0x9f),

    accent: Color32::from_rgb(0x09, 0x69, 0xda),
    accent_hover: Color32::from_rgb(0x05, 0x50, 0xae),
    success: Color32::from_rgb(0x1a, 0x7f, 0x37),
    danger: Color32::from_rgb(0xcf, 0x22, 0x2e),
    warning: Color32::from_rgb(0x9a, 0x6c, 0x00),

    border: Color32::from_rgb(0xd0, 0xd7, 0xde),
    border_subtle: Color32::from_rgb(0xe6, 0xe8, 0xeb),

    status_text: Color32::from_rgb(0x65, 0x6d, 0x76),

    shadow_color: Color32::from_black_alpha(30),
};

// ============================================================================
// Public helpers
// ============================================================================

/// Get the [`ThemeColors`] for a given [`Theme`] variant.
pub fn colors(theme: Theme) -> &'static ThemeColors {
    match theme {
        Theme::Dark => &DARK,
        Theme::Light => &LIGHT,
    }
}

/// Apply theme to an egui context. Call once per frame (early, before panels).
///
/// This comprehensively overrides the egui [`Style`] to produce a polished,
/// professional CAD-application aesthetic.
pub fn apply_theme(ctx: &egui::Context, theme: Theme) {
    let c = colors(theme);
    let is_dark = matches!(theme, Theme::Dark);

    let mut style = (*ctx.style()).clone();

    // ------------------------------------------------------------------
    // Typography
    // ------------------------------------------------------------------
    style.text_styles = BTreeMap::from([
        (
            egui::TextStyle::Heading,
            FontId::new(16.0, FontFamily::Proportional),
        ),
        (
            egui::TextStyle::Name("Heading2".into()),
            FontId::new(14.0, FontFamily::Proportional),
        ),
        (
            egui::TextStyle::Body,
            FontId::new(13.0, FontFamily::Proportional),
        ),
        (
            egui::TextStyle::Monospace,
            FontId::new(13.0, FontFamily::Monospace),
        ),
        (
            egui::TextStyle::Button,
            FontId::new(13.0, FontFamily::Proportional),
        ),
        (
            egui::TextStyle::Small,
            FontId::new(11.0, FontFamily::Proportional),
        ),
    ]);

    // ------------------------------------------------------------------
    // Spacing
    // ------------------------------------------------------------------
    style.spacing.item_spacing = Vec2::new(8.0, 4.0);
    style.spacing.button_padding = Vec2::new(12.0, 6.0);
    style.spacing.indent = 18.0;
    style.spacing.interact_size = Vec2::new(40.0, 22.0);
    style.spacing.icon_width = 16.0;
    style.spacing.icon_width_inner = 10.0;
    style.spacing.icon_spacing = 6.0;
    style.spacing.window_margin = Margin::same(10);
    style.spacing.menu_margin = Margin::same(6);
    style.spacing.combo_width = 120.0;

    // ------------------------------------------------------------------
    // Visuals
    // ------------------------------------------------------------------
    let mut v = if is_dark {
        Visuals::dark()
    } else {
        Visuals::light()
    };

    v.dark_mode = is_dark;

    // --- Panel / window backgrounds ---
    v.panel_fill = c.bg_secondary;
    v.window_fill = c.bg_secondary;
    v.extreme_bg_color = c.bg_primary;
    v.faint_bg_color = if is_dark {
        Color32::from_rgb(0x13, 0x17, 0x1d)
    } else {
        Color32::from_rgb(0xf0, 0xf3, 0xf6)
    };
    v.code_bg_color = c.bg_tertiary;

    // --- Text ---
    // We do NOT override_text_color globally, so widget states
    // (hovered, active, disabled) properly modulate fg_stroke.
    v.override_text_color = None;

    // --- Warning / error colors ---
    v.warn_fg_color = c.warning;
    v.error_fg_color = c.danger;
    v.hyperlink_color = c.accent;

    // ================================================================
    // Widget styling — the heart of the visual overhaul
    // ================================================================

    // -- Noninteractive (labels, separators) --
    v.widgets.noninteractive.bg_fill = c.bg_tertiary;
    v.widgets.noninteractive.weak_bg_fill = c.bg_tertiary;
    v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, c.text_secondary);
    v.widgets.noninteractive.bg_stroke = Stroke::new(0.5, c.border_subtle);
    v.widgets.noninteractive.corner_radius = CornerRadius::same(4);
    v.widgets.noninteractive.expansion = 0.0;

    // -- Inactive (clickable, not hovered) --
    let inactive_bg = if is_dark {
        Color32::from_rgb(0x1c, 0x21, 0x28)
    } else {
        Color32::from_rgb(0xef, 0xf1, 0xf5)
    };
    v.widgets.inactive.bg_fill = inactive_bg;
    v.widgets.inactive.weak_bg_fill = inactive_bg;
    v.widgets.inactive.fg_stroke = Stroke::new(1.0, c.text_secondary);
    v.widgets.inactive.bg_stroke = Stroke::NONE; // clean: no border on idle buttons
    v.widgets.inactive.corner_radius = CornerRadius::same(6);
    v.widgets.inactive.expansion = 0.0;

    // -- Hovered --
    let hovered_bg = if is_dark {
        Color32::from_rgb(0x24, 0x2a, 0x35)
    } else {
        Color32::from_rgb(0xe2, 0xe6, 0xea)
    };
    v.widgets.hovered.bg_fill = hovered_bg;
    v.widgets.hovered.weak_bg_fill = hovered_bg;
    v.widgets.hovered.fg_stroke = Stroke::new(1.0, c.text_primary);
    v.widgets.hovered.bg_stroke = Stroke::new(1.0, c.accent);
    v.widgets.hovered.corner_radius = CornerRadius::same(6);
    v.widgets.hovered.expansion = 1.0;

    // -- Active (pressed / toggled on) --
    v.widgets.active.bg_fill = c.accent;
    v.widgets.active.weak_bg_fill = c.accent;
    v.widgets.active.fg_stroke = Stroke::new(1.5, Color32::WHITE);
    v.widgets.active.bg_stroke = Stroke::new(1.0, c.accent_hover);
    v.widgets.active.corner_radius = CornerRadius::same(6);
    v.widgets.active.expansion = 0.0;

    // -- Open (combo-box / menu open) --
    v.widgets.open.bg_fill = c.bg_elevated;
    v.widgets.open.weak_bg_fill = c.bg_elevated;
    v.widgets.open.fg_stroke = Stroke::new(1.0, c.text_primary);
    v.widgets.open.bg_stroke = Stroke::new(1.0, c.accent);
    v.widgets.open.corner_radius = CornerRadius::same(6);
    v.widgets.open.expansion = 0.0;

    // --- Selection ---
    v.selection.bg_fill = Color32::from_rgba_premultiplied(
        (c.accent.r() as f32 * 0.4) as u8,
        (c.accent.g() as f32 * 0.4) as u8,
        (c.accent.b() as f32 * 0.4) as u8,
        102, // ~40% opacity
    );
    v.selection.stroke = Stroke::new(1.0, c.accent);

    // --- Windows ---
    v.window_corner_radius = CornerRadius::same(8);
    v.window_shadow = Shadow {
        offset: [0, 4],
        blur: 16,
        spread: 2,
        color: c.shadow_color,
    };
    v.window_fill = c.bg_secondary;
    v.window_stroke = Stroke::new(1.0, c.border);
    v.window_highlight_topmost = true;

    // --- Menus ---
    v.menu_corner_radius = CornerRadius::same(6);

    // --- Popups ---
    v.popup_shadow = Shadow {
        offset: [0, 2],
        blur: 10,
        spread: 1,
        color: c.shadow_color,
    };

    // --- Misc ---
    v.resize_corner_size = 10.0;
    v.clip_rect_margin = 3.0;
    v.button_frame = true;
    v.collapsing_header_frame = false;
    v.indent_has_left_vline = true;
    v.striped = true;
    v.slider_trailing_fill = true;
    v.interact_cursor = Some(egui::CursorIcon::PointingHand);
    v.image_loading_spinners = true;

    style.visuals = v;
    ctx.set_style(style);
}

// ============================================================================
// Panel frame helpers
// ============================================================================

/// Styled frame for side panels (properties, layers, etc.).
///
/// Themed fill with subtle border. Side panels are edge-to-edge so no rounding.
pub fn panel_frame(theme: Theme) -> egui::Frame {
    let c = colors(theme);
    egui::Frame {
        inner_margin: Margin::same(10),
        fill: c.bg_secondary,
        stroke: Stroke::new(1.0, c.border),
        corner_radius: CornerRadius::ZERO,
        outer_margin: Margin::ZERO,
        shadow: Shadow::NONE,
    }
}

/// Styled frame for the top toolbar / menu bar.
///
/// No rounding (docked to top), subtle separation from the viewport.
pub fn toolbar_frame(theme: Theme) -> egui::Frame {
    let c = colors(theme);
    egui::Frame {
        inner_margin: Margin::symmetric(10, 4),
        fill: c.bg_secondary,
        stroke: Stroke::NONE,
        corner_radius: CornerRadius::ZERO,
        outer_margin: Margin::ZERO,
        shadow: Shadow::NONE,
    }
}

/// Styled frame for the bottom status bar.
///
/// Darkest background tier, compact padding.
pub fn status_bar_frame(theme: Theme) -> egui::Frame {
    let c = colors(theme);
    egui::Frame {
        inner_margin: Margin::symmetric(10, 3),
        fill: c.bg_primary,
        stroke: Stroke::NONE,
        corner_radius: CornerRadius::ZERO,
        outer_margin: Margin::ZERO,
        shadow: Shadow::NONE,
    }
}

/// Styled frame for modal dialogs.
///
/// Rounded corners, shadow, border — floats above everything.
pub fn dialog_frame(theme: Theme) -> egui::Frame {
    let c = colors(theme);
    egui::Frame {
        inner_margin: Margin::same(16),
        fill: c.bg_secondary,
        stroke: Stroke::new(1.0, c.border),
        corner_radius: CornerRadius::same(10),
        outer_margin: Margin::ZERO,
        shadow: Shadow {
            offset: [0, 6],
            blur: 24,
            spread: 4,
            color: c.shadow_color,
        },
    }
}

/// Styled frame for collapsible sections within panels.
///
/// Subtle background with small rounding to group related controls.
pub fn section_frame(theme: Theme) -> egui::Frame {
    let c = colors(theme);
    egui::Frame {
        inner_margin: Margin::same(6),
        fill: if matches!(theme, Theme::Dark) {
            Color32::from_rgb(0x13, 0x17, 0x1d)
        } else {
            Color32::from_rgb(0xf0, 0xf3, 0xf6)
        },
        stroke: Stroke::new(0.5, c.border_subtle),
        corner_radius: CornerRadius::same(6),
        outer_margin: Margin::symmetric(0, 2),
        shadow: Shadow::NONE,
    }
}

/// Styled frame for sub-toolbars (sketch, dimension).
///
/// Slightly different background to visually nest under the main toolbar.
pub fn sub_toolbar_frame(theme: Theme) -> egui::Frame {
    let c = colors(theme);
    egui::Frame {
        inner_margin: Margin::symmetric(10, 3),
        fill: if matches!(theme, Theme::Dark) {
            Color32::from_rgb(0x13, 0x17, 0x1d)
        } else {
            Color32::from_rgb(0xf0, 0xf3, 0xf6)
        },
        stroke: Stroke::new(0.5, c.border_subtle),
        corner_radius: CornerRadius::ZERO,
        outer_margin: Margin::ZERO,
        shadow: Shadow::NONE,
    }
}

// ============================================================================
// Button style helpers
// ============================================================================

/// Returns the accent color for the current theme (convenience for widgets).
pub fn accent_color(theme: Theme) -> Color32 {
    colors(theme).accent
}

/// Returns the danger color for the current theme (convenience for widgets).
pub fn danger_color(theme: Theme) -> Color32 {
    colors(theme).danger
}

/// Returns the success color for the current theme (convenience for widgets).
pub fn success_color(theme: Theme) -> Color32 {
    colors(theme).success
}
