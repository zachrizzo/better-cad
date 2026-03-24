//! Electrical symbol generators.
//!
//! Each function returns `Vec<StyledPrimitive>` for a specific electrical
//! symbol type.  Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/electrical.ts`.

use std::f64::consts::PI;

use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_arc, add_circle, add_line, add_rect, add_text};

const DOMAIN: DomainColor = DomainColor::Electrical;

// ── Outlets ─────────────────────────────────────────────────────────────────

/// Duplex outlet: small circle with two short prong lines.
pub fn outlet(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.07,
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.07],
        [0.0, 0.12],
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -0.07],
        [0.0, -0.12],
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// GFCI outlet: duplex outlet + "GFI" label.
pub fn gfci_outlet(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = outlet(center, rotation);
    add_text(&mut out, DOMAIN, center, rotation, "GFI", 0.05);
    out
}

/// Floor outlet (same geometry as duplex outlet).
pub fn floor_outlet(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    outlet(center, rotation)
}

/// Data outlet: downward-pointing triangle.
pub fn data_outlet(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let tri: [[f64; 2]; 3] = [[-0.07, 0.05], [0.07, 0.05], [0.0, -0.07]];
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        tri[0],
        tri[1],
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        tri[1],
        tri[2],
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        tri[2],
        tri[0],
        SymbolLineClass::Primary,
        false,
    );
    out
}

// ── Switches ────────────────────────────────────────────────────────────────

/// Single-pole switch: circle + "S" + extending line.
pub fn switch(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.07,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "S", 0.06);
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.07, 0.0],
        [0.15, 0.0],
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Three-way switch: circle + "S3" + extending line.
pub fn three_way_switch(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.07,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "S3", 0.05);
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.07, 0.0],
        [0.15, 0.0],
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Dimmer switch: circle + "DIM" + extending line.
pub fn dimmer_switch(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.07,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "DIM", 0.04);
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.07, 0.0],
        [0.15, 0.0],
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Timer switch: circle + "ST".
pub fn timer_switch(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.07,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "ST", 0.05);
    out
}

/// Motion sensor: circle + "MS".
pub fn motion_sensor(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.07,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "MS", 0.05);
    out
}

// ── Ceiling fixtures ────────────────────────────────────────────────────────

/// Standard ceiling light fixture: circle with crosshair extending past edge.
pub fn light_fixture(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let r = 0.12;
    let ext = r + 0.06;
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        r,
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-ext, 0.0],
        [ext, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -ext],
        [0.0, ext],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Ceiling fan: circle with three curved blade arcs at 120-degree intervals.
pub fn ceiling_fan(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let r = 0.14;
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        r,
        SymbolLineClass::Primary,
        false,
    );
    let blade_radius = 0.10;
    let half_sweep = (50.0_f64 / 2.0).to_radians();
    for i in 0..3 {
        let base_angle = (i as f64 * 120.0).to_radians();
        add_arc(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [0.0, 0.0],
            blade_radius,
            base_angle - half_sweep,
            base_angle + half_sweep,
            SymbolLineClass::Secondary,
            false,
        );
    }
    add_text(&mut out, DOMAIN, center, rotation, "CF", 0.05);
    out
}

/// Recessed light: outer circle + inner circle.
pub fn recessed_light(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.075,
        SymbolLineClass::Primary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.04,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Track light: long thin rect with three dots.
pub fn track_light(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.40,
        0.06,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.12, 0.0],
        0.02,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.02,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.12, 0.0],
        0.02,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Pendant light: circle with a short stem line.
pub fn pendant_light(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.10,
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.10],
        [0.0, 0.20],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Wall sconce: half-circle (arc) + closing line.
pub fn wall_sconce(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.10,
        PI / 2.0,
        PI * 1.5,
        SymbolLineClass::Primary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -0.10],
        [0.0, 0.10],
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Outdoor light: circle + "WP".
pub fn outdoor_light(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.09,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "WP", 0.05);
    out
}

// ── Panel / boxes ───────────────────────────────────────────────────────────

/// Electrical panel: rectangle with three horizontal grid lines.
pub fn panel(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 0.26;
    let d = 0.36;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        w,
        d,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    let half_h = d / 2.0;
    let half_w = w / 2.0;
    for i in 1..=3 {
        let ly = -half_h + (i as f64 * d) / 4.0;
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [-half_w, ly],
            [half_w, ly],
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Junction box: circle + "J".
pub fn junction_box(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.08,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "J", 0.06);
    out
}

// ── Detectors / sensors (note: also in fire_safety for smoke_alarm) ─────────

/// Smoke detector (electrical system variant): circle + "SD".
pub fn smoke_detector(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.09,
        SymbolLineClass::Primary,
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "SD", 0.06);
    out
}

/// Thermostat (electrical system variant): small circle + "T".
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
    add_text(&mut out, DOMAIN, center, rotation, "T", 0.05);
    out
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outlet_produces_primitives() {
        let prims = outlet([0.0, 0.0], 0.0);
        assert!(prims.len() >= 3, "outlet should have circle + 2 lines");
    }

    #[test]
    fn light_fixture_produces_primitives() {
        let prims = light_fixture([1.0, 2.0], 0.5);
        assert!(
            prims.len() >= 3,
            "light fixture should have circle + 2 crosshairs"
        );
    }

    #[test]
    fn panel_produces_primitives() {
        let prims = panel([0.0, 0.0], 0.0);
        assert!(prims.len() >= 4, "panel should have rect + 3 grid lines");
    }

    #[test]
    fn ceiling_fan_produces_primitives() {
        let prims = ceiling_fan([0.0, 0.0], 0.0);
        // circle + 3 arcs + text = 5
        assert!(prims.len() >= 5);
    }
}
