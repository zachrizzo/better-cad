//! Measurement snap settings panel for Measure/Dimension tools.

use bcad_state::settings::{MeasurementSnapMode, MeasurementSnapTool};
use bcad_state::{AppState, Command};

/// Show measurement snap mode settings for the given tool.
/// Returns commands for toggled snap modes.
pub fn show(ui: &mut egui::Ui, state: &AppState, tool: MeasurementSnapTool) -> Vec<Command> {
    let mut cmds = Vec::new();

    let snap_settings = &state.settings.measurement_snap_settings;
    let modes = match tool {
        MeasurementSnapTool::Measure => &snap_settings.measure,
        MeasurementSnapTool::Dimension => &snap_settings.dimension,
    };

    ui.label(egui::RichText::new("Snap Modes").strong().size(13.0));

    if !state.ui.snap_enabled {
        ui.label(
            egui::RichText::new("Snap is off globally. Press S to enable.")
                .weak()
                .italics(),
        );
    }

    // Grid of snap mode checkboxes
    let snap_modes: &[(MeasurementSnapMode, &str, bool)] = &[
        (MeasurementSnapMode::Endpoint, "Endpoint", modes.endpoint),
        (MeasurementSnapMode::Midpoint, "Midpoint", modes.midpoint),
        (
            MeasurementSnapMode::Intersection,
            "Intersection",
            modes.intersection,
        ),
        (MeasurementSnapMode::Center, "Center", modes.center),
        (MeasurementSnapMode::Nearest, "Nearest", modes.nearest),
    ];

    for &(mode, label, current) in snap_modes {
        let mut checked = current;
        let response = ui.add_enabled(
            state.ui.snap_enabled,
            egui::Checkbox::new(&mut checked, label),
        );
        if response.changed() {
            cmds.push(Command::SetMeasurementSnapMode {
                tool,
                mode,
                enabled: checked,
            });
        }
    }

    cmds
}
