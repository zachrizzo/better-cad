//! UI state types replacing `ui-store.ts`.
//!
//! Covers view mode, active tool, theme, dimension sub-mode, annotation
//! preferences, and the right-panel tab.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// ViewMode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewMode {
    TwoD,
    ThreeD,
    Split,
}

impl Default for ViewMode {
    fn default() -> Self {
        Self::TwoD
    }
}

// ---------------------------------------------------------------------------
// ToolType  (28 variants matching the TS union)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolType {
    Select,
    Foundation,
    Parking,
    Wall,
    Door,
    Floor,
    Roof,
    Stair,
    Measure,
    MeasurePath,
    MeasureAngle,
    MeasureArea,
    Window,
    Column,
    Beam,
    Room,
    Dimension,
    Text,
    Sketch,
    Section,
    Furniture,
    Plumbing,
    Electrical,
    Cabinet,
    Hvac,
    FireSafety,
    Accessibility,
    SpotElevation,
}

impl Default for ToolType {
    fn default() -> Self {
        Self::Select
    }
}

// ---------------------------------------------------------------------------
// DimensionSubMode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DimensionSubMode {
    Aligned,
    Horizontal,
    Vertical,
    Chain,
    Baseline,
    Ordinate,
}

impl Default for DimensionSubMode {
    fn default() -> Self {
        Self::Aligned
    }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Dark,
    Light,
}

impl Default for Theme {
    fn default() -> Self {
        Self::Dark
    }
}

// ---------------------------------------------------------------------------
// RightTab
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RightTab {
    Properties,
    View,
    Layers,
    Chat,
}

impl Default for RightTab {
    fn default() -> Self {
        Self::Properties
    }
}

// ---------------------------------------------------------------------------
// PlanSymbolProfileId
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanSymbolProfileId {
    OpenUsV1,
}

impl Default for PlanSymbolProfileId {
    fn default() -> Self {
        Self::OpenUsV1
    }
}

// ---------------------------------------------------------------------------
// AnnotationDensity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnnotationDensity {
    Minimal,
    Medium,
    Verbose,
}

impl Default for AnnotationDensity {
    fn default() -> Self {
        Self::Minimal
    }
}

// ---------------------------------------------------------------------------
// UiState  (the composite struct)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiState {
    pub view_mode: ViewMode,
    pub active_tool: ToolType,
    pub dimension_sub_mode: DimensionSubMode,
    pub show_grid: bool,
    pub snap_enabled: bool,
    pub selected_body_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_door_family_type_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_window_family_type_id: Option<String>,
    pub theme: Theme,
    pub active_right_tab: RightTab,
    pub plan_symbol_profile: PlanSymbolProfileId,
    pub annotation_density: AnnotationDensity,
    pub show_furniture_labels: bool,
    pub show_mep_text: bool,
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            view_mode: ViewMode::default(),
            active_tool: ToolType::default(),
            dimension_sub_mode: DimensionSubMode::default(),
            show_grid: true,
            snap_enabled: true,
            selected_body_id: None,
            active_door_family_type_id: None,
            active_window_family_type_id: None,
            theme: Theme::default(),
            active_right_tab: RightTab::default(),
            plan_symbol_profile: PlanSymbolProfileId::default(),
            annotation_density: AnnotationDensity::default(),
            show_furniture_labels: false,
            show_mep_text: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_mode_default_is_two_d() {
        assert_eq!(ViewMode::default(), ViewMode::TwoD);
    }

    #[test]
    fn active_tool_default_is_select() {
        assert_eq!(ToolType::default(), ToolType::Select);
    }

    #[test]
    fn theme_default_is_dark() {
        assert_eq!(Theme::default(), Theme::Dark);
    }

    #[test]
    fn dimension_sub_mode_default_is_aligned() {
        assert_eq!(DimensionSubMode::default(), DimensionSubMode::Aligned);
    }

    #[test]
    fn right_tab_default_is_properties() {
        assert_eq!(RightTab::default(), RightTab::Properties);
    }

    #[test]
    fn annotation_density_default_is_minimal() {
        assert_eq!(AnnotationDensity::default(), AnnotationDensity::Minimal);
    }

    #[test]
    fn ui_state_defaults() {
        let ui = UiState::default();
        assert_eq!(ui.view_mode, ViewMode::TwoD);
        assert_eq!(ui.active_tool, ToolType::Select);
        assert_eq!(ui.theme, Theme::Dark);
        assert!(ui.show_grid);
        assert!(ui.snap_enabled);
        assert!(ui.selected_body_id.is_none());
        assert!(!ui.show_furniture_labels);
        assert!(!ui.show_mep_text);
    }

    #[test]
    fn tool_type_has_at_least_25_variants() {
        // Enumerate all variants to prove at least 25 exist and compile
        let tools: Vec<ToolType> = vec![
            ToolType::Select,
            ToolType::Foundation,
            ToolType::Parking,
            ToolType::Wall,
            ToolType::Door,
            ToolType::Floor,
            ToolType::Roof,
            ToolType::Stair,
            ToolType::Measure,
            ToolType::MeasurePath,
            ToolType::MeasureAngle,
            ToolType::MeasureArea,
            ToolType::Window,
            ToolType::Column,
            ToolType::Beam,
            ToolType::Room,
            ToolType::Dimension,
            ToolType::Text,
            ToolType::Sketch,
            ToolType::Section,
            ToolType::Furniture,
            ToolType::Plumbing,
            ToolType::Electrical,
            ToolType::Cabinet,
            ToolType::Hvac,
            ToolType::FireSafety,
            ToolType::Accessibility,
            ToolType::SpotElevation,
        ];
        assert!(
            tools.len() >= 25,
            "ToolType should have at least 25 variants, got {}",
            tools.len()
        );
    }
}
