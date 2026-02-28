import { create } from 'zustand'

type ViewMode = '2d' | '3d' | 'split'
type ToolType = 'select' | 'wall' | 'door' | 'floor' | 'roof' | 'stair' | 'measure' | 'window' | 'column' | 'beam' | 'room' | 'dimension' | 'text' | 'sketch' | 'section'
type Theme = 'dark' | 'light'

interface UIState {
  viewMode: ViewMode
  activeTool: ToolType
  showGrid: boolean
  snapEnabled: boolean
  selectedBodyId: string | null
  theme: Theme
  setViewMode: (mode: ViewMode) => void
  setActiveTool: (tool: ToolType) => void
  toggleGrid: () => void
  toggleSnap: () => void
  selectBody: (id: string | null) => void
  toggleTheme: () => void
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: '3d',
  activeTool: 'select',
  showGrid: true,
  snapEnabled: true,
  selectedBodyId: null,
  theme: 'dark',
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  selectBody: (id) => set({ selectedBodyId: id }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
}))
