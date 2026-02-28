import { create } from 'zustand'

export interface SavedView {
  id: string
  name: string
  type: 'section' | 'elevation'
  // Section: defined by two points (cut line on plan)
  cutLineStart?: [number, number]
  cutLineEnd?: [number, number]
  // Elevation: cardinal direction
  direction?: 'north' | 'south' | 'east' | 'west'
  // Camera state
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
}

interface ViewState {
  views: Map<string, SavedView>
  activeViewId: string | null

  addView: (view: SavedView) => void
  removeView: (id: string) => void
  updateView: (id: string, patch: Partial<SavedView>) => void
  setActiveView: (id: string | null) => void
  clearActiveView: () => void
}

const STORAGE_KEY = 'bettercad-saved-views'

function loadViews(): Map<string, SavedView> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const arr: SavedView[] = JSON.parse(raw)
    const map = new Map<string, SavedView>()
    arr.forEach((v) => map.set(v.id, v))
    return map
  } catch {
    return new Map()
  }
}

function persistViews(views: Map<string, SavedView>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(views.values())))
  } catch {
    // localStorage full or unavailable
  }
}

export const useViewStore = create<ViewState>((set, get) => ({
  views: loadViews(),
  activeViewId: null,

  addView: (view) => {
    const next = new Map(get().views)
    next.set(view.id, view)
    persistViews(next)
    set({ views: next })
  },

  removeView: (id) => {
    const next = new Map(get().views)
    next.delete(id)
    persistViews(next)
    const activeViewId = get().activeViewId === id ? null : get().activeViewId
    set({ views: next, activeViewId })
  },

  updateView: (id, patch) => {
    const next = new Map(get().views)
    const existing = next.get(id)
    if (!existing) return
    next.set(id, { ...existing, ...patch })
    persistViews(next)
    set({ views: next })
  },

  setActiveView: (id) => set({ activeViewId: id }),

  clearActiveView: () => set({ activeViewId: null }),
}))
