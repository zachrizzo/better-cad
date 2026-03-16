import { create } from 'zustand'
import type { AnnotationDensity, PlanSymbolProfileId } from '../standards/plan-symbol-profile'
import type { DimensionSubMode } from '../components/panels/DimensionToolbar'

type ViewMode = '2d' | '3d' | 'split'
type ToolType = 'select' | 'foundation' | 'parking' | 'wall' | 'door' | 'floor' | 'roof' | 'stair' | 'measure' | 'measure_path' | 'measure_angle' | 'measure_area' | 'window' | 'column' | 'beam' | 'room' | 'dimension' | 'text' | 'sketch' | 'section' | 'furniture' | 'plumbing' | 'electrical' | 'cabinet' | 'hvac' | 'fire_safety' | 'accessibility' | 'spot_elevation'
type Theme = 'dark' | 'light'
type RightTab = 'properties' | 'view' | 'layers' | 'chat'

interface UIState {
  viewMode: ViewMode
  activeTool: ToolType
  dimensionSubMode: DimensionSubMode
  showGrid: boolean
  snapEnabled: boolean
  selectedBodyId: string | null
  theme: Theme
  activeRightTab: RightTab
  planSymbolProfile: PlanSymbolProfileId
  annotationDensity: AnnotationDensity
  showFurnitureLabels: boolean
  showMepText: boolean
  setViewMode: (mode: ViewMode) => void
  setActiveTool: (tool: ToolType) => void
  setDimensionSubMode: (mode: DimensionSubMode) => void
  toggleGrid: () => void
  toggleSnap: () => void
  selectBody: (id: string | null) => void
  toggleTheme: () => void
  setActiveRightTab: (tab: RightTab) => void
  setPlanSymbolProfile: (profile: PlanSymbolProfileId) => void
  setAnnotationDensity: (density: AnnotationDensity) => void
  setShowFurnitureLabels: (show: boolean) => void
  setShowMepText: (show: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: '2d',
  activeTool: 'select',
  dimensionSubMode: 'aligned' as DimensionSubMode,
  showGrid: true,
  snapEnabled: true,
  selectedBodyId: null,
  theme: 'dark',
  activeRightTab: 'properties',
  planSymbolProfile: 'open_us_v1',
  annotationDensity: 'minimal',
  showFurnitureLabels: false,
  showMepText: false,
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveTool: (tool) => set({ activeTool: tool, ...(tool !== 'dimension' ? { dimensionSubMode: 'aligned' as DimensionSubMode } : {}) }),
  setDimensionSubMode: (dimensionSubMode) => set({ dimensionSubMode }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  selectBody: (id) => set({ selectedBodyId: id }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setActiveRightTab: (tab) => set({ activeRightTab: tab }),
  setPlanSymbolProfile: (profile) => set({ planSymbolProfile: profile }),
  setAnnotationDensity: (density) => set({ annotationDensity: density }),
  setShowFurnitureLabels: (show) => set({ showFurnitureLabels: show }),
  setShowMepText: (show) => set({ showMepText: show }),
}))
