//! BetterCAD native egui UI shell.
//!
//! Replaces all React/TypeScript UI components with an egui immediate-mode
//! interface. The main entry point is [`BcadUi::show`], which renders the
//! entire UI frame and returns a list of [`Command`]s and [`UiAction`]s.

pub mod array_dialog;
pub mod chat_panel;
pub mod constraint_panel;
pub mod export_dialog;
pub mod import_dialog;
pub mod layer_panel;
pub mod level_manager;
pub mod menu_bar;
pub mod property_panel;
pub mod schedule_panel;
pub mod status_bar;
pub mod theme;
pub mod toolbar;
pub mod view_panel;
pub mod widgets;

use bcad_state::ui_state::{RightTab, ToolType};
use bcad_state::{AppState, Command};

// ---------------------------------------------------------------------------
// UiAction -- side-effectful operations the host must handle
// ---------------------------------------------------------------------------

/// Side-effectful actions that require host-level handling (file I/O, native
/// dialogs, etc.). These are separate from [`Command`] because they perform
/// I/O rather than pure state mutations.
#[derive(Debug, Clone)]
pub enum UiAction {
    /// Save the current project to a .bcad file (shows native save dialog).
    SaveProject,
    /// Open a .bcad project file (shows native open dialog).
    OpenProject,
    /// Export the project in the specified format.
    ExportProject { format: export_dialog::ExportFormat },
    /// Import geometry from a file (shows native open dialog for the given format).
    ImportFile { format: import_dialog::ImportFormat },
}

// ---------------------------------------------------------------------------
// Dialog visibility state (not in AppState -- local to UI)
// ---------------------------------------------------------------------------

/// Transient UI-only state that the egui shell tracks between frames.
#[derive(Debug, Default)]
pub struct DialogState {
    pub export_open: bool,
    pub import_open: bool,
    pub array_open: bool,
    pub schedule_open: bool,
    pub clear_confirm_open: bool,

    // Export dialog local state
    pub export: export_dialog::ExportDialogState,
    // Import dialog local state
    pub import: import_dialog::ImportDialogState,
    // Array dialog local state
    pub array: array_dialog::ArrayDialogState,
    // Schedule panel local state
    pub schedule: schedule_panel::SchedulePanelState,
}

// ---------------------------------------------------------------------------
// BcadUi  -- the main UI struct
// ---------------------------------------------------------------------------

/// The egui application shell for BetterCAD.
///
/// Holds only transient UI state (dialog open/close, local widget state).
/// The authoritative application state lives in [`AppState`].
pub struct BcadUi {
    /// Transient dialog / overlay state.
    pub dialogs: DialogState,
    /// Which right-panel tab is selected (mirrors state but we keep a local
    /// copy so we can change it without emitting a command every frame).
    active_right_tab: RightTab,
}

impl Default for BcadUi {
    fn default() -> Self {
        Self::new()
    }
}

impl BcadUi {
    pub fn new() -> Self {
        Self {
            dialogs: DialogState::default(),
            active_right_tab: RightTab::Properties,
        }
    }

    /// Render the entire BetterCAD UI for one frame.
    ///
    /// Returns a [`Vec<Command>`] of all user-initiated actions that should
    /// be dispatched against `AppState`. The caller is responsible for
    /// executing them.
    ///
    /// The `CentralPanel` (viewport area) is left empty -- its [`egui::Rect`]
    /// is returned inside the tuple so the caller can route it to the 3D/2D
    /// renderer.
    pub fn show(
        &mut self,
        ctx: &egui::Context,
        state: &mut AppState,
    ) -> (Vec<Command>, Vec<UiAction>, egui::Rect) {
        // Apply the active theme every frame (cheap -- just writes Visuals).
        theme::apply_theme(ctx, state.ui.theme);

        let mut cmds = Vec::new();
        let mut actions = Vec::new();

        // Sync local tab with state (in case an external command changed it).
        self.active_right_tab = state.ui.active_right_tab;

        // ----- Top menu bar -----
        egui::TopBottomPanel::top("menu_bar").show(ctx, |ui| {
            let (menu_cmds, menu_actions) = menu_bar::show(ui, state, &mut self.dialogs);
            cmds.extend(menu_cmds);
            actions.extend(menu_actions);
        });

        // ----- Sub-toolbar (sketch or dimension) -----
        if state.ui.active_tool == ToolType::Sketch {
            egui::TopBottomPanel::top("sketch_toolbar").show(ctx, |ui| {
                cmds.extend(toolbar::sketch_toolbar(ui, state));
            });
        }
        if state.ui.active_tool == ToolType::Dimension {
            egui::TopBottomPanel::top("dimension_toolbar").show(ctx, |ui| {
                cmds.extend(toolbar::dimension_toolbar(ui, state));
            });
        }

        // ----- Bottom status bar -----
        egui::TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
            status_bar::show(ui, state);
        });

        // ----- Left tool palette -----
        egui::SidePanel::left("tool_panel")
            .exact_width(84.0)
            .resizable(false)
            .show(ctx, |ui| {
                egui::ScrollArea::vertical()
                    .auto_shrink([false; 2])
                    .show(ui, |ui| {
                        ui.set_min_width(ui.available_width());
                        cmds.extend(toolbar::tool_palette(ui, state));
                    });
            });

        // ----- Right side panel (resizable) -----
        egui::SidePanel::right("side_panel")
            .default_width(320.0)
            .width_range(260.0..=520.0)
            .resizable(true)
            .show(ctx, |ui| {
                cmds.extend(self.side_panel_content(ui, state));
            });

        // ----- Central panel (viewport -- empty, just claim the rect) -----
        let viewport_response =
            egui::CentralPanel::default()
                .frame(egui::Frame::NONE)
                .show(ctx, |_ui| {
                    // The 3D/2D renderer draws into this area.
                    // We intentionally leave it empty.
                });
        let viewport_rect = viewport_response.response.rect;

        // ----- Modal dialogs (rendered last so they overlay everything) -----
        if self.dialogs.export_open {
            let (dialog_cmds, dialog_actions, should_close) =
                export_dialog::show(ctx, &mut self.dialogs.export);
            cmds.extend(dialog_cmds);
            actions.extend(dialog_actions);
            if should_close {
                self.dialogs.export_open = false;
            }
        }

        if self.dialogs.import_open {
            let (dialog_cmds, dialog_actions, should_close) =
                import_dialog::show(ctx, &mut self.dialogs.import);
            cmds.extend(dialog_cmds);
            actions.extend(dialog_actions);
            if should_close {
                self.dialogs.import_open = false;
            }
        }

        if self.dialogs.array_open {
            let (dialog_cmds, should_close) = array_dialog::show(ctx, &mut self.dialogs.array);
            cmds.extend(dialog_cmds);
            if should_close {
                self.dialogs.array_open = false;
            }
        }

        if self.dialogs.schedule_open {
            let (dialog_cmds, should_close) =
                schedule_panel::show(ctx, state, &mut self.dialogs.schedule);
            cmds.extend(dialog_cmds);
            if should_close {
                self.dialogs.schedule_open = false;
            }
        }

        if self.dialogs.clear_confirm_open {
            let mut close = false;
            egui::Window::new("Clear Project")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .show(ctx, |ui| {
                    ui.label("Are you sure you want to clear the entire project?");
                    ui.label("This cannot be undone.");
                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if ui.button("Clear").clicked() {
                            cmds.push(Command::ClearProject);
                            close = true;
                        }
                        if ui.button("Cancel").clicked() {
                            close = true;
                        }
                    });
                });
            if close {
                self.dialogs.clear_confirm_open = false;
            }
        }

        // If the right tab changed, emit a command
        if self.active_right_tab != state.ui.active_right_tab {
            cmds.push(Command::SetActiveRightTab {
                tab: self.active_right_tab,
            });
        }

        (cmds, actions, viewport_rect)
    }

    /// Render the side panel content with tabs.
    fn side_panel_content(&mut self, ui: &mut egui::Ui, state: &mut AppState) -> Vec<Command> {
        let mut cmds = Vec::new();

        // Tab bar
        ui.horizontal(|ui| {
            ui.selectable_value(
                &mut self.active_right_tab,
                RightTab::Properties,
                "Properties",
            );
            ui.selectable_value(&mut self.active_right_tab, RightTab::View, "View");
            ui.selectable_value(&mut self.active_right_tab, RightTab::Layers, "Layers");
            ui.selectable_value(&mut self.active_right_tab, RightTab::Chat, "Chat");
        });
        ui.separator();

        // Tab content in a scroll area
        // Chat panel manages its own scroll layout (input pinned to bottom),
        // so it must NOT be wrapped in the parent ScrollArea.
        if self.active_right_tab == RightTab::Chat {
            cmds.extend(chat_panel::show(ui, state));
        } else {
            egui::ScrollArea::vertical().show(ui, |ui| match self.active_right_tab {
                RightTab::Properties => {
                    cmds.extend(level_manager::show(ui, state));
                    ui.separator();
                    if state.ui.active_tool == ToolType::Sketch {
                        cmds.extend(constraint_panel::show(ui, state));
                    } else {
                        cmds.extend(property_panel::show(ui, state));
                    }
                }
                RightTab::View => {
                    cmds.extend(view_panel::show(ui, state));
                }
                RightTab::Layers => {
                    cmds.extend(layer_panel::show(ui, state));
                }
                RightTab::Chat => unreachable!(),
            });
        }

        cmds
    }
}
