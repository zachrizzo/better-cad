import { create } from 'zustand'

export interface PbrMaterial {
  id: string
  name: string
  base_color: [number, number, number, number]  // RGBA 0-1
  metallic: number
  roughness: number
}

interface MaterialState {
  materials: Map<string, PbrMaterial>
  bodyMaterials: Map<string, string>  // bodyId -> materialId
  selectedMaterialId: string | null
  setMaterials: (materials: PbrMaterial[]) => void
  setBodyMaterial: (bodyId: string, materialId: string) => void
  selectMaterial: (id: string | null) => void
}

export const useMaterialStore = create<MaterialState>((set) => ({
  materials: new Map(),
  bodyMaterials: new Map(),
  selectedMaterialId: null,
  setMaterials: (mats) => set({
    materials: new Map(mats.map(m => [m.id, m]))
  }),
  setBodyMaterial: (bodyId, materialId) => set((s) => {
    const bodyMaterials = new Map(s.bodyMaterials)
    bodyMaterials.set(bodyId, materialId)
    return { bodyMaterials }
  }),
  selectMaterial: (id) => set({ selectedMaterialId: id }),
}))
