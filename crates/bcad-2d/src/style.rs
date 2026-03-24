//! Drawing style system -- ISO 128 / NCS architectural drafting standards.
//!
//! This module provides pen weights, line types, drawing scales, text roles,
//! and domain colours following ISO 128 (technical drawings -- general
//! principles of presentation) and ISO 3098 (text standards).
//!
//! ## Migration from `SymbolLineClass`
//!
//! The old four-weight `SymbolLineClass` enum is retained as a **deprecated
//! type alias** that maps to `PenWeight`:
//!
//! | Old variant           | New variant       |
//! |-----------------------|-------------------|
//! | `SymbolLineClass::Cut`        | `PenWeight::Heavy`     |
//! | `SymbolLineClass::Primary`    | `PenWeight::Wide`      |
//! | `SymbolLineClass::Secondary`  | `PenWeight::Medium`    |
//! | `SymbolLineClass::Annotation` | `PenWeight::Fine`      |

use serde::{Deserialize, Serialize};

use crate::primitives::SymbolPrimitive;

// ---------------------------------------------------------------------------
// PenWeight -- ISO 128 standard pen series
// ---------------------------------------------------------------------------

/// ISO 128 standard pen weight series.
///
/// The six weights follow the 1 : sqrt(2) progression used in international
/// drafting standards.  Each variant stores an exact millimetre value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PenWeight {
    /// 0.13 mm -- hatching, grids, construction lines.
    ExtraFine,
    /// 0.18 mm -- dimension lines, extension lines, leaders, centerlines, text.
    Fine,
    /// 0.25 mm -- furniture, fixtures, doors/windows in projection, hidden lines.
    Medium,
    /// 0.35 mm -- interior walls at cut, doors/windows at cut.
    Wide,
    /// 0.50 mm -- exterior walls at cut, columns at cut, floor edges.
    Heavy,
    /// 0.70 mm -- section cut lines, ground lines, drawing borders.
    ExtraHeavy,
}

impl PenWeight {
    /// Pen width in millimetres on paper (ISO 128 standard series).
    pub fn mm(self) -> f64 {
        match self {
            Self::ExtraFine => 0.13,
            Self::Fine => 0.18,
            Self::Medium => 0.25,
            Self::Wide => 0.35,
            Self::Heavy => 0.50,
            Self::ExtraHeavy => 0.70,
        }
    }

    /// Pen width in PDF/PostScript points (1 pt = 0.3528 mm).
    pub fn points(self) -> f64 {
        self.mm() / 0.3528
    }

    /// Pen width in screen pixels at the given zoom level.
    ///
    /// The base mapping assumes 96 DPI (1 px ~= 0.2646 mm).  At `zoom = 1.0`
    /// the result is the physical-size equivalent; higher zoom scales linearly.
    pub fn screen_px(self, zoom: f32) -> f32 {
        // mm / 0.2646 gives base px, then scale by zoom
        (self.mm() as f32 / 0.2646) * zoom
    }
}

// ---------------------------------------------------------------------------
// SymbolLineClass -- deprecated backward-compat alias
// ---------------------------------------------------------------------------

/// **Deprecated.** Use [`PenWeight`] instead.
///
/// This enum is kept for backward compatibility during migration.  Each
/// variant maps directly to a [`PenWeight`] value:
///
/// * `Cut` -> `PenWeight::Heavy`
/// * `Primary` -> `PenWeight::Wide`
/// * `Secondary` -> `PenWeight::Medium`
/// * `Annotation` -> `PenWeight::Fine`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SymbolLineClass {
    /// Sectional cut lines (heaviest weight).  Maps to `PenWeight::Heavy`.
    Cut,
    /// Primary visible outlines.  Maps to `PenWeight::Wide`.
    Primary,
    /// Internal detail / secondary geometry.  Maps to `PenWeight::Medium`.
    Secondary,
    /// Text leaders, dimension lines, and annotations.  Maps to `PenWeight::Fine`.
    Annotation,
}

impl SymbolLineClass {
    /// Convert to the new ISO 128 [`PenWeight`].
    pub fn to_pen_weight(self) -> PenWeight {
        match self {
            Self::Cut => PenWeight::Heavy,
            Self::Primary => PenWeight::Wide,
            Self::Secondary => PenWeight::Medium,
            Self::Annotation => PenWeight::Fine,
        }
    }

    /// Line width in *screen pixels* for the plan viewport (legacy API).
    pub fn linewidth_px(self) -> f64 {
        match self {
            Self::Cut => 2.2,
            Self::Primary => 1.6,
            Self::Secondary => 1.1,
            Self::Annotation => 0.85,
        }
    }

    /// Line width in *millimetres* for PDF / print output (legacy API).
    ///
    /// Note: these values differ from the ISO 128 series -- they are the
    /// original BetterCAD values kept for backward compatibility.  Prefer
    /// [`PenWeight::mm`] for standards-compliant output.
    pub fn lineweight_mm(self) -> f64 {
        match self {
            Self::Cut => 0.35,
            Self::Primary => 0.25,
            Self::Secondary => 0.13,
            Self::Annotation => 0.09,
        }
    }
}

impl From<SymbolLineClass> for PenWeight {
    fn from(lc: SymbolLineClass) -> Self {
        lc.to_pen_weight()
    }
}

// ---------------------------------------------------------------------------
// LineType -- ISO 128-20 line conventions
// ---------------------------------------------------------------------------

/// ISO 128-20 line type conventions.
///
/// Each variant defines a repeating dash/gap pattern measured in millimetres
/// *on paper*.  Use [`LineType::pattern_mm`] to retrieve the raw pattern and
/// [`LineType::pattern_world`] to convert to world units via a
/// [`DrawingScale`].
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum LineType {
    /// ISO type 01 -- continuous (solid) line.
    Continuous,
    /// ISO type 02 -- dashed: dash 2 mm, gap 1 mm.
    Dashed,
    /// ISO type 04 -- center line: long 12 mm, gap 1 mm, short 2 mm, gap 1 mm.
    CenterLine,
    /// ISO type 05 -- phantom: long 12 mm, gap 1 mm, short 2 mm, gap 1 mm, short 2 mm, gap 1 mm.
    Phantom,
    /// ISO type 04 variant -- dash-dot (alias for center line pattern).
    DashDot,
    /// ISO type 07 -- dotted: dot 0.25 mm, gap 1 mm.
    Dotted,
}

impl LineType {
    /// Returns the dash/gap pattern in millimetres on paper.
    ///
    /// An empty vector means a continuous (solid) line.  Otherwise the
    /// vector alternates dash-length, gap-length, dash-length, ...
    pub fn pattern_mm(&self) -> Vec<f64> {
        match self {
            Self::Continuous => vec![],
            Self::Dashed => vec![2.0, 1.0],
            Self::CenterLine => vec![12.0, 1.0, 2.0, 1.0],
            Self::Phantom => vec![12.0, 1.0, 2.0, 1.0, 2.0, 1.0],
            Self::DashDot => vec![12.0, 1.0, 2.0, 1.0],
            Self::Dotted => vec![0.25, 1.0],
        }
    }

    /// Returns the dash/gap pattern in world (model) units.
    ///
    /// Each element of the paper-space pattern is converted via
    /// [`DrawingScale::paper_to_world`].
    pub fn pattern_world(&self, scale: &DrawingScale) -> Vec<f64> {
        self.pattern_mm()
            .iter()
            .map(|&mm| scale.paper_to_world(mm))
            .collect()
    }

    /// `true` when the line type is not continuous (i.e. has a pattern).
    pub fn is_dashed(&self) -> bool {
        !matches!(self, Self::Continuous)
    }
}

// ---------------------------------------------------------------------------
// DrawingScale
// ---------------------------------------------------------------------------

/// Drawing scale (paper-to-world ratio).
///
/// A scale of `1:100` means 1 mm on paper = 100 mm (0.1 m) in the model.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct DrawingScale {
    /// The denominator of the scale ratio, e.g. `100.0` for 1:100.
    pub ratio: f64,
}

impl DrawingScale {
    /// Create a new drawing scale from a ratio denominator.
    ///
    /// # Panics
    /// Panics if `ratio` is not positive.
    pub fn new(ratio: f64) -> Self {
        assert!(ratio > 0.0, "DrawingScale ratio must be positive");
        Self { ratio }
    }

    /// Parse a scale string like `"1:100"` or `"1:50"`.
    ///
    /// Returns a 1:1 scale if parsing fails.
    pub fn from_str(s: &str) -> Self {
        if let Some((_num, denom)) = s.split_once(':') {
            if let Ok(d) = denom.trim().parse::<f64>() {
                if d > 0.0 {
                    return Self { ratio: d };
                }
            }
        }
        Self { ratio: 1.0 }
    }

    /// Convert a measurement in paper millimetres to world units (mm).
    pub fn paper_to_world(&self, paper_mm: f64) -> f64 {
        paper_mm * self.ratio
    }

    /// Convert a measurement in world units (mm) to paper millimetres.
    pub fn world_to_paper(&self, world: f64) -> f64 {
        world / self.ratio
    }

    /// Text height in world units for a given [`TextRole`].
    pub fn text_height(&self, role: TextRole) -> f64 {
        self.paper_to_world(role.paper_height_mm())
    }

    /// Convert a [`PenWeight`] to world units.
    pub fn pen_world(&self, pen: PenWeight) -> f64 {
        self.paper_to_world(pen.mm())
    }
}

impl Default for DrawingScale {
    fn default() -> Self {
        Self { ratio: 100.0 }
    }
}

// ---------------------------------------------------------------------------
// TextRole -- ISO 3098 text height standards
// ---------------------------------------------------------------------------

/// Text sizing roles following ISO 3098 conventions.
///
/// Each variant prescribes a nominal text height in millimetres on paper.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TextRole {
    /// 2.5 mm -- dimension values.
    DimensionValue,
    /// 3.5 mm -- room names.
    RoomName,
    /// 3.0 mm -- room numbers.
    RoomNumber,
    /// 5.0 mm -- drawing titles.
    DrawingTitle,
    /// 7.0 mm -- sheet titles.
    SheetTitle,
    /// 2.5 mm -- general notes.
    GeneralNote,
    /// 4.0 mm -- column grid labels.
    ColumnGrid,
    /// 5.0 mm -- section cut letters.
    SectionLetter,
    /// 3.0 mm -- door / window tags.
    DoorWindowTag,
    /// 2.5 mm -- keynotes.
    Keynote,
    /// 1.8 mm -- small annotations.
    SmallAnnotation,
}

impl TextRole {
    /// Nominal text height in millimetres on paper (ISO 3098).
    pub fn paper_height_mm(&self) -> f64 {
        match self {
            Self::DimensionValue => 2.5,
            Self::RoomName => 3.5,
            Self::RoomNumber => 3.0,
            Self::DrawingTitle => 5.0,
            Self::SheetTitle => 7.0,
            Self::GeneralNote => 2.5,
            Self::ColumnGrid => 4.0,
            Self::SectionLetter => 5.0,
            Self::DoorWindowTag => 3.0,
            Self::Keynote => 2.5,
            Self::SmallAnnotation => 1.8,
        }
    }
}

// ---------------------------------------------------------------------------
// Domain colors
// ---------------------------------------------------------------------------

/// Drawing domain -- determines which colour a primitive is rendered in.
///
/// Matches the `SymbolDomain` type and `PLAN_DOMAIN_COLORS` map from the TS
/// codebase.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DomainColor {
    /// Walls, doors, windows, structural -- `#334155`
    Architectural,
    /// Furniture elements -- `#166534`
    Furniture,
    /// Plumbing fixtures -- `#1d4ed8`
    Plumbing,
    /// Electrical symbols -- `#b91c1c`
    Electrical,
    /// Dimension lines, leaders, notes -- `#475569`
    Annotation,
    /// HVAC ductwork and equipment -- `#7c3aed`
    Hvac,
    /// Fire safety devices -- `#dc2626`
    FireSafety,
    /// Accessibility symbols -- `#0891b2`
    Accessibility,
    /// Kitchen / bath cabinetry -- `#92400e`
    Cabinet,
}

impl DomainColor {
    /// Returns the sRGB hex colour string (including `#` prefix).
    pub fn hex(self) -> &'static str {
        match self {
            Self::Architectural => "#334155",
            Self::Furniture => "#166534",
            Self::Plumbing => "#1d4ed8",
            Self::Electrical => "#b91c1c",
            Self::Annotation => "#475569",
            Self::Hvac => "#7c3aed",
            Self::FireSafety => "#dc2626",
            Self::Accessibility => "#0891b2",
            Self::Cabinet => "#92400e",
        }
    }

    /// Returns `(r, g, b)` in the 0--255 range.
    pub fn rgb(self) -> (u8, u8, u8) {
        match self {
            Self::Architectural => (0x33, 0x41, 0x55),
            Self::Furniture => (0x16, 0x65, 0x34),
            Self::Plumbing => (0x1d, 0x4e, 0xd8),
            Self::Electrical => (0xb9, 0x1c, 0x1c),
            Self::Annotation => (0x47, 0x55, 0x69),
            Self::Hvac => (0x7c, 0x3a, 0xed),
            Self::FireSafety => (0xdc, 0x26, 0x26),
            Self::Accessibility => (0x08, 0x91, 0xb2),
            Self::Cabinet => (0x92, 0x40, 0x0e),
        }
    }

    /// Returns `(r, g, b)` normalised to `[0.0, 1.0]`.
    pub fn rgb_f32(self) -> (f32, f32, f32) {
        let (r, g, b) = self.rgb();
        (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0)
    }
}

/// Monochrome print colour -- `#222222`.
pub const MONOCHROME_PRINT_COLOR: (u8, u8, u8) = (0x22, 0x22, 0x22);

// ---------------------------------------------------------------------------
// Styled primitive
// ---------------------------------------------------------------------------

/// A geometric primitive together with its drawing style.
///
/// This is the main output type produced by symbol generators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyledPrimitive {
    /// The geometric primitive.
    pub primitive: SymbolPrimitive,
    /// ISO 128 pen weight.
    pub pen: PenWeight,
    /// ISO 128-20 line type.
    pub line_type: LineType,
    /// Domain colour for rendering.
    pub domain_color: DomainColor,
    /// Layer name (CAD layer assignment).
    pub layer: &'static str,

    // Legacy fields -- kept so that existing code accessing `.line_class`
    // and `.dashed` continues to work without changes.
    /// Legacy line class (mirrors `pen` through the `SymbolLineClass` mapping).
    pub line_class: SymbolLineClass,
    /// Legacy dashed flag (mirrors `line_type.is_dashed()`).
    pub dashed: bool,
}

impl StyledPrimitive {
    /// Shorthand constructor -- continuous line on the `"0"` layer.
    ///
    /// Accepts the legacy `SymbolLineClass` for backward compatibility.
    pub fn new(
        primitive: SymbolPrimitive,
        line_class: SymbolLineClass,
        domain_color: DomainColor,
    ) -> Self {
        let pen = line_class.to_pen_weight();
        Self {
            primitive,
            pen,
            line_type: LineType::Continuous,
            domain_color,
            layer: "0",
            line_class,
            dashed: false,
        }
    }

    /// Shorthand constructor with dashed rendering.
    ///
    /// Accepts the legacy `SymbolLineClass` for backward compatibility.
    pub fn dashed(
        primitive: SymbolPrimitive,
        line_class: SymbolLineClass,
        domain_color: DomainColor,
    ) -> Self {
        let pen = line_class.to_pen_weight();
        Self {
            primitive,
            pen,
            line_type: LineType::Dashed,
            domain_color,
            layer: "0",
            line_class,
            dashed: true,
        }
    }

    /// Full-control constructor using the new ISO 128 types.
    pub fn with_line_type(
        primitive: SymbolPrimitive,
        pen: PenWeight,
        line_type: LineType,
        domain_color: DomainColor,
        layer: &'static str,
    ) -> Self {
        // Derive a best-effort SymbolLineClass for legacy compat.
        let line_class = match pen {
            PenWeight::ExtraHeavy | PenWeight::Heavy => SymbolLineClass::Cut,
            PenWeight::Wide => SymbolLineClass::Primary,
            PenWeight::Medium => SymbolLineClass::Secondary,
            PenWeight::Fine | PenWeight::ExtraFine => SymbolLineClass::Annotation,
        };
        Self {
            primitive,
            pen,
            line_type,
            domain_color,
            layer,
            line_class,
            dashed: line_type.is_dashed(),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- PenWeight::mm() ---------------------------------------------------

    #[test]
    fn pen_weight_mm_values() {
        assert!((PenWeight::ExtraFine.mm() - 0.13).abs() < 1e-10);
        assert!((PenWeight::Fine.mm() - 0.18).abs() < 1e-10);
        assert!((PenWeight::Medium.mm() - 0.25).abs() < 1e-10);
        assert!((PenWeight::Wide.mm() - 0.35).abs() < 1e-10);
        assert!((PenWeight::Heavy.mm() - 0.50).abs() < 1e-10);
        assert!((PenWeight::ExtraHeavy.mm() - 0.70).abs() < 1e-10);
    }

    #[test]
    fn pen_weight_points() {
        // 0.25 mm / 0.3528 ~= 0.7086
        let pts = PenWeight::Medium.points();
        assert!((pts - 0.25 / 0.3528).abs() < 1e-6);
    }

    #[test]
    fn pen_weight_screen_px() {
        let px = PenWeight::Medium.screen_px(1.0);
        // 0.25 / 0.2646 ~= 0.9447
        assert!((px - 0.25 / 0.2646).abs() < 0.01);
        // Zoom doubles it
        let px2 = PenWeight::Medium.screen_px(2.0);
        assert!((px2 - px * 2.0).abs() < 0.01);
    }

    // -- DrawingScale conversions ------------------------------------------

    #[test]
    fn drawing_scale_paper_to_world() {
        let scale = DrawingScale::new(100.0);
        assert!((scale.paper_to_world(1.0) - 100.0).abs() < 1e-10);
        assert!((scale.paper_to_world(2.5) - 250.0).abs() < 1e-10);
    }

    #[test]
    fn drawing_scale_world_to_paper() {
        let scale = DrawingScale::new(50.0);
        assert!((scale.world_to_paper(100.0) - 2.0).abs() < 1e-10);
    }

    #[test]
    fn drawing_scale_from_str_valid() {
        let s = DrawingScale::from_str("1:200");
        assert!((s.ratio - 200.0).abs() < 1e-10);
    }

    #[test]
    fn drawing_scale_from_str_invalid() {
        let s = DrawingScale::from_str("garbage");
        assert!((s.ratio - 1.0).abs() < 1e-10);
    }

    #[test]
    fn drawing_scale_pen_world() {
        let scale = DrawingScale::new(100.0);
        // 0.25 mm * 100 = 25.0 mm in world
        assert!((scale.pen_world(PenWeight::Medium) - 25.0).abs() < 1e-10);
    }

    #[test]
    fn drawing_scale_text_height() {
        let scale = DrawingScale::new(100.0);
        // DimensionValue = 2.5 mm * 100 = 250.0 mm
        assert!((scale.text_height(TextRole::DimensionValue) - 250.0).abs() < 1e-10);
    }

    // -- LineType patterns -------------------------------------------------

    #[test]
    fn line_type_continuous_empty_pattern() {
        assert!(LineType::Continuous.pattern_mm().is_empty());
    }

    #[test]
    fn line_type_dashed_pattern() {
        let p = LineType::Dashed.pattern_mm();
        assert_eq!(p, vec![2.0, 1.0]);
    }

    #[test]
    fn line_type_centerline_pattern() {
        let p = LineType::CenterLine.pattern_mm();
        assert_eq!(p, vec![12.0, 1.0, 2.0, 1.0]);
    }

    #[test]
    fn line_type_phantom_pattern() {
        let p = LineType::Phantom.pattern_mm();
        assert_eq!(p, vec![12.0, 1.0, 2.0, 1.0, 2.0, 1.0]);
    }

    #[test]
    fn line_type_dotted_pattern() {
        let p = LineType::Dotted.pattern_mm();
        assert_eq!(p, vec![0.25, 1.0]);
    }

    #[test]
    fn line_type_pattern_world() {
        let scale = DrawingScale::new(50.0);
        let p = LineType::Dashed.pattern_world(&scale);
        // [2.0*50, 1.0*50] = [100.0, 50.0]
        assert_eq!(p.len(), 2);
        assert!((p[0] - 100.0).abs() < 1e-10);
        assert!((p[1] - 50.0).abs() < 1e-10);
    }

    #[test]
    fn line_type_is_dashed() {
        assert!(!LineType::Continuous.is_dashed());
        assert!(LineType::Dashed.is_dashed());
        assert!(LineType::CenterLine.is_dashed());
        assert!(LineType::Phantom.is_dashed());
        assert!(LineType::DashDot.is_dashed());
        assert!(LineType::Dotted.is_dashed());
    }

    // -- TextRole heights --------------------------------------------------

    #[test]
    fn text_role_heights() {
        assert!((TextRole::DimensionValue.paper_height_mm() - 2.5).abs() < 1e-10);
        assert!((TextRole::RoomName.paper_height_mm() - 3.5).abs() < 1e-10);
        assert!((TextRole::RoomNumber.paper_height_mm() - 3.0).abs() < 1e-10);
        assert!((TextRole::DrawingTitle.paper_height_mm() - 5.0).abs() < 1e-10);
        assert!((TextRole::SheetTitle.paper_height_mm() - 7.0).abs() < 1e-10);
        assert!((TextRole::GeneralNote.paper_height_mm() - 2.5).abs() < 1e-10);
        assert!((TextRole::ColumnGrid.paper_height_mm() - 4.0).abs() < 1e-10);
        assert!((TextRole::SectionLetter.paper_height_mm() - 5.0).abs() < 1e-10);
        assert!((TextRole::DoorWindowTag.paper_height_mm() - 3.0).abs() < 1e-10);
        assert!((TextRole::Keynote.paper_height_mm() - 2.5).abs() < 1e-10);
        assert!((TextRole::SmallAnnotation.paper_height_mm() - 1.8).abs() < 1e-10);
    }

    // -- SymbolLineClass backward compat -----------------------------------

    #[test]
    fn symbol_line_class_to_pen_weight() {
        assert_eq!(SymbolLineClass::Cut.to_pen_weight(), PenWeight::Heavy);
        assert_eq!(SymbolLineClass::Primary.to_pen_weight(), PenWeight::Wide);
        assert_eq!(SymbolLineClass::Secondary.to_pen_weight(), PenWeight::Medium);
        assert_eq!(SymbolLineClass::Annotation.to_pen_weight(), PenWeight::Fine);
    }

    #[test]
    fn symbol_line_class_from_into() {
        let pen: PenWeight = SymbolLineClass::Cut.into();
        assert_eq!(pen, PenWeight::Heavy);
    }

    // -- StyledPrimitive constructors --------------------------------------

    #[test]
    fn styled_primitive_new_sets_continuous() {
        let sp = StyledPrimitive::new(
            SymbolPrimitive::Circle {
                center: [0.0, 0.0],
                radius: 1.0,
            },
            SymbolLineClass::Primary,
            DomainColor::Architectural,
        );
        assert_eq!(sp.pen, PenWeight::Wide);
        assert_eq!(sp.line_type, LineType::Continuous);
        assert!(!sp.dashed);
    }

    #[test]
    fn styled_primitive_dashed_sets_dashed_line_type() {
        let sp = StyledPrimitive::dashed(
            SymbolPrimitive::Circle {
                center: [0.0, 0.0],
                radius: 1.0,
            },
            SymbolLineClass::Secondary,
            DomainColor::Cabinet,
        );
        assert_eq!(sp.pen, PenWeight::Medium);
        assert_eq!(sp.line_type, LineType::Dashed);
        assert!(sp.dashed);
    }

    #[test]
    fn styled_primitive_with_line_type() {
        let sp = StyledPrimitive::with_line_type(
            SymbolPrimitive::Circle {
                center: [0.0, 0.0],
                radius: 1.0,
            },
            PenWeight::ExtraHeavy,
            LineType::CenterLine,
            DomainColor::Annotation,
            "A-WALL",
        );
        assert_eq!(sp.pen, PenWeight::ExtraHeavy);
        assert_eq!(sp.line_type, LineType::CenterLine);
        assert_eq!(sp.layer, "A-WALL");
        assert!(sp.dashed); // CenterLine is considered dashed
    }
}
