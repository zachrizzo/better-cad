//! IFC (Industry Foundation Classes) import/export.
//!
//! Will use ifc_rs once integrated. Currently stubbed.

pub fn import_ifc(_data: &[u8]) -> Result<(), crate::IoError> {
    Err(crate::IoError::FormatError(
        "IFC import not yet implemented".into(),
    ))
}
