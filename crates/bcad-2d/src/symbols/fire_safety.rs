//! Fire safety symbol generators.
//!
//! Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/fire-safety.ts`.

use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_circle, add_line, add_rect, add_text};

const DOMAIN: DomainColor = DomainColor::FireSafety;

/// Fire extinguisher: circle + "FE" label.
pub fn fire_extinguisher(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
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
    add_text(&mut out, DOMAIN, center, rotation, "FE", 0.07);
    out
}

/// Sprinkler head: outer circle + center dot + 4 radiating lines.
pub fn sprinkler_head(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
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
    let inner_r = 0.04;
    let outer_r = 0.09;
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [inner_r, 0.0],
        [outer_r, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, inner_r],
        [0.0, outer_r],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-inner_r, 0.0],
        [-outer_r, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -inner_r],
        [0.0, -outer_r],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Exit sign: rectangle + "EXIT" label + direction arrow.
pub fn exit_sign(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.30,
        0.12,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "EXIT", 0.06);
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.18, 0.0],
        [0.24, 0.0],
        SymbolLineClass::Annotation,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.21, 0.03],
        [0.24, 0.0],
        SymbolLineClass::Annotation,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.21, -0.03],
        [0.24, 0.0],
        SymbolLineClass::Annotation,
        false,
    );
    out
}

/// Pull station: small square + "FP" label.
pub fn pull_station(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.12,
        0.12,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "FP", 0.06);
    out
}

/// Smoke alarm: circle + "SA" label.
pub fn smoke_alarm(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
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
    add_text(&mut out, DOMAIN, center, rotation, "SA", 0.07);
    out
}

/// Fire alarm panel: rectangle + "FACP" label.
pub fn fire_alarm_panel(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.30,
        0.20,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "FACP", 0.05);
    out
}

/// Fire hose cabinet: wide rectangle + "FHC" label.
pub fn fire_hose_cabinet(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.60,
        0.20,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "FHC", 0.06);
    out
}

/// Annunciator: wide thin rectangle + "ANN" label.
pub fn annunciator(center: [f64; 2], rotation: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        0.40,
        0.10,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "ANN", 0.05);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sprinkler_head_produces_primitives() {
        let prims = sprinkler_head([0.0, 0.0], 0.0);
        // 2 circles + 4 lines = 6
        assert!(prims.len() >= 6);
    }

    #[test]
    fn exit_sign_produces_primitives() {
        let prims = exit_sign([0.0, 0.0], 0.0);
        // rect + text + 3 arrow lines = 5
        assert!(prims.len() >= 5);
    }
}
