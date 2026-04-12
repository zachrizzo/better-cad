//! Toolbars for BetterCAD.
//!
//! - `tool_palette`: left-side vertical panel with all drawing tools (like FreeCAD)
//! - `sketch_toolbar`: secondary horizontal bar for Sketch mode
//! - `dimension_toolbar`: secondary horizontal bar for Dimension mode

use bcad_state::sketch_state::{ConstraintStatus, SketchDrawMode};
use bcad_state::ui_state::{DimensionSubMode, ToolType};
use bcad_state::{AppState, Command};

use crate::theme;

// ---------------------------------------------------------------------------
// Left tool palette (vertical, FreeCAD-style)
// ---------------------------------------------------------------------------

struct PaletteEntry {
    tool: ToolType,
    label: &'static str,
    shortcut: &'static str,
}

/// Render the vertical tool palette for the left side panel.
///
/// Buttons are grouped by category with separator labels.  Each button is
/// styled as a selectable label and emits a [`Command::SetActiveTool`] when
/// clicked.
pub fn tool_palette(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let active = state.ui.active_tool;
    let tc = theme::colors(state.ui.theme);

    // Button size: full width of the panel, fixed height.
    const BTN_H: f32 = 28.0;

    // Helper: one tool button.
    // Returns true if clicked.
    let btn = |ui: &mut egui::Ui, tool: ToolType, label: &str, shortcut: &str| -> bool {
        let is_active = active == tool;

        // Compose the display: label + muted shortcut hint
        let text = if shortcut.is_empty() {
            egui::RichText::new(label).size(11.5)
        } else {
            egui::RichText::new(label).size(11.5)
        };

        let resp = ui.add_sized(
            [ui.available_width(), BTN_H],
            egui::SelectableLabel::new(is_active, text),
        );

        // Hover tooltip shows full name + shortcut
        let hint = if shortcut.is_empty() {
            label.to_string()
        } else {
            format!("{label}  [{shortcut}]")
        };
        resp.clone().on_hover_text(hint);

        // Show shortcut hint text faintly on the right side when not active
        if !shortcut.is_empty() && !is_active {
            let rect = resp.rect;
            let painter = ui.painter();
            painter.text(
                egui::pos2(rect.max.x - 4.0, rect.center().y),
                egui::Align2::RIGHT_CENTER,
                shortcut,
                egui::FontId::proportional(9.0),
                tc.text_muted,
            );
        }

        resp.clicked()
    };

    // Category header helper
    let header = |ui: &mut egui::Ui, text: &str| {
        ui.add_space(4.0);
        ui.label(
            egui::RichText::new(text)
                .size(9.5)
                .color(tc.text_muted)
                .strong(),
        );
    };

    // ---- General ----
    header(ui, "GENERAL");
    if btn(ui, ToolType::Select, "Select", "Esc") {
        cmds.push(Command::SetActiveTool {
            tool: ToolType::Select,
        });
    }

    ui.separator();

    // ---- Architecture ----
    header(ui, "ARCHITECTURE");
    for entry in &[
        PaletteEntry {
            tool: ToolType::Wall,
            label: "Wall",
            shortcut: "W",
        },
        PaletteEntry {
            tool: ToolType::Door,
            label: "Door",
            shortcut: "D",
        },
        PaletteEntry {
            tool: ToolType::Window,
            label: "Window",
            shortcut: "N",
        },
        PaletteEntry {
            tool: ToolType::Floor,
            label: "Floor",
            shortcut: "F",
        },
        PaletteEntry {
            tool: ToolType::Roof,
            label: "Roof",
            shortcut: "O",
        },
        PaletteEntry {
            tool: ToolType::Stair,
            label: "Stair",
            shortcut: "S",
        },
        PaletteEntry {
            tool: ToolType::Room,
            label: "Room",
            shortcut: "",
        },
    ] {
        if btn(ui, entry.tool, entry.label, entry.shortcut) {
            cmds.push(Command::SetActiveTool { tool: entry.tool });
        }
    }

    ui.separator();

    // ---- Structure ----
    header(ui, "STRUCTURE");
    for entry in &[
        PaletteEntry {
            tool: ToolType::Column,
            label: "Column",
            shortcut: "C",
        },
        PaletteEntry {
            tool: ToolType::Beam,
            label: "Beam",
            shortcut: "B",
        },
        PaletteEntry {
            tool: ToolType::Foundation,
            label: "Foundation",
            shortcut: "H",
        },
    ] {
        if btn(ui, entry.tool, entry.label, entry.shortcut) {
            cmds.push(Command::SetActiveTool { tool: entry.tool });
        }
    }

    ui.separator();

    // ---- Interior ----
    header(ui, "INTERIOR");
    for entry in &[
        PaletteEntry {
            tool: ToolType::Furniture,
            label: "Furniture",
            shortcut: "I",
        },
        PaletteEntry {
            tool: ToolType::Cabinet,
            label: "Cabinet",
            shortcut: "J",
        },
        PaletteEntry {
            tool: ToolType::Parking,
            label: "Parking",
            shortcut: "P",
        },
    ] {
        if btn(ui, entry.tool, entry.label, entry.shortcut) {
            cmds.push(Command::SetActiveTool { tool: entry.tool });
        }
    }

    ui.separator();

    // ---- MEP ----
    header(ui, "MEP");
    for entry in &[
        PaletteEntry {
            tool: ToolType::Plumbing,
            label: "Plumbing",
            shortcut: "U",
        },
        PaletteEntry {
            tool: ToolType::Electrical,
            label: "Electrical",
            shortcut: "E",
        },
        PaletteEntry {
            tool: ToolType::Hvac,
            label: "HVAC",
            shortcut: "V",
        },
        PaletteEntry {
            tool: ToolType::FireSafety,
            label: "Fire Safety",
            shortcut: "G",
        },
        PaletteEntry {
            tool: ToolType::Accessibility,
            label: "Access.",
            shortcut: "Y",
        },
    ] {
        if btn(ui, entry.tool, entry.label, entry.shortcut) {
            cmds.push(Command::SetActiveTool { tool: entry.tool });
        }
    }

    ui.separator();

    // ---- Annotation ----
    header(ui, "ANNOTATE");
    for entry in &[
        PaletteEntry {
            tool: ToolType::Dimension,
            label: "Dimension",
            shortcut: "A",
        },
        PaletteEntry {
            tool: ToolType::Text,
            label: "Text",
            shortcut: "T",
        },
        PaletteEntry {
            tool: ToolType::Section,
            label: "Section",
            shortcut: "-",
        },
        PaletteEntry {
            tool: ToolType::SpotElevation,
            label: "Spot Elev.",
            shortcut: "",
        },
    ] {
        if btn(ui, entry.tool, entry.label, entry.shortcut) {
            cmds.push(Command::SetActiveTool { tool: entry.tool });
        }
    }

    ui.separator();

    // ---- Measure ----
    header(ui, "MEASURE");
    for entry in &[
        PaletteEntry {
            tool: ToolType::Measure,
            label: "Measure",
            shortcut: "M",
        },
        PaletteEntry {
            tool: ToolType::MeasurePath,
            label: "Path",
            shortcut: "",
        },
        PaletteEntry {
            tool: ToolType::MeasureArea,
            label: "Area",
            shortcut: "",
        },
        PaletteEntry {
            tool: ToolType::MeasureAngle,
            label: "Angle",
            shortcut: "",
        },
    ] {
        if btn(ui, entry.tool, entry.label, entry.shortcut) {
            cmds.push(Command::SetActiveTool { tool: entry.tool });
        }
    }

    ui.separator();

    // ---- Sketch ----
    header(ui, "SKETCH");
    if btn(ui, ToolType::Sketch, "Sketch", "K") {
        cmds.push(Command::SetActiveTool {
            tool: ToolType::Sketch,
        });
    }

    cmds
}

// ---------------------------------------------------------------------------
// Sketch toolbar
// ---------------------------------------------------------------------------

struct DrawModeOption {
    mode: SketchDrawMode,
    label: &'static str,
    tooltip: &'static str,
}

const SKETCH_DRAW_MODES: &[DrawModeOption] = &[
    DrawModeOption {
        mode: SketchDrawMode::None,
        label: "Select",
        tooltip: "Select entities (click points/lines)",
    },
    DrawModeOption {
        mode: SketchDrawMode::Line,
        label: "Line",
        tooltip: "Draw lines (chain mode, right-click to end)",
    },
    DrawModeOption {
        mode: SketchDrawMode::Rectangle,
        label: "Rect",
        tooltip: "Draw rectangles (click two corners)",
    },
    DrawModeOption {
        mode: SketchDrawMode::Circle,
        label: "Circle",
        tooltip: "Draw circles (click center, then radius)",
    },
];

/// Render the sketch sub-toolbar. Returns commands.
pub fn sketch_toolbar(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tc = theme::colors(state.ui.theme);

    ui.horizontal(|ui| {
        ui.colored_label(tc.text_muted, "Sketch:");

        for opt in SKETCH_DRAW_MODES {
            let is_active = state.sketch.draw_mode == opt.mode;
            let response = ui.selectable_label(is_active, opt.label);
            if response.clicked() {
                cmds.push(Command::SetSketchDrawMode { mode: opt.mode });
            }
            response.on_hover_text(opt.tooltip);
        }

        ui.separator();

        // Solve button
        if ui
            .button("Solve")
            .on_hover_text("Re-run constraint solver")
            .clicked()
        {
            cmds.push(Command::RunSketchSolver);
        }

        // Clear button
        if ui
            .button("Clear")
            .on_hover_text("Clear all sketch entities and constraints")
            .clicked()
        {
            cmds.push(Command::ClearSketch);
        }

        ui.separator();

        // Solver status indicator
        let (status_text, status_color) = match state.sketch.solver_status {
            ConstraintStatus::WellConstrained => (
                "Fully Constrained",
                egui::Color32::from_rgb(0x16, 0xa3, 0x4a),
            ),
            ConstraintStatus::OverConstrained => ("Over-Constrained", tc.danger),
            ConstraintStatus::UnderConstrained => ("Under-Constrained", tc.text_muted),
        };
        ui.colored_label(status_color, status_text);
    });

    cmds
}

// ---------------------------------------------------------------------------
// Dimension toolbar
// ---------------------------------------------------------------------------

struct DimModeOption {
    mode: DimensionSubMode,
    label: &'static str,
    tooltip: &'static str,
}

const DIM_SUB_MODES: &[DimModeOption] = &[
    DimModeOption {
        mode: DimensionSubMode::Aligned,
        label: "Aligned",
        tooltip: "Aligned dimension (default)",
    },
    DimModeOption {
        mode: DimensionSubMode::Horizontal,
        label: "Horiz",
        tooltip: "Horizontal dimension (constrain to X)",
    },
    DimModeOption {
        mode: DimensionSubMode::Vertical,
        label: "Vert",
        tooltip: "Vertical dimension (constrain to Y)",
    },
    DimModeOption {
        mode: DimensionSubMode::Chain,
        label: "Chain",
        tooltip: "Chained dimensions (continuous)",
    },
    DimModeOption {
        mode: DimensionSubMode::Baseline,
        label: "Base",
        tooltip: "Baseline dimensions (from origin)",
    },
    DimModeOption {
        mode: DimensionSubMode::Ordinate,
        label: "Ord",
        tooltip: "Ordinate dimensions (X/Y from datum)",
    },
];

/// Render the dimension sub-toolbar. Returns commands.
pub fn dimension_toolbar(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tc = theme::colors(state.ui.theme);

    ui.horizontal(|ui| {
        ui.colored_label(tc.text_muted, "Dim:");

        for opt in DIM_SUB_MODES {
            let is_active = state.ui.dimension_sub_mode == opt.mode;
            let response = ui.selectable_label(is_active, opt.label);
            if response.clicked() {
                cmds.push(Command::SetDimensionSubMode { mode: opt.mode });
            }
            response.on_hover_text(opt.tooltip);
        }
    });

    cmds
}
