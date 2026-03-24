//! Core types for the PDF export system.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Paper sizes
// ---------------------------------------------------------------------------

/// Supported paper sizes for construction document export.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PaperSize {
    /// 24" x 36" (609.6 x 914.4 mm)
    ArchD,
    /// 594 x 841 mm
    A1,
    /// 11" x 17" (279.4 x 431.8 mm)
    Tabloid,
    /// 8.5" x 11" (215.9 x 279.4 mm)
    Letter,
}

impl PaperSize {
    /// Returns (width, height) in mm in landscape orientation (width > height).
    pub fn dimensions_mm(&self) -> (f64, f64) {
        match self {
            PaperSize::ArchD => (914.4, 609.6),
            PaperSize::A1 => (841.0, 594.0),
            PaperSize::Tabloid => (431.8, 279.4),
            PaperSize::Letter => (279.4, 215.9),
        }
    }
}

impl Default for PaperSize {
    fn default() -> Self {
        PaperSize::Letter
    }
}

// ---------------------------------------------------------------------------
// Sheet types
// ---------------------------------------------------------------------------

/// The type of drawing sheet to include in the export.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SheetType {
    FloorPlan,
    ElectricalPlan,
    PlumbingPlan,
    ReflectedCeiling,
    SitePlan,
    Elevations,
    Schedules,
}

impl SheetType {
    /// Human-readable label for the sheet type.
    pub fn label(&self) -> &'static str {
        match self {
            SheetType::FloorPlan => "Floor Plan",
            SheetType::ElectricalPlan => "Electrical Plan",
            SheetType::PlumbingPlan => "Plumbing Plan",
            SheetType::ReflectedCeiling => "Reflected Ceiling Plan",
            SheetType::SitePlan => "Site Plan",
            SheetType::Elevations => "Elevations",
            SheetType::Schedules => "Schedules",
        }
    }

    /// Sheet number prefix (discipline code).
    pub fn prefix(&self) -> &'static str {
        match self {
            SheetType::FloorPlan => "A",
            SheetType::ElectricalPlan => "E",
            SheetType::PlumbingPlan => "P",
            SheetType::ReflectedCeiling => "A",
            SheetType::SitePlan => "C",
            SheetType::Elevations => "A",
            SheetType::Schedules => "A",
        }
    }

    /// Base sheet number for numbering within the discipline.
    pub fn base_number(&self) -> u32 {
        match self {
            SheetType::Schedules => 600,
            SheetType::Elevations => 200,
            _ => 100,
        }
    }

    /// The set of AEC layers visible on this sheet type.
    pub fn visible_layers(&self) -> &'static [&'static str] {
        match self {
            SheetType::FloorPlan => &[
                "A-WALL", "A-DOOR", "A-WIND", "A-FLOR", "A-STRS", "A-COLS", "G-DIMS", "G-ANNO",
                "G-TAGS",
            ],
            SheetType::ElectricalPlan => {
                &["A-WALL", "A-DOOR", "A-WIND", "E-POWR", "E-LITE", "G-DIMS"]
            }
            SheetType::PlumbingPlan => &["A-WALL", "A-DOOR", "A-WIND", "P-FIXT", "G-DIMS"],
            SheetType::ReflectedCeiling => &["A-WALL", "A-CLNG", "E-LITE", "G-DIMS"],
            SheetType::SitePlan => &["L-SITE", "A-WALL", "G-ANNO"],
            SheetType::Elevations => &[],
            SheetType::Schedules => &[],
        }
    }
}

/// Generate a sheet number like "A-101" from the sheet type and index.
pub fn generate_sheet_number(sheet_type: SheetType, index: u32) -> String {
    format!(
        "{}-{}",
        sheet_type.prefix(),
        sheet_type.base_number() + index + 1
    )
}

// ---------------------------------------------------------------------------
// Project / sheet metadata
// ---------------------------------------------------------------------------

/// Project-level information displayed in the title block.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub project_name: String,
    pub project_address: String,
    pub client_name: String,
    pub architect_name: String,
    pub architect_license: String,
    pub date: String,
    pub project_number: String,
}

/// A single revision entry displayed in the revision table.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RevisionEntry {
    pub number: String,
    pub date: String,
    pub description: String,
}

/// Per-sheet metadata for the title block.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetInfo {
    pub sheet_number: String,
    pub sheet_title: String,
    pub scale: String,
    pub revisions: Vec<RevisionEntry>,
}

// ---------------------------------------------------------------------------
// Export options
// ---------------------------------------------------------------------------

/// Top-level configuration for a PDF export operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfExportOptions {
    pub paper_size: PaperSize,
    /// Architectural scale string, e.g. "1:100" or "1/4\" = 1'-0\"".
    pub scale: String,
    /// Which sheets to include in the document set.
    pub sheets: Vec<SheetType>,
    /// Project metadata for the title block.
    pub project_info: ProjectInfo,
    /// Whether to render the title block on each sheet.
    pub show_title_block: bool,
}

impl Default for PdfExportOptions {
    fn default() -> Self {
        Self {
            paper_size: PaperSize::Letter,
            scale: "1:100".to_string(),
            sheets: vec![SheetType::FloorPlan],
            project_info: ProjectInfo::default(),
            show_title_block: true,
        }
    }
}

// ---------------------------------------------------------------------------
// Lineweight system (mm on paper)
// ---------------------------------------------------------------------------

/// ISO 128 standard architectural lineweights in mm on paper.
///
/// Values follow the ISO 128 pen weight series (1 : sqrt(2) progression).
pub struct Lineweights;

impl Lineweights {
    /// Exterior walls at section cut -- 0.50 mm (ISO 128 Heavy).
    pub const WALL_CUT_EXTERIOR: f64 = 0.50;
    /// Interior walls at section cut -- 0.35 mm (ISO 128 Wide).
    pub const WALL_CUT_INTERIOR: f64 = 0.35;
    /// Legacy alias: heaviest wall cut weight (exterior).
    pub const WALL_CUT: f64 = 0.50;
    /// Walls beyond the cut plane -- 0.25 mm (ISO 128 Medium).
    pub const WALL_BEYOND: f64 = 0.25;
    /// Door leaf / window frame at cut -- 0.35 mm (ISO 128 Wide).
    pub const DOOR_LEAF: f64 = 0.35;
    /// Door swing arc / window glass lines -- 0.25 mm (ISO 128 Medium).
    pub const DOOR_SWING: f64 = 0.25;
    /// Window frame at cut -- 0.35 mm (ISO 128 Wide).
    pub const WINDOW_FRAME: f64 = 0.35;
    /// Window glass lines -- 0.25 mm (ISO 128 Medium).
    pub const WINDOW_GLASS: f64 = 0.25;
    /// Legacy alias for backward compatibility.
    pub const DOOR_WINDOW: f64 = 0.35;
    /// Column outline at cut -- 0.50 mm (ISO 128 Heavy).
    pub const COLUMN_OUTLINE: f64 = 0.50;
    /// Stair treads -- 0.25 mm (ISO 128 Medium).
    pub const STAIR_TREAD: f64 = 0.25;
    /// Stair direction arrow -- 0.18 mm (ISO 128 Fine).
    pub const STAIR_ARROW: f64 = 0.18;
    /// Dimension lines -- 0.18 mm (ISO 128 Fine).
    pub const DIMENSION: f64 = 0.18;
    /// Extension lines -- 0.13 mm (ISO 128 ExtraFine).
    pub const EXTENSION: f64 = 0.13;
    /// Tick marks on dimensions -- 0.25 mm (ISO 128 Medium).
    pub const TICK_MARK: f64 = 0.25;
    /// Hidden (dashed) lines -- 0.13 mm (ISO 128 ExtraFine).
    pub const HIDDEN: f64 = 0.13;
    /// Centre / construction lines -- 0.13 mm (ISO 128 ExtraFine).
    pub const CENTERLINE: f64 = 0.13;
    /// Hatching / poche patterns -- 0.13 mm (ISO 128 ExtraFine).
    pub const HATCH: f64 = 0.13;
    /// Text leaders -- 0.18 mm (ISO 128 Fine).
    pub const TEXT_LEADER: f64 = 0.18;
    /// Outer drawing border -- 0.70 mm (ISO 128 ExtraHeavy).
    pub const BORDER: f64 = 0.70;
    /// Inner drawing border -- 0.25 mm (ISO 128 Medium).
    pub const BORDER_INNER: f64 = 0.25;
}

// ---------------------------------------------------------------------------
// Architectural scales
// ---------------------------------------------------------------------------

/// Parse a scale string into a numeric scale factor.
///
/// Supports metric "1:N" notation (returns 1/N) and imperial architectural
/// notation like `1/4" = 1'-0"` (returns fraction_inches / 12).
pub fn parse_scale(scale_str: &str) -> f64 {
    // Try metric 1:N
    if let Some(rest) = scale_str.strip_prefix("1:") {
        if let Ok(n) = rest.trim().parse::<f64>() {
            if n > 0.0 {
                return 1.0 / n;
            }
        }
    }

    // Imperial architectural scales lookup
    match scale_str {
        "1/8\" = 1'-0\"" => 1.0 / 96.0,
        "3/16\" = 1'-0\"" => 1.0 / 64.0,
        "1/4\" = 1'-0\"" => 1.0 / 48.0,
        "3/8\" = 1'-0\"" => 1.0 / 32.0,
        "1/2\" = 1'-0\"" => 1.0 / 24.0,
        "1\" = 1'-0\"" => 1.0 / 12.0,
        _ => 1.0 / 100.0, // default
    }
}

// ---------------------------------------------------------------------------
// Layer assignment for elements
// ---------------------------------------------------------------------------

/// Maps an element kind name to its default AEC layer.
///
/// Note: a parallel mapping exists in `bcad_state::selection::kind_to_layer`
/// (returning `Option`). Keep both in sync when adding new element kinds.
pub fn kind_to_layer(kind: &str) -> &'static str {
    match kind {
        "wall" => "A-WALL",
        "door" => "A-DOOR",
        "window" => "A-WIND",
        "floor" => "A-FLOR",
        "roof" => "A-ROOF",
        "stair" => "A-STRS",
        "column" => "A-COLS",
        "beam" => "A-BEAM",
        "foundation" => "A-FNDN",
        "electrical" => "E-POWR",
        "plumbing" => "P-FIXT",
        "furniture" => "F-FURN",
        "site_detail" => "L-SITE",
        "dimension" => "G-DIMS",
        "text_annotation" | "leader_annotation" | "keynote" => "G-ANNO",
        "tag" => "G-TAGS",
        "room" | "level" => "A-FLOR",
        _ => "",
    }
}
