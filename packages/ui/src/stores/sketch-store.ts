import { create } from 'zustand'

export interface SketchPoint { id: string; x: number; y: number }
export interface SketchLine { id: string; p1: string; p2: string }

interface SketchState {
  active: boolean
  points: Map<string, SketchPoint>
  lines: Map<string, SketchLine>
  pendingPoint: SketchPoint | null  // first click of rectangle tool
  activateSketch: () => void
  deactivateSketch: () => void
  addPoint: (id: string, x: number, y: number) => void
  addLine: (id: string, p1: string, p2: string) => void
  setPendingPoint: (p: SketchPoint | null) => void
  clearSketch: () => void
}

export const useSketchStore = create<SketchState>((set) => ({
  active: false,
  points: new Map(),
  lines: new Map(),
  pendingPoint: null,
  activateSketch: () => set({ active: true }),
  deactivateSketch: () => set({ active: false, pendingPoint: null }),
  addPoint: (id, x, y) => set((s) => {
    const points = new Map(s.points)
    points.set(id, { id, x, y })
    return { points }
  }),
  addLine: (id, p1, p2) => set((s) => {
    const lines = new Map(s.lines)
    lines.set(id, { id, p1, p2 })
    return { lines }
  }),
  setPendingPoint: (p) => set({ pendingPoint: p }),
  clearSketch: () => set({ points: new Map(), lines: new Map(), pendingPoint: null }),
}))
