import { create } from 'zustand'

export interface SketchPoint { id: string; x: number; y: number }
export interface SketchLine { id: string; p1: string; p2: string }
export type SketchPoint2 = [number, number]

export interface SketchProfile {
  id: string
  points: SketchPoint2[]
}

interface SketchState {
  active: boolean
  points: Map<string, SketchPoint>
  lines: Map<string, SketchLine>
  profiles: Map<string, SketchProfile>
  pendingPoint: SketchPoint | null  // first click of rectangle tool
  previewPoint: SketchPoint2 | null
  activateSketch: () => void
  deactivateSketch: () => void
  addPoint: (id: string, x: number, y: number) => void
  addLine: (id: string, p1: string, p2: string) => void
  addProfile: (profile: SketchProfile) => void
  setPendingPoint: (p: SketchPoint | null) => void
  setPreviewPoint: (p: SketchPoint2 | null) => void
  clearSketch: () => void
}

export const useSketchStore = create<SketchState>((set) => ({
  active: false,
  points: new Map(),
  lines: new Map(),
  profiles: new Map(),
  pendingPoint: null,
  previewPoint: null,
  activateSketch: () => set({ active: true }),
  deactivateSketch: () => set({ active: false, pendingPoint: null, previewPoint: null }),
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
  addProfile: (profile) => set((s) => {
    const profiles = new Map(s.profiles)
    profiles.set(profile.id, profile)
    return { profiles }
  }),
  setPendingPoint: (p) => set({ pendingPoint: p }),
  setPreviewPoint: (p) => set({ previewPoint: p }),
  clearSketch: () => set({
    points: new Map(),
    lines: new Map(),
    profiles: new Map(),
    pendingPoint: null,
    previewPoint: null,
  }),
}))
