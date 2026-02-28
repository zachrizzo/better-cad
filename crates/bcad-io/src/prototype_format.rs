//! Prototype-native project format v2.
//!
//! Format layout (ZIP archive):
//! - manifest.json
//! - project.json

use std::io::{Cursor, Read, Write};

use bcad_domain::{PrototypeProject, PROTOTYPE_FORMAT, PROTOTYPE_VERSION};
use serde::{Deserialize, Serialize};
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Manifest {
    format: String,
    version: u32,
    app: String,
}

pub fn save_project_v2(project: &PrototypeProject) -> Result<Vec<u8>, crate::IoError> {
    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let options = FileOptions::<()>::default().compression_method(zip::CompressionMethod::Deflated);

    let manifest = Manifest {
        format: PROTOTYPE_FORMAT.to_string(),
        version: PROTOTYPE_VERSION,
        app: "BetterCAD Prototype".to_string(),
    };

    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
    let project_json = serde_json::to_string_pretty(project)
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;

    zip.start_file("manifest.json", options)
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
    zip.write_all(manifest_json.as_bytes())?;

    zip.start_file("project.json", options)
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
    zip.write_all(project_json.as_bytes())?;

    let result = zip
        .finish()
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
    Ok(result.into_inner())
}

pub fn load_project_v2(data: &[u8]) -> Result<PrototypeProject, crate::IoError> {
    let cursor = Cursor::new(data);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| crate::IoError::FormatError(e.to_string()))?;

    let mut manifest_contents = String::new();
    {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
        manifest_file.read_to_string(&mut manifest_contents)?;
    }
    let manifest: Manifest = serde_json::from_str(&manifest_contents)
        .map_err(|e| crate::IoError::FormatError(format!("invalid manifest: {e}")))?;

    if manifest.format != PROTOTYPE_FORMAT {
        return Err(crate::IoError::FormatError(format!(
            "unsupported format: {}",
            manifest.format
        )));
    }
    if manifest.version != PROTOTYPE_VERSION {
        return Err(crate::IoError::FormatError(format!(
            "unsupported project version: {}",
            manifest.version
        )));
    }

    let mut project_contents = String::new();
    {
        let mut project_file = archive
            .by_name("project.json")
            .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
        project_file.read_to_string(&mut project_contents)?;
    }

    let project: PrototypeProject = serde_json::from_str(&project_contents)
        .map_err(|e| crate::IoError::FormatError(format!("invalid project payload: {e}")))?;

    Ok(project)
}

#[cfg(test)]
mod tests {
    use bcad_domain::{Element, ElementMeta, PrototypeProject, WallElement};

    use super::*;

    #[test]
    fn test_save_load_roundtrip_v2() {
        let mut project = PrototypeProject::new("Test", "m");
        project.elements.push(Element::Wall(WallElement {
            meta: ElementMeta::new("Wall 1"),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        }));

        let saved = save_project_v2(&project).expect("save should succeed");
        let loaded = load_project_v2(&saved).expect("load should succeed");

        assert_eq!(loaded.format, PROTOTYPE_FORMAT);
        assert_eq!(loaded.version, PROTOTYPE_VERSION);
        assert_eq!(loaded.elements.len(), 1);
    }

    #[test]
    fn test_load_v2_invalid_data() {
        let result = load_project_v2(b"not a zip");
        assert!(result.is_err());
    }
}
