//! Array dialog: modal for configuring linear or polar array operations.
//!
//! Mirrors `ArrayDialog.tsx`.

use bcad_state::Command;

// ---------------------------------------------------------------------------
// Array type
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArrayType {
    Linear,
    Polar,
}

impl Default for ArrayType {
    fn default() -> Self {
        Self::Linear
    }
}

// ---------------------------------------------------------------------------
// Dialog state
// ---------------------------------------------------------------------------

/// Persistent local state for the array dialog.
#[derive(Debug)]
pub struct ArrayDialogState {
    pub array_type: ArrayType,
    pub count: u32,
    // Linear
    pub spacing_x: f64,
    pub spacing_y: f64,
    // Polar
    pub center_x: f64,
    pub center_y: f64,
    pub total_angle: f64,
}

impl Default for ArrayDialogState {
    fn default() -> Self {
        Self {
            array_type: ArrayType::Linear,
            count: 4,
            spacing_x: 3.0,
            spacing_y: 0.0,
            center_x: 0.0,
            center_y: 0.0,
            total_angle: 360.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Show the array dialog as a modal window.
/// Returns (commands, should_close).
pub fn show(ctx: &egui::Context, local: &mut ArrayDialogState) -> (Vec<Command>, bool) {
    let cmds = Vec::new();
    let mut should_close = false;

    egui::Window::new("Array")
        .collapsible(false)
        .resizable(false)
        .default_width(340.0)
        .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
        .show(ctx, |ui| {
            // Type selector
            ui.horizontal(|ui| {
                if ui
                    .selectable_label(local.array_type == ArrayType::Linear, "Linear")
                    .clicked()
                {
                    local.array_type = ArrayType::Linear;
                }
                if ui
                    .selectable_label(local.array_type == ArrayType::Polar, "Polar")
                    .clicked()
                {
                    local.array_type = ArrayType::Polar;
                }
            });

            ui.add_space(8.0);

            // Count
            ui.horizontal(|ui| {
                ui.label("Count:");
                let mut count_i32 = local.count as i32;
                ui.add(
                    egui::DragValue::new(&mut count_i32)
                        .range(1..=100)
                        .speed(0.5),
                );
                local.count = count_i32.max(1) as u32;
            });

            ui.add_space(4.0);

            match local.array_type {
                ArrayType::Linear => {
                    ui.horizontal(|ui| {
                        ui.label("Spacing X (m):");
                        ui.add(
                            egui::DragValue::new(&mut local.spacing_x)
                                .speed(0.1)
                                .range(-1000.0..=1000.0),
                        );
                    });
                    ui.horizontal(|ui| {
                        ui.label("Spacing Y (m):");
                        ui.add(
                            egui::DragValue::new(&mut local.spacing_y)
                                .speed(0.1)
                                .range(-1000.0..=1000.0),
                        );
                    });
                }
                ArrayType::Polar => {
                    ui.horizontal(|ui| {
                        ui.label("Center X (m):");
                        ui.add(
                            egui::DragValue::new(&mut local.center_x)
                                .speed(0.1)
                                .range(-1000.0..=1000.0),
                        );
                    });
                    ui.horizontal(|ui| {
                        ui.label("Center Y (m):");
                        ui.add(
                            egui::DragValue::new(&mut local.center_y)
                                .speed(0.1)
                                .range(-1000.0..=1000.0),
                        );
                    });
                    ui.horizontal(|ui| {
                        ui.label("Total Angle (deg):");
                        ui.add(
                            egui::DragValue::new(&mut local.total_angle)
                                .speed(1.0)
                                .range(0.0..=360.0),
                        );
                    });
                }
            }

            ui.add_space(4.0);

            // Preview text
            let preview = match local.array_type {
                ArrayType::Linear => format!(
                    "{} copies spaced [{:.2}m, {:.2}m] apart",
                    local.count, local.spacing_x, local.spacing_y,
                ),
                ArrayType::Polar => format!(
                    "{} copies rotated around ({:.1}, {:.1}) over {:.0} degrees",
                    local.count, local.center_x, local.center_y, local.total_angle,
                ),
            };
            ui.colored_label(egui::Color32::from_rgb(0x9c, 0xa5, 0xc4), &preview);

            ui.add_space(8.0);

            // Action buttons
            ui.horizontal(|ui| {
                if ui.button("OK").clicked() {
                    // The host application reads `local` to get the params
                    // and performs the array operation.
                    should_close = true;
                }
                if ui.button("Cancel").clicked() {
                    should_close = true;
                }
            });
        });

    (cmds, should_close)
}
