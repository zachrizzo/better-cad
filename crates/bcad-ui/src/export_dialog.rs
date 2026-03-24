//! Export dialog: modal for choosing export format and options.
//!
//! Supports STEP, IFC, glTF, DXF, and PDF with construction document
//! sub-options (paper size, scale, sheets, project info).

use crate::UiAction;
use bcad_state::Command;

// ---------------------------------------------------------------------------
// Export format
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Step,
    Ifc,
    Gltf,
    Dxf,
    Pdf,
}

impl ExportFormat {
    pub fn label(self) -> &'static str {
        match self {
            Self::Step => "STEP (.step)",
            Self::Ifc => "IFC (.ifc)",
            Self::Gltf => "glTF Binary (.glb)",
            Self::Dxf => "DXF (.dxf)",
            Self::Pdf => "PDF Drawing Set (.pdf)",
        }
    }
}

const ALL_FORMATS: &[ExportFormat] = &[
    ExportFormat::Step,
    ExportFormat::Ifc,
    ExportFormat::Gltf,
    ExportFormat::Dxf,
    ExportFormat::Pdf,
];

// ---------------------------------------------------------------------------
// Paper sizes
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaperSize {
    ArchD,
    A1,
    Tabloid,
    Letter,
}

impl PaperSize {
    fn label(self) -> &'static str {
        match self {
            Self::ArchD => "ARCH-D (36\" x 24\")",
            Self::A1 => "A1 (841 x 594 mm)",
            Self::Tabloid => "Tabloid (17\" x 11\")",
            Self::Letter => "Letter (11\" x 8.5\")",
        }
    }
}

const PAPER_SIZES: &[PaperSize] = &[
    PaperSize::ArchD,
    PaperSize::A1,
    PaperSize::Tabloid,
    PaperSize::Letter,
];

// ---------------------------------------------------------------------------
// Sheet types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SheetType {
    FloorPlan,
    ElectricalPlan,
    PlumbingPlan,
    ReflectedCeiling,
    SitePlan,
    Elevations,
    Schedules,
}

impl SheetType {
    fn label(self) -> &'static str {
        match self {
            Self::FloorPlan => "Floor Plan",
            Self::ElectricalPlan => "Electrical Plan",
            Self::PlumbingPlan => "Plumbing Plan",
            Self::ReflectedCeiling => "Reflected Ceiling Plan",
            Self::SitePlan => "Site Plan",
            Self::Elevations => "Elevations",
            Self::Schedules => "Schedules",
        }
    }
}

const ALL_SHEET_TYPES: &[SheetType] = &[
    SheetType::FloorPlan,
    SheetType::ElectricalPlan,
    SheetType::PlumbingPlan,
    SheetType::ReflectedCeiling,
    SheetType::SitePlan,
    SheetType::Elevations,
    SheetType::Schedules,
];

const SCALE_OPTIONS: &[&str] = &[
    "1:50",
    "1:100",
    "1:200",
    "1:500",
    "1/4\" = 1'",
    "1/8\" = 1'",
    "3/16\" = 1'",
];

// ---------------------------------------------------------------------------
// Dialog state
// ---------------------------------------------------------------------------

/// Persistent local state for the export dialog.
#[derive(Debug)]
pub struct ExportDialogState {
    pub format: ExportFormat,
    pub paper_size: PaperSize,
    pub scale: String,
    pub advanced_pdf: bool,
    pub selected_sheets: Vec<SheetType>,
    pub project_name: String,
    pub project_address: String,
    pub architect_name: String,
}

impl Default for ExportDialogState {
    fn default() -> Self {
        Self {
            format: ExportFormat::Step,
            paper_size: PaperSize::Letter,
            scale: "1:100".to_string(),
            advanced_pdf: false,
            selected_sheets: vec![SheetType::FloorPlan, SheetType::Schedules],
            project_name: "BetterCAD Project".to_string(),
            project_address: String::new(),
            architect_name: String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Show the export dialog as a modal window.
/// Returns (commands, ui_actions, should_close).
pub fn show(
    ctx: &egui::Context,
    local: &mut ExportDialogState,
) -> (Vec<Command>, Vec<UiAction>, bool) {
    let cmds = Vec::new();
    let mut actions = Vec::new();
    let mut should_close = false;

    egui::Window::new("Export File")
        .collapsible(false)
        .resizable(false)
        .default_width(420.0)
        .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
        .show(ctx, |ui| {
            // Format selector
            ui.horizontal(|ui| {
                ui.label("Format:");
                egui::ComboBox::from_id_salt("export_format")
                    .selected_text(local.format.label())
                    .show_ui(ui, |ui| {
                        for fmt in ALL_FORMATS {
                            ui.selectable_value(&mut local.format, *fmt, fmt.label());
                        }
                    });
            });

            // PDF sub-options
            if local.format == ExportFormat::Pdf {
                ui.add_space(8.0);

                ui.checkbox(&mut local.advanced_pdf, "Construction Document Mode");

                // Paper size (advanced only)
                if local.advanced_pdf {
                    ui.horizontal(|ui| {
                        ui.label("Paper Size:");
                        egui::ComboBox::from_id_salt("paper_size")
                            .selected_text(local.paper_size.label())
                            .show_ui(ui, |ui| {
                                for ps in PAPER_SIZES {
                                    ui.selectable_value(&mut local.paper_size, *ps, ps.label());
                                }
                            });
                    });
                }

                // Scale
                ui.horizontal(|ui| {
                    ui.label("Scale:");
                    egui::ComboBox::from_id_salt("pdf_scale")
                        .selected_text(&local.scale)
                        .show_ui(ui, |ui| {
                            for s in SCALE_OPTIONS {
                                ui.selectable_value(&mut local.scale, s.to_string(), *s);
                            }
                        });
                });

                // Sheets
                ui.add_space(4.0);
                ui.label(egui::RichText::new("Sheets:").strong().size(12.0));

                let sheet_types: &[SheetType] = if local.advanced_pdf {
                    ALL_SHEET_TYPES
                } else {
                    &[
                        SheetType::FloorPlan,
                        SheetType::Elevations,
                        SheetType::Schedules,
                    ]
                };

                for st in sheet_types {
                    let mut checked = local.selected_sheets.contains(st);
                    if ui.checkbox(&mut checked, st.label()).changed() {
                        if checked {
                            if !local.selected_sheets.contains(st) {
                                local.selected_sheets.push(*st);
                            }
                        } else {
                            local.selected_sheets.retain(|s| s != st);
                        }
                    }
                }

                // Project info (advanced only)
                if local.advanced_pdf {
                    ui.add_space(4.0);
                    ui.group(|ui| {
                        ui.label(egui::RichText::new("Project Information").strong());
                        ui.horizontal(|ui| {
                            ui.label("Name:");
                            ui.text_edit_singleline(&mut local.project_name);
                        });
                        ui.horizontal(|ui| {
                            ui.label("Address:");
                            ui.text_edit_singleline(&mut local.project_address);
                        });
                        ui.horizontal(|ui| {
                            ui.label("Architect:");
                            ui.text_edit_singleline(&mut local.architect_name);
                        });
                    });
                }
            }

            ui.add_space(12.0);

            // Action buttons
            ui.horizontal(|ui| {
                if ui.button("Export").clicked() {
                    // Signal the host to perform the export with the selected format.
                    actions.push(UiAction::ExportProject {
                        format: local.format,
                    });
                    should_close = true;
                }
                if ui.button("Cancel").clicked() {
                    should_close = true;
                }
            });
        });

    (cmds, actions, should_close)
}
