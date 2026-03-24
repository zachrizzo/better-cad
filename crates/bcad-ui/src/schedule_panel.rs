//! Schedule / Quantity takeoff panel.
//!
//! Shown as a modal overlay with tabs: Walls, Doors, Windows, Rooms, Takeoff.
//! Mirrors `SchedulePanel.tsx`.

use bcad_domain::Element;
use bcad_state::{AppState, Command};

use crate::theme;

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

/// Which schedule tab is active.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScheduleTab {
    Walls,
    Doors,
    Windows,
    Rooms,
    Takeoff,
}

impl Default for ScheduleTab {
    fn default() -> Self {
        Self::Doors
    }
}

/// Persistent local state for the schedule panel between frames.
#[derive(Debug, Default)]
pub struct SchedulePanelState {
    pub tab: ScheduleTab,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Show the schedule panel as a modal window.
/// Returns (commands, should_close).
pub fn show(
    ctx: &egui::Context,
    state: &AppState,
    local: &mut SchedulePanelState,
) -> (Vec<Command>, bool) {
    let cmds = Vec::new();
    let mut should_close = false;
    let tc = theme::colors(state.ui.theme);

    egui::Window::new("Schedules & Quantities")
        .collapsible(false)
        .resizable(true)
        .default_width(700.0)
        .min_width(500.0)
        .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
        .show(ctx, |ui| {
            // Close button in header
            ui.horizontal(|ui| {
                ui.heading(egui::RichText::new("Schedules & Quantities").color(tc.accent));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("X").clicked() {
                        should_close = true;
                    }
                });
            });

            ui.add_space(4.0);

            // Tabs
            ui.horizontal(|ui| {
                for (tab, label) in [
                    (ScheduleTab::Doors, "Doors"),
                    (ScheduleTab::Windows, "Windows"),
                    (ScheduleTab::Rooms, "Rooms/Floors"),
                    (ScheduleTab::Walls, "Wall Quantities"),
                    (ScheduleTab::Takeoff, "Material Takeoff"),
                ] {
                    if ui.selectable_label(local.tab == tab, label).clicked() {
                        local.tab = tab;
                    }
                }
            });

            ui.separator();

            // Table content
            egui::ScrollArea::vertical()
                .max_height(400.0)
                .show(ui, |ui| match local.tab {
                    ScheduleTab::Walls => {
                        wall_quantities_table(ui, state, tc);
                    }
                    ScheduleTab::Doors => {
                        door_table(ui, state, tc);
                    }
                    ScheduleTab::Windows => {
                        window_table(ui, state, tc);
                    }
                    ScheduleTab::Rooms => {
                        room_table(ui, state, tc);
                    }
                    ScheduleTab::Takeoff => {
                        takeoff_table(ui, state, tc);
                    }
                });
        });

    (cmds, should_close)
}

// ---------------------------------------------------------------------------
// Table renderers
// ---------------------------------------------------------------------------

fn wall_quantities_table(ui: &mut egui::Ui, state: &AppState, tc: &theme::ThemeColors) {
    let mut count = 0usize;
    let mut total_length = 0.0f64;

    for el in state.document.prototype.project.elements.iter() {
        if let Element::Wall(wall) = el {
            count += 1;
            let dx = wall.end[0] - wall.start[0];
            let dy = wall.end[1] - wall.start[1];
            total_length += (dx * dx + dy * dy).sqrt();
        }
    }

    if count == 0 {
        ui.colored_label(tc.text_muted, "No walls in the project yet.");
        return;
    }

    egui::Grid::new("wall_qty_grid")
        .num_columns(2)
        .striped(true)
        .show(ui, |ui| {
            ui.colored_label(tc.text_muted, "METRIC");
            ui.colored_label(tc.text_muted, "VALUE");
            ui.end_row();

            ui.label("Wall Count");
            ui.label(format!("{}", count));
            ui.end_row();

            ui.label("Total Length");
            ui.label(format!("{:.3} m", total_length));
            ui.end_row();
        });
}

fn door_table(ui: &mut egui::Ui, state: &AppState, tc: &theme::ThemeColors) {
    let doors: Vec<&bcad_domain::DoorElement> = state
        .document
        .prototype
        .project
        .elements
        .iter()
        .filter_map(|el| {
            if let Element::Door(d) = el {
                Some(d)
            } else {
                None
            }
        })
        .collect();

    if doors.is_empty() {
        ui.colored_label(tc.text_muted, "No doors in the project yet.");
        return;
    }

    egui::Grid::new("door_grid")
        .num_columns(4)
        .striped(true)
        .show(ui, |ui| {
            ui.colored_label(tc.text_muted, "ID");
            ui.colored_label(tc.text_muted, "NAME");
            ui.colored_label(tc.text_muted, "WIDTH");
            ui.colored_label(tc.text_muted, "HEIGHT");
            ui.end_row();

            for door in &doors {
                let id_short = if door.meta.id.len() > 8 {
                    format!("{}...", &door.meta.id[..8])
                } else {
                    door.meta.id.clone()
                };
                ui.label(id_short);
                ui.label(&door.meta.name);
                ui.label(format!("{:.3}", door.width));
                ui.label(format!("{:.3}", door.height));
                ui.end_row();
            }
        });
}

fn window_table(ui: &mut egui::Ui, state: &AppState, tc: &theme::ThemeColors) {
    let windows: Vec<&bcad_domain::WindowElement> = state
        .document
        .prototype
        .project
        .elements
        .iter()
        .filter_map(|el| {
            if let Element::Window(w) = el {
                Some(w)
            } else {
                None
            }
        })
        .collect();

    if windows.is_empty() {
        ui.colored_label(tc.text_muted, "No windows in the project yet.");
        return;
    }

    egui::Grid::new("window_grid")
        .num_columns(4)
        .striped(true)
        .show(ui, |ui| {
            ui.colored_label(tc.text_muted, "ID");
            ui.colored_label(tc.text_muted, "NAME");
            ui.colored_label(tc.text_muted, "WIDTH");
            ui.colored_label(tc.text_muted, "HEIGHT");
            ui.end_row();

            for win in &windows {
                let id_short = if win.meta.id.len() > 8 {
                    format!("{}...", &win.meta.id[..8])
                } else {
                    win.meta.id.clone()
                };
                ui.label(id_short);
                ui.label(&win.meta.name);
                ui.label(format!("{:.3}", win.width));
                ui.label(format!("{:.3}", win.height));
                ui.end_row();
            }
        });
}

fn room_table(ui: &mut egui::Ui, state: &AppState, tc: &theme::ThemeColors) {
    let rooms: Vec<&bcad_domain::RoomElement> = state
        .document
        .prototype
        .project
        .elements
        .iter()
        .filter_map(|el| {
            if let Element::Room(r) = el {
                Some(r)
            } else {
                None
            }
        })
        .collect();

    if rooms.is_empty() {
        ui.colored_label(tc.text_muted, "No rooms in the project yet.");
        return;
    }

    egui::Grid::new("room_grid")
        .num_columns(4)
        .striped(true)
        .show(ui, |ui| {
            ui.colored_label(tc.text_muted, "ID");
            ui.colored_label(tc.text_muted, "NAME");
            ui.colored_label(tc.text_muted, "AREA");
            ui.colored_label(tc.text_muted, "PERIMETER");
            ui.end_row();

            for room in &rooms {
                let id_short = if room.meta.id.len() > 8 {
                    format!("{}...", &room.meta.id[..8])
                } else {
                    room.meta.id.clone()
                };
                ui.label(id_short);
                ui.label(&room.meta.name);
                let area = bcad_domain::polygon_area(&room.boundary);
                let perimeter = bcad_domain::polygon_perimeter(&room.boundary);
                ui.label(format!("{:.3} m2", area));
                ui.label(format!("{:.3} m", perimeter));
                ui.end_row();
            }
        });
}

fn takeoff_table(ui: &mut egui::Ui, state: &AppState, tc: &theme::ThemeColors) {
    // Group elements by kind and count them
    let mut kind_counts: std::collections::BTreeMap<&str, usize> =
        std::collections::BTreeMap::new();

    for el in state.document.prototype.project.elements.iter() {
        let kind = element_kind_name(el);
        *kind_counts.entry(kind).or_insert(0) += 1;
    }

    if kind_counts.is_empty() {
        ui.colored_label(tc.text_muted, "No elements in the project yet.");
        return;
    }

    egui::Grid::new("takeoff_grid")
        .num_columns(2)
        .striped(true)
        .show(ui, |ui| {
            ui.colored_label(tc.text_muted, "ELEMENT TYPE");
            ui.colored_label(tc.text_muted, "COUNT");
            ui.end_row();

            for (kind, count) in &kind_counts {
                ui.label(*kind);
                ui.label(format!("{}", count));
                ui.end_row();
            }
        });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn element_kind_name(el: &Element) -> &'static str {
    match el {
        Element::Site(_) => "Site",
        Element::Level(_) => "Level",
        Element::Grid(_) => "Grid",
        Element::Wall(_) => "Wall",
        Element::Floor(_) => "Floor",
        Element::Roof(_) => "Roof",
        Element::Foundation(_) => "Foundation",
        Element::Column(_) => "Column",
        Element::Beam(_) => "Beam",
        Element::Door(_) => "Door",
        Element::Window(_) => "Window",
        Element::Stair(_) => "Stair",
        Element::Room(_) => "Room",
        Element::View(_) => "View",
        Element::Sheet(_) => "Sheet",
        Element::Material(_) => "Material",
        Element::FamilyType(_) => "Family Type",
        Element::Generic(_) => "Generic",
        Element::Electrical(_) => "Electrical",
        Element::Plumbing(_) => "Plumbing",
        Element::Furniture(_) => "Furniture",
        Element::SiteDetail(_) => "Site Detail",
        Element::LeaderAnnotation(_) => "Leader Annotation",
        Element::Keynote(_) => "Keynote",
        Element::Tag(_) => "Tag",
        Element::Hvac(_) => "HVAC",
        Element::FireSafety(_) => "Fire Safety",
        Element::Accessibility(_) => "Accessibility",
        Element::Cabinet(_) => "Cabinet",
    }
}

