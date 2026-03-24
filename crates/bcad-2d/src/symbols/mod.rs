//! Symbol generator modules.
//!
//! Each sub-module exposes one or more pure functions that accept element
//! parameters and return `Vec<StyledPrimitive>`.

pub mod accessibility;
pub mod cabinet;
pub mod door_window;
pub mod electrical;
pub mod fire_safety;
pub mod furniture;
pub mod hvac;
pub mod plumbing;
pub mod site;

use crate::primitives::{
    rect_points, rotate_and_translate, transform_points, SymbolPrimitive, TextAnchor,
};
use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

// ---------------------------------------------------------------------------
// Shared builder helpers -- mirrors the TS `_helpers.ts` module
// ---------------------------------------------------------------------------

/// Push a rectangle (closed polyline) centered at `center` with optional
/// local-space offset.
pub(crate) fn add_rect(
    out: &mut Vec<StyledPrimitive>,
    domain: DomainColor,
    center: [f64; 2],
    rotation: f64,
    width: f64,
    depth: f64,
    line_class: SymbolLineClass,
    offset: [f64; 2],
    dashed: bool,
) {
    let pts = rect_points(width, depth);
    let shifted: Vec<[f64; 2]> = pts
        .iter()
        .map(|[px, py]| [px + offset[0], py + offset[1]])
        .collect();
    let world = transform_points(&shifted, center, rotation);
    let prim = SymbolPrimitive::Polyline {
        points: world,
        closed: true,
    };
    if dashed {
        out.push(StyledPrimitive::dashed(prim, line_class, domain));
    } else {
        out.push(StyledPrimitive::new(prim, line_class, domain));
    }
}

/// Push a line segment between two local-space points.
pub(crate) fn add_line(
    out: &mut Vec<StyledPrimitive>,
    domain: DomainColor,
    center: [f64; 2],
    rotation: f64,
    start: [f64; 2],
    end: [f64; 2],
    line_class: SymbolLineClass,
    dashed: bool,
) {
    let world = transform_points(&[start, end], center, rotation);
    let prim = SymbolPrimitive::Polyline {
        points: world,
        closed: false,
    };
    if dashed {
        out.push(StyledPrimitive::dashed(prim, line_class, domain));
    } else {
        out.push(StyledPrimitive::new(prim, line_class, domain));
    }
}

/// Push a circle at a local-space center.
pub(crate) fn add_circle(
    out: &mut Vec<StyledPrimitive>,
    domain: DomainColor,
    center: [f64; 2],
    rotation: f64,
    local_center: [f64; 2],
    radius: f64,
    line_class: SymbolLineClass,
    dashed: bool,
) {
    let world_center = rotate_and_translate(local_center, center, rotation);
    let prim = SymbolPrimitive::Circle {
        center: world_center,
        radius,
    };
    if dashed {
        out.push(StyledPrimitive::dashed(prim, line_class, domain));
    } else {
        out.push(StyledPrimitive::new(prim, line_class, domain));
    }
}

/// Push a circular arc at a local-space center.
///
/// `start_angle` and `end_angle` are in radians and will be offset by the
/// element rotation so the arc rotates with the symbol.
pub(crate) fn add_arc(
    out: &mut Vec<StyledPrimitive>,
    domain: DomainColor,
    center: [f64; 2],
    rotation: f64,
    local_center: [f64; 2],
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    line_class: SymbolLineClass,
    dashed: bool,
) {
    let world_center = rotate_and_translate(local_center, center, rotation);
    let prim = SymbolPrimitive::Arc {
        center: world_center,
        radius,
        start_angle: start_angle + rotation,
        end_angle: end_angle + rotation,
    };
    if dashed {
        out.push(StyledPrimitive::dashed(prim, line_class, domain));
    } else {
        out.push(StyledPrimitive::new(prim, line_class, domain));
    }
}

/// Push a text label positioned at `center` (world space already assumed via
/// `position`).
pub(crate) fn add_text(
    out: &mut Vec<StyledPrimitive>,
    domain: DomainColor,
    position: [f64; 2],
    _rotation: f64,
    text: &str,
    size: f64,
) {
    let prim = SymbolPrimitive::Text {
        position,
        content: text.to_string(),
        font_size: size,
        anchor: TextAnchor::Center,
    };
    out.push(StyledPrimitive::new(
        prim,
        SymbolLineClass::Annotation,
        domain,
    ));
}

/// Push a closed or open polyline from local-space points.
pub(crate) fn add_polyline(
    out: &mut Vec<StyledPrimitive>,
    domain: DomainColor,
    center: [f64; 2],
    rotation: f64,
    local_points: &[[f64; 2]],
    line_class: SymbolLineClass,
    closed: bool,
    dashed: bool,
) {
    let world = transform_points(local_points, center, rotation);
    let prim = SymbolPrimitive::Polyline {
        points: world,
        closed,
    };
    if dashed {
        out.push(StyledPrimitive::dashed(prim, line_class, domain));
    } else {
        out.push(StyledPrimitive::new(prim, line_class, domain));
    }
}

/// Push an ellipse approximated as a closed polyline.
pub(crate) fn add_ellipse(
    out: &mut Vec<StyledPrimitive>,
    domain: DomainColor,
    center: [f64; 2],
    rotation: f64,
    local_center: [f64; 2],
    rx: f64,
    ry: f64,
    line_class: SymbolLineClass,
    segments: usize,
) {
    let mut pts = Vec::with_capacity(segments + 1);
    for i in 0..=segments {
        let angle = (i as f64 / segments as f64) * std::f64::consts::TAU;
        pts.push([
            local_center[0] + angle.cos() * rx,
            local_center[1] + angle.sin() * ry,
        ]);
    }
    let world = transform_points(&pts, center, rotation);
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: world,
            closed: true,
        },
        line_class,
        domain,
    ));
}

/// Clamp a value to `[min, max]`.
///
/// Delegates to [`f64::clamp`] from std. Kept as a convenience alias to avoid
/// `use std::cmp` in symbol generator modules.
pub(crate) fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.clamp(min, max)
}
