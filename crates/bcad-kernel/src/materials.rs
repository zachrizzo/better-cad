//! PBR material definitions for rendering.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A physically-based rendering (PBR) material.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PbrMaterial {
    /// Unique identifier for this material.
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// Base color as RGBA, each component in [0.0, 1.0].
    pub base_color: [f32; 4],
    /// Metallic factor in [0.0, 1.0].
    pub metallic: f32,
    /// Roughness factor in [0.0, 1.0].
    pub roughness: f32,
}

impl PbrMaterial {
    pub fn new(name: &str, base_color: [f32; 4], metallic: f32, roughness: f32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            base_color,
            metallic,
            roughness,
        }
    }
}

/// Built-in material library.
pub struct MaterialLibrary {
    pub materials: Vec<PbrMaterial>,
}

impl MaterialLibrary {
    /// Create the default library with 6 architectural materials.
    pub fn default_library() -> Self {
        Self {
            materials: vec![
                PbrMaterial::new("Concrete", [0.6, 0.6, 0.6, 1.0], 0.0, 0.9),
                PbrMaterial::new("Glass", [0.8, 0.9, 1.0, 0.3], 0.1, 0.05),
                PbrMaterial::new("Wood Oak", [0.6, 0.4, 0.2, 1.0], 0.0, 0.7),
                PbrMaterial::new("Steel", [0.8, 0.8, 0.85, 1.0], 0.95, 0.3),
                PbrMaterial::new("Brick", [0.7, 0.3, 0.2, 1.0], 0.0, 0.85),
                PbrMaterial::new("White Plaster", [0.95, 0.93, 0.9, 1.0], 0.0, 0.8),
            ],
        }
    }

    pub fn get_by_name(&self, name: &str) -> Option<&PbrMaterial> {
        self.materials.iter().find(|m| m.name == name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_library_has_six_materials() {
        let lib = MaterialLibrary::default_library();
        assert_eq!(lib.materials.len(), 6);
    }

    #[test]
    fn test_get_by_name_steel() {
        let lib = MaterialLibrary::default_library();
        let steel = lib.get_by_name("Steel").expect("Steel should exist");
        assert_eq!(steel.name, "Steel");
        assert!(steel.metallic > 0.9);
    }

    #[test]
    fn test_get_by_name_not_found() {
        let lib = MaterialLibrary::default_library();
        assert!(lib.get_by_name("Nonexistent").is_none());
    }

    #[test]
    fn test_material_ids_are_unique() {
        let lib = MaterialLibrary::default_library();
        let ids: Vec<&str> = lib.materials.iter().map(|m| m.id.as_str()).collect();
        for (i, id) in ids.iter().enumerate() {
            for (j, other) in ids.iter().enumerate() {
                if i != j {
                    assert_ne!(id, other, "duplicate material id");
                }
            }
        }
    }
}
