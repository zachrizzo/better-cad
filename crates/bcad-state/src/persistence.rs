//! Persistence layer: save/load settings as TOML.
//!
//! Replaces the Zustand `persist` middleware for:
//! - settings-store
//! - bim-store (defaults only)
//! - level-store
//! - view-store

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::bim_defaults::BimDefaults;
use crate::level_state::LevelState;
use crate::settings::SettingsState;
use crate::view_state::SavedView;

// ---------------------------------------------------------------------------
// Persisted data structure
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedPreferences {
    pub settings: SettingsState,
    pub bim_defaults: BimDefaults,
    pub levels: LevelState,
    pub views: ViewStatePersisted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewStatePersisted {
    #[serde(default)]
    pub views: Vec<SavedView>,
}

// ---------------------------------------------------------------------------
// Platform-specific preferences directory
// ---------------------------------------------------------------------------

/// Returns the platform-specific preferences directory for BetterCAD.
/// Uses the `dirs` crate for reliable cross-platform paths.
pub fn preferences_dir() -> PathBuf {
    if let Some(config) = dirs::config_dir() {
        config.join("BetterCAD")
    } else {
        // Fallback: use home directory.
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".bettercad")
    }
}

const PREFERENCES_FILE: &str = "preferences.toml";

/// Full path to the preferences file.
pub fn preferences_path() -> PathBuf {
    preferences_dir().join(PREFERENCES_FILE)
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/// Load preferences from disk. Returns `None` if the file doesn't exist.
pub fn load_preferences() -> Result<Option<PersistedPreferences>, PersistError> {
    let path = preferences_path();
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)?;
    let prefs: PersistedPreferences = toml::from_str(&content)?;
    Ok(Some(prefs))
}

/// Save preferences to disk, creating the directory if needed.
pub fn save_preferences(prefs: &PersistedPreferences) -> Result<(), PersistError> {
    let dir = preferences_dir();
    std::fs::create_dir_all(&dir)?;
    let content = toml::to_string_pretty(prefs)?;
    let path = dir.join(PREFERENCES_FILE);
    std::fs::write(&path, content)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum PersistError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("TOML serialize error: {0}")]
    TomlSer(#[from] toml::ser::Error),
    #[error("TOML deserialize error: {0}")]
    TomlDe(#[from] toml::de::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_prefs() -> PersistedPreferences {
        PersistedPreferences {
            settings: SettingsState::default(),
            bim_defaults: BimDefaults::default(),
            levels: LevelState::default(),
            views: ViewStatePersisted { views: Vec::new() },
        }
    }

    #[test]
    fn round_trip_default_preferences() {
        let prefs = default_prefs();
        let toml_str = toml::to_string_pretty(&prefs).expect("serialize failed");
        let deserialized: PersistedPreferences =
            toml::from_str(&toml_str).expect("deserialize failed");

        // Verify key fields survive round-trip
        assert_eq!(
            deserialized.settings.length_unit,
            prefs.settings.length_unit
        );
        assert_eq!(
            deserialized.settings.lighting_preset,
            prefs.settings.lighting_preset
        );
        assert!(
            (deserialized.bim_defaults.wall_height - prefs.bim_defaults.wall_height).abs()
                < f64::EPSILON
        );
        assert!(
            (deserialized.bim_defaults.door_width - prefs.bim_defaults.door_width).abs()
                < f64::EPSILON
        );
        assert_eq!(
            deserialized.bim_defaults.stair_risers,
            prefs.bim_defaults.stair_risers
        );
        assert_eq!(deserialized.levels.levels.len(), prefs.levels.levels.len());
        assert_eq!(
            deserialized.levels.active_level_id,
            prefs.levels.active_level_id
        );
        assert_eq!(deserialized.views.views.len(), 0);
    }

    #[test]
    fn default_settings_serialize_to_valid_toml() {
        let prefs = default_prefs();
        let toml_str = toml::to_string_pretty(&prefs).expect("serialize failed");
        // Verify it's non-empty and contains expected keys
        assert!(!toml_str.is_empty());
        assert!(toml_str.contains("wall_height"));
        assert!(toml_str.contains("length_unit"));
        assert!(toml_str.contains("levels"));
    }

    #[test]
    fn round_trip_with_saved_view() {
        use crate::view_state::{CardinalDirection, SavedView, SavedViewType};

        let prefs = PersistedPreferences {
            settings: SettingsState::default(),
            bim_defaults: BimDefaults::default(),
            levels: LevelState::default(),
            views: ViewStatePersisted {
                views: vec![SavedView {
                    id: "view-1".to_string(),
                    name: "North Elevation".to_string(),
                    view_type: SavedViewType::Elevation,
                    cut_line_start: None,
                    cut_line_end: None,
                    direction: Some(CardinalDirection::North),
                    camera_position: [10.0, 5.0, 0.0],
                    camera_target: [0.0, 0.0, 0.0],
                }],
            },
        };
        let toml_str = toml::to_string_pretty(&prefs).expect("serialize failed");
        let deserialized: PersistedPreferences =
            toml::from_str(&toml_str).expect("deserialize failed");
        assert_eq!(deserialized.views.views.len(), 1);
        assert_eq!(deserialized.views.views[0].name, "North Elevation");
    }

    #[test]
    fn preferences_path_ends_with_toml() {
        let path = preferences_path();
        assert!(
            path.to_string_lossy().ends_with("preferences.toml"),
            "path should end with preferences.toml, got: {:?}",
            path
        );
    }
}
