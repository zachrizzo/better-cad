//! Constraint panel for sketch mode.
//!
//! Shows a 3x3 grid of constraint mode buttons, a constraint list with
//! delete capability, solver status indicator, and a value input field
//! for Distance and Angle constraints.

use bcad_state::sketch_state::{ConstraintStatus, SketchConstraintMode, SketchConstraintType};
use bcad_state::{AppState, Command};

use crate::theme;

// Transient UI-only state for the constraint value input field.
std::thread_local! {
    static CONSTRAINT_VALUE: std::cell::RefCell<String> = std::cell::RefCell::new(String::new());
}

/// A descriptor for one constraint mode button.
struct ConstraintBtn {
    mode: SketchConstraintMode,
    label: &'static str,
    tooltip: &'static str,
}

const CONSTRAINT_BUTTONS: [ConstraintBtn; 9] = [
    ConstraintBtn {
        mode: SketchConstraintMode::Coincident,
        label: "Coinc",
        tooltip: "Coincident: merge two points",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Horizontal,
        label: "Horiz",
        tooltip: "Horizontal: constrain line to horizontal",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Vertical,
        label: "Vert",
        tooltip: "Vertical: constrain line to vertical",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Distance,
        label: "Dist",
        tooltip: "Distance: set distance between points",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Fixed,
        label: "Fixed",
        tooltip: "Fixed: lock point position",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Perpendicular,
        label: "Perp",
        tooltip: "Perpendicular: 90-degree angle between lines",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Parallel,
        label: "Para",
        tooltip: "Parallel: make lines parallel",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Angle,
        label: "Angle",
        tooltip: "Angle: set angle between lines",
    },
    ConstraintBtn {
        mode: SketchConstraintMode::Equal,
        label: "Equal",
        tooltip: "Equal: make two lengths equal",
    },
];

/// Render the constraint panel. Returns commands.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let tc = theme::colors(state.ui.theme);

    ui.heading("Constraints");
    ui.add_space(4.0);

    // ---- Solver status indicator ----
    let (status_text, status_color) = match state.sketch.solver_status {
        ConstraintStatus::WellConstrained => (
            "Fully Constrained",
            egui::Color32::from_rgb(0x16, 0xa3, 0x4a),
        ),
        ConstraintStatus::OverConstrained => ("Over-Constrained", tc.danger),
        ConstraintStatus::UnderConstrained => ("Under-Constrained", tc.text_muted),
    };
    ui.horizontal(|ui| {
        ui.colored_label(tc.text_secondary, "Solver:");
        ui.colored_label(status_color, status_text);
    });
    ui.add_space(4.0);

    // ---- 3x3 constraint mode grid ----
    ui.label(egui::RichText::new("Constraint Mode").strong().size(12.0));
    ui.add_space(2.0);

    let active_mode = state.sketch.constraint_mode;

    egui::Grid::new("constraint_grid")
        .num_columns(3)
        .spacing([4.0, 4.0])
        .show(ui, |ui| {
            for (i, btn) in CONSTRAINT_BUTTONS.iter().enumerate() {
                let is_active = active_mode == btn.mode;
                let response = ui.add_sized(
                    [64.0, 24.0],
                    egui::SelectableLabel::new(is_active, btn.label),
                );
                if response.clicked() {
                    let new_mode = if is_active {
                        SketchConstraintMode::None
                    } else {
                        btn.mode
                    };
                    cmds.push(Command::SetSketchConstraintMode { mode: new_mode });
                }
                response.on_hover_text(btn.tooltip);

                // New row after every 3 buttons
                if (i + 1) % 3 == 0 {
                    ui.end_row();
                }
            }
        });

    ui.add_space(8.0);

    // ---- Value input for Distance / Angle ----
    let needs_value = matches!(
        active_mode,
        SketchConstraintMode::Distance | SketchConstraintMode::Angle
    );
    if needs_value {
        let value_label = match active_mode {
            SketchConstraintMode::Distance => "Distance value:",
            SketchConstraintMode::Angle => "Angle (degrees):",
            _ => "Value:",
        };
        ui.horizontal(|ui| {
            ui.label(value_label);
            CONSTRAINT_VALUE.with(|val| {
                let mut buf = val.borrow_mut();
                ui.add_sized(
                    [80.0, 20.0],
                    egui::TextEdit::singleline(&mut *buf).hint_text("0.0"),
                );
            });
        });
        ui.add_space(4.0);
    }

    ui.separator();

    // ---- Constraint list ----
    ui.label(
        egui::RichText::new("Active Constraints")
            .strong()
            .size(12.0),
    );
    ui.add_space(2.0);

    if state.sketch.constraints.is_empty() {
        ui.colored_label(tc.text_muted, "No constraints applied.");
    } else {
        // Sort constraints by id for stable ordering
        let mut sorted: Vec<_> = state.sketch.constraints.values().collect();
        sorted.sort_by(|a, b| a.id.cmp(&b.id));

        for constraint in sorted {
            let type_label = constraint_type_label(constraint.constraint_type);
            let value_str = constraint
                .value
                .map(|v| format!(" = {:.2}", v))
                .unwrap_or_default();

            ui.horizontal(|ui| {
                // Type + value
                let label = format!("{}{}", type_label, value_str);
                ui.colored_label(tc.text_secondary, &label);

                // Delete button
                if ui
                    .add(
                        egui::Button::new(egui::RichText::new("X").color(tc.danger).small())
                            .frame(false)
                            .min_size(egui::vec2(16.0, 16.0)),
                    )
                    .on_hover_text("Remove constraint")
                    .clicked()
                {
                    cmds.push(Command::RemoveSketchConstraint {
                        id: constraint.id.clone(),
                    });
                }
            });
        }
    }

    ui.add_space(8.0);

    // ---- Quick actions ----
    ui.horizontal(|ui| {
        if ui
            .button("Solve")
            .on_hover_text("Re-run constraint solver")
            .clicked()
        {
            cmds.push(Command::RunSketchSolver);
        }
        if ui
            .button("Clear All")
            .on_hover_text("Remove all constraints")
            .clicked()
        {
            // Remove each constraint individually
            let ids: Vec<String> = state.sketch.constraints.keys().cloned().collect();
            for id in ids {
                cmds.push(Command::RemoveSketchConstraint { id });
            }
        }
    });

    cmds
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn constraint_type_label(ct: SketchConstraintType) -> &'static str {
    match ct {
        SketchConstraintType::Coincident => "Coincident",
        SketchConstraintType::Horizontal => "Horizontal",
        SketchConstraintType::Vertical => "Vertical",
        SketchConstraintType::Distance => "Distance",
        SketchConstraintType::Fixed => "Fixed",
        SketchConstraintType::Perpendicular => "Perpendicular",
        SketchConstraintType::Parallel => "Parallel",
        SketchConstraintType::Angle => "Angle",
        SketchConstraintType::Equal => "Equal",
    }
}
