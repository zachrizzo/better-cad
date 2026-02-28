//! Native .bcad file format (zipped JSON metadata + model document).
//!
//! The .bcad format bundles the full project document and metadata
//! into a single compressed ZIP archive.

use std::io::{Cursor, Read, Write};
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

pub fn save_bcad(project_json: &str) -> Result<Vec<u8>, crate::IoError> {
    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let options = FileOptions::<()>::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("metadata.json", options)
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
    zip.write_all(br#"{"version":"0.1","app":"BetterCAD"}"#)?;

    zip.start_file("model.json", options)
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
    zip.write_all(project_json.as_bytes())?;

    let result = zip
        .finish()
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;
    Ok(result.into_inner())
}

pub fn load_bcad(data: &[u8]) -> Result<String, crate::IoError> {
    let cursor = Cursor::new(data);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| crate::IoError::FormatError(e.to_string()))?;

    let mut file = archive
        .by_name("model.json")
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_load_roundtrip() {
        let original = r#"{"objects":[{"type":"box","width":1}]}"#;
        let saved = save_bcad(original).expect("save should succeed");
        let loaded = load_bcad(&saved).expect("load should succeed");
        assert_eq!(loaded, original);
    }

    #[test]
    fn test_load_invalid_data() {
        let result = load_bcad(b"not a zip file");
        assert!(result.is_err());
    }
}
