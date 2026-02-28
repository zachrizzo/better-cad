import { create } from 'zustand'

type ViewMode = '2d' | '3d' | 'split'
type ToolType = 'select' | 'wall' | 'door' | 'window' | 'extrude' | 'measure'

interface UIState {
  viewMode: ViewMode
  activeTool: ToolType
  showGrid: boolean
  snapEnabled: boolean
  setViewMode: (mode: ViewMode) => void
  setActiveTool: (tool: ToolType) => void
  toggleGrid: () => void
  toggleSnap: () => void
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: '3d',
  activeTool: 'select',
  showGrid: true,
  snapEnabled: true,
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
}))
