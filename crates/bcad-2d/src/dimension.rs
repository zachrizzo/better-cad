//! Dimension line primitives.
//!
//! Generates extension lines, a dimension line, tick marks (45-degree slash),
//! and a centered text label.
//!
//! This is a direct Rust port of the logic in
//! `packages/ui/src/components/viewport/DimensionRenderer2D.tsx`.

use crate::primitives::SymbolPrimitive;
use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

const DOMAIN: DomainColor = DomainColor::Annotation;
const COS45: f64 = std::f64::consts::FRAC_1_SQRT_2; // cos(PI/4)
const SIN45: f64 = std::f64::consts::FRAC_1_SQRT_2; // sin(PI/4)

/// Generate a complete dimension annotation.
///
/// # Parameters
/// - `p1`, `p2` -- the two measured endpoints in world space.
/// - `offset` -- perpendicular distance from the measured line to the
///   dimension line (positive = toward the normal direction).
/// - `text` -- the dimension label string (e.g. "2500 mm").
/// - `scale` -- the drawing scale (paper-to-world ratio), used to size
///   tick marks and text.  Pass `1.0` for world-unit sizing.
///
/// Returns a list of [`StyledPrimitive`] comprising:
/// - Two extension lines
/// - The dimension line
/// - Two tick marks (45-degree slashes)
/// - The text label
pub fn generate_dimension(
    p1: [f64; 2],
    p2: [f64; 2],
    offset: f64,
    text: &str,
    scale: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();

    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-6 {
        return out;
    }

    // Unit direction along measured line
    let ux = dx / len;
    let uy = dy / len;

    // Perpendicular normal
    let nx = -uy;
    let ny = ux;

    // Extension line gap and overshoot (approx 1mm and 2mm at paper scale)
    let gap = 1.0 / (scale * 1000.0);
    let overshoot = 2.0 / (scale * 1000.0);

    // Extension line 1
    let ext1_start = [p1[0] + nx * gap, p1[1] + ny * gap];
    let ext1_end = [
        p1[0] + nx * (offset + overshoot),
        p1[1] + ny * (offset + overshoot),
    ];
    push_line(&mut out, ext1_start, ext1_end, SymbolLineClass::Annotation);

    // Extension line 2
    let ext2_start = [p2[0] + nx * gap, p2[1] + ny * gap];
    let ext2_end = [
        p2[0] + nx * (offset + overshoot),
        p2[1] + ny * (offset + overshoot),
    ];
    push_line(&mut out, ext2_start, ext2_end, SymbolLineClass::Annotation);

    // Dimension line (at offset distance from measured line)
    let dim_start = [p1[0] + nx * offset, p1[1] + ny * offset];
    let dim_end = [p2[0] + nx * offset, p2[1] + ny * offset];
    push_line(&mut out, dim_start, dim_end, SymbolLineClass::Primary);

    // Tick marks: 45-degree slash at each end
    let tick_length = 3.0 / (scale * 1000.0);
    let half_tick = tick_length / 2.0;

    let tick1a = [
        dim_start[0] - half_tick * COS45,
        dim_start[1] - half_tick * SIN45,
    ];
    let tick1b = [
        dim_start[0] + half_tick * COS45,
        dim_start[1] + half_tick * SIN45,
    ];
    push_line(&mut out, tick1a, tick1b, SymbolLineClass::Primary);

    let tick2a = [
        dim_end[0] - half_tick * COS45,
        dim_end[1] - half_tick * SIN45,
    ];
    let tick2b = [
        dim_end[0] + half_tick * COS45,
        dim_end[1] + half_tick * SIN45,
    ];
    push_line(&mut out, tick2a, tick2b, SymbolLineClass::Primary);

    // Text label at midpoint, offset slightly above the dimension line
    let font_size = {
        let computed = 2.5 / (scale * 1000.0);
        if computed > 0.01 {
            computed
        } else {
            0.12
        }
    };
    let mid_x = (dim_start[0] + dim_end[0]) / 2.0 + nx * font_size * 0.3;
    let mid_y = (dim_start[1] + dim_end[1]) / 2.0 + ny * font_size * 0.3;

    out.push(StyledPrimitive::new(
        SymbolPrimitive::Text {
            position: [mid_x, mid_y],
            content: text.to_string(),
            font_size,
            anchor: crate::primitives::TextAnchor::BottomCenter,
        },
        SymbolLineClass::Annotation,
        DOMAIN,
    ));

    out
}

fn push_line(
    out: &mut Vec<StyledPrimitive>,
    start: [f64; 2],
    end: [f64; 2],
    line_class: SymbolLineClass,
) {
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: vec![start, end],
            closed: false,
        },
        line_class,
        DOMAIN,
    ));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_dimension() {
        let prims = generate_dimension([0.0, 0.0], [5.0, 0.0], 0.5, "5000 mm", 1.0);
        // 2 ext lines + dim line + 2 ticks + text = 6
        assert_eq!(prims.len(), 6);
    }

    #[test]
    fn zero_length_returns_empty() {
        let prims = generate_dimension([1.0, 1.0], [1.0, 1.0], 0.5, "0", 1.0);
        assert!(prims.is_empty());
    }

    #[test]
    fn angled_dimension() {
        let prims = generate_dimension([0.0, 0.0], [3.0, 4.0], 0.3, "5000 mm", 1.0);
        assert_eq!(prims.len(), 6);
    }
}
