//! Equation formulation for the constraint solver.
//!
//! Each constraint type maps to one or more scalar residual equations.
//! The Jacobian is computed via finite differences.

use std::collections::HashMap;

use crate::constraint::Constraint;
use crate::sketch::{PointId, Sketch};

/// Compute the residual vector for a single constraint.
pub fn residuals_for(constraint: &Constraint, sketch: &Sketch) -> Vec<f64> {
    match constraint {
        Constraint::Coincident(p1, p2) => {
            let a = sketch.get_point(*p1).unwrap();
            let b = sketch.get_point(*p2).unwrap();
            vec![a.x - b.x, a.y - b.y]
        }
        Constraint::Horizontal(lid) => {
            let line = sketch.get_line(*lid).unwrap();
            let a = sketch.get_point(line.p1).unwrap();
            let b = sketch.get_point(line.p2).unwrap();
            vec![a.y - b.y]
        }
        Constraint::Vertical(lid) => {
            let line = sketch.get_line(*lid).unwrap();
            let a = sketch.get_point(line.p1).unwrap();
            let b = sketch.get_point(line.p2).unwrap();
            vec![a.x - b.x]
        }
        Constraint::Distance(p1, p2, d) => {
            let a = sketch.get_point(*p1).unwrap();
            let b = sketch.get_point(*p2).unwrap();
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = (dx * dx + dy * dy).sqrt();
            vec![dist - d]
        }
        Constraint::Fixed(pid, fx, fy) => {
            let p = sketch.get_point(*pid).unwrap();
            vec![p.x - fx, p.y - fy]
        }
        Constraint::Perpendicular(l1, l2) => {
            let line1 = sketch.get_line(*l1).unwrap();
            let line2 = sketch.get_line(*l2).unwrap();
            let a = sketch.get_point(line1.p1).unwrap();
            let b = sketch.get_point(line1.p2).unwrap();
            let c = sketch.get_point(line2.p1).unwrap();
            let d = sketch.get_point(line2.p2).unwrap();
            let dot = (b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y);
            vec![dot]
        }
        Constraint::Parallel(l1, l2) => {
            let line1 = sketch.get_line(*l1).unwrap();
            let line2 = sketch.get_line(*l2).unwrap();
            let a = sketch.get_point(line1.p1).unwrap();
            let b = sketch.get_point(line1.p2).unwrap();
            let c = sketch.get_point(line2.p1).unwrap();
            let d = sketch.get_point(line2.p2).unwrap();
            let cross = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
            vec![cross]
        }
        Constraint::Angle(l1, l2, target_angle) => {
            let line1 = sketch.get_line(*l1).unwrap();
            let line2 = sketch.get_line(*l2).unwrap();
            let a = sketch.get_point(line1.p1).unwrap();
            let b = sketch.get_point(line1.p2).unwrap();
            let c = sketch.get_point(line2.p1).unwrap();
            let d = sketch.get_point(line2.p2).unwrap();
            let dx1 = b.x - a.x;
            let dy1 = b.y - a.y;
            let dx2 = d.x - c.x;
            let dy2 = d.y - c.y;
            let dot = dx1 * dx2 + dy1 * dy2;
            let cross = dx1 * dy2 - dy1 * dx2;
            let angle = cross.atan2(dot);
            vec![angle - target_angle]
        }
    }
}

/// Compute Jacobian contributions via finite differences.
/// Returns (row, col, value) triplets for the Jacobian matrix.
pub fn jacobian_contributions(
    constraint: &Constraint,
    sketch: &mut Sketch,
    param_map: &HashMap<PointId, usize>,
    _n_params: usize,
    row_offset: usize,
) -> Vec<(usize, usize, f64)> {
    const EPSILON: f64 = 1e-7;

    let base_residuals = residuals_for(constraint, sketch);
    let n_residuals = base_residuals.len();
    let mut triplets = Vec::new();

    // Collect the point IDs involved in this constraint
    let involved_points = constraint_point_ids(constraint, sketch);

    for pid in &involved_points {
        if let Some(&col_base) = param_map.get(pid) {
            // Perturb x
            {
                let p = sketch.get_point_mut(*pid).unwrap();
                p.x += EPSILON;
            }
            let perturbed = residuals_for(constraint, sketch);
            {
                let p = sketch.get_point_mut(*pid).unwrap();
                p.x -= EPSILON;
            }
            for r in 0..n_residuals {
                let deriv = (perturbed[r] - base_residuals[r]) / EPSILON;
                if deriv.abs() > 1e-15 {
                    triplets.push((row_offset + r, col_base, deriv));
                }
            }

            // Perturb y
            {
                let p = sketch.get_point_mut(*pid).unwrap();
                p.y += EPSILON;
            }
            let perturbed = residuals_for(constraint, sketch);
            {
                let p = sketch.get_point_mut(*pid).unwrap();
                p.y -= EPSILON;
            }
            for r in 0..n_residuals {
                let deriv = (perturbed[r] - base_residuals[r]) / EPSILON;
                if deriv.abs() > 1e-15 {
                    triplets.push((row_offset + r, col_base + 1, deriv));
                }
            }
        }
    }

    // Also handle parameters not in involved_points but in param_map
    // (for completeness with finite differences we only need involved points)

    triplets
}

/// Extract all PointIds referenced by a constraint.
fn constraint_point_ids(constraint: &Constraint, sketch: &Sketch) -> Vec<PointId> {
    match constraint {
        Constraint::Coincident(p1, p2) => vec![*p1, *p2],
        Constraint::Distance(p1, p2, _) => vec![*p1, *p2],
        Constraint::Fixed(p, _, _) => vec![*p],
        Constraint::Horizontal(lid) | Constraint::Vertical(lid) => {
            let line = sketch.get_line(*lid).unwrap();
            vec![line.p1, line.p2]
        }
        Constraint::Perpendicular(l1, l2)
        | Constraint::Parallel(l1, l2)
        | Constraint::Angle(l1, l2, _) => {
            let line1 = sketch.get_line(*l1).unwrap();
            let line2 = sketch.get_line(*l2).unwrap();
            let mut pts = vec![line1.p1, line1.p2, line2.p1, line2.p2];
            pts.dedup();
            pts
        }
    }
}

/// Count the number of residuals a constraint contributes.
pub fn residual_count(constraint: &Constraint) -> usize {
    match constraint {
        Constraint::Coincident(_, _) => 2,
        Constraint::Horizontal(_) => 1,
        Constraint::Vertical(_) => 1,
        Constraint::Distance(_, _, _) => 1,
        Constraint::Fixed(_, _, _) => 2,
        Constraint::Perpendicular(_, _) => 1,
        Constraint::Parallel(_, _) => 1,
        Constraint::Angle(_, _, _) => 1,
    }
}
