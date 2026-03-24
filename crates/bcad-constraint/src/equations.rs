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
            let Some(a) = sketch.get_point(*p1) else {
                return vec![0.0, 0.0];
            };
            let Some(b) = sketch.get_point(*p2) else {
                return vec![0.0, 0.0];
            };
            vec![a.x - b.x, a.y - b.y]
        }
        Constraint::Horizontal(lid) => {
            let Some(line) = sketch.get_line(*lid) else {
                return vec![0.0];
            };
            let Some(a) = sketch.get_point(line.p1) else {
                return vec![0.0];
            };
            let Some(b) = sketch.get_point(line.p2) else {
                return vec![0.0];
            };
            vec![a.y - b.y]
        }
        Constraint::Vertical(lid) => {
            let Some(line) = sketch.get_line(*lid) else {
                return vec![0.0];
            };
            let Some(a) = sketch.get_point(line.p1) else {
                return vec![0.0];
            };
            let Some(b) = sketch.get_point(line.p2) else {
                return vec![0.0];
            };
            vec![a.x - b.x]
        }
        Constraint::Distance(p1, p2, d) => {
            let Some(a) = sketch.get_point(*p1) else {
                return vec![0.0];
            };
            let Some(b) = sketch.get_point(*p2) else {
                return vec![0.0];
            };
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = (dx * dx + dy * dy).sqrt().max(1e-10);
            vec![dist - d]
        }
        Constraint::Fixed(pid, fx, fy) => {
            let Some(p) = sketch.get_point(*pid) else {
                return vec![0.0, 0.0];
            };
            vec![p.x - fx, p.y - fy]
        }
        Constraint::Perpendicular(l1, l2) => {
            let Some((dx1, dy1, dx2, dy2)) = line_pair_directions(*l1, *l2, sketch) else {
                return vec![0.0];
            };
            vec![dx1 * dx2 + dy1 * dy2]
        }
        Constraint::Parallel(l1, l2) => {
            let Some((dx1, dy1, dx2, dy2)) = line_pair_directions(*l1, *l2, sketch) else {
                return vec![0.0];
            };
            vec![dx1 * dy2 - dy1 * dx2]
        }
        Constraint::Angle(l1, l2, target_angle) => {
            let Some((dx1, dy1, dx2, dy2)) = line_pair_directions(*l1, *l2, sketch) else {
                return vec![0.0];
            };
            let dot = dx1 * dx2 + dy1 * dy2;
            let cross = dx1 * dy2 - dy1 * dx2;
            vec![cross.atan2(dot) - target_angle]
        }
    }
}

/// Resolve two lines into their direction vectors (dx1, dy1, dx2, dy2).
///
/// Returns `None` if any line or point lookup fails.
fn line_pair_directions(
    l1: crate::sketch::LineId,
    l2: crate::sketch::LineId,
    sketch: &Sketch,
) -> Option<(f64, f64, f64, f64)> {
    let line1 = sketch.get_line(l1)?;
    let line2 = sketch.get_line(l2)?;
    let a = sketch.get_point(line1.p1)?;
    let b = sketch.get_point(line1.p2)?;
    let c = sketch.get_point(line2.p1)?;
    let d = sketch.get_point(line2.p2)?;
    Some((b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y))
}

/// Compute Jacobian contributions via finite differences.
/// Returns (row, col, value) triplets for the Jacobian matrix.
pub fn jacobian_contributions(
    constraint: &Constraint,
    sketch: &mut Sketch,
    param_map: &HashMap<PointId, usize>,
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
                let Some(p) = sketch.get_point_mut(*pid) else {
                    continue;
                };
                p.x += EPSILON;
            }
            let perturbed = residuals_for(constraint, sketch);
            {
                let Some(p) = sketch.get_point_mut(*pid) else {
                    continue;
                };
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
                let Some(p) = sketch.get_point_mut(*pid) else {
                    continue;
                };
                p.y += EPSILON;
            }
            let perturbed = residuals_for(constraint, sketch);
            {
                let Some(p) = sketch.get_point_mut(*pid) else {
                    continue;
                };
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

    triplets
}

/// Extract all PointIds referenced by a constraint.
fn constraint_point_ids(constraint: &Constraint, sketch: &Sketch) -> Vec<PointId> {
    match constraint {
        Constraint::Coincident(p1, p2) => vec![*p1, *p2],
        Constraint::Distance(p1, p2, _) => vec![*p1, *p2],
        Constraint::Fixed(p, _, _) => vec![*p],
        Constraint::Horizontal(lid) | Constraint::Vertical(lid) => {
            let Some(line) = sketch.get_line(*lid) else {
                return vec![];
            };
            vec![line.p1, line.p2]
        }
        Constraint::Perpendicular(l1, l2)
        | Constraint::Parallel(l1, l2)
        | Constraint::Angle(l1, l2, _) => {
            let Some(line1) = sketch.get_line(*l1) else {
                return vec![];
            };
            let Some(line2) = sketch.get_line(*l2) else {
                return vec![];
            };
            let mut pts = vec![line1.p1, line1.p2, line2.p1, line2.p2];
            pts.sort_unstable();
            pts.dedup();
            pts
        }
    }
}

/// Count the number of residuals a constraint contributes.
pub fn residual_count(constraint: &Constraint) -> usize {
    match constraint {
        Constraint::Coincident(..) | Constraint::Fixed(..) => 2,
        Constraint::Horizontal(..)
        | Constraint::Vertical(..)
        | Constraint::Distance(..)
        | Constraint::Perpendicular(..)
        | Constraint::Parallel(..)
        | Constraint::Angle(..) => 1,
    }
}
