pub mod constraint;
pub mod equations;
pub mod sketch;
pub mod solver;

/// Smoke-test entry point.
pub fn ping() -> &'static str {
    "bcad-constraint pong"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(ping(), "bcad-constraint pong");
    }
}
