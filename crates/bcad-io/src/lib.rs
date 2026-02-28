pub mod step;
pub mod dxf_io;
pub mod ifc;
pub mod gltf_export;
pub mod bcad_format;

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
