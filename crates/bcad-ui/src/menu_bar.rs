//! Top menu bar: brand text, File / Edit / Draw / Settings menus.
//!
//! Each menu item may show a keyboard shortcut hint and returns
//! [`Command`] values for every user action.

use bcad_state::settings::{LengthUnit, LightingPreset};
use bcad_state::ui_state::{Theme, ToolType, ViewMode};
use bcad_state::{AppState, Command};

use crate::theme;
use crate::DialogState;
use crate::UiAction;

// ---------------------------------------------------------------------------
// Tool catalog (mirrors TOOL_OPTIONS in App.tsx)
// ---------------------------------------------------------------------------

struct ToolOption {
    tool: ToolType,
    label: &'static str,
    shortcut: &'static str,
}

const TOOL_OPTIONS: &[ToolOption] = &[
    ToolOption {
        tool: ToolType::Select,
        label: "Select",
        shortcut: "Esc",
    },
    ToolOption {
        tool: ToolType::Foundation,
        label: "Foundation",
        shortcut: "H",
    },
    ToolOption {
        tool: ToolType::Parking,
        label: "Parking",
        shortcut: "P",
    },
    ToolOption {
        tool: ToolType::Wall,
        label: "Wall",
        shortcut: "W",
    },
    ToolOption {
        tool: ToolType::Door,
        label: "Door",
        shortcut: "D",
    },
    ToolOption {
        tool: ToolType::Window,
        label: "Window",
        shortcut: "N",
    },
    ToolOption {
        tool: ToolType::Floor,
        label: "Floor",
        shortcut: "F",
    },
    ToolOption {
        tool: ToolType::Stair,
        label: "Stair",
        shortcut: "S",
    },
    ToolOption {
        tool: ToolType::Column,
        label: "Column",
        shortcut: "C",
    },
    ToolOption {
        tool: ToolType::Beam,
        label: "Beam",
        shortcut: "B",
    },
    ToolOption {
        tool: ToolType::Roof,
        label: "Roof",
        shortcut: "O",
    },
    ToolOption {
        tool: ToolType::Dimension,
        label: "Dimension",
        shortcut: "A",
    },
    ToolOption {
        tool: ToolType::Text,
        label: "Text",
        shortcut: "T",
    },
    ToolOption {
        tool: ToolType::Sketch,
        label: "Sketch",
        shortcut: "K",
    },
    ToolOption {
        tool: ToolType::Furniture,
        label: "Furniture",
        shortcut: "I",
    },
    ToolOption {
        tool: ToolType::Plumbing,
        label: "Plumbing",
        shortcut: "U",
    },
    ToolOption {
        tool: ToolType::Electrical,
        label: "Electrical",
        shortcut: "E",
    },
    ToolOption {
        tool: ToolType::Cabinet,
        label: "Cabinet",
        shortcut: "J",
    },
    ToolOption {
        tool: ToolType::Hvac,
        label: "HVAC",
        shortcut: "V",
    },
    ToolOption {
        tool: ToolType::FireSafety,
        label: "Fire Safety",
        shortcut: "G",
    },
    ToolOption {
        tool: ToolType::Accessibility,
        label: "Access.",
        shortcut: "Y",
    },
    ToolOption {
        tool: ToolType::Measure,
        label: "Measure",
        shortcut: "M",
    },
    ToolOption {
        tool: ToolType::MeasurePath,
        label: "Path",
        shortcut: "",
    },
    ToolOption {
        tool: ToolType::MeasureArea,
        label: "Area",
        shortcut: "",
    },
    ToolOption {
        tool: ToolType::MeasureAngle,
        label: "Angle",
        shortcut: "",
    },
    ToolOption {
        tool: ToolType::SpotElevation,
        label: "Spot Elev",
        shortcut: "",
    },
    ToolOption {
        tool: ToolType::Section,
        label: "Section",
        shortcut: "-",
    },
];

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Render the top menu bar and return commands + UI actions for any actions taken.
pub fn show(
    ui: &mut egui::Ui,
    state: &AppState,
    dialogs: &mut DialogState,
) -> (Vec<Command>, Vec<UiAction>) {
    let mut cmds = Vec::new();
    let mut actions = Vec::new();
    let tc = theme::colors(state.ui.theme);

    ui.horizontal(|ui| {
        // ---- Brand ----
        ui.label(
            egui::RichText::new("BetterCAD Prototype")
                .color(tc.accent)
                .strong()
                .size(16.0),
        );

        // Project name chip
        ui.label(
            egui::RichText::new(format!(
                "Project: {}",
                state.document.prototype.project.name
            ))
            .size(11.0)
            .color(tc.text_muted),
        );

        // Active level chip
        if let Some(level) = state.levels.active_level() {
            ui.label(
                egui::RichText::new(format!("Level: {}", level.name))
                    .size(11.0)
                    .color(tc.text_muted),
            );
        }

        ui.separator();

        // ---- Menu bar ----
        egui::menu::bar(ui, |ui| {
            let (file_cmds, file_actions) = file_menu(ui, dialogs);
            cmds.extend(file_cmds);
            actions.extend(file_actions);
            cmds.extend(edit_menu(ui, state, dialogs));
            cmds.extend(draw_menu(ui, state));
            cmds.extend(settings_menu(ui, state, dialogs));
        });
    });

    (cmds, actions)
}

// ---------------------------------------------------------------------------
// File menu
// ---------------------------------------------------------------------------

fn file_menu(ui: &mut egui::Ui, dialogs: &mut DialogState) -> (Vec<Command>, Vec<UiAction>) {
    let cmds = Vec::new();
    let mut actions = Vec::new();

    ui.menu_button("File", |ui| {
        if menu_item_shortcut(ui, "Save Project", "Ctrl+S").clicked() {
            actions.push(UiAction::SaveProject);
            ui.close_menu();
        }
        if menu_item_shortcut(ui, "Open Project", "Ctrl+O").clicked() {
            actions.push(UiAction::OpenProject);
            ui.close_menu();
        }

        ui.separator();

        if ui.button("Import Geometry").clicked() {
            dialogs.import_open = true;
            ui.close_menu();
        }
        if ui.button("Export Geometry").clicked() {
            dialogs.export_open = true;
            ui.close_menu();
        }

        ui.separator();

        if ui.button("Clear Project...").clicked() {
            dialogs.clear_confirm_open = true;
            ui.close_menu();
        }
    });

    (cmds, actions)
}

// ---------------------------------------------------------------------------
// Edit menu
// ---------------------------------------------------------------------------

fn edit_menu(ui: &mut egui::Ui, state: &AppState, dialogs: &mut DialogState) -> Vec<Command> {
    let mut cmds = Vec::new();

    ui.menu_button("Edit", |ui| {
        // -- Undo / Redo --
        let undo_label = if let Some(label) = state.history.undo_label() {
            format!("Undo: {}  Ctrl+Z", label)
        } else {
            "Undo  Ctrl+Z".to_string()
        };
        let undo_btn = ui.add_enabled(state.history.can_undo(), egui::Button::new(undo_label).frame(false));
        if undo_btn.clicked() {
            cmds.push(Command::Undo);
            ui.close_menu();
        }
        let redo_label = if let Some(label) = state.history.redo_label() {
            format!("Redo: {}  Ctrl+Shift+Z", label)
        } else {
            "Redo  Ctrl+Shift+Z".to_string()
        };
        let redo_btn = ui.add_enabled(state.history.can_redo(), egui::Button::new(redo_label).frame(false));
        if redo_btn.clicked() {
            cmds.push(Command::Redo);
            ui.close_menu();
        }

        ui.separator();

        // -- Copy / Paste / Duplicate --
        let has_selection = state.ui.selected_body_id.is_some();
        let has_clipboard = state.clipboard.is_some();

        let copy_btn = ui.add_enabled(has_selection, egui::Button::new("Copy  Ctrl+C").frame(false));
        if copy_btn.clicked() {
            cmds.push(Command::CopySelected);
            ui.close_menu();
        }
        let paste_btn = ui.add_enabled(has_clipboard, egui::Button::new("Paste  Ctrl+V").frame(false));
        if paste_btn.clicked() {
            cmds.push(Command::PasteFromClipboard);
            ui.close_menu();
        }
        let dup_btn = ui.add_enabled(has_selection, egui::Button::new("Duplicate  Ctrl+D").frame(false));
        if dup_btn.clicked() {
            cmds.push(Command::DuplicateSelected);
            ui.close_menu();
        }

        ui.separator();

        // -- Delete Selected --
        let del_btn = ui.add_enabled(has_selection, egui::Button::new("Delete Selected  Del").frame(false));
        if del_btn.clicked() {
            if let Some(ref id) = state.ui.selected_body_id {
                cmds.push(Command::DeleteElement { id: id.clone() });
                cmds.push(Command::ClearSelection);
            }
            ui.close_menu();
        }

        if menu_item_shortcut(ui, "Select All", "Ctrl+A").clicked() {
            // Select all is left to the host; we just signal intent
            ui.close_menu();
        }

        ui.separator();

        if menu_item_shortcut(ui, "Array...", "Ctrl+Shift+D").clicked() {
            dialogs.array_open = true;
            ui.close_menu();
        }
    });

    cmds
}

// ---------------------------------------------------------------------------
// Draw menu
// ---------------------------------------------------------------------------

fn draw_menu(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();

    ui.menu_button("Draw", |ui| {
        for opt in TOOL_OPTIONS {
            let is_active = state.ui.active_tool == opt.tool;
            let label = if opt.shortcut.is_empty() {
                opt.label.to_string()
            } else {
                format!("{}  {}", opt.label, opt.shortcut)
            };

            if ui.selectable_label(is_active, &label).clicked() {
                cmds.push(Command::SetActiveTool { tool: opt.tool });
                ui.close_menu();
            }
        }
    });

    cmds
}

// ---------------------------------------------------------------------------
// Settings menu
// ---------------------------------------------------------------------------

fn settings_menu(ui: &mut egui::Ui, state: &AppState, dialogs: &mut DialogState) -> Vec<Command> {
    let mut cmds = Vec::new();

    ui.menu_button("Settings", |ui| {
        // -- View mode --
        ui.label(
            egui::RichText::new("Display Mode")
                .size(10.0)
                .color(theme::colors(state.ui.theme).text_muted),
        );
        if ui
            .selectable_label(state.ui.view_mode == ViewMode::ThreeD, "3D")
            .clicked()
        {
            cmds.push(Command::SetViewMode {
                mode: ViewMode::ThreeD,
            });
        }
        if ui
            .selectable_label(state.ui.view_mode == ViewMode::TwoD, "2D")
            .clicked()
        {
            cmds.push(Command::SetViewMode {
                mode: ViewMode::TwoD,
            });
        }
        if ui
            .selectable_label(state.ui.view_mode == ViewMode::Split, "Split")
            .clicked()
        {
            cmds.push(Command::SetViewMode {
                mode: ViewMode::Split,
            });
        }
        ui.separator();

        // -- Units submenu --
        ui.menu_button("Units", |ui| {
            let current = state.settings.length_unit;
            for (unit, label) in [
                (LengthUnit::Mm, "Millimeters"),
                (LengthUnit::Cm, "Centimeters"),
                (LengthUnit::M, "Meters"),
                (LengthUnit::In, "Inches"),
                (LengthUnit::Ft, "Feet"),
            ] {
                if ui.selectable_label(current == unit, label).clicked() {
                    cmds.push(Command::SetLengthUnit { unit });
                    ui.close_menu();
                }
            }
        });

        ui.separator();

        // -- Toggles --
        let grid_label = if state.ui.show_grid {
            "Grid: On"
        } else {
            "Grid: Off"
        };
        if ui
            .selectable_label(state.ui.show_grid, grid_label)
            .clicked()
        {
            cmds.push(Command::ToggleGrid);
        }

        let snap_label = if state.ui.snap_enabled {
            "Snap: On"
        } else {
            "Snap: Off"
        };
        if ui
            .selectable_label(state.ui.snap_enabled, snap_label)
            .clicked()
        {
            cmds.push(Command::ToggleSnap);
        }

        let walls_label = if state.settings.walls_visible {
            "Hide Walls (Interior View)"
        } else {
            "Show Walls"
        };
        if ui
            .selectable_label(!state.settings.walls_visible, walls_label)
            .clicked()
        {
            cmds.push(Command::ToggleWallsVisible);
        }

        let sched_label = "Schedules";
        if ui.button(sched_label).clicked() {
            dialogs.schedule_open = !dialogs.schedule_open;
            ui.close_menu();
        }

        ui.separator();

        // -- Lighting --
        ui.label(
            egui::RichText::new("Lighting")
                .size(10.0)
                .color(theme::colors(state.ui.theme).text_muted),
        );
        for (preset, label) in [
            (LightingPreset::Daylight, "Daylight"),
            (LightingPreset::Evening, "Evening"),
            (LightingPreset::Studio, "Studio"),
        ] {
            if ui
                .selectable_label(state.settings.lighting_preset == preset, label)
                .clicked()
            {
                cmds.push(Command::SetLightingPreset { preset });
            }
        }

        ui.separator();

        // -- Theme --
        let theme_label = match state.ui.theme {
            Theme::Dark => "Switch to Light Theme",
            Theme::Light => "Switch to Dark Theme",
        };
        if ui.button(theme_label).clicked() {
            cmds.push(Command::ToggleTheme);
            ui.close_menu();
        }
    });

    cmds
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// A menu item button that shows a right-aligned keyboard shortcut hint.
fn menu_item_shortcut(ui: &mut egui::Ui, label: &str, shortcut: &str) -> egui::Response {
    ui.add(egui::Button::new(egui::RichText::new(format!("{}  {}", label, shortcut))).frame(false))
}
