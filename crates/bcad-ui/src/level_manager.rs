//! Level manager: list of building levels with name, elevation,
//! visibility, and management controls.
//!
//! Mirrors `LevelManager.tsx`.

use bcad_state::level_state::LevelVisibility;
use bcad_state::settings::LengthUnit;
use bcad_state::{AppState, Command};

use crate::theme;

/// Render the level manager. Returns commands.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tc = theme::colors(state.ui.theme);

    // Collapsing header for the level list
    let active_level = state.levels.active_level();
    let header_text = if let Some(level) = active_level {
        format!(
            "Levels  ({} @ {})",
            level.name,
            format_length(level.elevation, state.settings.length_unit),
        )
    } else {
        "Levels".to_string()
    };

    egui::CollapsingHeader::new(egui::RichText::new(header_text).strong())
        .default_open(true)
        .show(ui, |ui| {
            for level in &state.levels.levels {
                let is_active = level.id == state.levels.active_level_id;

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
                        // Active indicator
                        if is_active {
                            ui.colored_label(tc.accent, ">");
                        } else {
                            ui.colored_label(egui::Color32::TRANSPARENT, " ");
                        }

                        // Level name (click to set active)
                        let name_response = ui.link(&level.name);
                        if name_response.clicked() {
                            cmds.push(Command::SetActiveLevel {
                                id: level.id.clone(),
                            });
                        }

                        // Elevation display
                        ui.colored_label(
                            tc.text_muted,
                            format_length(level.elevation, state.settings.length_unit),
                        );

                        // Elevation drag value
                        let mut elev = level.elevation;
                        let drag = egui::DragValue::new(&mut elev)
                            .speed(0.1)
                            .range(-100.0..=1000.0)
                            .suffix(unit_suffix(state.settings.length_unit));
                        if ui.add(drag).changed() {
                            cmds.push(Command::SetLevelElevation {
                                id: level.id.clone(),
                                elevation: elev,
                            });
                        }

                        // Visibility button (cycles V -> G -> H)
                        let (vis_text, vis_tooltip) = match level.visibility {
                            LevelVisibility::Visible => ("V", "Visible -- click to ghost"),
                            LevelVisibility::Ghosted => {
                                ("G", "Ghosted (semi-transparent) -- click to hide")
                            }
                            LevelVisibility::Hidden => ("H", "Hidden -- click to show"),
                        };
                        let vis_color = match level.visibility {
                            LevelVisibility::Visible => tc.text_primary,
                            LevelVisibility::Ghosted => tc.text_muted,
                            LevelVisibility::Hidden => tc.danger,
                        };
                        if ui
                            .add(
                                egui::Button::new(
                                    egui::RichText::new(vis_text).color(vis_color).monospace(),
                                )
                                .min_size(egui::vec2(22.0, 16.0)),
                            )
                            .on_hover_text(vis_tooltip)
                            .clicked()
                        {
                            cmds.push(Command::ToggleLevelVisibility {
                                id: level.id.clone(),
                            });
                        }

                        // Delete button (only if more than 1 level)
                        if state.levels.levels.len() > 1 {
                            if ui.small_button("X").on_hover_text("Remove level").clicked() {
                                cmds.push(Command::RemoveLevel {
                                    id: level.id.clone(),
                                });
                            }
                        }
                    });
                });
            }

            // Add Level button
            ui.add_space(4.0);
            if ui.button("+ Add Level").clicked() {
                let max_elevation = state
                    .levels
                    .levels
                    .iter()
                    .map(|l| l.elevation)
                    .fold(0.0_f64, f64::max);
                let new_elevation = max_elevation + 3.0;
                let idx = state.levels.levels.len() + 1;
                cmds.push(Command::AddLevel {
                    name: format!("Level {}", idx),
                    elevation: new_elevation,
                });
            }
        });

    cmds
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn format_length(meters: f64, unit: LengthUnit) -> String {
    match unit {
        LengthUnit::Mm => format!("{:.0} mm", meters * 1000.0),
        LengthUnit::Cm => format!("{:.1} cm", meters * 100.0),
        LengthUnit::M => format!("{:.2} m", meters),
        LengthUnit::In => format!("{:.2} in", meters * 39.3701),
        LengthUnit::Ft => format!("{:.2} ft", meters * 3.28084),
    }
}

fn unit_suffix(unit: LengthUnit) -> &'static str {
    match unit {
        LengthUnit::Mm => " mm",
        LengthUnit::Cm => " cm",
        LengthUnit::M => " m",
        LengthUnit::In => " in",
        LengthUnit::Ft => " ft",
    }
}
