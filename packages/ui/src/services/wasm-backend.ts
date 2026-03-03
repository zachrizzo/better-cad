import type {
  BackendCapabilities,
  EnrichedPlanViewData,
  ElevationViewData,
  ExportFormat,
  ImportFormat,
  ImportResult,
  KernelBackend,
  PrototypeElement,
  RegenOptions,
  RegeneratedMesh,
  SectionViewData,
  TessellatedMesh,
} from './kernel-bridge'
import type { PbrMaterial } from '../stores/material-store'
import { normalizeQueriedElements } from './room-utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmModule = any

export class WasmBackend implements KernelBackend {
  private wasm: WasmModule = null

  async initialize(): Promise<void> {
    try {
      const wasmModule = await import('@bettercad/wasm')
      await wasmModule.default()
      this.wasm = wasmModule
      console.log('[BetterCAD] WASM kernel loaded')
    } catch (e) {
      console.error('[BetterCAD] WASM module failed to load:', e)
      throw new Error(`WASM kernel failed to initialize: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private requireWasm(): WasmModule {
    if (!this.wasm) {
      throw new Error('WASM backend is not initialized')
    }
    return this.wasm
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requireMethod(name: string): (...args: any[]) => any {
    const wasm = this.requireWasm()
    if (typeof wasm[name] !== 'function') {
      throw new Error(`WASM backend is missing required method: ${name}`)
    }
    return wasm[name]
  }

  async ping(): Promise<string> {
    return this.requireMethod('ping')()
  }

  async getCapabilities(): Promise<BackendCapabilities> {
    return this.requireMethod('get_capabilities')() as BackendCapabilities
  }

  async resetProject(name: string, units: string): Promise<void> {
    this.requireMethod('reset_project')(name, units)
  }

  async createElement(element: PrototypeElement): Promise<string> {
    return this.requireMethod('create_element')(JSON.stringify(element))
  }

  async updateElement(elementId: string, element: PrototypeElement): Promise<void> {
    this.requireMethod('update_element')(elementId, JSON.stringify(element))
  }

  async deleteElement(elementId: string): Promise<void> {
    this.requireMethod('delete_element')(elementId)
  }

  async queryElements(): Promise<PrototypeElement[]> {
    const raw = this.requireMethod('query_elements')()
    return normalizeQueriedElements(JSON.parse(raw) as PrototypeElement[])
  }

  async regenView(_opts?: RegenOptions): Promise<RegeneratedMesh[]> {
    const result = this.requireMethod('regen_view')()
    if (!Array.isArray(result)) return []
    return result.map((m: { id: string; positions: number[]; normals: number[]; indices: number[] }) => ({
      id: m.id,
      positions: new Float32Array(m.positions),
      normals: new Float32Array(m.normals),
      indices: new Uint32Array(m.indices),
    }))
  }

  async createBox(_width: number, _height: number, _depth: number): Promise<string> {
    throw new Error('createBox() is removed in prototype-velocity mode; use createElement(kind="wall"|...)')
  }

  async tessellate(_bodyId: string): Promise<TessellatedMesh> {
    throw new Error('tessellate() by body id is not supported in prototype-velocity mode')
  }

  async extrudeSketchPoints(points: [number, number][], height: number): Promise<TessellatedMesh> {
    const flatPoints = points.flatMap(([x, y]) => [x, y])
    const result = this.requireMethod('extrude_sketch_points')(flatPoints, height)
    return {
      positions: new Float32Array(result.positions),
      normals: new Float32Array(result.normals),
      indices: new Uint32Array(result.indices),
    }
  }

  async createAndTessellateBox(width: number, height: number, depth: number): Promise<TessellatedMesh> {
    const result = this.requireMethod('create_and_tessellate_box')(width, height, depth)
    return {
      positions: new Float32Array(result.positions),
      normals: new Float32Array(result.normals),
      indices: new Uint32Array(result.indices),
    }
  }

  async addWall(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    height: number,
    thickness: number,
  ): Promise<TessellatedMesh> {
    const result = this.requireMethod('add_wall')(startX, startY, endX, endY, height, thickness)
    return {
      positions: new Float32Array(result.positions),
      normals: new Float32Array(result.normals),
      indices: new Uint32Array(result.indices),
    }
  }

  async generatePlanView(wallsJson: string): Promise<string> {
    return this.requireMethod('generate_plan_view')(wallsJson)
  }

  async generatePlanViewV2(): Promise<EnrichedPlanViewData> {
    const raw = this.requireMethod('generate_plan_view_v2')()
    return JSON.parse(raw) as EnrichedPlanViewData
  }

  async generateSectionCut(
    cutStartX: number,
    cutStartY: number,
    cutEndX: number,
    cutEndY: number,
    cutHeight: number,
  ): Promise<SectionViewData> {
    const raw = this.requireMethod('generate_section_cut_view')(cutStartX, cutStartY, cutEndX, cutEndY, cutHeight)
    return JSON.parse(raw) as SectionViewData
  }

  async generateElevation(direction: string): Promise<ElevationViewData> {
    const raw = this.requireMethod('generate_elevation_view')(direction)
    return JSON.parse(raw) as ElevationViewData
  }

  async importModel(data: Uint8Array, format: ImportFormat): Promise<ImportResult> {
    if (format === 'dxf') {
      const raw = this.requireMethod('import_dxf_data')(data) as string
      const imported = JSON.parse(raw) as unknown[]
      return { meshes: [], stateMutated: true, importedElementCount: imported.length }
    }

    if (format === 'ifc') {
      const raw = this.requireMethod('import_ifc_data')(data) as string
      const imported = JSON.parse(raw) as unknown[]
      return { meshes: [], stateMutated: true, importedElementCount: imported.length, warnings: [] }
    }

    if (format !== 'step') {
      throw new Error(`Import format "${format}" is not supported`)
    }
    const result = this.requireMethod('import_step_data')(data)
    if (!Array.isArray(result)) return { meshes: [], stateMutated: false }
    const meshes = result.map((m: { positions: number[]; normals: number[]; indices: number[] }) => ({
      positions: new Float32Array(m.positions),
      normals: new Float32Array(m.normals),
      indices: new Uint32Array(m.indices),
    }))
    return { meshes, stateMutated: false }
  }

  async exportModel(format: ExportFormat): Promise<ArrayBuffer> {
    if (format === 'dxf') {
      const bytes: Uint8Array = this.requireMethod('export_dxf_project')()
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
    if (format === 'ifc') {
      const bytes: Uint8Array = this.requireMethod('export_ifc_project')()
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
    if (format === 'step') {
      const bytes: Uint8Array = this.requireMethod('export_step_project')()
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
    if (format === 'gltf') {
      const bytes: Uint8Array = this.requireMethod('export_gltf_project')()
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
    throw new Error(`Export format "${format}" is not supported`)
  }

  async importFile(data: Uint8Array, format: string): Promise<TessellatedMesh[]> {
    const result = await this.importModel(data, format as ImportFormat)
    return result.meshes
  }

  async exportFile(format: string): Promise<ArrayBuffer> {
    return this.exportModel(format as ExportFormat)
  }

  async getMaterialLibrary(): Promise<PbrMaterial[]> {
    const result = this.requireMethod('get_material_library')()
    return result as PbrMaterial[]
  }

  async saveProject(projectJson?: string): Promise<ArrayBuffer> {
    const bytes: Uint8Array = this.requireMethod('save_project')(projectJson ?? '')
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }

  async loadProject(data: ArrayBuffer): Promise<string> {
    return this.requireMethod('load_project')(new Uint8Array(data))
  }
}
