//! Layer panel: list of AIA layers with visibility toggle, lock toggle,
//! color swatch, and layer preset selector.

use bcad_state::layer_state::LAYER_PRESETS;
use bcad_state::{AppState, Command};

use crate::theme;

/// Render the layer panel inside the side panel. Returns commands.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tc = theme::colors(state.ui.theme);

    // Title
    ui.heading("Layers");
    ui.add_space(4.0);

    // Preset selector
    ui.horizontal(|ui| {
        ui.label("Preset:");
        egui::ComboBox::from_id_salt("layer_preset")
            .selected_text("Choose preset...")
            .show_ui(ui, |ui| {
                for preset_name in LAYER_PRESETS {
                    if ui.selectable_label(false, *preset_name).clicked() {
                        cmds.push(Command::SetLayerPreset {
                            preset: preset_name.to_string(),
                        });
                    }
                }
            });
    });

    ui.add_space(4.0);

    // Active layer indicator
    ui.horizontal(|ui| {
        ui.colored_label(tc.text_muted, "Active layer:");
        ui.colored_label(tc.accent, &state.layers.active_layer_id);
    });

    ui.add_space(8.0);

    // Layer list
    for layer in &state.layers.layers {
        let is_active = layer.id == state.layers.active_layer_id;

        // Parse hex color for the swatch
        let swatch_color = parse_hex_color(&layer.color).unwrap_or(egui::Color32::GRAY);

        let row_bg = if is_active {
            tc.accent.linear_multiply(0.15)
        } else {
            egui::Color32::TRANSPARENT
        };

        let frame = egui::Frame::NONE
            .inner_margin(egui::Margin::symmetric(4, 2))
            .fill(row_bg)
            .corner_radius(egui::CornerRadius::same(3));

        frame.show(ui, |ui| {
            ui.horizontal(|ui| {
                // Visibility toggle (eye icon)
                let vis_text = if layer.visible { "O" } else { "-" };
                let vis_tooltip = if layer.visible {
                    "Hide layer"
                } else {
                    "Show layer"
                };
                let vis_color = if layer.visible {
                    tc.text_primary
                } else {
                    tc.text_muted
                };
                if ui
                    .add(
                        egui::Button::new(
                            egui::RichText::new(vis_text).color(vis_color).monospace(),
                        )
                        .frame(false)
                        .min_size(egui::vec2(20.0, 16.0)),
                    )
                    .on_hover_text(vis_tooltip)
                    .clicked()
                {
                    cmds.push(Command::ToggleLayerVisibility {
                        id: layer.id.clone(),
                    });
                }

                // Lock toggle
                let lock_text = if layer.locked { "L" } else { "U" };
                let lock_tooltip = if layer.locked {
                    "Unlock layer"
                } else {
                    "Lock layer"
                };
                if ui
                    .add(
                        egui::Button::new(egui::RichText::new(lock_text).monospace())
                            .frame(false)
                            .min_size(egui::vec2(20.0, 16.0)),
                    )
                    .on_hover_text(lock_tooltip)
                    .clicked()
                {
                    cmds.push(Command::SetLayerLocked {
                        id: layer.id.clone(),
                        locked: !layer.locked,
                    });
                }

                // Color swatch (small colored rect)
                let (rect, _) =
                    ui.allocate_exact_size(egui::vec2(12.0, 12.0), egui::Sense::hover());
                ui.painter()
                    .rect_filled(rect, egui::CornerRadius::same(2), swatch_color);

                // Layer ID
                let id_color = if !layer.visible {
                    tc.text_muted
                } else {
                    tc.text_secondary
                };
                ui.colored_label(id_color, &layer.id);

                // Layer name
                let name_color = if !layer.visible {
                    tc.text_muted
                } else {
                    tc.text_primary
                };
                let name_response = ui.colored_label(name_color, &layer.name);

                // Clicking anywhere on the row sets active layer
                if name_response.clicked() {
                    cmds.push(Command::SetActiveLayer {
                        id: layer.id.clone(),
                    });
                }
            });
        });
    }

    cmds
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a CSS hex color string (e.g. "#8B4513") to egui Color32.
fn parse_hex_color(hex: &str) -> Option<egui::Color32> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some(egui::Color32::from_rgb(r, g, b))
}
