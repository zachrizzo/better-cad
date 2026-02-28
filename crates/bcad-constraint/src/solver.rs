//! Constraint solver using Newton-Raphson iteration.

use std::collections::HashMap;

use nalgebra::{DMatrix, DVector};

use crate::constraint::Constraint;
use crate::equations;
use crate::sketch::{PointId, Sketch};

pub struct SolverResult {
    pub converged: bool,
    pub iterations: usize,
    pub residual_norm: f64,
}

pub fn solve(sketch: &mut Sketch) -> SolverResult {
    const MAX_ITER: usize = 100;
    const TOLERANCE: f64 = 1e-10;

    // 1. Build param_map: only non-fixed points get parameters (x, y).
    //    Each point maps to its column index base; x = col, y = col+1.
    let mut param_map: HashMap<PointId, usize> = HashMap::new();
    let mut col = 0usize;
    for p in &sketch.points {
        if !p.fixed {
            param_map.insert(p.id, col);
            col += 2;
        }
    }
    let n_params = col;

    // Total number of residual equations
    let n_residuals: usize = sketch
        .constraints
        .iter()
        .map(|c| equations::residual_count(c))
        .sum();

    if n_params == 0 || n_residuals == 0 {
        return SolverResult {
            converged: true,
            iterations: 0,
            residual_norm: 0.0,
        };
    }

    // 2. Newton-Raphson loop
    for iteration in 0..MAX_ITER {
        // a. Evaluate all residuals
        let mut residuals = Vec::with_capacity(n_residuals);
        for c in &sketch.constraints {
            residuals.extend(equations::residuals_for(c, sketch));
        }
        let r_vec = DVector::from_vec(residuals.clone());
        let norm = r_vec.norm();

        // b. Check convergence
        if norm < TOLERANCE {
            return SolverResult {
                converged: true,
                iterations: iteration,
                residual_norm: norm,
            };
        }

        // c. Build Jacobian via finite differences
        let mut jac = DMatrix::zeros(n_residuals, n_params);
        let constraints_clone: Vec<Constraint> = sketch.constraints.clone();
        let mut row_offset = 0usize;
        for c in &constraints_clone {
            let triplets =
                equations::jacobian_contributions(c, sketch, &param_map, n_params, row_offset);
            for (r, c_idx, val) in triplets {
                jac[(r, c_idx)] = val;
            }
            row_offset += equations::residual_count(c);
        }

        // d. Solve J * delta = -residuals
        //    For a potentially non-square system, use J^T * J * delta = -J^T * r
        //    (Gauss-Newton approach when n_residuals != n_params)
        let jt = jac.transpose();
        let jtj = &jt * &jac;
        let jtr = &jt * &r_vec;

        let decomp = jtj.lu();
        let neg_jtr = -jtr;
        let delta = decomp.solve(&neg_jtr);

        let delta = match delta {
            Some(d) => d,
            None => {
                // Singular matrix - solver cannot proceed
                return SolverResult {
                    converged: false,
                    iterations: iteration,
                    residual_norm: norm,
                };
            }
        };

        // e. Update parameters
        for (&pid, &col_base) in &param_map {
            let p = sketch.get_point_mut(pid).unwrap();
            p.x += delta[col_base];
            p.y += delta[col_base + 1];
        }
    }

    // Did not converge within MAX_ITER
    let final_residuals: Vec<f64> = sketch
        .constraints
        .iter()
        .flat_map(|c| equations::residuals_for(c, sketch))
        .collect();
    let final_norm = DVector::from_vec(final_residuals).norm();

    SolverResult {
        converged: false,
        iterations: MAX_ITER,
        residual_norm: final_norm,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constraint::Constraint;
    use crate::sketch::Sketch;

    #[test]
    fn test_constrained_rectangle() {
        let mut sketch = Sketch::new();
        // 4 corners, one fixed
        let p0 = sketch.add_point(0.0, 0.0, true); // fixed origin
        let p1 = sketch.add_point(1.5, 0.0, false); // will be constrained to x=2
        let p2 = sketch.add_point(1.5, 0.8, false); // will be constrained to (2,1)
        let p3 = sketch.add_point(0.0, 0.8, false); // will be constrained to (0,1)

        let l0 = sketch.add_line(p0, p1);
        let l1 = sketch.add_line(p1, p2);
        let l2 = sketch.add_line(p2, p3);
        let l3 = sketch.add_line(p3, p0);

        sketch.add_constraint(Constraint::Horizontal(l0));
        sketch.add_constraint(Constraint::Vertical(l1));
        sketch.add_constraint(Constraint::Horizontal(l2));
        sketch.add_constraint(Constraint::Vertical(l3));
        sketch.add_constraint(Constraint::Distance(p0, p1, 2.0)); // width = 2
        sketch.add_constraint(Constraint::Distance(p0, p3, 1.0)); // height = 1

        let result = solve(&mut sketch);
        assert!(result.converged, "solver did not converge");

        let pt1 = sketch.get_point(p1).unwrap();
        assert!(
            (pt1.x - 2.0).abs() < 1e-6,
            "p1.x = {}, expected 2.0",
            pt1.x
        );
        assert!(
            (pt1.y - 0.0).abs() < 1e-6,
            "p1.y = {}, expected 0.0",
            pt1.y
        );

        let pt2 = sketch.get_point(p2).unwrap();
        assert!(
            (pt2.x - 2.0).abs() < 1e-6,
            "p2.x = {}, expected 2.0",
            pt2.x
        );
        assert!(
            (pt2.y - 1.0).abs() < 1e-6,
            "p2.y = {}, expected 1.0",
            pt2.y
        );

        let pt3 = sketch.get_point(p3).unwrap();
        assert!(
            (pt3.x - 0.0).abs() < 1e-6,
            "p3.x = {}, expected 0.0",
            pt3.x
        );
        assert!(
            (pt3.y - 1.0).abs() < 1e-6,
            "p3.y = {}, expected 1.0",
            pt3.y
        );
    }

    #[test]
    fn test_coincident_constraint() {
        let mut sketch = Sketch::new();
        let p0 = sketch.add_point(0.0, 0.0, true);
        let p1 = sketch.add_point(1.0, 2.0, false);

        sketch.add_constraint(Constraint::Coincident(p0, p1));

        let result = solve(&mut sketch);
        assert!(result.converged, "solver did not converge");

        let pt1 = sketch.get_point(p1).unwrap();
        assert!((pt1.x - 0.0).abs() < 1e-6);
        assert!((pt1.y - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_fixed_constraint() {
        let mut sketch = Sketch::new();
        let p0 = sketch.add_point(1.0, 2.0, false);

        sketch.add_constraint(Constraint::Fixed(p0, 3.0, 4.0));

        let result = solve(&mut sketch);
        assert!(result.converged, "solver did not converge");

        let pt = sketch.get_point(p0).unwrap();
        assert!((pt.x - 3.0).abs() < 1e-6);
        assert!((pt.y - 4.0).abs() < 1e-6);
    }

    #[test]
    fn test_perpendicular_constraint() {
        let mut sketch = Sketch::new();
        let p0 = sketch.add_point(0.0, 0.0, true);
        let p1 = sketch.add_point(1.0, 0.0, true); // horizontal line
        let p2 = sketch.add_point(0.0, 0.0, true);
        let p3 = sketch.add_point(0.5, 0.8, false); // should become vertical-ish

        let l0 = sketch.add_line(p0, p1);
        let l1 = sketch.add_line(p2, p3);

        sketch.add_constraint(Constraint::Perpendicular(l0, l1));
        sketch.add_constraint(Constraint::Distance(p2, p3, 1.0));

        let result = solve(&mut sketch);
        assert!(result.converged, "solver did not converge");

        // l1 should be perpendicular to l0 (horizontal), so l1 direction dot (1,0) = 0
        let a = sketch.get_point(p2).unwrap();
        let b = sketch.get_point(p3).unwrap();
        let dot = (b.x - a.x) * 1.0 + (b.y - a.y) * 0.0;
        assert!(dot.abs() < 1e-6, "dot product = {}, expected ~0", dot);
    }

    #[test]
    fn test_parallel_constraint() {
        let mut sketch = Sketch::new();
        let p0 = sketch.add_point(0.0, 0.0, true);
        let p1 = sketch.add_point(1.0, 1.0, true); // diagonal line
        let p2 = sketch.add_point(2.0, 0.0, true);
        let p3 = sketch.add_point(3.0, 1.5, false); // should become parallel

        let l0 = sketch.add_line(p0, p1);
        let l1 = sketch.add_line(p2, p3);

        sketch.add_constraint(Constraint::Parallel(l0, l1));
        sketch.add_constraint(Constraint::Distance(p2, p3, 2.0_f64.sqrt()));

        let result = solve(&mut sketch);
        assert!(result.converged, "solver did not converge");

        // Cross product should be ~0
        let a = sketch.get_point(p0).unwrap();
        let b = sketch.get_point(p1).unwrap();
        let c = sketch.get_point(p2).unwrap();
        let d = sketch.get_point(p3).unwrap();
        let cross = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        assert!(cross.abs() < 1e-6, "cross product = {}, expected ~0", cross);
    }

    #[test]
    fn test_already_satisfied() {
        let mut sketch = Sketch::new();
        let p0 = sketch.add_point(0.0, 0.0, true);
        let p1 = sketch.add_point(2.0, 0.0, false);

        let l0 = sketch.add_line(p0, p1);
        sketch.add_constraint(Constraint::Horizontal(l0));
        sketch.add_constraint(Constraint::Distance(p0, p1, 2.0));

        let result = solve(&mut sketch);
        assert!(result.converged);
        assert_eq!(result.iterations, 0);
    }
}
