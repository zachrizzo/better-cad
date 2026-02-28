import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LevelVisibility = 'visible' | 'ghosted' | 'hidden'

export interface Level {
  id: string
  name: string
  elevation: number
  visibility: LevelVisibility
}

interface LevelState {
  levels: Level[]
  activeLevelId: string

  addLevel: (name: string, elevation: number) => string
  removeLevel: (id: string) => void
  renameLevel: (id: string, name: string) => void
  setLevelElevation: (id: string, elevation: number) => void
  reorderLevel: (id: string, newIndex: number) => void
  setActiveLevel: (id: string) => void
  toggleLevelVisibility: (id: string) => void
  setLevelVisibility: (id: string, visibility: LevelVisibility) => void
  copyToLevel: (sourceLevelId: string, targetLevelId: string) => CopyToLevelResult
}

export interface CopyToLevelResult {
  /** Mapping from original element id to cloned element id */
  clonedIds: Map<string, string>
  elevationOffset: number
}

const DEFAULT_GROUND_ID = 'level-ground'
const DEFAULT_LEVEL1_ID = 'level-1'
const DEFAULT_LEVEL2_ID = 'level-2'

const DEFAULT_LEVELS: Level[] = [
  { id: DEFAULT_GROUND_ID, name: 'Ground', elevation: 0.0, visibility: 'visible' },
  { id: DEFAULT_LEVEL1_ID, name: 'Level 1', elevation: 3.0, visibility: 'visible' },
  { id: DEFAULT_LEVEL2_ID, name: 'Level 2', elevation: 6.0, visibility: 'visible' },
]

export const useLevelStore = create<LevelState>()(
  persist(
    (set, get) => ({
      levels: DEFAULT_LEVELS,
      activeLevelId: DEFAULT_GROUND_ID,

      addLevel: (name, elevation) => {
        const id = `level-${crypto.randomUUID()}`
        set((state) => ({
          levels: [...state.levels, { id, name, elevation, visibility: 'visible' }],
        }))
        return id
      },

      removeLevel: (id) => {
        set((state) => {
          if (state.levels.length <= 1) return state
          const next = state.levels.filter((l) => l.id !== id)
          const newActive = state.activeLevelId === id
            ? next[0].id
            : state.activeLevelId
          return { levels: next, activeLevelId: newActive }
        })
      },

      renameLevel: (id, name) => {
        set((state) => ({
          levels: state.levels.map((l) => (l.id === id ? { ...l, name } : l)),
        }))
      },

      setLevelElevation: (id, elevation) => {
        set((state) => ({
          levels: state.levels.map((l) => (l.id === id ? { ...l, elevation } : l)),
        }))
      },

      reorderLevel: (id, newIndex) => {
        set((state) => {
          const oldIndex = state.levels.findIndex((l) => l.id === id)
          if (oldIndex === -1 || oldIndex === newIndex) return state
          const next = [...state.levels]
          const [removed] = next.splice(oldIndex, 1)
          next.splice(newIndex, 0, removed)
          return { levels: next }
        })
      },

      setActiveLevel: (id) => {
        set({ activeLevelId: id })
      },

      toggleLevelVisibility: (id) => {
        set((state) => ({
          levels: state.levels.map((l) => {
            if (l.id !== id) return l
            const order: LevelVisibility[] = ['visible', 'ghosted', 'hidden']
            const idx = order.indexOf(l.visibility)
            return { ...l, visibility: order[(idx + 1) % order.length] }
          }),
        }))
      },

      setLevelVisibility: (id, visibility) => {
        set((state) => ({
          levels: state.levels.map((l) => (l.id === id ? { ...l, visibility } : l)),
        }))
      },

      copyToLevel: (sourceLevelId, targetLevelId) => {
        const state = get()
        const source = state.levels.find((l) => l.id === sourceLevelId)
        const target = state.levels.find((l) => l.id === targetLevelId)
        if (!source || !target) {
          return { clonedIds: new Map(), elevationOffset: 0 }
        }
        const elevationOffset = target.elevation - source.elevation
        // The actual element cloning is handled by the caller (which has access to entity-store + kernel).
        // This just computes the elevation offset.
        return { clonedIds: new Map(), elevationOffset }
      },
    }),
    {
      name: 'bettercad-levels',
      partialize: (state) => ({
        levels: state.levels,
        activeLevelId: state.activeLevelId,
      }),
    },
  ),
)

/** Helper: get the active level object */
export function getActiveLevel(): Level | undefined {
  const state = useLevelStore.getState()
  return state.levels.find((l) => l.id === state.activeLevelId)
}

/** Helper: get the elevation for a given level id (returns 0 if not found) */
export function getLevelElevation(levelId: string | null | undefined): number {
  if (!levelId) return 0
  const level = useLevelStore.getState().levels.find((l) => l.id === levelId)
  return level?.elevation ?? 0
}

/** Helper: get visibility for a given level id */
export function getLevelVisibility(levelId: string | null | undefined): LevelVisibility {
  if (!levelId) return 'visible'
  const level = useLevelStore.getState().levels.find((l) => l.id === levelId)
  return level?.visibility ?? 'visible'
}
