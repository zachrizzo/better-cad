//! Title block rendering for BetterCAD construction document sheets.
//!
//! Produces an AEC-standard title block with outer/inner borders, a title strip
//! in the bottom-right corner, revision table, and project information fields.

use printpdf::*;

use crate::drawing_helpers::{draw_hline, draw_rect, draw_vline, mm, set_pen, set_stroke_color_rgb};
use crate::types::Lineweights;
use crate::types::PaperSize;
use crate::types::ProjectInfo;
use crate::types::SheetInfo;

// ---------------------------------------------------------------------------
// Layout constants (all dimensions in mm)
// ---------------------------------------------------------------------------

/// Margin from the paper edge to the outer border line.
const BORDER_MARGIN: f64 = 12.0;

/// Title strip dimensions.
const TITLE_STRIP_WIDTH: f64 = 180.0;
const TITLE_STRIP_HEIGHT: f64 = 50.0;

/// Revision block row height.
const REV_ROW_HEIGHT: f64 = 5.0;

// ---------------------------------------------------------------------------
// Drawable area computation
// ---------------------------------------------------------------------------

/// The rectangular region inside the borders and above the title strip where
/// drawing content may be placed (all values in mm, origin at bottom-left).
#[derive(Debug, Clone, Copy)]
pub struct DrawableArea {
    pub left: f64,
    pub bottom: f64,
    pub width: f64,
    pub height: f64,
}

/// Returns the drawable area for a given paper size. The area lies inside the
/// inner border and above the title strip, with a small additional padding.
pub fn get_drawable_area(paper: &PaperSize) -> DrawableArea {
    let (pw, ph) = paper.dimensions_mm();
    let inner_off = BORDER_MARGIN + 4.0;
    let left = inner_off;
    let bottom = BORDER_MARGIN + TITLE_STRIP_HEIGHT + 4.0;
    let width = pw - 2.0 * inner_off;
    let height = ph - inner_off - bottom;
    DrawableArea {
        left,
        bottom,
        width,
        height,
    }
}

// ---------------------------------------------------------------------------
// Title block renderer
// ---------------------------------------------------------------------------

/// Configuration bundle for rendering a title block on a single sheet.
pub struct TitleBlockConfig<'a> {
    pub project: &'a ProjectInfo,
    pub sheet: &'a SheetInfo,
    pub paper: &'a PaperSize,
}

/// Render a professional title block onto the given PDF layer.
///
/// Coordinate system: printpdf uses bottom-left origin with Mm units, which
/// matches our internal mm coordinates directly.
pub fn render_title_block(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    config: &TitleBlockConfig,
) {
    let (pw, ph) = config.paper.dimensions_mm();

    // --- Outer border: 0.70 mm (ISO 128 ExtraHeavy) ---
    set_pen(layer, Lineweights::BORDER);
    set_stroke_color_rgb(layer, 0, 0, 0);
    draw_rect(
        layer,
        BORDER_MARGIN,
        BORDER_MARGIN,
        pw - 2.0 * BORDER_MARGIN,
        ph - 2.0 * BORDER_MARGIN,
    );

    // --- Inner border: 0.25 mm (ISO 128 Medium) ---
    let inner_off = BORDER_MARGIN + 2.0;
    set_pen(layer, Lineweights::BORDER_INNER);
    draw_rect(
        layer,
        inner_off,
        inner_off,
        pw - 2.0 * inner_off,
        ph - 2.0 * inner_off,
    );

    // --- Title strip area (bottom-right) ---
    let ts_right = pw - BORDER_MARGIN;
    let ts_left = ts_right - TITLE_STRIP_WIDTH;
    let ts_bottom = BORDER_MARGIN;
    let ts_top = ts_bottom + TITLE_STRIP_HEIGHT;

    // Title strip outline: 0.50 mm (ISO 128 Heavy)
    set_pen(layer, 0.50);
    draw_rect(
        layer,
        ts_left,
        ts_bottom,
        TITLE_STRIP_WIDTH,
        TITLE_STRIP_HEIGHT,
    );

    // Horizontal dividers inside title strip (measured from ts_bottom going up)
    let row3_y = ts_bottom + 14.0; // scale / date / sheet number
    let row2_y = ts_bottom + 26.0; // sheet title
    let row1_y = ts_bottom + 38.0; // client / architect

    set_pen(layer, 0.25);
    draw_hline(layer, ts_left, row1_y, ts_right);
    draw_hline(layer, ts_left, row2_y, ts_right);
    draw_hline(layer, ts_left, row3_y, ts_right);

    // Vertical divider at midpoint for the bottom row
    let mid_x = ts_left + TITLE_STRIP_WIDTH / 2.0;
    draw_vline(layer, mid_x, ts_bottom, row3_y);

    // --- Text inside title strip ---

    // Row 0 (top): Project name (bold, larger)
    layer.use_text(
        config.project.project_name.to_uppercase(),
        8.0,
        mm(ts_left + 4.0),
        mm(row1_y + 8.0),
        font,
    );
    layer.use_text(
        &config.project.project_address.to_uppercase(),
        6.0,
        mm(ts_left + 4.0),
        mm(row1_y + 3.0),
        font,
    );

    // Row 1: Client / Architect info -- UPPERCASE
    layer.use_text(
        format!("CLIENT: {}", config.project.client_name.to_uppercase()),
        5.5,
        mm(ts_left + 4.0),
        mm(row2_y + 8.0),
        font,
    );
    layer.use_text(
        format!("ARCHITECT: {}", config.project.architect_name.to_uppercase()),
        5.5,
        mm(ts_left + 4.0),
        mm(row2_y + 4.0),
        font,
    );

    // Row 2: Sheet title (larger, centered-ish)
    layer.use_text(
        &config.sheet.sheet_title,
        9.0,
        mm(ts_left + 20.0),
        mm(row3_y + 6.0),
        font,
    );

    // Row 3 left: Scale + Date + Project number -- UPPERCASE
    layer.use_text(
        format!("SCALE: {}", config.sheet.scale.to_uppercase()),
        6.0,
        mm(ts_left + 4.0),
        mm(ts_bottom + 10.0),
        font,
    );
    layer.use_text(
        format!("DATE: {}", config.project.date.to_uppercase()),
        6.0,
        mm(ts_left + 4.0),
        mm(ts_bottom + 6.0),
        font,
    );
    layer.use_text(
        format!("PROJECT #: {}", config.project.project_number.to_uppercase()),
        6.0,
        mm(ts_left + 4.0),
        mm(ts_bottom + 2.0),
        font,
    );

    // Row 3 right: Sheet number (large)
    layer.use_text(
        &config.sheet.sheet_number,
        16.0,
        mm(mid_x + 20.0),
        mm(ts_bottom + 5.0),
        font,
    );

    // BetterCAD branding -- UPPERCASE
    layer.use_text(
        "BETTERCAD",
        5.0,
        mm(ts_right - 22.0),
        mm(ts_bottom + 1.0),
        font,
    );

    // --- Revision block (above title strip) ---
    let revs = &config.sheet.revisions;
    if !revs.is_empty() {
        let rev_block_height = (revs.len() as f64 + 1.0) * REV_ROW_HEIGHT;
        let rev_bottom = ts_top;
        let rev_top = rev_bottom + rev_block_height;
        let rev_col_date = ts_left + 20.0;
        let rev_col_desc = ts_left + 55.0;

        set_pen(layer, 0.25);
        draw_rect(
            layer,
            ts_left,
            rev_bottom,
            TITLE_STRIP_WIDTH,
            rev_block_height,
        );

        // Header row
        let header_y = rev_top - REV_ROW_HEIGHT;
        layer.use_text("REV", 5.0, mm(ts_left + 3.0), mm(header_y + 1.5), font);
        layer.use_text(
            "DATE",
            5.0,
            mm(rev_col_date + 3.0),
            mm(header_y + 1.5),
            font,
        );
        layer.use_text(
            "DESCRIPTION",
            5.0,
            mm(rev_col_desc + 3.0),
            mm(header_y + 1.5),
            font,
        );
        draw_hline(layer, ts_left, header_y, ts_right);

        // Column dividers
        draw_vline(layer, rev_col_date, rev_bottom, rev_top);
        draw_vline(layer, rev_col_desc, rev_bottom, rev_top);

        // Revision rows
        for (i, rev) in revs.iter().enumerate() {
            let ry = header_y - (i as f64 + 1.0) * REV_ROW_HEIGHT;
            layer.use_text(&rev.number, 5.0, mm(ts_left + 3.0), mm(ry + 1.5), font);
            layer.use_text(&rev.date, 5.0, mm(rev_col_date + 3.0), mm(ry + 1.5), font);
            layer.use_text(
                &rev.description,
                5.0,
                mm(rev_col_desc + 3.0),
                mm(ry + 1.5),
                font,
            );
            if i < revs.len() - 1 {
                draw_hline(layer, ts_left, ry, ts_right);
            }
        }
    }
}
