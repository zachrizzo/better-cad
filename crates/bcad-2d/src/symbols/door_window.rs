//! Door and window symbol generators.
//!
//! Geometry closely mirrors the TypeScript generators in
//! `packages/ui/src/standards/symbol-generators/doors.ts` and
//! `packages/ui/src/standards/symbol-generators/windows.ts`.

use std::f64::consts::PI;

use crate::primitives::SymbolPrimitive;
use crate::style::{DomainColor, StyledPrimitive, SymbolLineClass};

const DOMAIN: DomainColor = DomainColor::Architectural;

// ---------------------------------------------------------------------------
// Door symbols
// ---------------------------------------------------------------------------

/// Parameters needed to draw a door in plan.
pub struct DoorParams {
    /// Position along the wall (0..1 parameter mapped to world coords).
    pub center: [f64; 2],
    /// Unit direction vector along the wall.
    pub dir: [f64; 2],
    /// Unit normal (perpendicular to wall, pointing to one side).
    pub normal: [f64; 2],
    /// Door width (opening width) in metres.
    pub width: f64,
    /// Wall thickness (for pocket/sliding depth calcs).
    pub wall_thickness: f64,
    /// `"left"` or `"right"`.
    pub swing: Swing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Swing {
    Left,
    Right,
}

/// Single swing door: opening span + leaf line + quarter-arc sweep.
pub fn single_swing_door(p: &DoorParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let half = p.width / 2.0;
    let dir = p.dir;
    let normal = p.normal;
    let cx = p.center[0];
    let cy = p.center[1];

    // Opening span line
    let span_s = [cx - dir[0] * half, cy - dir[1] * half];
    let span_e = [cx + dir[0] * half, cy + dir[1] * half];
    push_line(&mut out, span_s, span_e, SymbolLineClass::Secondary);

    // Hinge and swing directions
    let (hinge, closed_dir, open_dir) = match p.swing {
        Swing::Left => {
            let h = [cx - dir[0] * half, cy - dir[1] * half];
            (h, dir, normal)
        }
        Swing::Right => {
            let h = [cx + dir[0] * half, cy + dir[1] * half];
            (h, [-dir[0], -dir[1]], [-normal[0], -normal[1]])
        }
    };

    // Door leaf line from hinge to open position
    let leaf_end = [
        hinge[0] + open_dir[0] * p.width,
        hinge[1] + open_dir[1] * p.width,
    ];
    push_line(&mut out, hinge, leaf_end, SymbolLineClass::Primary);

    // Quarter-arc sweep
    let mut arc_pts = Vec::with_capacity(15);
    for i in 0..=14 {
        let theta = (PI / 2.0) * (i as f64 / 14.0);
        arc_pts.push([
            hinge[0] + p.width * (closed_dir[0] * theta.cos() + open_dir[0] * theta.sin()),
            hinge[1] + p.width * (closed_dir[1] * theta.cos() + open_dir[1] * theta.sin()),
        ]);
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: arc_pts,
            closed: false,
        },
        SymbolLineClass::Secondary,
        DOMAIN,
    ));

    out
}

/// Double swing door: two mirror-image single-swing leaves.
pub fn double_swing_door(p: &DoorParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let half = p.width / 2.0;
    let dir = p.dir;
    let normal = p.normal;
    let cx = p.center[0];
    let cy = p.center[1];

    // Opening span
    let span_s = [cx - dir[0] * half, cy - dir[1] * half];
    let span_e = [cx + dir[0] * half, cy + dir[1] * half];
    push_line(&mut out, span_s, span_e, SymbolLineClass::Secondary);

    let leaf_w = p.width / 2.0;

    // Left leaf + arc
    let hinge_l = [cx - dir[0] * half, cy - dir[1] * half];
    let leaf_end_l = [
        hinge_l[0] + normal[0] * leaf_w,
        hinge_l[1] + normal[1] * leaf_w,
    ];
    push_line(&mut out, hinge_l, leaf_end_l, SymbolLineClass::Primary);
    let mut arc_l = Vec::with_capacity(15);
    for i in 0..=14 {
        let theta = (PI / 2.0) * (i as f64 / 14.0);
        arc_l.push([
            hinge_l[0] + leaf_w * (dir[0] * theta.cos() + normal[0] * theta.sin()),
            hinge_l[1] + leaf_w * (dir[1] * theta.cos() + normal[1] * theta.sin()),
        ]);
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: arc_l,
            closed: false,
        },
        SymbolLineClass::Secondary,
        DOMAIN,
    ));

    // Right leaf + arc
    let hinge_r = [cx + dir[0] * half, cy + dir[1] * half];
    let leaf_end_r = [
        hinge_r[0] - normal[0] * leaf_w,
        hinge_r[1] - normal[1] * leaf_w,
    ];
    push_line(&mut out, hinge_r, leaf_end_r, SymbolLineClass::Primary);
    let mut arc_r = Vec::with_capacity(15);
    for i in 0..=14 {
        let theta = (PI / 2.0) * (i as f64 / 14.0);
        arc_r.push([
            hinge_r[0] + leaf_w * (-dir[0] * theta.cos() - normal[0] * theta.sin()),
            hinge_r[1] + leaf_w * (-dir[1] * theta.cos() - normal[1] * theta.sin()),
        ]);
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: arc_r,
            closed: false,
        },
        SymbolLineClass::Secondary,
        DOMAIN,
    ));

    out
}

/// Sliding door: two thin overlapping panel rectangles + arrow.
pub fn sliding_door(p: &DoorParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let dir = p.dir;
    let normal = p.normal;
    let cx = p.center[0];
    let cy = p.center[1];
    let panel_depth = p.wall_thickness * 0.15;
    let panel_width = p.width * 0.55;

    // Panel 1
    let p1c = [
        cx - dir[0] * panel_width * 0.15 + normal[0] * panel_depth,
        cy - dir[1] * panel_width * 0.15 + normal[1] * panel_depth,
    ];
    push_panel_rect(
        &mut out,
        p1c,
        dir,
        normal,
        panel_width,
        panel_depth,
        SymbolLineClass::Primary,
    );

    // Panel 2
    let p2c = [
        cx + dir[0] * panel_width * 0.15 - normal[0] * panel_depth,
        cy + dir[1] * panel_width * 0.15 - normal[1] * panel_depth,
    ];
    push_panel_rect(
        &mut out,
        p2c,
        dir,
        normal,
        panel_width,
        panel_depth,
        SymbolLineClass::Primary,
    );

    // Arrow
    let arrow_base = [
        cx + normal[0] * p.wall_thickness * 0.5,
        cy + normal[1] * p.wall_thickness * 0.5,
    ];
    let arrow_tip = [
        arrow_base[0] + dir[0] * p.width * 0.3,
        arrow_base[1] + dir[1] * p.width * 0.3,
    ];
    let ah = p.width * 0.08;
    push_line(&mut out, arrow_base, arrow_tip, SymbolLineClass::Annotation);
    let al = [
        arrow_tip[0] - dir[0] * ah + normal[0] * ah,
        arrow_tip[1] - dir[1] * ah + normal[1] * ah,
    ];
    let ar = [
        arrow_tip[0] - dir[0] * ah - normal[0] * ah,
        arrow_tip[1] - dir[1] * ah - normal[1] * ah,
    ];
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: vec![al, arrow_tip, ar],
            closed: false,
        },
        SymbolLineClass::Annotation,
        DOMAIN,
    ));

    out
}

/// Pocket door: panel line + dashed pocket recess.
pub fn pocket_door(p: &DoorParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let half = p.width / 2.0;
    let dir = p.dir;
    let normal = p.normal;
    let cx = p.center[0];
    let cy = p.center[1];

    let panel_s = [cx - dir[0] * half, cy - dir[1] * half];
    let panel_e = [cx + dir[0] * half, cy + dir[1] * half];
    push_line(&mut out, panel_s, panel_e, SymbolLineClass::Primary);

    let pocket_offset: f64 = match p.swing {
        Swing::Left => -1.0,
        Swing::Right => 1.0,
    };
    let pocket_cx = cx + dir[0] * pocket_offset * p.width;
    let pocket_cy = cy + dir[1] * pocket_offset * p.width;
    let phw = p.width * 0.48;
    let phd = p.wall_thickness * 0.3;
    let pts = vec![
        [
            pocket_cx - dir[0] * phw - normal[0] * phd,
            pocket_cy - dir[1] * phw - normal[1] * phd,
        ],
        [
            pocket_cx + dir[0] * phw - normal[0] * phd,
            pocket_cy + dir[1] * phw - normal[1] * phd,
        ],
        [
            pocket_cx + dir[0] * phw + normal[0] * phd,
            pocket_cy + dir[1] * phw + normal[1] * phd,
        ],
        [
            pocket_cx - dir[0] * phw + normal[0] * phd,
            pocket_cy - dir[1] * phw + normal[1] * phd,
        ],
    ];
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: pts,
            closed: true,
        },
        SymbolLineClass::Annotation,
        DOMAIN,
    ));

    out
}

/// Bifold door: opening span + two V-shaped fold lines.
pub fn bifold_door(p: &DoorParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let half = p.width / 2.0;
    let dir = p.dir;
    let normal = p.normal;
    let cx = p.center[0];
    let cy = p.center[1];

    let span_s = [cx - dir[0] * half, cy - dir[1] * half];
    let span_e = [cx + dir[0] * half, cy + dir[1] * half];
    push_line(&mut out, span_s, span_e, SymbolLineClass::Secondary);

    let fold_depth = p.width * 0.3;
    let mid = [cx + normal[0] * fold_depth, cy + normal[1] * fold_depth];

    // Left fold
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: vec![span_s, mid, [cx, cy]],
            closed: false,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));

    // Right fold
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: vec![span_e, mid, [cx, cy]],
            closed: false,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));

    out
}

/// Garage door: full-width rectangle + section lines + overhead arrow.
pub fn garage_door(p: &DoorParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let half = p.width / 2.0;
    let dir = p.dir;
    let normal = p.normal;
    let cx = p.center[0];
    let cy = p.center[1];
    let rect_hd = p.wall_thickness * 0.25;

    let pts = vec![
        [
            cx - dir[0] * half - normal[0] * rect_hd,
            cy - dir[1] * half - normal[1] * rect_hd,
        ],
        [
            cx + dir[0] * half - normal[0] * rect_hd,
            cy + dir[1] * half - normal[1] * rect_hd,
        ],
        [
            cx + dir[0] * half + normal[0] * rect_hd,
            cy + dir[1] * half + normal[1] * rect_hd,
        ],
        [
            cx - dir[0] * half + normal[0] * rect_hd,
            cy - dir[1] * half + normal[1] * rect_hd,
        ],
    ];
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: pts,
            closed: true,
        },
        SymbolLineClass::Primary,
        DOMAIN,
    ));

    // Section lines
    let section_count = 4;
    for i in 1..section_count {
        let t = i as f64 / section_count as f64;
        let offset_n = -rect_hd + rect_hd * 2.0 * t;
        let ls = [
            cx - dir[0] * half * 0.9 + normal[0] * offset_n,
            cy - dir[1] * half * 0.9 + normal[1] * offset_n,
        ];
        let le = [
            cx + dir[0] * half * 0.9 + normal[0] * offset_n,
            cy + dir[1] * half * 0.9 + normal[1] * offset_n,
        ];
        push_line(&mut out, ls, le, SymbolLineClass::Secondary);
    }

    // Overhead arrow
    let arrow_len = p.wall_thickness * 0.6;
    let arrow_tip = [cx + normal[0] * arrow_len, cy + normal[1] * arrow_len];
    push_line(&mut out, [cx, cy], arrow_tip, SymbolLineClass::Annotation);
    let ah = arrow_len * 0.3;
    let al = [
        arrow_tip[0] - normal[0] * ah + dir[0] * ah * 0.5,
        arrow_tip[1] - normal[1] * ah + dir[1] * ah * 0.5,
    ];
    let ar = [
        arrow_tip[0] - normal[0] * ah - dir[0] * ah * 0.5,
        arrow_tip[1] - normal[1] * ah - dir[1] * ah * 0.5,
    ];
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: vec![al, arrow_tip, ar],
            closed: false,
        },
        SymbolLineClass::Annotation,
        DOMAIN,
    ));

    out
}

// ---------------------------------------------------------------------------
// Window symbols
// ---------------------------------------------------------------------------

/// Parameters needed to draw a window in plan.
pub struct WindowParams {
    pub center: [f64; 2],
    pub dir: [f64; 2],
    pub normal: [f64; 2],
    pub width: f64,
    pub wall_thickness: f64,
}

/// Fixed window: single line across opening.
pub fn fixed_window(p: &WindowParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    opening_line(&mut out, p, 0.0, SymbolLineClass::Primary);
    out
}

/// Double hung window: three parallel lines.
pub fn double_hung_window(p: &WindowParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let offset = p.wall_thickness * 0.3;
    opening_line(&mut out, p, offset, SymbolLineClass::Primary);
    opening_line(&mut out, p, 0.0, SymbolLineClass::Secondary);
    opening_line(&mut out, p, -offset, SymbolLineClass::Primary);
    out
}

/// Casement window: center frame line + quarter-arc swing + leaf line.
pub fn casement_window(p: &WindowParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let half = p.width / 2.0;
    let dir = p.dir;
    let normal = p.normal;

    opening_line(&mut out, p, 0.0, SymbolLineClass::Primary);

    let hinge_edge = [p.center[0] - dir[0] * half, p.center[1] - dir[1] * half];

    let mut arc_pts = Vec::with_capacity(15);
    for i in 0..=14 {
        let theta = (PI / 2.0) * (i as f64 / 14.0);
        arc_pts.push([
            hinge_edge[0] + p.width * (dir[0] * theta.cos() + normal[0] * theta.sin()),
            hinge_edge[1] + p.width * (dir[1] * theta.cos() + normal[1] * theta.sin()),
        ]);
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: arc_pts,
            closed: false,
        },
        SymbolLineClass::Secondary,
        DOMAIN,
    ));

    let leaf_end = [
        hinge_edge[0] + normal[0] * p.width,
        hinge_edge[1] + normal[1] * p.width,
    ];
    push_line(&mut out, hinge_edge, leaf_end, SymbolLineClass::Secondary);

    out
}

/// Sliding window: two parallel lines + arrow.
pub fn sliding_window(p: &WindowParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let offset = p.wall_thickness * 0.3 * 0.5;
    opening_line(&mut out, p, offset, SymbolLineClass::Primary);
    opening_line(&mut out, p, -offset, SymbolLineClass::Primary);

    // Arrow
    let dir = p.dir;
    let normal = p.normal;
    let arrow_base = [
        p.center[0] + normal[0] * p.wall_thickness * 0.5,
        p.center[1] + normal[1] * p.wall_thickness * 0.5,
    ];
    let arrow_tip = [
        arrow_base[0] + dir[0] * p.width * 0.25,
        arrow_base[1] + dir[1] * p.width * 0.25,
    ];
    let ah = p.width * 0.06;
    push_line(&mut out, arrow_base, arrow_tip, SymbolLineClass::Annotation);
    let al = [
        arrow_tip[0] - dir[0] * ah + normal[0] * ah,
        arrow_tip[1] - dir[1] * ah + normal[1] * ah,
    ];
    let ar = [
        arrow_tip[0] - dir[0] * ah - normal[0] * ah,
        arrow_tip[1] - dir[1] * ah - normal[1] * ah,
    ];
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: vec![al, arrow_tip, ar],
            closed: false,
        },
        SymbolLineClass::Annotation,
        DOMAIN,
    ));

    out
}

/// Awning window: top frame + arc sweeping outward + bottom line.
pub fn awning_window(p: &WindowParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let offset = p.wall_thickness * 0.3;
    let dir = p.dir;
    let normal = p.normal;

    opening_line(&mut out, p, offset, SymbolLineClass::Primary);

    let top_edge = [
        p.center[0] + normal[0] * offset,
        p.center[1] + normal[1] * offset,
    ];
    let awning_depth = p.width * 0.5;
    let mut arc_pts = Vec::with_capacity(15);
    for i in 0..=14 {
        let theta = (PI / 2.0) * (i as f64 / 14.0);
        arc_pts.push([
            top_edge[0] + awning_depth * (dir[0] * theta.cos() - normal[0] * theta.sin()),
            top_edge[1] + awning_depth * (dir[1] * theta.cos() - normal[1] * theta.sin()),
        ]);
    }
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: arc_pts,
            closed: false,
        },
        SymbolLineClass::Secondary,
        DOMAIN,
    ));

    opening_line(&mut out, p, -offset, SymbolLineClass::Secondary);
    out
}

/// Bay window: center pane + two angled side panes at 30 degrees.
pub fn bay_window(p: &WindowParams) -> Vec<StyledPrimitive> {
    let mut out = Vec::new();
    let half = p.width / 2.0;
    let dir = p.dir;
    let normal = p.normal;
    let cx = p.center[0];
    let cy = p.center[1];
    let center_half = half * 0.5;

    // Center pane
    let cs = [cx - dir[0] * center_half, cy - dir[1] * center_half];
    let ce = [cx + dir[0] * center_half, cy + dir[1] * center_half];
    push_line(&mut out, cs, ce, SymbolLineClass::Primary);

    // Side panes at 30 degrees
    let side_len = half * 0.55;
    let bay_angle = PI / 6.0;

    // Left
    let lj = [cx - dir[0] * center_half, cy - dir[1] * center_half];
    let le = [
        lj[0] - dir[0] * side_len * bay_angle.cos() + normal[0] * side_len * bay_angle.sin(),
        lj[1] - dir[1] * side_len * bay_angle.cos() + normal[1] * side_len * bay_angle.sin(),
    ];
    push_line(&mut out, lj, le, SymbolLineClass::Primary);

    // Right
    let rj = [cx + dir[0] * center_half, cy + dir[1] * center_half];
    let re = [
        rj[0] + dir[0] * side_len * bay_angle.cos() + normal[0] * side_len * bay_angle.sin(),
        rj[1] + dir[1] * side_len * bay_angle.cos() + normal[1] * side_len * bay_angle.sin(),
    ];
    push_line(&mut out, rj, re, SymbolLineClass::Primary);

    out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

fn push_panel_rect(
    out: &mut Vec<StyledPrimitive>,
    center: [f64; 2],
    dir: [f64; 2],
    normal: [f64; 2],
    width: f64,
    depth: f64,
    line_class: SymbolLineClass,
) {
    let hw = width / 2.0;
    let hd = depth / 2.0;
    let pts = vec![
        [
            center[0] - dir[0] * hw - normal[0] * hd,
            center[1] - dir[1] * hw - normal[1] * hd,
        ],
        [
            center[0] + dir[0] * hw - normal[0] * hd,
            center[1] + dir[1] * hw - normal[1] * hd,
        ],
        [
            center[0] + dir[0] * hw + normal[0] * hd,
            center[1] + dir[1] * hw + normal[1] * hd,
        ],
        [
            center[0] - dir[0] * hw + normal[0] * hd,
            center[1] - dir[1] * hw + normal[1] * hd,
        ],
    ];
    out.push(StyledPrimitive::new(
        SymbolPrimitive::Polyline {
            points: pts,
            closed: true,
        },
        line_class,
        DOMAIN,
    ));
}

fn opening_line(
    out: &mut Vec<StyledPrimitive>,
    p: &WindowParams,
    normal_offset: f64,
    line_class: SymbolLineClass,
) {
    let half = p.width / 2.0;
    let start = [
        p.center[0] - p.dir[0] * half + p.normal[0] * normal_offset,
        p.center[1] - p.dir[1] * half + p.normal[1] * normal_offset,
    ];
    let end = [
        p.center[0] + p.dir[0] * half + p.normal[0] * normal_offset,
        p.center[1] + p.dir[1] * half + p.normal[1] * normal_offset,
    ];
    push_line(out, start, end, line_class);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_door_params() -> DoorParams {
        DoorParams {
            center: [5.0, 0.0],
            dir: [1.0, 0.0],
            normal: [0.0, 1.0],
            width: 0.9,
            wall_thickness: 0.15,
            swing: Swing::Left,
        }
    }

    fn sample_window_params() -> WindowParams {
        WindowParams {
            center: [3.0, 0.0],
            dir: [1.0, 0.0],
            normal: [0.0, 1.0],
            width: 1.2,
            wall_thickness: 0.15,
        }
    }

    #[test]
    fn single_swing_produces_primitives() {
        let prims = single_swing_door(&sample_door_params());
        // span + leaf + arc = 3
        assert!(prims.len() >= 3);
    }

    #[test]
    fn double_hung_produces_three_lines() {
        let prims = double_hung_window(&sample_window_params());
        assert!(prims.len() >= 3);
    }

    #[test]
    fn bay_window_produces_three_lines() {
        let prims = bay_window(&sample_window_params());
        assert!(prims.len() >= 3);
    }
}
