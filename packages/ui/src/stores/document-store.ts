import { create } from 'zustand'

interface DocumentState {
  projectName: string
  meshes: Map<string, { positions: Float32Array; normals: Float32Array; indices: Uint32Array }>
  setProjectName: (name: string) => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  projectName: 'Untitled',
  meshes: new Map(),
  setProjectName: (name) => set({ projectName: name }),
}))
