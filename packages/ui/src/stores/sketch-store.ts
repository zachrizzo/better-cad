import { create } from 'zustand'
import {
  solveSketch,
  analyzeConstraintStatus,
  type SolverSketch,
  type SolverConstraint,
  type SolverResult,
  type ConstraintStatus,
} from '../utils/sketch-solver'

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface SketchPoint { id: string; x: number; y: number }
export interface SketchLine { id: string; p1: string; p2: string }
export type SketchPoint2 = [number, number]

export interface SketchCircle { id: string; center: string; radius: number }
export interface SketchArc { id: string; center: string; start: string; end: string }

export interface SketchProfile {
  id: string
  points: SketchPoint2[]
}

// ---------------------------------------------------------------------------
// Constraint types (frontend mirror of Rust Constraint enum)
// ---------------------------------------------------------------------------

export type SketchConstraintType =
  | 'Coincident'
  | 'Horizontal'
  | 'Vertical'
  | 'Distance'
  | 'Fixed'
  | 'Perpendicular'
  | 'Parallel'
  | 'Angle'
  | 'Equal'

export interface SketchConstraint {
  id: string
  type: SketchConstraintType
  /** Point IDs involved (for Coincident, Distance, Fixed) */
  points: string[]
  /** Line IDs involved (for Horizontal, Vertical, Perpendicular, Parallel, Angle, Equal) */
  lines: string[]
  /** Numeric value (distance, angle in radians, fixed x/y) */
  value?: number
  /** Second numeric value (for Fixed: y coordinate) */
  value2?: number
}

// ---------------------------------------------------------------------------
// Drawing mode
// ---------------------------------------------------------------------------

export type SketchDrawMode = 'line' | 'rectangle' | 'circle' | 'none'
export type SketchConstraintMode = SketchConstraintType | 'none'

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export interface SketchSelection {
  pointIds: string[]
  lineIds: string[]
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SketchState {
  active: boolean
  points: Map<string, SketchPoint>
  lines: Map<string, SketchLine>
  circles: Map<string, SketchCircle>
  arcs: Map<string, SketchArc>
  profiles: Map<string, SketchProfile>
  constraints: Map<string, SketchConstraint>

  // Drawing state
  drawMode: SketchDrawMode
  pendingPoint: SketchPoint | null
  previewPoint: SketchPoint2 | null
  /** For line chain drawing: the last point placed */
  lineChainStart: string | null

  // Constraint mode
  constraintMode: SketchConstraintMode

  // Selection
  selection: SketchSelection

  // Solver state
  solverStatus: ConstraintStatus
  lastSolverResult: SolverResult | null

  // Next numeric ID counter for solver point mapping
  _nextSolverId: number

  // Actions
  activateSketch: () => void
  deactivateSketch: () => void
  setDrawMode: (mode: SketchDrawMode) => void
  setConstraintMode: (mode: SketchConstraintMode) => void
  addPoint: (id: string, x: number, y: number) => void
  updatePoint: (id: string, x: number, y: number) => void
  addLine: (id: string, p1: string, p2: string) => void
  addCircle: (id: string, center: string, radius: number) => void
  addProfile: (profile: SketchProfile) => void
  setPendingPoint: (p: SketchPoint | null) => void
  setPreviewPoint: (p: SketchPoint2 | null) => void
  setLineChainStart: (id: string | null) => void

  // Selection actions
  selectPoint: (id: string, additive?: boolean) => void
  selectLine: (id: string, additive?: boolean) => void
  clearSelection: () => void
  togglePointSelection: (id: string) => void
  toggleLineSelection: (id: string) => void

  // Constraint actions
  addConstraint: (constraint: SketchConstraint) => void
  removeConstraint: (id: string) => void

  // Solver
  runSolver: () => void

  clearSketch: () => void
}

// ---------------------------------------------------------------------------
// Solver bridge: convert UI store data to solver format and back
// ---------------------------------------------------------------------------

function buildSolverSketch(
  points: Map<string, SketchPoint>,
  lines: Map<string, SketchLine>,
  circles: Map<string, SketchCircle>,
  constraints: Map<string, SketchConstraint>,
): { solverSketch: SolverSketch; idToSolver: Map<string, number>; solverToId: Map<number, string> } {
  const idToSolver = new Map<string, number>()
  const solverToId = new Map<number, string>()
  let nextId = 0

  // Map point IDs
  for (const [id] of points) {
    idToSolver.set(id, nextId)
    solverToId.set(nextId, id)
    nextId++
  }

  const solverPoints = Array.from(points.values()).map((p) => ({
    id: idToSolver.get(p.id)!,
    x: p.x,
    y: p.y,
    fixed: false,
  }))

  // Map line IDs
  const lineIdToSolver = new Map<string, number>()
  let nextLineId = 0
  for (const [id] of lines) {
    lineIdToSolver.set(id, nextLineId)
    nextLineId++
  }

  const solverLines = Array.from(lines.values()).map((l) => ({
    id: lineIdToSolver.get(l.id)!,
    p1: idToSolver.get(l.p1)!,
    p2: idToSolver.get(l.p2)!,
  }))

  const solverCircles = Array.from(circles.values()).map((c) => ({
    id: 0,
    center: idToSolver.get(c.center) ?? 0,
    radius: c.radius,
  }))

  // Map constraints
  const solverConstraints: SolverConstraint[] = []
  for (const c of constraints.values()) {
    const sc = mapConstraint(c, idToSolver, lineIdToSolver)
    if (sc) solverConstraints.push(sc)
  }

  return {
    solverSketch: {
      points: solverPoints,
      lines: solverLines,
      circles: solverCircles,
      constraints: solverConstraints,
    },
    idToSolver,
    solverToId,
  }
}

function mapConstraint(
  c: SketchConstraint,
  ptMap: Map<string, number>,
  lineMap: Map<string, number>,
): SolverConstraint | null {
  switch (c.type) {
    case 'Coincident': {
      const p1 = ptMap.get(c.points[0])
      const p2 = ptMap.get(c.points[1])
      if (p1 === undefined || p2 === undefined) return null
      return { type: 'Coincident', p1, p2 }
    }
    case 'Horizontal': {
      const lineId = lineMap.get(c.lines[0])
      if (lineId === undefined) return null
      return { type: 'Horizontal', lineId }
    }
    case 'Vertical': {
      const lineId = lineMap.get(c.lines[0])
      if (lineId === undefined) return null
      return { type: 'Vertical', lineId }
    }
    case 'Distance': {
      const p1 = ptMap.get(c.points[0])
      const p2 = ptMap.get(c.points[1])
      if (p1 === undefined || p2 === undefined) return null
      return { type: 'Distance', p1, p2, distance: c.value ?? 1 }
    }
    case 'Fixed': {
      const pid = ptMap.get(c.points[0])
      if (pid === undefined) return null
      return { type: 'Fixed', pointId: pid, x: c.value ?? 0, y: c.value2 ?? 0 }
    }
    case 'Perpendicular': {
      const l1 = lineMap.get(c.lines[0])
      const l2 = lineMap.get(c.lines[1])
      if (l1 === undefined || l2 === undefined) return null
      return { type: 'Perpendicular', l1, l2 }
    }
    case 'Parallel': {
      const l1 = lineMap.get(c.lines[0])
      const l2 = lineMap.get(c.lines[1])
      if (l1 === undefined || l2 === undefined) return null
      return { type: 'Parallel', l1, l2 }
    }
    case 'Angle': {
      const l1 = lineMap.get(c.lines[0])
      const l2 = lineMap.get(c.lines[1])
      if (l1 === undefined || l2 === undefined) return null
      return { type: 'Angle', l1, l2, angle: c.value ?? 0 }
    }
    case 'Equal': {
      const l1 = lineMap.get(c.lines[0])
      const l2 = lineMap.get(c.lines[1])
      if (l1 === undefined || l2 === undefined) return null
      return { type: 'Equal', l1, l2 }
    }
  }
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

export const useSketchStore = create<SketchState>((set, get) => ({
  active: false,
  points: new Map(),
  lines: new Map(),
  circles: new Map(),
  arcs: new Map(),
  profiles: new Map(),
  constraints: new Map(),

  drawMode: 'none',
  pendingPoint: null,
  previewPoint: null,
  lineChainStart: null,

  constraintMode: 'none',

  selection: { pointIds: [], lineIds: [] },

  solverStatus: 'under-constrained',
  lastSolverResult: null,

  _nextSolverId: 0,

  activateSketch: () => set({ active: true, drawMode: 'none', constraintMode: 'none' }),
  deactivateSketch: () => set({
    active: false,
    pendingPoint: null,
    previewPoint: null,
    drawMode: 'none',
    constraintMode: 'none',
    lineChainStart: null,
    selection: { pointIds: [], lineIds: [] },
  }),

  setDrawMode: (mode) => set({
    drawMode: mode,
    constraintMode: 'none',
    pendingPoint: null,
    lineChainStart: null,
    selection: { pointIds: [], lineIds: [] },
  }),

  setConstraintMode: (mode) => set({
    constraintMode: mode,
    drawMode: 'none',
    pendingPoint: null,
    lineChainStart: null,
  }),

  addPoint: (id, x, y) => set((s) => {
    const points = new Map(s.points)
    points.set(id, { id, x, y })
    return { points }
  }),

  updatePoint: (id, x, y) => set((s) => {
    const points = new Map(s.points)
    const existing = points.get(id)
    if (existing) {
      points.set(id, { ...existing, x, y })
    }
    return { points }
  }),

  addLine: (id, p1, p2) => set((s) => {
    const lines = new Map(s.lines)
    lines.set(id, { id, p1, p2 })
    return { lines }
  }),

  addCircle: (id, center, radius) => set((s) => {
    const circles = new Map(s.circles)
    circles.set(id, { id, center, radius })
    return { circles }
  }),

  addProfile: (profile) => set((s) => {
    const profiles = new Map(s.profiles)
    profiles.set(profile.id, profile)
    return { profiles }
  }),

  setPendingPoint: (p) => set({ pendingPoint: p }),
  setPreviewPoint: (p) => set({ previewPoint: p }),
  setLineChainStart: (id) => set({ lineChainStart: id }),

  // Selection
  selectPoint: (id, additive) => set((s) => {
    if (additive) {
      const pointIds = s.selection.pointIds.includes(id)
        ? s.selection.pointIds
        : [...s.selection.pointIds, id]
      return { selection: { ...s.selection, pointIds } }
    }
    return { selection: { pointIds: [id], lineIds: [] } }
  }),

  selectLine: (id, additive) => set((s) => {
    if (additive) {
      const lineIds = s.selection.lineIds.includes(id)
        ? s.selection.lineIds
        : [...s.selection.lineIds, id]
      return { selection: { ...s.selection, lineIds } }
    }
    return { selection: { pointIds: [], lineIds: [id] } }
  }),

  clearSelection: () => set({ selection: { pointIds: [], lineIds: [] } }),

  togglePointSelection: (id) => set((s) => {
    const pointIds = s.selection.pointIds.includes(id)
      ? s.selection.pointIds.filter((pid) => pid !== id)
      : [...s.selection.pointIds, id]
    return { selection: { ...s.selection, pointIds } }
  }),

  toggleLineSelection: (id) => set((s) => {
    const lineIds = s.selection.lineIds.includes(id)
      ? s.selection.lineIds.filter((lid) => lid !== id)
      : [...s.selection.lineIds, id]
    return { selection: { ...s.selection, lineIds } }
  }),

  // Constraints
  addConstraint: (constraint) => {
    set((s) => {
      const constraints = new Map(s.constraints)
      constraints.set(constraint.id, constraint)
      return { constraints }
    })
    // Auto-run solver after adding constraint
    get().runSolver()
  },

  removeConstraint: (id) => {
    set((s) => {
      const constraints = new Map(s.constraints)
      constraints.delete(id)
      return { constraints }
    })
    get().runSolver()
  },

  // Solver
  runSolver: () => {
    const state = get()
    const { solverSketch, solverToId } = buildSolverSketch(
      state.points,
      state.lines,
      state.circles,
      state.constraints,
    )

    const result = solveSketch(solverSketch)
    const status = analyzeConstraintStatus(solverSketch)

    // Apply solved positions back to store points
    if (result.converged) {
      const points = new Map(state.points)
      for (const sp of solverSketch.points) {
        const storeId = solverToId.get(sp.id)
        if (storeId) {
          const existing = points.get(storeId)
          if (existing) {
            points.set(storeId, { ...existing, x: sp.x, y: sp.y })
          }
        }
      }
      set({ points, solverStatus: status, lastSolverResult: result })
    } else {
      set({ solverStatus: status, lastSolverResult: result })
    }
  },

  clearSketch: () => set({
    points: new Map(),
    lines: new Map(),
    circles: new Map(),
    arcs: new Map(),
    profiles: new Map(),
    constraints: new Map(),
    pendingPoint: null,
    previewPoint: null,
    lineChainStart: null,
    drawMode: 'none',
    constraintMode: 'none',
    selection: { pointIds: [], lineIds: [] },
    solverStatus: 'under-constrained',
    lastSolverResult: null,
  }),
}))
