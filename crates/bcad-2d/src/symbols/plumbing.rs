//! Plumbing symbol generators.
//!
//! Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/plumbing.ts`.

use std::f64::consts::PI;

use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_circle, add_ellipse, add_line, add_polyline, add_rect, add_text};

const DOMAIN: DomainColor = DomainColor::Plumbing;

/// Toilet: rear tank rect + elongated bowl polyline + inner seat polyline.
pub fn toilet(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 0.38;
    let d = 0.70;

    // Tank rectangle at rear
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        w * 0.9,
        d * 0.25,
        SymbolLineClass::Primary,
        [0.0, d * 0.35],
        false,
    );

    // Bowl outline: U-shape with semicircular front
    let bowl_w = w * 0.45;
    let bowl_top = d * 0.18;
    let bowl_bot = -d * 0.35;
    let arc_center_y = bowl_bot * 0.4;
    let arc_segments = 12;

    let mut bowl_pts = Vec::new();
    bowl_pts.push([bowl_w, bowl_top]);
    bowl_pts.push([bowl_w, bowl_bot * 0.4]);
    for i in 0..=arc_segments {
        let angle = -PI / 2.0 + (PI * i as f64) / arc_segments as f64;
        bowl_pts.push([
            angle.cos() * bowl_w,
            arc_center_y + angle.sin() * (bowl_bot * 0.6 * -1.0),
        ]);
    }
    bowl_pts.push([-bowl_w, bowl_bot * 0.4]);
    bowl_pts.push([-bowl_w, bowl_top]);
    add_polyline(
        &mut out,
        DOMAIN,
        center,
        rotation,
        &bowl_pts,
        SymbolLineClass::Primary,
        true,
        false,
    );

    // Inner seat outline
    let inset = 0.025;
    let seat_w = bowl_w - inset;
    let seat_top = bowl_top - inset;
    let seat_bot_mid = bowl_bot * 0.4;
    let mut seat_pts = Vec::new();
    seat_pts.push([seat_w, seat_top]);
    seat_pts.push([seat_w, seat_bot_mid]);
    for i in 0..=arc_segments {
        let angle = -PI / 2.0 + (PI * i as f64) / arc_segments as f64;
        seat_pts.push([
            angle.cos() * seat_w,
            seat_bot_mid + angle.sin() * (bowl_bot * 0.6 * -1.0 - inset),
        ]);
    }
    seat_pts.push([-seat_w, seat_bot_mid]);
    seat_pts.push([-seat_w, seat_top]);
    add_polyline(
        &mut out,
        DOMAIN,
        center,
        rotation,
        &seat_pts,
        SymbolLineClass::Secondary,
        true,
        false,
    );

    out
}

/// Sink: outer vanity rect + elliptical basin + drain dot + faucet lines.
pub fn sink(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 0.50;
    let d = 0.40;
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
    add_ellipse(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.12,
        0.08,
        SymbolLineClass::Secondary,
        24,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.015,
        SymbolLineClass::Primary,
        false,
    );
    let faucet_y = d * 0.38;
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-0.03, faucet_y],
        [-0.03, faucet_y - 0.05],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.03, faucet_y],
        [0.03, faucet_y - 0.05],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Bathtub: rounded-corner outer rect + inner rect + drain circle.
pub fn bathtub(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 0.76;
    let d = 1.52;
    let r = 0.08;
    let hw = w / 2.0;
    let hd = d / 2.0;
    let corner_segs = 6;

    let mut outer = Vec::new();
    // Top-right corner
    for i in 0..=corner_segs {
        let angle = (PI / 2.0) * (i as f64 / corner_segs as f64);
        outer.push([hw - r + angle.cos() * r, hd - r + angle.sin() * r]);
    }
    // Top-left corner
    for i in 0..=corner_segs {
        let angle = PI / 2.0 + (PI / 2.0) * (i as f64 / corner_segs as f64);
        outer.push([-(hw - r) + angle.cos() * r, hd - r + angle.sin() * r]);
    }
    // Bottom-left corner
    for i in 0..=corner_segs {
        let angle = PI + (PI / 2.0) * (i as f64 / corner_segs as f64);
        outer.push([-(hw - r) + angle.cos() * r, -(hd - r) + angle.sin() * r]);
    }
    // Bottom-right corner
    for i in 0..=corner_segs {
        let angle = 3.0 * PI / 2.0 + (PI / 2.0) * (i as f64 / corner_segs as f64);
        outer.push([hw - r + angle.cos() * r, -(hd - r) + angle.sin() * r]);
    }
    add_polyline(
        &mut out,
        DOMAIN,
        center,
        rotation,
        &outer,
        SymbolLineClass::Primary,
        true,
        false,
    );

    let inset = 0.06;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        w - inset * 2.0,
        d - inset * 2.0,
        SymbolLineClass::Secondary,
        [0.0, 0.0],
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -hd + 0.20],
        0.02,
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Shower: square outline + center drain + shower head circle.
pub fn shower(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let s = 0.90;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        s,
        s,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.02,
        SymbolLineClass::Primary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, s / 2.0 - 0.08],
        0.04,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Urinal: U-shape with semicircular bottom + drain circle.
pub fn urinal(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 0.38;
    let d = 0.36;
    let hw = w / 2.0;
    let hd = d / 2.0;
    let u_segs = 12;

    let mut pts = Vec::new();
    pts.push([-hw, hd]);
    pts.push([-hw, -hd * 0.3]);
    for i in 0..=u_segs {
        let angle = PI + (PI * i as f64) / u_segs as f64;
        pts.push([angle.cos() * hw, -hd * 0.3 + angle.sin() * (hd * 0.7)]);
    }
    pts.push([hw, -hd * 0.3]);
    pts.push([hw, hd]);
    add_polyline(
        &mut out,
        DOMAIN,
        center,
        rotation,
        &pts,
        SymbolLineClass::Primary,
        true,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -hd * 0.3],
        0.02,
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Water heater: large circle + "WH" label.
pub fn water_heater(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
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
    add_text(&mut out, DOMAIN, center, rotation, "WH", 0.12);
    out
}

/// Floor drain: circle + cross pattern.
pub fn floor_drain(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.12,
        SymbolLineClass::Primary,
        false,
    );
    let half = 0.05;
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-half, 0.0],
        [half, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -half],
        [0.0, half],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Dishwasher: square + horizontal center line.
pub fn dishwasher(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let s = 0.60;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        s,
        s,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-s / 2.0, 0.0],
        [s / 2.0, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Washing machine: square + inner drum circle.
pub fn washing_machine(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let s = 0.65;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        s,
        s,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.20,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Hose bib: small triangle.
pub fn hose_bib(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let pts: [[f64; 2]; 3] = [[-0.08, 0.08], [0.08, 0.08], [0.0, -0.08]];
    add_polyline(
        &mut out,
        DOMAIN,
        center,
        rotation,
        &pts,
        SymbolLineClass::Secondary,
        true,
        false,
    );
    out
}

/// Double sink: wide rect + two ellipses + center divider.
pub fn double_sink(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 0.80;
    let d = 0.50;
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
    add_ellipse(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-w * 0.2, 0.0],
        0.10,
        0.07,
        SymbolLineClass::Secondary,
        24,
    );
    add_ellipse(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [w * 0.2, 0.0],
        0.10,
        0.07,
        SymbolLineClass::Secondary,
        24,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -d * 0.4],
        [0.0, d * 0.4],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Bidet: ellipse.
pub fn bidet(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_ellipse(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.15,
        0.12,
        SymbolLineClass::Primary,
        24,
    );
    out
}

/// Utility sink: outer + inner rectangles.
pub fn utility_sink(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 0.60;
    let d = 0.50;
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
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        w * 0.8,
        d * 0.75,
        SymbolLineClass::Secondary,
        [0.0, 0.0],
        false,
    );
    out
}

/// Pedestal sink: ellipse + center drain circle.
pub fn pedestal_sink(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_ellipse(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        0.18,
        0.14,
        SymbolLineClass::Primary,
        24,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toilet_produces_primitives() {
        let prims = toilet([0.0, 0.0], 0.0);
        assert!(prims.len() >= 3, "toilet should have tank + bowl + seat");
    }

    #[test]
    fn sink_produces_primitives() {
        let prims = sink([1.0, 1.0], 0.0);
        assert!(prims.len() >= 4);
    }

    #[test]
    fn bathtub_produces_primitives() {
        let prims = bathtub([0.0, 0.0], 0.0);
        assert!(prims.len() >= 3);
    }
}
