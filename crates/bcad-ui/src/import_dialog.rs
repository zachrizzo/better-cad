//! Import dialog: modal for selecting import format and file.
//!
//! Supports STEP, DXF, IFC. The actual file selection and import
//! execution is handled by the host application.

use crate::UiAction;
use bcad_state::Command;

// ---------------------------------------------------------------------------
// Import format
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportFormat {
    Step,
    Dxf,
    Ifc,
}

impl ImportFormat {
    pub fn label(self) -> &'static str {
        match self {
            Self::Step => "STEP (.step, .stp)",
            Self::Dxf => "DXF (.dxf)",
            Self::Ifc => "IFC (.ifc)",
        }
    }
}

const IMPORT_FORMATS: &[ImportFormat] = &[ImportFormat::Step, ImportFormat::Dxf, ImportFormat::Ifc];

// ---------------------------------------------------------------------------
// Dialog state
// ---------------------------------------------------------------------------

/// Persistent local state for the import dialog.
#[derive(Debug)]
pub struct ImportDialogState {
    pub format: ImportFormat,
    pub file_path: String,
}

impl Default for ImportDialogState {
    fn default() -> Self {
        Self {
            format: ImportFormat::Step,
            file_path: String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Show the import dialog as a modal window.
/// Returns (commands, ui_actions, should_close).
pub fn show(
    ctx: &egui::Context,
    local: &mut ImportDialogState,
) -> (Vec<Command>, Vec<UiAction>, bool) {
    let cmds = Vec::new();
    let mut actions = Vec::new();
    let mut should_close = false;

    egui::Window::new("Import File")
        .collapsible(false)
        .resizable(false)
        .default_width(380.0)
        .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
        .show(ctx, |ui| {
            // Format info
            ui.label(format!(
                "Supported formats: {}",
                IMPORT_FORMATS
                    .iter()
                    .map(|f| f.label())
                    .collect::<Vec<_>>()
                    .join(", "),
            ));

            ui.add_space(8.0);

            // Format selector
            ui.horizontal(|ui| {
                ui.label("Format:");
                egui::ComboBox::from_id_salt("import_format")
                    .selected_text(local.format.label())
                    .show_ui(ui, |ui| {
                        for fmt in IMPORT_FORMATS {
                            ui.selectable_value(&mut local.format, *fmt, fmt.label());
                        }
                    });
            });

            ui.add_space(4.0);

            // File path display
            ui.horizontal(|ui| {
                ui.label("File:");
                if local.file_path.is_empty() {
                    ui.colored_label(
                        egui::Color32::from_rgb(0x9c, 0xa5, 0xc4),
                        "(no file selected)",
                    );
                } else {
                    ui.monospace(&local.file_path);
                }
            });

            // Browse button: directly triggers the import action which will
            // show a native file dialog and import the file.
            if ui
                .button("Browse & Import...")
                .on_hover_text("Select a file to import")
                .clicked()
            {
                actions.push(UiAction::ImportFile {
                    format: local.format,
                });
                should_close = true;
            }

            ui.add_space(12.0);

            // Action buttons
            ui.horizontal(|ui| {
                if ui.button("Cancel").clicked() {
                    should_close = true;
                }
            });
        });

    (cmds, actions, should_close)
}
