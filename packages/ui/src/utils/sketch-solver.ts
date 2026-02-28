/**
 * TypeScript constraint solver for the parametric sketch system.
 *
 * Mirrors the Rust Newton-Raphson solver in crates/bcad-constraint/ so
 * that constraint solving can run on the UI thread without requiring a
 * round-trip to WASM (the constraint crate is not yet wired into the
 * WASM build).
 *
 * Data types intentionally match the Rust types:
 *   PointId  -> number (index)
 *   LineId   -> number (index)
 *   Constraint enum -> discriminated union
 */

// ---------------------------------------------------------------------------
// Sketch primitives
// ---------------------------------------------------------------------------

export interface SolverPoint {
  id: number
  x: number
  y: number
  fixed: boolean
}

export interface SolverLine {
  id: number
  p1: number // PointId
  p2: number // PointId
}

export interface SolverCircle {
  id: number
  center: number // PointId
  radius: number
}

// ---------------------------------------------------------------------------
// Constraints (discriminated union matching Rust enum)
// ---------------------------------------------------------------------------

export type SolverConstraint =
  | { type: 'Coincident'; p1: number; p2: number }
  | { type: 'Horizontal'; lineId: number }
  | { type: 'Vertical'; lineId: number }
  | { type: 'Distance'; p1: number; p2: number; distance: number }
  | { type: 'Fixed'; pointId: number; x: number; y: number }
  | { type: 'Perpendicular'; l1: number; l2: number }
  | { type: 'Parallel'; l1: number; l2: number }
  | { type: 'Angle'; l1: number; l2: number; angle: number }
  | { type: 'Equal'; l1: number; l2: number }

// ---------------------------------------------------------------------------
// Sketch container
// ---------------------------------------------------------------------------

export interface SolverSketch {
  points: SolverPoint[]
  lines: SolverLine[]
  circles: SolverCircle[]
  constraints: SolverConstraint[]
}

export interface SolverResult {
  converged: boolean
  iterations: number
  residualNorm: number
  /** DOF analysis: parameters - residuals. Negative = over-constrained. */
  dof: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPoint(sketch: SolverSketch, id: number): SolverPoint | undefined {
  return sketch.points.find((p) => p.id === id)
}

function getLine(sketch: SolverSketch, id: number): SolverLine | undefined {
  return sketch.lines.find((l) => l.id === id)
}

// ---------------------------------------------------------------------------
// Residuals
// ---------------------------------------------------------------------------

function residualsFor(c: SolverConstraint, sketch: SolverSketch): number[] {
  switch (c.type) {
    case 'Coincident': {
      const a = getPoint(sketch, c.p1)
      const b = getPoint(sketch, c.p2)
      if (!a || !b) return [0, 0]
      return [a.x - b.x, a.y - b.y]
    }
    case 'Horizontal': {
      const line = getLine(sketch, c.lineId)
      if (!line) return [0]
      const a = getPoint(sketch, line.p1)
      const b = getPoint(sketch, line.p2)
      if (!a || !b) return [0]
      return [a.y - b.y]
    }
    case 'Vertical': {
      const line = getLine(sketch, c.lineId)
      if (!line) return [0]
      const a = getPoint(sketch, line.p1)
      const b = getPoint(sketch, line.p2)
      if (!a || !b) return [0]
      return [a.x - b.x]
    }
    case 'Distance': {
      const a = getPoint(sketch, c.p1)
      const b = getPoint(sketch, c.p2)
      if (!a || !b) return [0]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-10)
      return [dist - c.distance]
    }
    case 'Fixed': {
      const p = getPoint(sketch, c.pointId)
      if (!p) return [0, 0]
      return [p.x - c.x, p.y - c.y]
    }
    case 'Perpendicular': {
      const l1 = getLine(sketch, c.l1)
      const l2 = getLine(sketch, c.l2)
      if (!l1 || !l2) return [0]
      const a = getPoint(sketch, l1.p1)
      const b = getPoint(sketch, l1.p2)
      const cc = getPoint(sketch, l2.p1)
      const d = getPoint(sketch, l2.p2)
      if (!a || !b || !cc || !d) return [0]
      const dot = (b.x - a.x) * (d.x - cc.x) + (b.y - a.y) * (d.y - cc.y)
      return [dot]
    }
    case 'Parallel': {
      const l1 = getLine(sketch, c.l1)
      const l2 = getLine(sketch, c.l2)
      if (!l1 || !l2) return [0]
      const a = getPoint(sketch, l1.p1)
      const b = getPoint(sketch, l1.p2)
      const cc = getPoint(sketch, l2.p1)
      const d = getPoint(sketch, l2.p2)
      if (!a || !b || !cc || !d) return [0]
      const cross = (b.x - a.x) * (d.y - cc.y) - (b.y - a.y) * (d.x - cc.x)
      return [cross]
    }
    case 'Angle': {
      const l1 = getLine(sketch, c.l1)
      const l2 = getLine(sketch, c.l2)
      if (!l1 || !l2) return [0]
      const a = getPoint(sketch, l1.p1)
      const b = getPoint(sketch, l1.p2)
      const cc = getPoint(sketch, l2.p1)
      const d = getPoint(sketch, l2.p2)
      if (!a || !b || !cc || !d) return [0]
      const dx1 = b.x - a.x
      const dy1 = b.y - a.y
      const dx2 = d.x - cc.x
      const dy2 = d.y - cc.y
      const dot = dx1 * dx2 + dy1 * dy2
      const cross = dx1 * dy2 - dy1 * dx2
      const angle = Math.atan2(cross, dot)
      return [angle - c.angle]
    }
    case 'Equal': {
      const l1 = getLine(sketch, c.l1)
      const l2 = getLine(sketch, c.l2)
      if (!l1 || !l2) return [0]
      const a = getPoint(sketch, l1.p1)
      const b = getPoint(sketch, l1.p2)
      const cc = getPoint(sketch, l2.p1)
      const d = getPoint(sketch, l2.p2)
      if (!a || !b || !cc || !d) return [0]
      const len1sq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
      const len2sq = (d.x - cc.x) ** 2 + (d.y - cc.y) ** 2
      return [len1sq - len2sq]
    }
  }
}

function residualCount(c: SolverConstraint): number {
  switch (c.type) {
    case 'Coincident': return 2
    case 'Fixed': return 2
    default: return 1
  }
}

/** Collect point IDs referenced by a constraint. */
function constraintPointIds(c: SolverConstraint, sketch: SolverSketch): number[] {
  switch (c.type) {
    case 'Coincident': return [c.p1, c.p2]
    case 'Distance': return [c.p1, c.p2]
    case 'Fixed': return [c.pointId]
    case 'Horizontal':
    case 'Vertical': {
      const line = getLine(sketch, c.type === 'Horizontal' ? c.lineId : c.lineId)
      if (!line) return []
      return [line.p1, line.p2]
    }
    case 'Perpendicular':
    case 'Parallel':
    case 'Angle':
    case 'Equal': {
      const l1 = getLine(sketch, c.l1)
      const l2 = getLine(sketch, c.l2)
      if (!l1 || !l2) return []
      const pts = [l1.p1, l1.p2, l2.p1, l2.p2]
      return [...new Set(pts)]
    }
  }
}

// ---------------------------------------------------------------------------
// Simple dense linear algebra (avoids external dependency)
// ---------------------------------------------------------------------------

/** Solve A * x = b for square A using LU decomposition. Returns null if singular. */
function solveDense(A: number[][], b: number[]): number[] | null {
  const n = A.length
  if (n === 0) return []

  // Copy A and b
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const U: number[][] = A.map((row) => [...row])
  const bb = [...b]
  const pivot: number[] = Array.from({ length: n }, (_, i) => i)

  for (let k = 0; k < n; k++) {
    // Partial pivoting
    let maxVal = Math.abs(U[k][k])
    let maxRow = k
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(U[i][k]) > maxVal) {
        maxVal = Math.abs(U[i][k])
        maxRow = i
      }
    }
    if (maxVal < 1e-14) return null // singular

    if (maxRow !== k) {
      ;[U[k], U[maxRow]] = [U[maxRow], U[k]]
      ;[bb[k], bb[maxRow]] = [bb[maxRow], bb[k]]
      ;[pivot[k], pivot[maxRow]] = [pivot[maxRow], pivot[k]]
      ;[L[k], L[maxRow]] = [L[maxRow], L[k]]
    }

    L[k][k] = 1
    for (let i = k + 1; i < n; i++) {
      const factor = U[i][k] / U[k][k]
      L[i][k] = factor
      for (let j = k; j < n; j++) {
        U[i][j] -= factor * U[k][j]
      }
      bb[i] -= factor * bb[k]
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = bb[i]
    for (let j = i + 1; j < n; j++) {
      sum -= U[i][j] * x[j]
    }
    if (Math.abs(U[i][i]) < 1e-14) return null
    x[i] = sum / U[i][i]
  }
  return x
}

// ---------------------------------------------------------------------------
// Newton-Raphson solver
// ---------------------------------------------------------------------------

const MAX_ITER = 100
const TOLERANCE = 1e-10
const EPSILON = 1e-7

export function solveSketch(sketch: SolverSketch): SolverResult {
  // 1. Build param_map: only non-fixed points
  const paramMap = new Map<number, number>() // pointId -> column base
  let col = 0
  for (const p of sketch.points) {
    if (!p.fixed) {
      paramMap.set(p.id, col)
      col += 2
    }
  }
  const nParams = col

  // Total residual count
  const nResiduals = sketch.constraints.reduce((acc, c) => acc + residualCount(c), 0)

  const dof = nParams - nResiduals

  if (nParams === 0 || nResiduals === 0) {
    return { converged: true, iterations: 0, residualNorm: 0, dof }
  }

  for (let iteration = 0; iteration < MAX_ITER; iteration++) {
    // a. Evaluate residuals
    const residuals: number[] = []
    for (const c of sketch.constraints) {
      residuals.push(...residualsFor(c, sketch))
    }

    const norm = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0))
    if (norm < TOLERANCE) {
      return { converged: true, iterations: iteration, residualNorm: norm, dof }
    }

    // b. Build Jacobian via finite differences
    const jac: number[][] = Array.from({ length: nResiduals }, () => new Array(nParams).fill(0))

    let rowOffset = 0
    for (const c of sketch.constraints) {
      const baseR = residualsFor(c, sketch)
      const nR = baseR.length
      const involvedPoints = constraintPointIds(c, sketch)

      for (const pid of involvedPoints) {
        const colBase = paramMap.get(pid)
        if (colBase === undefined) continue

        const pt = getPoint(sketch, pid)
        if (!pt) continue

        // Perturb x
        pt.x += EPSILON
        const perturbedX = residualsFor(c, sketch)
        pt.x -= EPSILON
        for (let r = 0; r < nR; r++) {
          const deriv = (perturbedX[r] - baseR[r]) / EPSILON
          if (Math.abs(deriv) > 1e-15) {
            jac[rowOffset + r][colBase] = deriv
          }
        }

        // Perturb y
        pt.y += EPSILON
        const perturbedY = residualsFor(c, sketch)
        pt.y -= EPSILON
        for (let r = 0; r < nR; r++) {
          const deriv = (perturbedY[r] - baseR[r]) / EPSILON
          if (Math.abs(deriv) > 1e-15) {
            jac[rowOffset + r][colBase + 1] = deriv
          }
        }
      }
      rowOffset += nR
    }

    // c. Gauss-Newton: solve (J^T J) delta = -J^T r
    const jtj: number[][] = Array.from({ length: nParams }, () => new Array(nParams).fill(0))
    const jtr: number[] = new Array(nParams).fill(0)

    for (let i = 0; i < nParams; i++) {
      for (let j = 0; j < nParams; j++) {
        let sum = 0
        for (let k = 0; k < nResiduals; k++) {
          sum += jac[k][i] * jac[k][j]
        }
        jtj[i][j] = sum
      }
      let sum = 0
      for (let k = 0; k < nResiduals; k++) {
        sum += jac[k][i] * residuals[k]
      }
      jtr[i] = sum
    }

    const negJtr = jtr.map((v) => -v)
    const delta = solveDense(jtj, negJtr)

    if (!delta) {
      return { converged: false, iterations: iteration, residualNorm: norm, dof }
    }

    // d. Update parameters
    for (const [pid, colBase] of paramMap) {
      const pt = getPoint(sketch, pid)
      if (!pt) continue
      pt.x += delta[colBase]
      pt.y += delta[colBase + 1]
    }
  }

  // Did not converge
  const finalResiduals: number[] = []
  for (const c of sketch.constraints) {
    finalResiduals.push(...residualsFor(c, sketch))
  }
  const finalNorm = Math.sqrt(finalResiduals.reduce((s, r) => s + r * r, 0))

  return { converged: false, iterations: MAX_ITER, residualNorm: finalNorm, dof }
}

// ---------------------------------------------------------------------------
// DOF analysis
// ---------------------------------------------------------------------------

export type ConstraintStatus = 'under-constrained' | 'fully-constrained' | 'over-constrained'

export function analyzeConstraintStatus(sketch: SolverSketch): ConstraintStatus {
  let nParams = 0
  for (const p of sketch.points) {
    if (!p.fixed) nParams += 2
  }
  const nResiduals = sketch.constraints.reduce((acc, c) => acc + residualCount(c), 0)
  const dof = nParams - nResiduals
  if (dof > 0) return 'under-constrained'
  if (dof === 0) return 'fully-constrained'
  return 'over-constrained'
}

/** Return the constraint status color for rendering. */
export function constraintStatusColor(status: ConstraintStatus): string {
  switch (status) {
    case 'under-constrained': return '#4dabf7'  // blue
    case 'fully-constrained': return '#51cf66'   // green
    case 'over-constrained': return '#ff6b6b'    // red
  }
}
