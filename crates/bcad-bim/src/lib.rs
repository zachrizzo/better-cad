pub mod wall;
pub mod opening;
pub mod slab;
pub mod plan_view;

/// Smoke-test entry point.
pub fn ping() -> &'static str {
    "bcad-bim pong"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping() {
        assert_eq!(ping(), "bcad-bim pong");
    }
}
