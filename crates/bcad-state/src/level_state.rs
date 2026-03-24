//! Level state replacing `level-store.ts`.
//!
//! Supports 3-state visibility (visible/ghosted/hidden), default levels,
//! and kernel sync.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// LevelVisibility
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LevelVisibility {
    Visible,
    Ghosted,
    Hidden,
}

impl Default for LevelVisibility {
    fn default() -> Self {
        Self::Visible
    }
}

impl LevelVisibility {
    /// Cycle through the 3-state visibility: visible -> ghosted -> hidden -> visible.
    pub fn next(self) -> Self {
        match self {
            Self::Visible => Self::Ghosted,
            Self::Ghosted => Self::Hidden,
            Self::Hidden => Self::Visible,
        }
    }
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Level {
    pub id: String,
    pub name: String,
    pub elevation: f64,
    pub visibility: LevelVisibility,
}

// ---------------------------------------------------------------------------
// KernelLevelSnapshot (for sync from kernel)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct KernelLevelSnapshot {
    pub id: String,
    pub name: String,
    pub elevation: f64,
}

// ---------------------------------------------------------------------------
// LevelState
// ---------------------------------------------------------------------------

pub const DEFAULT_GROUND_ID: &str = "level-ground";
pub const DEFAULT_LEVEL1_ID: &str = "level-1";
pub const DEFAULT_LEVEL2_ID: &str = "level-2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LevelState {
    pub levels: Vec<Level>,
    pub active_level_id: String,
}

impl Default for LevelState {
    fn default() -> Self {
        Self {
            levels: vec![
                Level {
                    id: DEFAULT_GROUND_ID.to_string(),
                    name: "Ground".to_string(),
                    elevation: 0.0,
                    visibility: LevelVisibility::Visible,
                },
                Level {
                    id: DEFAULT_LEVEL1_ID.to_string(),
                    name: "Level 1".to_string(),
                    elevation: 3.0,
                    visibility: LevelVisibility::Visible,
                },
                Level {
                    id: DEFAULT_LEVEL2_ID.to_string(),
                    name: "Level 2".to_string(),
                    elevation: 6.0,
                    visibility: LevelVisibility::Visible,
                },
            ],
            active_level_id: DEFAULT_GROUND_ID.to_string(),
        }
    }
}

impl LevelState {
    /// Get the active level.
    pub fn active_level(&self) -> Option<&Level> {
        self.levels.iter().find(|l| l.id == self.active_level_id)
    }

    /// Get a level's elevation (returns 0 if not found).
    pub fn level_elevation(&self, level_id: &str) -> f64 {
        self.levels
            .iter()
            .find(|l| l.id == level_id)
            .map(|l| l.elevation)
            .unwrap_or(0.0)
    }

    /// Get a level's visibility (returns Visible if not found).
    pub fn level_visibility(&self, level_id: &str) -> LevelVisibility {
        self.levels
            .iter()
            .find(|l| l.id == level_id)
            .map(|l| l.visibility)
            .unwrap_or(LevelVisibility::Visible)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_three_levels() {
        let state = LevelState::default();
        assert_eq!(state.levels.len(), 3);
    }

    #[test]
    fn default_ground_at_elevation_zero() {
        let state = LevelState::default();
        let ground = state
            .levels
            .iter()
            .find(|l| l.id == DEFAULT_GROUND_ID)
            .unwrap();
        assert!((ground.elevation - 0.0).abs() < f64::EPSILON);
        assert_eq!(ground.name, "Ground");
    }

    #[test]
    fn default_level1_at_elevation_3() {
        let state = LevelState::default();
        let level1 = state
            .levels
            .iter()
            .find(|l| l.id == DEFAULT_LEVEL1_ID)
            .unwrap();
        assert!((level1.elevation - 3.0).abs() < f64::EPSILON);
        assert_eq!(level1.name, "Level 1");
    }

    #[test]
    fn default_active_level_is_ground() {
        let state = LevelState::default();
        assert_eq!(state.active_level_id, DEFAULT_GROUND_ID);
    }

    #[test]
    fn active_level_returns_ground() {
        let state = LevelState::default();
        let active = state.active_level().unwrap();
        assert_eq!(active.id, DEFAULT_GROUND_ID);
    }

    #[test]
    fn level_elevation_returns_correct_value() {
        let state = LevelState::default();
        assert!((state.level_elevation(DEFAULT_LEVEL2_ID) - 6.0).abs() < f64::EPSILON);
    }

    #[test]
    fn level_elevation_returns_zero_for_unknown() {
        let state = LevelState::default();
        assert!((state.level_elevation("nonexistent") - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn level_visibility_default_is_visible() {
        assert_eq!(LevelVisibility::default(), LevelVisibility::Visible);
    }

    #[test]
    fn level_visibility_cycles_correctly() {
        assert_eq!(LevelVisibility::Visible.next(), LevelVisibility::Ghosted);
        assert_eq!(LevelVisibility::Ghosted.next(), LevelVisibility::Hidden);
        assert_eq!(LevelVisibility::Hidden.next(), LevelVisibility::Visible);
    }

    #[test]
    fn level_visibility_for_unknown_returns_visible() {
        let state = LevelState::default();
        assert_eq!(
            state.level_visibility("nonexistent"),
            LevelVisibility::Visible
        );
    }
}
