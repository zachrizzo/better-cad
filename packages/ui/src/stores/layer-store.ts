import { create } from 'zustand'

export interface LayerInfo {
  id: string
  name: string
  visible: boolean
  color: string
  locked: boolean
}

const STANDARD_LAYERS: LayerInfo[] = [
  { id: 'A-WALL', name: 'Walls', visible: true, color: '#000000', locked: false },
  { id: 'A-DOOR', name: 'Doors', visible: true, color: '#8B4513', locked: false },
  { id: 'A-WIND', name: 'Windows', visible: true, color: '#4169E1', locked: false },
  { id: 'A-FLOR', name: 'Floors', visible: true, color: '#808080', locked: false },
  { id: 'A-ROOF', name: 'Roofs', visible: true, color: '#CD853F', locked: false },
  { id: 'A-STRS', name: 'Stairs', visible: true, color: '#696969', locked: false },
  { id: 'A-CLNG', name: 'Ceilings', visible: true, color: '#D3D3D3', locked: false },
  { id: 'A-COLS', name: 'Columns', visible: true, color: '#2F4F4F', locked: false },
  { id: 'A-BEAM', name: 'Beams', visible: true, color: '#4682B4', locked: false },
  { id: 'A-FNDN', name: 'Foundations', visible: true, color: '#A0522D', locked: false },
  { id: 'E-POWR', name: 'Electrical Power', visible: true, color: '#FF0000', locked: false },
  { id: 'E-LITE', name: 'Electrical Lighting', visible: true, color: '#FFD700', locked: false },
  { id: 'P-FIXT', name: 'Plumbing Fixtures', visible: true, color: '#0000FF', locked: false },
  { id: 'S-GRID', name: 'Structural Grid', visible: true, color: '#FF00FF', locked: false },
  { id: 'F-FURN', name: 'Furniture', visible: true, color: '#228B22', locked: false },
  { id: 'L-SITE', name: 'Site', visible: true, color: '#006400', locked: false },
  { id: 'G-ANNO', name: 'Annotations', visible: true, color: '#333333', locked: false },
  { id: 'G-DIMS', name: 'Dimensions', visible: true, color: '#333333', locked: false },
  { id: 'G-TAGS', name: 'Tags', visible: true, color: '#333333', locked: false },
]

export interface LayerState {
  layers: LayerInfo[]
  activeLayerId: string
  setLayerVisibility: (id: string, visible: boolean) => void
  setLayerLocked: (id: string, locked: boolean) => void
  setActiveLayer: (id: string) => void
  toggleLayerVisibility: (id: string) => void
  setPreset: (preset: string) => void
  isElementVisible: (elementKind: string, elementLayer?: string) => boolean
}

const KIND_TO_LAYER: Record<string, string> = {
  wall: 'A-WALL', door: 'A-DOOR', window: 'A-WIND', floor: 'A-FLOR',
  roof: 'A-ROOF', stair: 'A-STRS', column: 'A-COLS', beam: 'A-BEAM',
  foundation: 'A-FNDN', electrical: 'E-POWR', plumbing: 'P-FIXT',
  furniture: 'F-FURN', site_detail: 'L-SITE', dimension: 'G-DIMS',
  text_annotation: 'G-ANNO', leader_annotation: 'G-ANNO', keynote: 'G-ANNO',
  tag: 'G-TAGS', room: 'A-FLOR', level: 'A-FLOR', grid: 'S-GRID',
}

const PRESETS: Record<string, string[]> = {
  'Architectural Plan': ['A-WALL', 'A-DOOR', 'A-WIND', 'A-FLOR', 'A-STRS', 'A-COLS', 'G-ANNO', 'G-DIMS', 'G-TAGS'],
  'Electrical Plan': ['A-WALL', 'A-DOOR', 'A-WIND', 'E-POWR', 'E-LITE', 'G-ANNO', 'G-DIMS'],
  'Plumbing Plan': ['A-WALL', 'A-DOOR', 'A-WIND', 'P-FIXT', 'G-ANNO', 'G-DIMS'],
  'Reflected Ceiling Plan': ['A-WALL', 'A-CLNG', 'E-LITE', 'G-ANNO', 'G-DIMS'],
  'Furniture Plan': ['A-WALL', 'A-DOOR', 'A-WIND', 'F-FURN', 'G-ANNO', 'G-DIMS'],
  'Site Plan': ['A-WALL', 'L-SITE', 'G-ANNO', 'G-DIMS'],
  'All Layers': STANDARD_LAYERS.map(l => l.id),
}

export const useLayerStore = create<LayerState>((set, get) => ({
  layers: STANDARD_LAYERS.map(l => ({ ...l })),
  activeLayerId: 'A-WALL',

  setLayerVisibility: (id, visible) =>
    set(s => ({ layers: s.layers.map(l => l.id === id ? { ...l, visible } : l) })),

  setLayerLocked: (id, locked) =>
    set(s => ({ layers: s.layers.map(l => l.id === id ? { ...l, locked } : l) })),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  toggleLayerVisibility: (id) =>
    set(s => ({ layers: s.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l) })),

  setPreset: (preset) => {
    const visibleIds = PRESETS[preset] || PRESETS['All Layers']
    set(s => ({
      layers: s.layers.map(l => ({ ...l, visible: visibleIds.includes(l.id) })),
    }))
  },

  isElementVisible: (elementKind, elementLayer) => {
    const layerId = elementLayer || KIND_TO_LAYER[elementKind]
    if (!layerId) return true
    const layer = get().layers.find(l => l.id === layerId)
    return layer ? layer.visible : true
  },
}))

export const LAYER_PRESETS = Object.keys(PRESETS)
