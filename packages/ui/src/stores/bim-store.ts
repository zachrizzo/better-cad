import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SketchExtrudeMode = 'walls' | 'solid'
export type StairType = 'straight' | 'spiral'
export type RoofType = 'flat' | 'shed' | 'gable' | 'hip'

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

export type DoorSwing = 'left' | 'right'

interface BimState {
  walls: Map<string, WallData>
  doors: Map<string, DoorData>
  pendingWallStart: [number, number] | null
  defaultWallHeight: number
  defaultWallThickness: number
  defaultDoorWidth: number
  defaultDoorHeight: number
  defaultDoorSill: number
  defaultDoorSwing: DoorSwing
  defaultFloorThickness: number
  defaultStairWidth: number
  defaultStairRisers: number
  defaultStairHeight: number
  defaultStairType: StairType
  defaultSpiralTurns: number
  defaultStairSideWallThickness: number
  defaultWindowWidth: number
  defaultWindowHeight: number
  defaultWindowSill: number
  defaultColumnWidth: number
  defaultColumnDepth: number
  defaultColumnHeight: number
  defaultBeamWidth: number
  defaultBeamDepth: number
  defaultBeamElevation: number
  defaultRoofThickness: number
  defaultRoofElevation: number
  defaultRoofAutoElevation: boolean
  defaultRoofType: RoofType
  defaultRoofPitchDegrees: number
  defaultRoofRidgeAngleDegrees: number
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
  setDefaultDoorSwing: (swing: DoorSwing) => void
  setDefaultFloorThickness: (thickness: number) => void
  setDefaultStairWidth: (width: number) => void
  setDefaultStairRisers: (risers: number) => void
  setDefaultStairHeight: (height: number) => void
  setDefaultStairType: (stairType: StairType) => void
  setDefaultSpiralTurns: (turns: number) => void
  setDefaultStairSideWallThickness: (thickness: number) => void
  setDefaultWindowWidth: (width: number) => void
  setDefaultWindowHeight: (height: number) => void
  setDefaultWindowSill: (sillHeight: number) => void
  setDefaultColumnWidth: (width: number) => void
  setDefaultColumnDepth: (depth: number) => void
  setDefaultColumnHeight: (height: number) => void
  setDefaultBeamWidth: (width: number) => void
  setDefaultBeamDepth: (depth: number) => void
  setDefaultBeamElevation: (elevation: number) => void
  setDefaultRoofThickness: (thickness: number) => void
  setDefaultRoofElevation: (elevation: number) => void
  setDefaultRoofAutoElevation: (enabled: boolean) => void
  setDefaultRoofType: (roofType: RoofType) => void
  setDefaultRoofPitchDegrees: (pitchDegrees: number) => void
  setDefaultRoofRidgeAngleDegrees: (angleDegrees: number) => void
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
      defaultDoorSwing: 'right',
      defaultFloorThickness: 0.25,
      defaultStairWidth: 1.1,
      defaultStairRisers: 16,
      defaultStairHeight: 3.0,
      defaultStairType: 'straight',
      defaultSpiralTurns: 1.0,
      defaultStairSideWallThickness: 0.12,
      defaultWindowWidth: 1.2,
      defaultWindowHeight: 1.2,
      defaultWindowSill: 0.9,
      defaultColumnWidth: 0.3,
      defaultColumnDepth: 0.3,
      defaultColumnHeight: 3.0,
      defaultBeamWidth: 0.2,
      defaultBeamDepth: 0.4,
      defaultBeamElevation: 3.0,
      defaultRoofThickness: 0.3,
      defaultRoofElevation: 3.0,
      defaultRoofAutoElevation: true,
      defaultRoofType: 'gable',
      defaultRoofPitchDegrees: 30,
      defaultRoofRidgeAngleDegrees: 0,
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
      setDefaultDoorSwing: (swing) => set({ defaultDoorSwing: swing }),
      setDefaultFloorThickness: (thickness) => set({ defaultFloorThickness: Math.max(0.01, thickness) }),
      setDefaultStairWidth: (width) => set({ defaultStairWidth: Math.max(0.2, width) }),
      setDefaultStairRisers: (risers) => set({ defaultStairRisers: Math.max(2, Math.min(64, Math.round(risers))) }),
      setDefaultStairHeight: (height) => set({ defaultStairHeight: Math.max(0.2, height) }),
      setDefaultStairType: (stairType) => set({ defaultStairType: stairType }),
      setDefaultSpiralTurns: (turns) =>
        set({
          defaultSpiralTurns: (() => {
            const clamped = Math.max(-5, Math.min(5, turns))
            if (Math.abs(clamped) < 0.1) return clamped < 0 ? -0.1 : 0.1
            return clamped
          })(),
        }),
      setDefaultStairSideWallThickness: (thickness) =>
        set({ defaultStairSideWallThickness: Math.max(0, thickness) }),
      setDefaultWindowWidth: (width) => set({ defaultWindowWidth: Math.max(0.01, width) }),
      setDefaultWindowHeight: (height) => set({ defaultWindowHeight: Math.max(0.01, height) }),
      setDefaultWindowSill: (sillHeight) => set({ defaultWindowSill: Math.max(0, sillHeight) }),
      setDefaultColumnWidth: (width) => set({ defaultColumnWidth: Math.max(0.01, width) }),
      setDefaultColumnDepth: (depth) => set({ defaultColumnDepth: Math.max(0.01, depth) }),
      setDefaultColumnHeight: (height) => set({ defaultColumnHeight: Math.max(0.01, height) }),
      setDefaultBeamWidth: (width) => set({ defaultBeamWidth: Math.max(0.01, width) }),
      setDefaultBeamDepth: (depth) => set({ defaultBeamDepth: Math.max(0.01, depth) }),
      setDefaultBeamElevation: (elevation) => set({ defaultBeamElevation: Math.max(0, elevation) }),
      setDefaultRoofThickness: (thickness) => set({ defaultRoofThickness: Math.max(0.01, thickness) }),
      setDefaultRoofElevation: (elevation) => set({ defaultRoofElevation: Math.max(0, elevation) }),
      setDefaultRoofAutoElevation: (enabled) => set({ defaultRoofAutoElevation: enabled }),
      setDefaultRoofType: (roofType) => set({ defaultRoofType: roofType }),
      setDefaultRoofPitchDegrees: (pitchDegrees) =>
        set({ defaultRoofPitchDegrees: Math.max(0, Math.min(75, pitchDegrees)) }),
      setDefaultRoofRidgeAngleDegrees: (angleDegrees) => {
        let normalized = angleDegrees % 360
        if (normalized < 0) normalized += 360
        set({ defaultRoofRidgeAngleDegrees: normalized })
      },
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
        defaultDoorSwing: state.defaultDoorSwing,
        defaultFloorThickness: state.defaultFloorThickness,
        defaultStairWidth: state.defaultStairWidth,
        defaultStairRisers: state.defaultStairRisers,
        defaultStairHeight: state.defaultStairHeight,
        defaultStairType: state.defaultStairType,
        defaultSpiralTurns: state.defaultSpiralTurns,
        defaultStairSideWallThickness: state.defaultStairSideWallThickness,
        defaultWindowWidth: state.defaultWindowWidth,
        defaultWindowHeight: state.defaultWindowHeight,
        defaultWindowSill: state.defaultWindowSill,
        defaultColumnWidth: state.defaultColumnWidth,
        defaultColumnDepth: state.defaultColumnDepth,
        defaultColumnHeight: state.defaultColumnHeight,
        defaultBeamWidth: state.defaultBeamWidth,
        defaultBeamDepth: state.defaultBeamDepth,
        defaultBeamElevation: state.defaultBeamElevation,
        defaultRoofThickness: state.defaultRoofThickness,
        defaultRoofElevation: state.defaultRoofElevation,
        defaultRoofAutoElevation: state.defaultRoofAutoElevation,
        defaultRoofType: state.defaultRoofType,
        defaultRoofPitchDegrees: state.defaultRoofPitchDegrees,
        defaultRoofRidgeAngleDegrees: state.defaultRoofRidgeAngleDegrees,
        autoExtrudeSketch: state.autoExtrudeSketch,
        sketchExtrudeMode: state.sketchExtrudeMode,
      }),
    },
  ),
)
