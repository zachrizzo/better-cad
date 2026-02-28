import type { PbrMaterial } from '../stores/material-store'

export interface TessellatedMesh {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export interface ElementMeta {
  id: string
  name: string
  level_id?: string | null
  host_id?: string | null
  type_id?: string | null
  parent_id?: string | null
}

export interface WallElement {
  kind: 'wall'
  meta: ElementMeta
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
}

export interface DoorElement {
  kind: 'door'
  meta: ElementMeta
  wall_id: string
  position_along_wall: number
  width: number
  height: number
  sill_height: number
  swing: 'left' | 'right'
}

export interface WindowElement {
  kind: 'window'
  meta: ElementMeta
  wall_id: string
  position_along_wall: number
  width: number
  height: number
  sill_height: number
}

export interface FloorElement {
  kind: 'floor'
  meta: ElementMeta
  boundary: [number, number][]
  thickness: number
}

export interface StairElement {
  kind: 'stair'
  meta: ElementMeta
  start: [number, number]
  end: [number, number]
  width: number
  risers: number
  total_height: number
}

export interface LevelElement {
  kind: 'level'
  meta: ElementMeta
  elevation: number
}

export interface GenericElement {
  kind: string
  meta: ElementMeta
  [key: string]: unknown
}

export type PrototypeElement =
  | WallElement
  | DoorElement
  | WindowElement
  | FloorElement
  | StairElement
  | LevelElement
  | GenericElement

export interface RegeneratedMesh extends TessellatedMesh {
  id: string
}

export interface KernelBackend {
  resetProject(name: string, units: string): Promise<void>
  createElement(element: PrototypeElement): Promise<string>
  updateElement(elementId: string, element: PrototypeElement): Promise<void>
  deleteElement(elementId: string): Promise<void>
  queryElements(): Promise<PrototypeElement[]>
  regenView(): Promise<RegeneratedMesh[]>
  createBox(width: number, height: number, depth: number): Promise<string>
  tessellate(bodyId: string): Promise<TessellatedMesh>
  createAndTessellateBox(width: number, height: number, depth: number): Promise<TessellatedMesh>
  extrudeSketchPoints(points: [number, number][], height: number): Promise<TessellatedMesh>
  addWall(startX: number, startY: number, endX: number, endY: number, height: number, thickness: number): Promise<TessellatedMesh>
  generatePlanView(wallsJson: string): Promise<string>
  importFile(data: Uint8Array, format: string): Promise<TessellatedMesh[]>
  exportFile(format: string): Promise<ArrayBuffer>
  getMaterialLibrary(): Promise<PbrMaterial[]>
  saveProject(projectJson?: string): Promise<ArrayBuffer>
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
