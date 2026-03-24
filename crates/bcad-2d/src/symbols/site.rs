//! Site symbol generators.
//!
//! Geometry closely mirrors the TypeScript renderers in
//! `packages/ui/src/components/viewport/SiteSymbols2D.tsx`.

use std::f64::consts::TAU;

use crate::primitives::SymbolPrimitive;
use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

use super::{add_line, add_polyline, add_text};

// Site uses a green domain colour distinct from the standard nine.
// Since we only have the nine DomainColor variants, we map site to
// Architectural for the line class but the colour in the TS is #16a34a
// (green).  For now we use Furniture (which is green #166534).  A renderer
// can override if needed.
const DOMAIN: DomainColor = DomainColor::Furniture;

/// North arrow / compass: triangle pointing north + "N" label + center line.
pub fn compass(center: [f64; 2]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let size = 1.0;
    // Triangle
    let tri = [
        [0.0, size],
        [-size * 0.3, -size * 0.3],
        [size * 0.3, -size * 0.3],
        [0.0, size], // close
    ];
    add_polyline(
        &mut out,
        DOMAIN,
        center,
        0.0,
        &tri,
        SymbolLineClass::Primary,
        true,
        false,
    );
    // "N" label above
    add_text(
        &mut out,
        DOMAIN,
        [center[0], center[1] + size + 0.2],
        0.0,
        "N",
        0.25,
    );
    // Center vertical line
    add_line(
        &mut out,
        DOMAIN,
        center,
        0.0,
        [0.0, -size * 0.5],
        [0.0, size],
        SymbolLineClass::Primary,
        false,
    );
    out
}

/// Property line: thick line through points + midpoint distance labels.
pub fn property_line(points: &[[f64; 2]]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    if points.len() < 2 {
        return out;
    }

    // Use Annotation domain (architectural red would clash; property lines are red in TS).
    let domain = DomainColor::Annotation;

    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: points.to_vec(),
            closed: false,
        },
        SymbolLineClass::Cut,
        domain,
    ));

    for i in 0..points.len() - 1 {
        let [x1, y1] = points[i];
        let [x2, y2] = points[i + 1];
        let mx = (x1 + x2) / 2.0;
        let my = (y1 + y2) / 2.0;
        let dist = ((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt();
        let label = format!("{:.2}m", dist);
        add_text(&mut out, domain, [mx, my + 0.15], 0.0, &label, 0.12);
    }

    out
}

/// Tree: circle with X inside.
pub fn tree(center: [f64; 2], radius: f64) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    // Approximate circle as polyline
    let segs = 24;
    let mut pts = Vec::with_capacity(segs + 1);
    for i in 0..=segs {
        let angle = (i as f64 / segs as f64) * TAU;
        pts.push([
            center[0] + angle.cos() * radius,
            center[1] + angle.sin() * radius,
        ]);
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: pts,
            closed: true,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));
    // X inside
    let r6 = radius * 0.6;
    add_line(
        &mut out,
        DOMAIN,
        center,
        0.0,
        [-r6, -r6],
        [r6, r6],
        SymbolLineClass::Secondary,
        false,
    );
    add_line(
        &mut out,
        DOMAIN,
        center,
        0.0,
        [r6, -r6],
        [-r6, r6],
        SymbolLineClass::Secondary,
        false,
    );
    out
}

/// Parking space: rectangle + diagonal line.
pub fn parking_space(p1: [f64; 2], p2: [f64; 2]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let w = 2.5;
    let d = 5.0;
    let angle = (p2[1] - p1[1]).atan2(p2[0] - p1[0]);
    let cos = angle.cos();
    let sin = angle.sin();
    let cx = (p1[0] + p2[0]) / 2.0;
    let cy = (p1[1] + p2[1]) / 2.0;

    let rot =
        |dx: f64, dy: f64| -> [f64; 2] { [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] };
    let hw = w / 2.0;
    let hd = d / 2.0;

    let rect = vec![
        rot(-hw, -hd),
        rot(hw, -hd),
        rot(hw, hd),
        rot(-hw, hd),
        rot(-hw, -hd),
    ];
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: rect,
            closed: true,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));
    // Diagonal
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: vec![rot(-hw, -hd), rot(hw, hd)],
            closed: false,
        },
        SymbolLineClass::Secondary,
        DOMAIN,
    ));
    out
}

/// Fence: line through points + X marks at regular intervals.
pub fn fence(points: &[[f64; 2]]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    if points.len() < 2 {
        return out;
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: points.to_vec(),
            closed: false,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));

    let mark_size = 0.08;
    for i in 0..points.len() - 1 {
        let [x1, y1] = points[i];
        let [x2, y2] = points[i + 1];
        let dx = x2 - x1;
        let dy = y2 - y1;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 0.3 {
            continue;
        }
        let x_count = (len / 0.5).floor().max(1.0) as i32;
        for j in 1..x_count {
            let t = j as f64 / x_count as f64;
            let px = x1 + dx * t;
            let py = y1 + dy * t;
            add_line(
                &mut out,
                DOMAIN,
                [px, py],
                0.0,
                [-mark_size, -mark_size],
                [mark_size, mark_size],
                SymbolLineClass::Secondary,
                false,
            );
            add_line(
                &mut out,
                DOMAIN,
                [px, py],
                0.0,
                [mark_size, -mark_size],
                [-mark_size, mark_size],
                SymbolLineClass::Secondary,
                false,
            );
        }
    }
    out
}

/// Contour line: polyline through points + optional elevation label.
pub fn contour_line(points: &[[f64; 2]], elevation: Option<f64>) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    if points.len() < 2 {
        return out;
    }
    let domain = DomainColor::Annotation;
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: points.to_vec(),
            closed: false,
        },
        SymbolLineClass::Annotation,
        domain,
    ));
    if let Some(elev) = elevation {
        let mid = points.len() / 2;
        let [mx, my] = points[mid];
        let label = format!("{:.1}m", elev);
        add_text(&mut out, domain, [mx, my + 0.1], 0.0, &label, 0.10);
    }
    out
}

/// Setback line: dashed polyline.
pub fn setback(points: &[[f64; 2]]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    if points.len() < 2 {
        return out;
    }
    out.push(StyledPrimitive::dashed(
        SymbolPrimitive::Polyline {
            points: points.to_vec(),
            closed: false,
        },
        SymbolLineClass::Primary,
        DomainColor::Annotation,
    ));
    out
}

/// Sidewalk: line through points + perpendicular hatch lines.
pub fn sidewalk(points: &[[f64; 2]]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    if points.len() < 2 {
        return out;
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: points.to_vec(),
            closed: false,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));

    for i in 0..points.len() - 1 {
        let [x1, y1] = points[i];
        let [x2, y2] = points[i + 1];
        let dx = x2 - x1;
        let dy = y2 - y1;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 0.1 {
            continue;
        }
        let nx = -dy / len * 0.5;
        let ny = dx / len * 0.5;
        let hatch_count = (len / 0.5).floor().max(2.0) as i32;
        for j in 0..=hatch_count {
            let t = j as f64 / hatch_count as f64;
            let px = x1 + dx * t;
            let py = y1 + dy * t;
            out.push(StyledPrimitive::new(
                SymbolPrimitive::Polyline {
                    points: vec![[px + nx, py + ny], [px - nx, py - ny]],
                    closed: false,
                },
                SymbolLineClass::Secondary,
                DOMAIN,
            ));
        }
    }
    out
}

/// Driveway: closed polygon outline.
pub fn driveway(points: &[[f64; 2]]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    if points.len() < 2 {
        return out;
    }
    let close = points.len() >= 3;
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: points.to_vec(),
            closed: close,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));
    out
}

/// Retaining wall: thick polyline.
pub fn retaining(points: &[[f64; 2]]) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    if points.len() < 2 {
        return out;
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: points.to_vec(),
            closed: false,
        },
        SymbolLineClass::Cut,
        DOMAIN,
    ));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compass_produces_primitives() {
        let prims = compass([0.0, 0.0]);
        assert!(
            prims.len() >= 3,
            "compass should have triangle + N label + center line"
        );
    }

    #[test]
    fn tree_produces_primitives() {
        let prims = tree([0.0, 0.0], 1.5);
        // circle polyline + 2 X lines = 3
        assert!(prims.len() >= 3);
    }

    #[test]
    fn fence_with_marks() {
        let pts = [[0.0, 0.0], [5.0, 0.0]];
        let prims = fence(&pts);
        // line + some X marks
        assert!(prims.len() >= 2);
    }
}
