//! Accessibility symbol generators.
//!
//! Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/accessibility.ts`.

use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_circle, add_line, add_rect, add_text};

const DOMAIN: DomainColor = DomainColor::Accessibility;

/// Helper: simplified ISA wheelchair icon at a given center and scale.
fn add_wheelchair_symbol(
    out: &mut Vec<StyledPrimitive>,
    cx: f64,
    cy: f64,
    rotation: f64,
    scale: f64,
) {
    // Head
    add_circle(
        out,
        DOMAIN,
        [cx, cy],
        rotation,
        [0.0, 0.14 * scale],
        0.03 * scale,
        SymbolLineClass::Primary,
        false,
    );
    // Body vertical line
    add_line(
        out,
        DOMAIN,
        [cx, cy],
        rotation,
        [0.0, 0.11 * scale],
        [0.0, 0.02 * scale],
        SymbolLineClass::Primary,
        false,
    );
    // Arm line
    add_line(
        out,
        DOMAIN,
        [cx, cy],
        rotation,
        [0.0, 0.08 * scale],
        [0.06 * scale, 0.06 * scale],
        SymbolLineClass::Primary,
        false,
    );
    // Large wheel
    add_circle(
        out,
        DOMAIN,
        [cx, cy],
        rotation,
        [0.0, -0.02 * scale],
        0.07 * scale,
        SymbolLineClass::Primary,
        false,
    );
    // Small front wheel
    add_circle(
        out,
        DOMAIN,
        [cx, cy],
        rotation,
        [0.06 * scale, -0.02 * scale],
        0.02 * scale,
        SymbolLineClass::Primary,
        false,
    );
    // Footrest
    add_line(
        out,
        DOMAIN,
        [cx, cy],
        rotation,
        [0.03 * scale, -0.02 * scale],
        [0.08 * scale, -0.06 * scale],
        SymbolLineClass::Primary,
        false,
    );
}

/// Wheelchair accessibility symbol (ISA icon).
pub fn wheelchair(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_wheelchair_symbol(&mut out, center[0], center[1], rotation, 1.0);
    out
}

/// Ramp: two parallel lines + direction arrow + slope label.
pub fn ramp(center: [f64; 2], rotation: f64, show_label: bool) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.30, 0.075],
        [0.30, 0.075],
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.30, -0.075],
        [0.30, -0.075],
        SymbolLineClass::Primary,
        false,
    );
    // Direction arrow
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.20, 0.0],
        [0.30, 0.0],
        SymbolLineClass::Annotation,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.26, 0.03],
        [0.30, 0.0],
        SymbolLineClass::Annotation,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.26, -0.03],
        [0.30, 0.0],
        SymbolLineClass::Annotation,
        false,
    );
    if show_label {
        add_text(&mut out, DOMAIN, center, rotation, "1:12", 0.06);
    }
    out
}

/// Grab bar: heavy line + mounting dots at each end.
pub fn grab_bar(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.30, 0.0],
        [0.30, 0.0],
        SymbolLineClass::Primary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.30, 0.0],
        0.025,
        SymbolLineClass::Primary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.30, 0.0],
        0.025,
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Accessible parking: rectangle + scaled wheelchair icon.
pub fn accessible_parking(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        1.0,
        0.50,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_wheelchair_symbol(&mut out, center[0], center[1], rotation, 0.6);
    out
}

/// Tactile warning: rectangle + grid of small dots.
pub fn tactile_warning(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.40,
        0.30,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    for row in 0..3 {
        for col in 0..4 {
            let lx = -0.135 + col as f64 * 0.09;
            let ly = -0.09 + row as f64 * 0.09;
            add_circle(
                &mut out,
                DOMAIN,
                center,
                rotation,
                [lx, ly],
                0.012,
                SymbolLineClass::Secondary,
                false,
            );
        }
    }
    out
}

/// ADA restroom: large rectangle + "ADA" label + wheelchair icon.
pub fn ada_restroom(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        1.50,
        1.50,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "ADA", 0.12);
    add_wheelchair_symbol(&mut out, center[0], center[1], rotation, 0.5);
    out
}

/// Hearing loop: circle + "HL" label.
pub fn hearing_loop(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.15,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "HL", 0.08);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wheelchair_produces_primitives() {
        let prims = wheelchair([0.0, 0.0], 0.0);
        assert!(
            prims.len() >= 6,
            "wheelchair icon should have head + body + arm + 2 wheels + footrest"
        );
    }

    #[test]
    fn tactile_warning_produces_primitives() {
        let prims = tactile_warning([0.0, 0.0], 0.0);
        // rect + 12 dots = 13
        assert!(prims.len() >= 13);
    }
}
