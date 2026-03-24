//! Sub-toolbars for Sketch and Dimension modes.
//!
//! These appear as a secondary horizontal bar below the main menu bar
//! when the respective tool is active.

use bcad_state::sketch_state::{ConstraintStatus, SketchDrawMode};
use bcad_state::ui_state::DimensionSubMode;
use bcad_state::{AppState, Command};

use crate::theme;

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
