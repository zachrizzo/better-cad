//! Shared low-level PDF drawing helpers used by both `pdf_export` and
//! `title_block`.
//!
//! Centralises the repeated conversions between mm and PDF points, stroke/fill
//! color setters, and primitive shape drawing so that the two rendering modules
//! stay DRY.

use printpdf::*;

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

/// Convert an f64 millimetre value to a printpdf `Mm(f32)`.
#[inline]
pub(crate) fn mm(v: f64) -> Mm {
    Mm(v as f32)
}

/// Millimetres-to-points conversion factor (1 pt = 0.3528 mm).
const MM_TO_PT: f64 = 1.0 / 0.3528;

// ---------------------------------------------------------------------------
// Pen / colour setters
// ---------------------------------------------------------------------------

/// Set the PDF outline (stroke) thickness from a pen weight in mm.
#[inline]
pub(crate) fn set_pen(layer: &PdfLayerReference, weight_mm: f64) {
    layer.set_outline_thickness((weight_mm * MM_TO_PT) as f32);
}

/// Set the stroke (outline) colour from u8 RGB components.
pub(crate) fn set_stroke_color_rgb(layer: &PdfLayerReference, r: u8, g: u8, b: u8) {
    layer.set_outline_color(Color::Rgb(Rgb::new(
        r as f32 / 255.0,
        g as f32 / 255.0,
        b as f32 / 255.0,
        None,
    )));
}

/// Set the fill colour from u8 RGB components.
pub(crate) fn set_fill_color_rgb(layer: &PdfLayerReference, r: u8, g: u8, b: u8) {
    layer.set_fill_color(Color::Rgb(Rgb::new(
        r as f32 / 255.0,
        g as f32 / 255.0,
        b as f32 / 255.0,
        None,
    )));
}

// ---------------------------------------------------------------------------
// Dash patterns
// ---------------------------------------------------------------------------

/// Apply a dashed line pattern. Dash and gap values are in mm on paper.
/// Pass an empty slice (or call [`reset_dash`]) to restore solid lines.
pub(crate) fn set_dash_pattern_mm(layer: &PdfLayerReference, pattern_mm: &[f64]) {
    if pattern_mm.is_empty() {
        layer.set_line_dash_pattern(LineDashPattern::default());
        return;
    }
    let to_pt = |v: f64| -> i64 { (v * MM_TO_PT).round() as i64 };
    let mut pat = LineDashPattern::default();
    // The printpdf API exposes three dash/gap pairs as separate fields.
    if let Some(&v) = pattern_mm.first() {
        pat.dash_1 = Some(to_pt(v));
    }
    if let Some(&v) = pattern_mm.get(1) {
        pat.gap_1 = Some(to_pt(v));
    }
    if let Some(&v) = pattern_mm.get(2) {
        pat.dash_2 = Some(to_pt(v));
    }
    if let Some(&v) = pattern_mm.get(3) {
        pat.gap_2 = Some(to_pt(v));
    }
    if let Some(&v) = pattern_mm.get(4) {
        pat.dash_3 = Some(to_pt(v));
    }
    if let Some(&v) = pattern_mm.get(5) {
        pat.gap_3 = Some(to_pt(v));
    }
    layer.set_line_dash_pattern(pat);
}

/// Reset the dash pattern to solid (continuous) lines.
#[inline]
pub(crate) fn reset_dash(layer: &PdfLayerReference) {
    layer.set_line_dash_pattern(LineDashPattern::default());
}

// ---------------------------------------------------------------------------
// Primitive shape drawing
// ---------------------------------------------------------------------------

/// Draw a closed rectangle outline.
pub(crate) fn draw_rect(layer: &PdfLayerReference, x: f64, y: f64, w: f64, h: f64) {
    let points = vec![
        (Point::new(mm(x), mm(y)), false),
        (Point::new(mm(x + w), mm(y)), false),
        (Point::new(mm(x + w), mm(y + h)), false),
        (Point::new(mm(x), mm(y + h)), false),
    ];
    layer.add_line(Line {
        points,
        is_closed: true,
    });
}

/// Draw a horizontal line segment.
pub(crate) fn draw_hline(layer: &PdfLayerReference, x1: f64, y: f64, x2: f64) {
    let points = vec![
        (Point::new(mm(x1), mm(y)), false),
        (Point::new(mm(x2), mm(y)), false),
    ];
    layer.add_line(Line {
        points,
        is_closed: false,
    });
}

/// Draw a vertical line segment.
pub(crate) fn draw_vline(layer: &PdfLayerReference, x: f64, y1: f64, y2: f64) {
    let points = vec![
        (Point::new(mm(x), mm(y1)), false),
        (Point::new(mm(x), mm(y2)), false),
    ];
    layer.add_line(Line {
        points,
        is_closed: false,
    });
}

/// Draw a general line segment between two points.
pub(crate) fn draw_line_seg(layer: &PdfLayerReference, x1: f64, y1: f64, x2: f64, y2: f64) {
    let points = vec![
        (Point::new(mm(x1), mm(y1)), false),
        (Point::new(mm(x2), mm(y2)), false),
    ];
    layer.add_line(Line {
        points,
        is_closed: false,
    });
}

/// Draw a circle approximation using 32 line segments.
pub(crate) fn draw_circle(layer: &PdfLayerReference, cx: f64, cy: f64, r: f64) {
    let segments = 32;
    let points: Vec<(Point, bool)> = (0..segments)
        .map(|i| {
            let angle = 2.0 * std::f64::consts::PI * i as f64 / segments as f64;
            let x = cx + r * angle.cos();
            let y = cy + r * angle.sin();
            (Point::new(mm(x), mm(y)), false)
        })
        .collect();
    layer.add_line(Line {
        points,
        is_closed: true,
    });
}
