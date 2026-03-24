//! HVAC symbol generators.
//!
//! Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/hvac.ts`.

use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_circle, add_line, add_polyline, add_rect, add_text};

const DOMAIN: DomainColor = DomainColor::Hvac;

/// Supply vent: rectangle + three internal horizontal louver lines.
pub fn supply_vent(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.30,
        0.15,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    for i in 1..=3 {
        let ly = -0.075 + 0.15 * (i as f64 / 4.0);
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [-0.12, ly],
            [0.12, ly],
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Return vent: square + X diagonal lines.
pub fn return_vent(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.35,
        0.35,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.15, -0.15],
        [0.15, 0.15],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.15, -0.15],
        [-0.15, 0.15],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Thermostat: small circle + "T" label.
pub fn thermostat(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.06,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "T", 0.06);
    out
}

/// Exhaust fan: circle + upward arrow.
pub fn exhaust_fan(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.14,
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.14],
        [0.0, 0.22],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.03, 0.19],
        [0.0, 0.22],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.03, 0.19],
        [0.0, 0.22],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Ductwork: double parallel lines + flow arrow.
pub fn ductwork(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.15, 0.05],
        [0.15, 0.05],
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.15, -0.05],
        [0.15, -0.05],
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.10, 0.0],
        [0.15, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.12, 0.03],
        [0.15, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.12, -0.03],
        [0.15, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Mini split: wide rectangle + zigzag coil line.
pub fn mini_split(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.80,
        0.22,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    let zig_count = 8;
    let mut zig_pts = Vec::with_capacity(zig_count + 1);
    for i in 0..=zig_count {
        let lx = -0.35 + 0.70 * (i as f64 / zig_count as f64);
        let ly = if i % 2 == 0 { 0.04 } else { -0.04 };
        zig_pts.push([lx, ly]);
    }
    add_polyline(
        &mut out,
        DOMAIN,
        center,
        rotation,
        &zig_pts,
        SymbolLineClass::Secondary,
        false,
        false,
    );
    out
}

/// Air handler: rectangle + "AH" label.
pub fn air_handler(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.60,
        0.40,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "AH", 0.12);
    out
}

/// Condensing unit: circle + "CU" label.
pub fn condensing_unit(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.25,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "CU", 0.10);
    out
}

/// Damper: horizontal line + "D" label.
pub fn damper(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.15, 0.0],
        [0.15, 0.0],
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "D", 0.08);
    out
}

/// Diffuser: square + four outward arrow lines.
pub fn diffuser(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.30,
        0.30,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.15],
        [0.0, 0.22],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -0.15],
        [0.0, -0.22],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.15, 0.0],
        [0.22, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.15, 0.0],
        [-0.22, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supply_vent_produces_primitives() {
        let prims = supply_vent([0.0, 0.0], 0.0);
        assert!(
            prims.len() >= 4,
            "supply vent should have rect + 3 louver lines"
        );
    }

    #[test]
    fn mini_split_produces_primitives() {
        let prims = mini_split([0.0, 0.0], 0.0);
        assert!(prims.len() >= 2);
    }
}
