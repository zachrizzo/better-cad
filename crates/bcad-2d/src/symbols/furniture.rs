//! Furniture symbol generators.
//!
//! Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/furniture.ts`.

use std::f64::consts::PI;

use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_arc, add_circle, add_line, add_rect, add_text, clamp};

const DOMAIN: DomainColor = DomainColor::Furniture;
const LC: SymbolLineClass = SymbolLineClass::Primary;

/// Desk: rectangle + inner line + keyboard tray rect.
pub fn desk(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.42, depth * 0.28],
        [width * 0.42, depth * 0.28],
        SymbolLineClass::Secondary,
        false,
    );
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.4,
        depth * 0.28,
        SymbolLineClass::Secondary,
        [0.0, -depth * 0.18],
        false,
    );
    out
}

/// Chair: seat circle + backrest arc + front edge line.
pub fn chair(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    let seat_r = min_dim * 0.28;
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        seat_r,
        LC,
        false,
    );
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        seat_r * 1.55,
        PI * 0.2,
        PI * 0.8,
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-seat_r * 0.7, seat_r * 0.88],
        [seat_r * 0.7, seat_r * 0.88],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Generic table: rect + center cross lines.
pub fn table(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.9,
        depth * 0.9,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.38, 0.0],
        [width * 0.38, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -depth * 0.38],
        [0.0, depth * 0.38],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Dining table: circle or rect depending on aspect ratio, with chair dots.
pub fn dining_table(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    let max_dim = width.max(depth);

    if (width - depth).abs() <= max_dim * 0.18 {
        add_circle(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [0.0, 0.0],
            min_dim * 0.42,
            LC,
            false,
        );
    } else {
        add_rect(
            &mut out,
            DOMAIN,
            center,
            rotation,
            width * 0.9,
            depth * 0.68,
            LC,
            [0.0, 0.0],
            false,
        );
    }
    let chair_r = clamp(min_dim * 0.09, 0.08, 0.16);
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, depth * 0.43],
        chair_r,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -depth * 0.43],
        chair_r,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.43, 0.0],
        chair_r,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.43, 0.0],
        chair_r,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Bed: rect + headboard rect + two pillow arcs.
pub fn bed(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.96,
        depth * 0.12,
        SymbolLineClass::Secondary,
        [0.0, depth * 0.44],
        false,
    );
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.23, depth * 0.34],
        width * 0.16,
        PI,
        PI * 2.0,
        SymbolLineClass::Secondary,
        false,
    );
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.23, depth * 0.34],
        width * 0.16,
        PI,
        PI * 2.0,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Sofa: rect + backrest rect + arm arcs + cushion dividers.
pub fn sofa(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.82,
        depth * 0.22,
        SymbolLineClass::Secondary,
        [0.0, depth * 0.33],
        false,
    );
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.36, 0.0],
        depth * 0.38,
        PI * 0.5,
        PI * 1.5,
        SymbolLineClass::Secondary,
        false,
    );
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.36, 0.0],
        depth * 0.38,
        -PI * 0.5,
        PI * 0.5,
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.13, -depth * 0.25],
        [-width * 0.13, depth * 0.25],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.13, -depth * 0.25],
        [width * 0.13, depth * 0.25],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.3, -depth * 0.06],
        [width * 0.3, -depth * 0.06],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Bookshelf: rect + shelf lines.
pub fn bookshelf(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.46, depth * 0.32],
        [width * 0.46, depth * 0.32],
        LC,
        false,
    );
    let shelf_count = clamp((width / 0.45).round(), 2.0, 6.0) as i32;
    for i in 1..shelf_count {
        let t = i as f64 / shelf_count as f64;
        let lx = -width / 2.0 + width * t;
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [lx, -depth / 2.0],
            [lx, depth / 2.0],
            SymbolLineClass::Secondary,
            false,
        );
    }
    let shelf_rows = clamp((depth / 0.25).round(), 2.0, 4.0) as i32;
    for i in 1..shelf_rows {
        let t = i as f64 / shelf_rows as f64;
        let ly = -depth / 2.0 + depth * t;
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [-width * 0.46, ly],
            [width * 0.46, ly],
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Wardrobe: rect + vertical center line + horizontal center line + two handle dots.
pub fn wardrobe(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -depth / 2.0],
        [0.0, depth / 2.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.46, 0.0],
        [width * 0.46, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.22, depth * 0.1],
        0.03,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.22, depth * 0.1],
        0.03,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Refrigerator: rect + divider line + handle.
pub fn refrigerator(
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
        LC,
        [0.0, 0.0],
        false,
    );
    if width >= depth {
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [0.0, -depth * 0.48],
            [0.0, depth * 0.48],
            SymbolLineClass::Secondary,
            false,
        );
    } else {
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [-width * 0.48, 0.0],
            [width * 0.48, 0.0],
            SymbolLineClass::Secondary,
            false,
        );
    }
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.06, depth * 0.12],
        [width * 0.06, depth * 0.12],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Stove/range: rect + control panel rect + four burner circles.
pub fn stove(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.8,
        depth * 0.14,
        SymbolLineClass::Secondary,
        [0.0, depth * 0.35],
        false,
    );
    let offsets: [[f64; 2]; 4] = [
        [-width * 0.2, -depth * 0.2],
        [width * 0.2, -depth * 0.2],
        [-width * 0.2, depth * 0.2],
        [width * 0.2, depth * 0.2],
    ];
    for offset in &offsets {
        add_circle(
            &mut out,
            DOMAIN,
            center,
            rotation,
            *offset,
            min_dim * 0.11,
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Washer or dryer: rect + control panel + inner drum circles.
pub fn washer_dryer(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.88,
        depth * 0.2,
        SymbolLineClass::Secondary,
        [0.0, depth * 0.34],
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -depth * 0.02],
        min_dim * 0.24,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -depth * 0.02],
        min_dim * 0.12,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Nightstand: rect + drawer line + knob circle.
pub fn nightstand(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.4, 0.0],
        [width * 0.4, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -depth * 0.22],
        min_dim * 0.05,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Coffee table: circle or rect depending on aspect ratio + center line.
pub fn coffee_table(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    let max_dim = width.max(depth);
    if (width - depth).abs() <= max_dim * 0.2 {
        add_circle(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [0.0, 0.0],
            min_dim * 0.42,
            LC,
            false,
        );
    } else {
        add_rect(
            &mut out,
            DOMAIN,
            center,
            rotation,
            width * 0.86,
            depth * 0.62,
            LC,
            [0.0, 0.0],
            false,
        );
    }
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.24, 0.0],
        [width * 0.24, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// TV console: rect + two vertical partition lines.
pub fn tv_console(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width / 6.0, -depth * 0.46],
        [-width / 6.0, depth * 0.46],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width / 6.0, -depth * 0.46],
        [width / 6.0, depth * 0.46],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Console table: rect + two vertical leg lines.
pub fn console_table(
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
        width * 0.96,
        depth * 0.42,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.32, -depth * 0.2],
        [-width * 0.32, depth * 0.2],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.32, -depth * 0.2],
        [width * 0.32, depth * 0.2],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Bench: rect + two leg lines.
pub fn bench(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.96,
        depth * 0.56,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.3, -depth * 0.26],
        [-width * 0.3, depth * 0.26],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.3, -depth * 0.26],
        [width * 0.3, depth * 0.26],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Ottoman: rect + X pattern.
pub fn ottoman(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.9,
        depth * 0.9,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.35, -depth * 0.35],
        [width * 0.35, depth * 0.35],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.35, -depth * 0.35],
        [-width * 0.35, depth * 0.35],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Vanity: rect + mirror line + basin circle.
pub fn vanity(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.44, depth * 0.2],
        [width * 0.44, depth * 0.2],
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        min_dim * 0.16,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Fireplace: rect + arch arc.
pub fn fireplace(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, -depth * 0.1],
        min_dim * 0.28,
        PI,
        PI * 2.0,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Plant: circle + radiating ray lines.
pub fn plant(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [0.0, 0.0],
        min_dim * 0.35,
        LC,
        false,
    );
    let ray_len = min_dim * 0.12;
    let ray_start = min_dim * 0.38;
    for i in 0..8 {
        let angle = i as f64 * PI / 4.0;
        add_line(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [angle.cos() * ray_start, angle.sin() * ray_start],
            [
                angle.cos() * (ray_start + ray_len),
                angle.sin() * (ray_start + ray_len),
            ],
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Mirror: rect + X lines.
pub fn mirror(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.4, -depth * 0.4],
        [width * 0.4, depth * 0.4],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.4, -depth * 0.4],
        [-width * 0.4, depth * 0.4],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Conference table: rect + center line + seat circles.
pub fn conference_table(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.92,
        depth * 0.58,
        LC,
        [0.0, 0.0],
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.4, 0.0],
        [width * 0.4, 0.0],
        SymbolLineClass::Secondary,
        false,
    );
    let seats = clamp((width / 0.75).round(), 4.0, 8.0) as i32;
    let seat_r = clamp(min_dim * 0.07, 0.06, 0.12);
    for i in 0..seats {
        let t = if seats == 1 {
            0.5
        } else {
            i as f64 / (seats - 1) as f64
        };
        let sx = -width * 0.38 + width * 0.76 * t;
        add_circle(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [sx, depth * 0.42],
            seat_r,
            SymbolLineClass::Secondary,
            false,
        );
        add_circle(
            &mut out,
            DOMAIN,
            center,
            rotation,
            [sx, -depth * 0.42],
            seat_r,
            SymbolLineClass::Secondary,
            false,
        );
    }
    out
}

/// Kitchen island: rect + sink basin rect + faucet circles.
pub fn kitchen_island(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width * 0.24,
        depth * 0.22,
        SymbolLineClass::Secondary,
        [-width * 0.18, 0.0],
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.18, 0.0],
        min_dim * 0.04,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.24, -depth * 0.08],
        min_dim * 0.06,
        SymbolLineClass::Secondary,
        false,
    );
    add_circle(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [width * 0.24, depth * 0.08],
        min_dim * 0.06,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Range hood: rect + arc.
pub fn range_hood(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_arc(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-width * 0.2, -depth * 0.2],
        min_dim * 0.3,
        0.0,
        PI / 2.0,
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Artwork: rect + corner marks.
pub fn artwork(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    let cm = min_dim * 0.08;
    let hw = width / 2.0;
    let hd = depth / 2.0;
    // Bottom-left corner
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, -hd],
        [-hw + cm, -hd],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, -hd],
        [-hw, -hd + cm],
        SymbolLineClass::Secondary,
        false,
    );
    // Bottom-right corner
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [hw, -hd],
        [hw - cm, -hd],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [hw, -hd],
        [hw, -hd + cm],
        SymbolLineClass::Secondary,
        false,
    );
    // Top-left corner
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd],
        [-hw + cm, hd],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [-hw, hd],
        [-hw, hd - cm],
        SymbolLineClass::Secondary,
        false,
    );
    // Top-right corner
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [hw, hd],
        [hw - cm, hd],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        rotation,
        [hw, hd],
        [hw, hd - cm],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Microwave: rect + "MW" label.
pub fn microwave(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "MW", min_dim * 0.24);
    out
}

/// Oven: rect + "OVN" label.
pub fn oven(center: [f64; 2], rotation: f64, width: f64, depth: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "OVN", min_dim * 0.24);
    out
}

/// Coffee maker: rect + "CM" label.
pub fn coffee_maker(
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let min_dim = width.min(depth);
    add_rect(
        &mut out,
        DOMAIN,
        center,
        rotation,
        width,
        depth,
        LC,
        [0.0, 0.0],
        false,
    );
    add_text(&mut out, DOMAIN, center, rotation, "CM", min_dim * 0.24);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desk_produces_primitives() {
        let prims = desk([0.0, 0.0], 0.0, 1.2, 0.6);
        assert!(prims.len() >= 3);
    }

    #[test]
    fn sofa_produces_primitives() {
        let prims = sofa([0.0, 0.0], 0.0, 2.0, 0.9);
        assert!(prims.len() >= 7);
    }

    #[test]
    fn bed_produces_primitives() {
        let prims = bed([0.0, 0.0], 0.0, 1.4, 2.0);
        assert!(prims.len() >= 4);
    }

    #[test]
    fn dining_table_round() {
        // When width ~= depth, should produce circle form
        let prims = dining_table([0.0, 0.0], 0.0, 1.0, 1.0);
        assert!(prims.len() >= 5);
    }
}
