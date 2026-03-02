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

export interface RoofElement {
  kind: 'roof'
  meta: ElementMeta
  boundary: [number, number][]
  thickness: number
  elevation: number
  auto_elevation: boolean
  roof_type: 'flat' | 'shed' | 'gable' | 'hip'
  pitch_degrees: number
  ridge_angle_degrees: number
}

export interface StairElement {
  kind: 'stair'
  meta: ElementMeta
  start: [number, number]
  end: [number, number]
  width: number
  risers: number
  total_height: number
  stair_type?: 'straight' | 'spiral'
  spiral_turns?: number
  side_wall_thickness?: number
}

export interface ColumnElement {
  kind: 'column'
  meta: ElementMeta
  center: [number, number]
  width: number
  depth: number
  height: number
}

export interface BeamElement {
  kind: 'beam'
  meta: ElementMeta
  start: [number, number, number]
  end: [number, number, number]
  width: number
  depth: number
}

export interface RoomElement {
  kind: 'room'
  meta: ElementMeta
  boundary: [number, number][]
  name: string
  color?: string
}

export interface DimensionElement {
  kind: 'dimension'
  meta: ElementMeta
  p1: [number, number]
  p2: [number, number]
  offset: number
  text_override?: string
}

export interface TextAnnotationElement {
  kind: 'text_annotation'
  meta: ElementMeta
  position: [number, number]
  text: string
  font_size: number
  rotation: number
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
  | RoofElement
  | StairElement
  | ColumnElement
  | BeamElement
  | RoomElement
  | DimensionElement
  | TextAnnotationElement
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
