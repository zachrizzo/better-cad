import type { PbrMaterial } from '../stores/material-store'

export interface TessellatedMesh {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export interface KernelBackend {
  createBox(width: number, height: number, depth: number): Promise<string>
  tessellate(bodyId: string): Promise<TessellatedMesh>
  createAndTessellateBox(width: number, height: number, depth: number): Promise<TessellatedMesh>
  extrudeSketchPoints(points: [number, number][], height: number): Promise<TessellatedMesh>
  addWall(startX: number, startY: number, endX: number, endY: number, height: number, thickness: number): Promise<TessellatedMesh>
  generatePlanView(wallsJson: string): Promise<string>
  importFile(data: Uint8Array, format: string): Promise<TessellatedMesh[]>
  exportFile(format: string): Promise<ArrayBuffer>
  getMaterialLibrary(): Promise<PbrMaterial[]>
  saveProject(projectJson: string): Promise<ArrayBuffer>
  loadProject(data: ArrayBuffer): Promise<string>
  ping(): Promise<string>
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getKernel(): Promise<KernelBackend> {
  if (isTauri()) {
    const { TauriBackend } = await import('./tauri-backend')
    return new TauriBackend()
  }
  const { WasmBackend } = await import('./wasm-backend')
  const backend = new WasmBackend()
  await backend.initialize()
  return backend
}
