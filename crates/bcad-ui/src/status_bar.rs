//! Bottom status bar showing runtime info.
//!
//! Layout:
//! - Left:   kernel status dot + label, element count
//! - Center: active tool name in accent color
//! - Right:  cursor coords, snap indicator, grid indicator, unit label

use bcad_state::settings::LengthUnit;
use bcad_state::ui_state::ToolType;
use bcad_state::AppState;

use crate::theme;
use crate::widgets;

/// Render the bottom status bar. This is purely informational and
/// does not return any commands.
pub fn show(ui: &mut egui::Ui, state: &AppState) {
    let tc = theme::colors(state.ui.theme);

    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 12.0;

        // ---- LEFT section: kernel status, element count ----
        // Kernel status with green dot
        widgets::status_dot(ui, tc.success);
        ui.colored_label(
            tc.status_text,
            egui::RichText::new("Kernel: ready").size(11.0),
        );

        // Thin separator
        ui.separator();

        // Element count
        let element_count = state.document.prototype.project.elements.len();
        ui.colored_label(
            tc.status_text,
            egui::RichText::new(format!("Elements: {}", element_count)).size(11.0),
        );

        // Mesh stats (vertex + face counts from cad_meshes)
        let (total_verts, total_faces) = mesh_stats(state);
        if total_verts > 0 {
            ui.colored_label(
                tc.status_text,
                egui::RichText::new(format!("V: {}  F: {}", total_verts, total_faces)).size(11.0),
            );
        }

        ui.separator();

        // ---- CENTER section: active tool ----
        ui.colored_label(
            tc.accent,
            egui::RichText::new(tool_name(state.ui.active_tool))
                .size(11.0)
                .strong(),
        );

        ui.separator();

        // ---- RIGHT section: coords, snap, grid, units ----
        // Use right-to-left layout to push items to the right edge
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.spacing_mut().item_spacing.x = 12.0;

            // Unit display (rightmost)
            ui.colored_label(
                tc.status_text,
                egui::RichText::new(unit_label(state.settings.length_unit))
                    .size(11.0)
                    .strong(),
            );

            ui.separator();

            // Grid indicator
            let grid_text = if state.ui.show_grid { "GRID" } else { "grid" };
            let grid_color = if state.ui.show_grid {
                tc.accent
            } else {
                tc.text_muted
            };
            ui.colored_label(grid_color, egui::RichText::new(grid_text).size(11.0));

            // Snap indicator
            let snap_text = if state.ui.snap_enabled {
                "SNAP"
            } else {
                "snap"
            };
            let snap_color = if state.ui.snap_enabled {
                tc.success
            } else {
                tc.text_muted
            };
            ui.colored_label(snap_color, egui::RichText::new(snap_text).size(11.0));

            ui.separator();

            // Measurement readout (if available)
            if let Some(ref readout) = state.measurement.tool_readout {
                ui.colored_label(tc.accent, egui::RichText::new(readout).size(11.0));
                ui.separator();
            }

            // Cursor position
            let coords = if let Some(cursor) = state.measurement.cursor {
                format!(
                    "X: {:.2}  Y: {:.2}  Z: {:.2}",
                    cursor[0], cursor[1], cursor[2]
                )
            } else {
                "X: --  Y: --  Z: --".to_string()
            };
            ui.colored_label(
                tc.status_text,
                egui::RichText::new(coords)
                    .size(11.0)
                    .family(egui::FontFamily::Monospace),
            );
        });
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn tool_name(tool: ToolType) -> &'static str {
    match tool {
        ToolType::Select => "Select",
        ToolType::Foundation => "Foundation",
        ToolType::Parking => "Parking",
        ToolType::Wall => "Wall",
        ToolType::Door => "Door",
        ToolType::Floor => "Floor",
        ToolType::Roof => "Roof",
        ToolType::Stair => "Stair",
        ToolType::Measure => "Measure",
        ToolType::MeasurePath => "Measure Path",
        ToolType::MeasureAngle => "Measure Angle",
        ToolType::MeasureArea => "Measure Area",
        ToolType::Window => "Window",
        ToolType::Column => "Column",
        ToolType::Beam => "Beam",
        ToolType::Room => "Room",
        ToolType::Dimension => "Dimension",
        ToolType::Text => "Text",
        ToolType::Sketch => "Sketch",
        ToolType::Section => "Section",
        ToolType::Furniture => "Furniture",
        ToolType::Plumbing => "Plumbing",
        ToolType::Electrical => "Electrical",
        ToolType::Cabinet => "Cabinet",
        ToolType::Hvac => "HVAC",
        ToolType::FireSafety => "Fire Safety",
        ToolType::Accessibility => "Accessibility",
        ToolType::SpotElevation => "Spot Elevation",
    }
}

fn unit_label(unit: LengthUnit) -> &'static str {
    match unit {
        LengthUnit::Mm => "mm",
        LengthUnit::Cm => "cm",
        LengthUnit::M => "m",
        LengthUnit::In => "in",
        LengthUnit::Ft => "ft",
    }
}

/// Sum up vertex and face counts from all cached CAD meshes.
fn mesh_stats(state: &AppState) -> (usize, usize) {
    let mut verts = 0usize;
    let mut faces = 0usize;
    for mesh in state.document.cad_meshes.values() {
        verts += mesh.positions.len() / 3;
        faces += mesh.indices.len() / 3;
    }
    (verts, faces)
}
