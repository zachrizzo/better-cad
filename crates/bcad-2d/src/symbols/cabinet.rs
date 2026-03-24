//! Cabinet symbol generators.
//!
//! Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/cabinet.ts`.

use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_ellipse, add_line, add_rect};

const DOMAIN: DomainColor = DomainColor::Cabinet;

/// Base cabinet: solid rect + countertop overhang + optional door partition.
pub fn base_cabinet(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
    door_count: u32,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd + 0.025],
        [hw, hd + 0.025],
        SymbolLineClass::Secondary,
        false,
    );
    if door_count >= 2 {
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [0.0, -hd],
            [0.0, hd],
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Drawer base: base cabinet + horizontal drawer lines.
pub fn drawer_base(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd + 0.025],
        [hw, hd + 0.025],
        SymbolLineClass::Secondary,
        false,
    );
    for i in 1..=3 {
        let ly = -hd + (depth * i as f64 / 4.0);
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [-hw, ly],
            [hw, ly],
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Upper (wall) cabinet: dashed rectangle + dashed shelf line.
pub fn upper_cabinet(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        true,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, 0.0],
        [hw, 0.0],
        SymbolLineClass::Secondary,
        true,
    );
    out
}

/// Tall / pantry cabinet: solid rect + horizontal divider.
pub fn tall_cabinet(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, 0.0],
        [hw, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Corner base cabinet: rect + diagonal line.
pub fn corner_base(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd],
        [hw, -hd],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Corner upper cabinet: dashed rect + dashed diagonal.
pub fn corner_upper(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        true,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd],
        [hw, -hd],
        SymbolLineClass::Secondary,
        true,
    );
    out
}

/// Corner tall cabinet: solid rect + diagonal + horizontal divider.
pub fn corner_tall(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd],
        [hw, -hd],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, 0.0],
        [hw, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Sink base cabinet: rect + countertop overhang + basin ellipse.
pub fn sink_base(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd + 0.025],
        [hw, hd + 0.025],
        SymbolLineClass::Secondary,
        false,
    );
    add_ellipse(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.05],
        width * 0.3,
        depth * 0.25,
        SymbolLineClass::Secondary,
        24,
    );
    out
}

/// Lazy susan: square + X diagonals.
pub fn lazy_susan(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hw = width / 2.0;
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, -hd],
        [hw, hd],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [hw, -hd],
        [-hw, hd],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Blind corner: rect + vertical partition.
pub fn blind_corner(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let hd = depth / 2.0;
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -hd],
        [0.0, hd],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Appliance garage: dashed rectangle (above counter).
pub fn appliance_garage(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        SymbolLineClass::Primary,
        [0.0, 0.0],
        true,
    );
    out
}

/// Pantry cabinet (same as tall_cabinet).
pub fn pantry(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    tall_cabinet(center, rotation, width, depth)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_cabinet_produces_primitives() {
        let prims = base_cabinet([0.0, 0.0], 0.0, 0.6, 0.6, 2);
        // rect + overhang + partition = 3
        assert!(prims.len() >= 3);
    }

    #[test]
    fn upper_cabinet_is_dashed() {
        let prims = upper_cabinet([0.0, 0.0], 0.0, 0.6, 0.3);
        assert!(prims.len() >= 2);
        assert!(prims[0].dashed, "upper cabinet rect should be dashed");
    }

    #[test]
    fn lazy_susan_has_x_diagonals() {
        let prims = lazy_susan([0.0, 0.0], 0.0, 0.6, 0.6);
        // rect + 2 diags = 3
        assert!(prims.len() >= 3);
    }
}
