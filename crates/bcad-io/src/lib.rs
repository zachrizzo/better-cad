pub mod step;
pub mod dxf_io;
pub mod ifc;
pub mod gltf_export;
pub mod bcad_format;

/// I/O error type for file import/export operations.
#[derive(Debug, thiserror::Error)]
pub enum IoError {
    #[error("Format error: {0}")]
    FormatError(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Smoke-test entry point.
pub fn ping() -> &'static str {
    "bcad-io pong"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(ping(), "bcad-io pong");
    }
}
