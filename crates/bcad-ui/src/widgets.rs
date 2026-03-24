//! Reusable widget helpers for the BetterCAD UI.

use bcad_state::settings::LengthUnit;
use egui::{Color32, CornerRadius, Stroke, Vec2};

// ---------------------------------------------------------------------------
// labeled_drag_value
// ---------------------------------------------------------------------------

/// A labeled DragValue on a single horizontal row.
///
/// Returns `true` if the value was changed.
pub fn labeled_drag_value(
    ui: &mut egui::Ui,
    label: &str,
    value: &mut f64,
    speed: f64,
    range: std::ops::RangeInclusive<f64>,
) -> bool {
    let mut changed = false;
    ui.horizontal(|ui| {
        ui.label(label);
        let drag = egui::DragValue::new(value).speed(speed).range(range);
        if ui.add(drag).changed() {
            changed = true;
        }
    });
    changed
}

// ---------------------------------------------------------------------------
// unit_input
// ---------------------------------------------------------------------------

/// A DragValue that displays the current [`LengthUnit`] as a suffix.
///
/// The value is always stored internally in meters. The DragValue
/// displays the converted value but stores back in meters.
///
/// Returns `true` if the value was changed.
pub fn unit_input(ui: &mut egui::Ui, label: &str, value: &mut f64, unit: LengthUnit) -> bool {
    let mut changed = false;
    let (factor, suffix) = unit_conversion(unit);

    // Convert to display units
    let mut display_val = *value * factor;

    ui.horizontal(|ui| {
        ui.label(label);
        let drag = egui::DragValue::new(&mut display_val)
            .speed(0.1 * factor)
            .suffix(suffix);
        if ui.add(drag).changed() {
            *value = display_val / factor;
            changed = true;
        }
    });

    changed
}

/// Returns (multiplier_from_meters, suffix_str) for a unit.
fn unit_conversion(unit: LengthUnit) -> (f64, &'static str) {
    match unit {
        LengthUnit::Mm => (1000.0, " mm"),
        LengthUnit::Cm => (100.0, " cm"),
        LengthUnit::M => (1.0, " m"),
        LengthUnit::In => (39.3701, " in"),
        LengthUnit::Ft => (3.28084, " ft"),
    }
}

// ---------------------------------------------------------------------------
// section_header
// ---------------------------------------------------------------------------

/// A collapsing section header styled for property panels.
///
/// Returns the [`egui::CollapsingResponse`] so the caller can add content.
pub fn section_header(ui: &mut egui::Ui, text: &str) -> egui::CollapsingResponse<()> {
    egui::CollapsingHeader::new(egui::RichText::new(text).strong().size(13.0))
        .default_open(true)
        .show(ui, |_ui| {})
}

// ---------------------------------------------------------------------------
// tool_button (original)
// ---------------------------------------------------------------------------

/// A button styled for tool selection. Highlighted when active.
///
/// Returns `true` if clicked.
pub fn tool_button(ui: &mut egui::Ui, label: &str, active: bool) -> bool {
    ui.selectable_label(active, label).clicked()
}

// ---------------------------------------------------------------------------
// tool_button_styled — active tool gets accent background + white text
// ---------------------------------------------------------------------------

/// A button for tool selection with polished active/inactive styling.
///
/// When `active`, the button gets the accent background with white text.
/// Otherwise it renders as a subtle, rounded button.
///
/// Returns `true` if clicked.
pub fn tool_button_styled(ui: &mut egui::Ui, label: &str, active: bool) -> bool {
    if active {
        // Accent-filled button for the active tool
        let accent = ui.visuals().widgets.active.bg_fill;
        let btn = egui::Button::new(egui::RichText::new(label).color(Color32::WHITE).strong())
            .fill(accent)
            .stroke(Stroke::NONE)
            .corner_radius(CornerRadius::same(6));
        ui.add(btn).clicked()
    } else {
        // Subtle button for inactive tools
        let btn = egui::Button::new(label)
            .fill(Color32::TRANSPARENT)
            .stroke(Stroke::NONE)
            .corner_radius(CornerRadius::same(6));
        ui.add(btn).clicked()
    }
}

// ---------------------------------------------------------------------------
// accent_button — primary action button (blue bg, white text)
// ---------------------------------------------------------------------------

/// A primary action button with accent-colored background and white text.
///
/// Use for the most important action in a panel or dialog (e.g. "Export",
/// "Apply", "Create").
///
/// Returns `true` if clicked.
pub fn accent_button(ui: &mut egui::Ui, label: &str) -> bool {
    let accent = ui.visuals().widgets.active.bg_fill;
    let btn = egui::Button::new(egui::RichText::new(label).color(Color32::WHITE).strong())
        .fill(accent)
        .stroke(Stroke::NONE)
        .corner_radius(CornerRadius::same(6))
        .min_size(Vec2::new(0.0, 28.0));
    ui.add(btn).clicked()
}

// ---------------------------------------------------------------------------
// danger_button — destructive action (red bg, white text)
// ---------------------------------------------------------------------------

/// A destructive action button with red background and white text.
///
/// Use for irreversible actions (e.g. "Delete", "Clear All").
///
/// Returns `true` if clicked.
pub fn danger_button(ui: &mut egui::Ui, label: &str) -> bool {
    let danger = ui.visuals().error_fg_color;
    let btn = egui::Button::new(egui::RichText::new(label).color(Color32::WHITE).strong())
        .fill(danger)
        .stroke(Stroke::NONE)
        .corner_radius(CornerRadius::same(6))
        .min_size(Vec2::new(0.0, 28.0));
    ui.add(btn).clicked()
}

// ---------------------------------------------------------------------------
// icon_button — compact icon-only button (square, subtle bg)
// ---------------------------------------------------------------------------

/// A compact, square button for icons or single-character labels.
///
/// Renders as a subtle square with rounded corners. Useful for toolbar
/// icons, close buttons, and toggle indicators.
///
/// Returns `true` if clicked.
pub fn icon_button(ui: &mut egui::Ui, icon_text: &str) -> bool {
    let size = Vec2::splat(24.0);
    let btn = egui::Button::new(egui::RichText::new(icon_text).size(14.0))
        .min_size(size)
        .corner_radius(CornerRadius::same(4));
    ui.add(btn).clicked()
}

// ---------------------------------------------------------------------------
// status_dot — colored indicator dot for status display
// ---------------------------------------------------------------------------

/// Paint a small colored circle as a status indicator.
///
/// Commonly used in the status bar for kernel-ready / error states.
pub fn status_dot(ui: &mut egui::Ui, color: Color32) {
    let (rect, _response) = ui.allocate_exact_size(Vec2::splat(8.0), egui::Sense::hover());
    if ui.is_rect_visible(rect) {
        ui.painter().circle_filled(rect.center(), 3.5, color);
    }
}
