import { create } from 'zustand'

export interface CadMeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

interface DocumentState {
  projectName: string
  meshes: Map<string, { positions: Float32Array; normals: Float32Array; indices: Uint32Array }>
  cadMeshes: Map<string, CadMeshData>
  boxParams: { width: number; height: number; depth: number }
  setProjectName: (name: string) => void
  addCadMesh: (id: string, mesh: CadMeshData) => void
  removeCadMesh: (id: string) => void
  clearCadMeshes: () => void
  setBoxParams: (params: { width: number; height: number; depth: number }) => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  projectName: 'Untitled',
  meshes: new Map(),
  cadMeshes: new Map(),
  boxParams: { width: 1, height: 1, depth: 1 },
  setProjectName: (name) => set({ projectName: name }),
  addCadMesh: (id, mesh) =>
    set((state) => {
      const next = new Map(state.cadMeshes)
      next.set(id, mesh)
      return { cadMeshes: next }
    }),
  removeCadMesh: (id) =>
    set((state) => {
      const next = new Map(state.cadMeshes)
      next.delete(id)
      return { cadMeshes: next }
    }),
  clearCadMeshes: () => set({ cadMeshes: new Map() }),
  setBoxParams: (params) => set({ boxParams: params }),
}))
