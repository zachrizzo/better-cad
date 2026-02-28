import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SketchExtrudeMode = 'walls' | 'solid'

export interface WallData {
  id: string
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
}

export interface DoorData {
  id: string
  wallId: string
  positionAlongWall: number
  center: [number, number]
  direction: [number, number]
  width: number
  height: number
  sillHeight: number
}

interface BimState {
  walls: Map<string, WallData>
  doors: Map<string, DoorData>
  pendingWallStart: [number, number] | null
  defaultWallHeight: number
  defaultWallThickness: number
  defaultDoorWidth: number
  defaultDoorHeight: number
  defaultDoorSill: number
  autoExtrudeSketch: boolean
  sketchExtrudeMode: SketchExtrudeMode
  addWall: (wall: WallData) => void
  updateWall: (id: string, patch: Partial<Omit<WallData, 'id'>>) => void
  removeWall: (id: string) => void
  addDoor: (door: DoorData) => void
  removeDoor: (id: string) => void
  setPendingWallStart: (pt: [number, number] | null) => void
  setDefaultWallHeight: (height: number) => void
  setDefaultWallThickness: (thickness: number) => void
  setDefaultDoorWidth: (width: number) => void
  setDefaultDoorHeight: (height: number) => void
  setDefaultDoorSill: (sillHeight: number) => void
  setAutoExtrudeSketch: (enabled: boolean) => void
  setSketchExtrudeMode: (mode: SketchExtrudeMode) => void
}

export const useBimStore = create<BimState>()(
  persist(
    (set) => ({
      walls: new Map(),
      doors: new Map(),
      pendingWallStart: null,
      defaultWallHeight: 3.0,
      defaultWallThickness: 0.2,
      defaultDoorWidth: 0.9,
      defaultDoorHeight: 2.1,
      defaultDoorSill: 0.0,
      autoExtrudeSketch: false,
      sketchExtrudeMode: 'walls',
      addWall: (wall) =>
        set((s) => {
          const walls = new Map(s.walls)
          walls.set(wall.id, wall)
          return { walls }
        }),
      updateWall: (id, patch) =>
        set((s) => {
          const current = s.walls.get(id)
          if (!current) return {}
          const walls = new Map(s.walls)
          walls.set(id, { ...current, ...patch })
          return { walls }
        }),
      removeWall: (id) =>
        set((s) => {
          const walls = new Map(s.walls)
          walls.delete(id)
          const doors = new Map(s.doors)
          for (const [doorId, door] of doors) {
            if (door.wallId === id) {
              doors.delete(doorId)
            }
          }
          return { walls, doors }
        }),
      addDoor: (door) =>
        set((s) => {
          const doors = new Map(s.doors)
          doors.set(door.id, door)
          return { doors }
        }),
      removeDoor: (id) =>
        set((s) => {
          const doors = new Map(s.doors)
          doors.delete(id)
          return { doors }
        }),
      setPendingWallStart: (pt) => set({ pendingWallStart: pt }),
      setDefaultWallHeight: (height) => set({ defaultWallHeight: Math.max(0.01, height) }),
      setDefaultWallThickness: (thickness) => set({ defaultWallThickness: Math.max(0.01, thickness) }),
      setDefaultDoorWidth: (width) => set({ defaultDoorWidth: Math.max(0.01, width) }),
      setDefaultDoorHeight: (height) => set({ defaultDoorHeight: Math.max(0.01, height) }),
      setDefaultDoorSill: (sillHeight) => set({ defaultDoorSill: Math.max(0, sillHeight) }),
      setAutoExtrudeSketch: (enabled) => set({ autoExtrudeSketch: enabled }),
      setSketchExtrudeMode: (mode) => set({ sketchExtrudeMode: mode }),
    }),
    {
      name: 'bettercad-bim-defaults',
      partialize: (state) => ({
        defaultWallHeight: state.defaultWallHeight,
        defaultWallThickness: state.defaultWallThickness,
        defaultDoorWidth: state.defaultDoorWidth,
        defaultDoorHeight: state.defaultDoorHeight,
        defaultDoorSill: state.defaultDoorSill,
        autoExtrudeSketch: state.autoExtrudeSketch,
        sketchExtrudeMode: state.sketchExtrudeMode,
      }),
    },
  ),
)
