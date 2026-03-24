pub mod document;
pub mod error;
pub mod geometry;
pub mod materials;
pub mod tessellation;
pub mod topology;

/// Smoke-test entry point.
pub fn ping() -> &'static str {
    "bcad-kernel pong"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(ping(), "bcad-kernel pong");
    }
}
