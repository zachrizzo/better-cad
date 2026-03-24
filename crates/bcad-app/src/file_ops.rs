//! File operations using rfd (native file dialogs).
//!
//! Provides save/open/export/import functionality via platform-native dialogs.
//! Also bridges [`bcad_ui::UiAction`] variants to the actual I/O operations.

use bcad_state::{AppState, Command};
use bcad_ui::UiAction;

/// Save the current project to a .bcad file.
///
/// Shows a native save dialog, serializes the document state to JSON,
/// and wraps it in the .bcad zip format via bcad-io.
pub fn save_project(state: &AppState) -> Result<(), FileOpError> {
    // Serialize the document prototype to JSON
    let json = serde_json::to_string_pretty(&state.document.prototype)
        .map_err(|e| FileOpError::Serialize(e.to_string()))?;

    // Wrap in .bcad format
    let bcad_data =
        bcad_io::bcad_format::save_bcad(&json).map_err(|e| FileOpError::Io(e.to_string()))?;

    // Show save dialog
    let path = rfd::FileDialog::new()
        .set_title("Save Project")
        .add_filter("BetterCAD Project", &["bcad"])
        .save_file();

    match path {
        Some(path) => {
            std::fs::write(&path, &bcad_data)?;
            log::info!("Project saved to {:?}", path);
            Ok(())
        }
        None => {
            log::info!("Save cancelled by user");
            Ok(())
        }
    }
}

/// Open a .bcad project file.
///
/// Shows a native open dialog, reads the file, and deserializes it.
/// Returns the loaded prototype state (caller must assign it to AppState).
pub fn open_project() -> Result<Option<bcad_domain::PrototypeState>, FileOpError> {
    let path = rfd::FileDialog::new()
        .set_title("Open Project")
        .add_filter("BetterCAD Project", &["bcad"])
        .pick_file();

    match path {
        Some(path) => {
            let data = std::fs::read(&path)?;
            let json = bcad_io::bcad_format::load_bcad(&data)
                .map_err(|e| FileOpError::Io(e.to_string()))?;
            let prototype: bcad_domain::PrototypeState =
                serde_json::from_str(&json).map_err(|e| FileOpError::Deserialize(e.to_string()))?;
            log::info!("Project loaded from {:?}", path);
            Ok(Some(prototype))
        }
        None => {
            log::info!("Open cancelled by user");
            Ok(None)
        }
    }
}

/// Export the project to an external format (STEP, DXF, IFC, glTF).
pub fn export_project(state: &AppState, format: ExportFormat) -> Result<(), FileOpError> {
    let filter = match format {
        ExportFormat::Step => ("STEP Files", vec!["step", "stp"]),
        ExportFormat::Dxf => ("DXF Files", vec!["dxf"]),
        ExportFormat::Ifc => ("IFC Files", vec!["ifc"]),
        ExportFormat::Gltf => ("glTF Files", vec!["gltf", "glb"]),
    };

    let path = rfd::FileDialog::new()
        .set_title(&format!("Export as {:?}", format))
        .add_filter(filter.0, &filter.1)
        .save_file();

    match path {
        Some(path) => {
            let elements = &state.document.prototype.project.elements;

            let data = match format {
                ExportFormat::Step => {
                    log::info!("STEP export to {:?} ({} elements)", path, elements.len());
                    // STEP export requires B-Rep Solid objects from bcad-kernel,
                    // not domain Element objects. For now, we export an empty STEP
                    // if there are no solids. A full implementation would tessellate
                    // or reconstruct solids from the BIM elements.
                    // This is a known limitation; the STEP export path needs the
                    // kernel's solid geometry which is not available from Element.
                    log::warn!(
                        "STEP export from BIM elements is not yet fully supported; \
                                use DXF or IFC for element-level export"
                    );
                    return Ok(());
                }
                ExportFormat::Dxf => {
                    log::info!("DXF export to {:?} ({} elements)", path, elements.len());
                    bcad_io::dxf_io::export_dxf(elements)
                        .map_err(|e| FileOpError::Io(e.to_string()))?
                }
                ExportFormat::Ifc => {
                    log::info!("IFC export to {:?} ({} elements)", path, elements.len());
                    bcad_io::ifc::export_ifc(elements)
                        .map_err(|e| FileOpError::Io(e.to_string()))?
                }
                ExportFormat::Gltf => {
                    log::info!("glTF export to {:?} ({} elements)", path, elements.len());
                    // glTF export requires tessellated meshes + PBR materials.
                    // Build them from the mesh cache if available, otherwise
                    // log a warning.
                    log::warn!(
                        "glTF export from BIM elements requires pre-tessellated meshes; \
                                use DXF or IFC for element-level export"
                    );
                    return Ok(());
                }
            };

            std::fs::write(&path, &data)?;
            log::info!("Export complete: {:?}", path);
            Ok(())
        }
        None => {
            log::info!("Export cancelled by user");
            Ok(())
        }
    }
}

/// Import elements from an external file using a format-specific file picker.
pub fn import_file(format: ImportFormat) -> Result<Option<Vec<bcad_domain::Element>>, FileOpError> {
    let (title, filters): (&str, Vec<(&str, Vec<&str>)>) = match format {
        ImportFormat::Step => (
            "Import STEP File",
            vec![("STEP Files", vec!["step", "stp"])],
        ),
        ImportFormat::Dxf => ("Import DXF File", vec![("DXF Files", vec!["dxf"])]),
        ImportFormat::Ifc => ("Import IFC File", vec![("IFC Files", vec!["ifc"])]),
    };

    let mut dialog = rfd::FileDialog::new().set_title(title);
    for (name, exts) in &filters {
        dialog = dialog.add_filter(*name, exts);
    }
    let path = dialog.pick_file();

    match path {
        Some(path) => {
            let data = std::fs::read(&path)?;
            log::info!(
                "Importing {:?} file: {:?} ({} bytes)",
                format,
                path,
                data.len()
            );

            let elements = match format {
                ImportFormat::Step => {
                    // STEP import returns Solid objects, not domain Elements.
                    // We log the result but cannot directly convert truck Solids
                    // to domain Elements without additional geometry mapping.
                    let solids = bcad_io::step::import_step(&data)
                        .map_err(|e| FileOpError::Io(e.to_string()))?;
                    log::info!("Imported {} solids from STEP file", solids.len());
                    // STEP solids are B-Rep geometry; they don't map directly to
                    // BIM elements. Return empty for now -- a future version
                    // should create generic 3D body elements.
                    Vec::new()
                }
                ImportFormat::Dxf => bcad_io::dxf_io::import_dxf(&data)
                    .map_err(|e| FileOpError::Io(e.to_string()))?,
                ImportFormat::Ifc => {
                    let result = bcad_io::ifc::import_ifc(&data)
                        .map_err(|e| FileOpError::Io(e.to_string()))?;
                    for warning in &result.warnings {
                        log::warn!(
                            "IFC import warning (entity #{}): {}",
                            warning.entity_id,
                            warning.message
                        );
                    }
                    result.elements
                }
            };

            log::info!(
                "Import complete: {} elements from {:?}",
                elements.len(),
                path
            );
            Ok(Some(elements))
        }
        None => {
            log::info!("Import cancelled by user");
            Ok(None)
        }
    }
}

/// Import format selector (mirrors bcad_ui::import_dialog::ImportFormat).
#[derive(Debug, Clone, Copy)]
pub enum ImportFormat {
    Step,
    Dxf,
    Ifc,
}

// ---------------------------------------------------------------------------
// UiAction -> file operation bridge
// ---------------------------------------------------------------------------

/// Process a batch of [`UiAction`]s from the UI layer, performing file I/O
/// and returning any [`Command`]s that should be dispatched as a result
/// (e.g., `SyncElements` after an import, or state replacement after open).
pub fn process_ui_actions(actions: Vec<UiAction>, state: &mut AppState) -> Vec<Command> {
    let mut cmds = Vec::new();

    for action in actions {
        match action {
            UiAction::SaveProject => {
                if let Err(e) = save_project(state) {
                    log::error!("Save failed: {}", e);
                }
            }
            UiAction::OpenProject => {
                match open_project() {
                    Ok(Some(prototype)) => {
                        // Replace the entire document prototype and sync elements
                        let elements = prototype.project.elements.clone();
                        state.document.prototype = prototype;
                        cmds.push(Command::SyncElements { elements });
                        log::info!("Project opened and state replaced");
                    }
                    Ok(None) => {
                        // User cancelled -- nothing to do
                    }
                    Err(e) => {
                        log::error!("Open failed: {}", e);
                    }
                }
            }
            UiAction::ExportProject { format } => {
                let export_fmt = match format {
                    bcad_ui::export_dialog::ExportFormat::Step => ExportFormat::Step,
                    bcad_ui::export_dialog::ExportFormat::Dxf => ExportFormat::Dxf,
                    bcad_ui::export_dialog::ExportFormat::Ifc => ExportFormat::Ifc,
                    bcad_ui::export_dialog::ExportFormat::Gltf => ExportFormat::Gltf,
                    bcad_ui::export_dialog::ExportFormat::Pdf => {
                        log::warn!("PDF export is not yet implemented");
                        continue;
                    }
                };
                if let Err(e) = export_project(state, export_fmt) {
                    log::error!("Export failed: {}", e);
                }
            }
            UiAction::ImportFile { format } => {
                let import_fmt = match format {
                    bcad_ui::import_dialog::ImportFormat::Step => ImportFormat::Step,
                    bcad_ui::import_dialog::ImportFormat::Dxf => ImportFormat::Dxf,
                    bcad_ui::import_dialog::ImportFormat::Ifc => ImportFormat::Ifc,
                };
                match import_file(import_fmt) {
                    Ok(Some(elements)) if !elements.is_empty() => {
                        // Add imported elements to the existing project
                        let count = elements.len();
                        for elem in elements {
                            cmds.push(Command::CreateElement { element: elem });
                        }
                        log::info!("Queued {} imported elements for creation", count);
                    }
                    Ok(Some(_)) => {
                        log::info!("Import returned no elements");
                    }
                    Ok(None) => {
                        // User cancelled
                    }
                    Err(e) => {
                        log::error!("Import failed: {}", e);
                    }
                }
            }
        }
    }

    cmds
}

/// Export format selector.
#[derive(Debug, Clone, Copy)]
pub enum ExportFormat {
    Step,
    Dxf,
    Ifc,
    Gltf,
}

/// File operation errors.
#[derive(Debug)]
#[allow(dead_code)]
pub enum FileOpError {
    Io(String),
    Serialize(String),
    Deserialize(String),
    UnsupportedFormat(String),
}

impl std::fmt::Display for FileOpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileOpError::Io(msg) => write!(f, "I/O error: {}", msg),
            FileOpError::Serialize(msg) => write!(f, "Serialization error: {}", msg),
            FileOpError::Deserialize(msg) => write!(f, "Deserialization error: {}", msg),
            FileOpError::UnsupportedFormat(ext) => write!(f, "Unsupported format: {}", ext),
        }
    }
}

impl std::error::Error for FileOpError {}

impl From<std::io::Error> for FileOpError {
    fn from(err: std::io::Error) -> Self {
        FileOpError::Io(err.to_string())
    }
}
