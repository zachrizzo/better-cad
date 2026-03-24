//! View panel: saved section/elevation views with management controls.
//!
//! Mirrors `ViewPanel.tsx` -- lists saved views sorted by name, allows
//! creating new sections/elevations, switching to a view, and deleting.

use bcad_state::ui_state::ToolType;
use bcad_state::view_state::{CardinalDirection, SavedView, SavedViewType};
use bcad_state::{AppState, Command};

use crate::theme;

// Transient UI state for elevation direction selector.
// Thread-local since egui is single-threaded.
std::thread_local! {
    static ELEVATION_DIRECTION: std::cell::Cell<CardinalDirection> =
        const { std::cell::Cell::new(CardinalDirection::North) };
}

/// Render the view panel inside the side panel. Returns commands.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tc = theme::colors(state.ui.theme);

    // Title
    ui.heading("Views");
    ui.add_space(4.0);

    // Collect and sort views by name
    let mut view_list: Vec<&SavedView> = state.views.views.values().collect();
    view_list.sort_by(|a, b| a.name.cmp(&b.name));

    let section_count = view_list
        .iter()
        .filter(|v| v.view_type == SavedViewType::Section)
        .count();
    let elevation_count = view_list
        .iter()
        .filter(|v| v.view_type == SavedViewType::Elevation)
        .count();

    // Summary
    ui.colored_label(
        tc.text_muted,
        format!(
            "{} section{} . {} elevation{}",
            section_count,
            if section_count == 1 { "" } else { "s" },
            elevation_count,
            if elevation_count == 1 { "" } else { "s" },
        ),
    );

    ui.colored_label(
        tc.text_muted,
        "Save camera views for section cuts and fixed elevations.",
    );

    ui.add_space(8.0);

    // Plan Symbols section
    ui.heading("Plan Symbols");

    ui.horizontal(|ui| {
        ui.label("Profile:");
        ui.label("Open US v1");
    });

    ui.horizontal(|ui| {
        ui.label("Density:");
        let density_label = match state.ui.annotation_density {
            bcad_state::ui_state::AnnotationDensity::Minimal => "Minimal",
            bcad_state::ui_state::AnnotationDensity::Medium => "Medium",
            bcad_state::ui_state::AnnotationDensity::Verbose => "Verbose",
        };
        egui::ComboBox::from_id_salt("annotation_density")
            .selected_text(density_label)
            .show_ui(ui, |ui| {
                use bcad_state::ui_state::AnnotationDensity;
                for (d, l) in [
                    (AnnotationDensity::Minimal, "Minimal"),
                    (AnnotationDensity::Medium, "Medium"),
                    (AnnotationDensity::Verbose, "Verbose"),
                ] {
                    if ui
                        .selectable_label(state.ui.annotation_density == d, l)
                        .clicked()
                    {
                        cmds.push(Command::SetAnnotationDensity { density: d });
                    }
                }
            });
    });

    let mut furniture_labels = state.ui.show_furniture_labels;
    if ui
        .checkbox(&mut furniture_labels, "Furniture Labels")
        .clicked()
    {
        cmds.push(Command::SetShowFurnitureLabels {
            show: furniture_labels,
        });
    }

    let mut mep_text = state.ui.show_mep_text;
    if ui.checkbox(&mut mep_text, "MEP Text").clicked() {
        cmds.push(Command::SetShowMepText { show: mep_text });
    }

    ui.add_space(8.0);

    // Back to 3D button (if a view is active)
    if state.views.active_view_id.is_some() {
        if ui.button("Back to 3D").clicked() {
            cmds.push(Command::SetActiveView { id: None });
        }
        ui.add_space(4.0);
    }

    // Wall visibility toggle
    let walls_label = if state.settings.walls_visible {
        "Hide Walls (Interior View)"
    } else {
        "Show Walls"
    };
    if ui.button(walls_label).clicked() {
        cmds.push(Command::ToggleWallsVisible);
    }

    ui.add_space(4.0);

    // New Section Cut button
    if ui.button("New Section Cut").clicked() {
        cmds.push(Command::SetActiveTool {
            tool: ToolType::Section,
        });
        cmds.push(Command::SetActiveView { id: None });
    }

    ui.add_space(4.0);

    // New Elevation builder
    ui.horizontal(|ui| {
        ui.label("New Elevation:");

        let mut dir = ELEVATION_DIRECTION.with(|c| c.get());

        egui::ComboBox::from_id_salt("elevation_direction")
            .selected_text(direction_label(dir))
            .show_ui(ui, |ui| {
                for d in [
                    CardinalDirection::North,
                    CardinalDirection::South,
                    CardinalDirection::East,
                    CardinalDirection::West,
                ] {
                    if ui
                        .selectable_value(&mut dir, d, direction_label(d))
                        .clicked()
                    {
                        ELEVATION_DIRECTION.with(|c| c.set(d));
                    }
                }
            });

        if ui.button("Add").clicked() {
            let direction = dir;
            let view_id = format!("elevation-{}", uuid::Uuid::new_v4());
            let existing_elevations = state
                .views
                .views
                .values()
                .filter(|v| v.view_type == SavedViewType::Elevation)
                .count();

            let dist = 50.0;
            let camera_position = match direction {
                CardinalDirection::North => [0.0, 3.0, -dist],
                CardinalDirection::South => [0.0, 3.0, dist],
                CardinalDirection::East => [dist, 3.0, 0.0],
                CardinalDirection::West => [-dist, 3.0, 0.0],
            };

            let view = SavedView {
                id: view_id.clone(),
                name: format!(
                    "{} Elevation {}",
                    direction_label(direction),
                    existing_elevations + 1
                ),
                view_type: SavedViewType::Elevation,
                cut_line_start: None,
                cut_line_end: None,
                direction: Some(direction),
                camera_position,
                camera_target: [0.0, 3.0, 0.0],
            };

            cmds.push(Command::AddSavedView { view });
            cmds.push(Command::SetActiveView { id: Some(view_id) });
        }
    });

    ui.add_space(8.0);

    // View list
    if view_list.is_empty() {
        ui.colored_label(
            tc.text_muted,
            "No saved views yet. Create a section cut or an elevation to pin a reusable camera.",
        );
    }

    for view in &view_list {
        let is_active = state.views.active_view_id.as_deref() == Some(&view.id);

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
                // Type icon
                let icon = match view.view_type {
                    SavedViewType::Section => "\u{2702}",
                    SavedViewType::Elevation => "\u{25A1}",
                };
                ui.label(icon);

                // View name (clickable to activate/deactivate)
                let name_response = ui.link(&view.name);
                if name_response.clicked() {
                    if is_active {
                        cmds.push(Command::SetActiveView { id: None });
                    } else {
                        cmds.push(Command::SetActiveView {
                            id: Some(view.id.clone()),
                        });
                    }
                }

                // Direction tag for elevations
                if view.view_type == SavedViewType::Elevation {
                    if let Some(dir) = view.direction {
                        ui.colored_label(tc.text_muted, direction_label(dir));
                    }
                }

                // Delete button
                if ui
                    .small_button("Delete")
                    .on_hover_text(format!("Delete {}", view.name))
                    .clicked()
                {
                    cmds.push(Command::RemoveSavedView {
                        id: view.id.clone(),
                    });
                }
            });
        });
    }

    cmds
}

fn direction_label(dir: CardinalDirection) -> &'static str {
    match dir {
        CardinalDirection::North => "North",
        CardinalDirection::South => "South",
        CardinalDirection::East => "East",
        CardinalDirection::West => "West",
    }
}
