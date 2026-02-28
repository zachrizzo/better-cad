import { create } from 'zustand'

export interface WallData {
  id: string
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
}

interface BimState {
  walls: Map<string, WallData>
  pendingWallStart: [number, number] | null
  addWall: (wall: WallData) => void
  removeWall: (id: string) => void
  setPendingWallStart: (pt: [number, number] | null) => void
}

export const useBimStore = create<BimState>((set) => ({
  walls: new Map(),
  pendingWallStart: null,
  addWall: (wall) =>
    set((s) => {
      const walls = new Map(s.walls)
      walls.set(wall.id, wall)
      return { walls }
    }),
  removeWall: (id) =>
    set((s) => {
      const walls = new Map(s.walls)
      walls.delete(id)
      return { walls }
    }),
  setPendingWallStart: (pt) => set({ pendingWallStart: pt }),
}))
