import type { KernelBackend, TessellatedMesh } from './kernel-bridge'
import type { PbrMaterial } from '../stores/material-store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmModule = any

export class WasmBackend implements KernelBackend {
  private wasm: WasmModule = null

  async initialize(): Promise<void> {
    try {
      const wasmModule = await import('@bettercad/wasm')
      // wasm-pack --target web requires calling the default export to load the .wasm file
      await wasmModule.default()
      this.wasm = wasmModule
      console.log('[BetterCAD] WASM kernel loaded')
    } catch (e) {
      console.error('[BetterCAD] WASM module failed to load:', e)
      throw new Error(`WASM kernel failed to initialize: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private warnMock(method: string) {
    console.warn(`[BetterCAD] ${method}() called but WASM not loaded — returning mock data`)
  }

  async ping(): Promise<string> {
    if (this.wasm) return this.wasm.ping()
    this.warnMock('ping')
    return 'pong (mock)'
  }

  async createBox(_width: number, _height: number, _depth: number): Promise<string> {
    this.warnMock('createBox')
    return 'mock-box-id'
  }

  async tessellate(_bodyId: string): Promise<TessellatedMesh> {
    this.warnMock('tessellate')
    return {
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([]),
    }
  }

  async extrudeSketchPoints(points: [number, number][], height: number): Promise<TessellatedMesh> {
    if (this.wasm?.extrude_sketch_points) {
      const flatPoints = points.flatMap(([x, y]) => [x, y])
      const result = this.wasm.extrude_sketch_points(flatPoints, height)
      return {
        positions: new Float32Array(result.positions),
        normals: new Float32Array(result.normals),
        indices: new Uint32Array(result.indices),
      }
    }
    this.warnMock('extrudeSketchPoints')
    return {
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([]),
    }
  }

  async createAndTessellateBox(width: number, height: number, depth: number): Promise<TessellatedMesh> {
    if (this.wasm?.create_and_tessellate_box) {
      const result = this.wasm.create_and_tessellate_box(width, height, depth)
      return {
        positions: new Float32Array(result.positions),
        normals: new Float32Array(result.normals),
        indices: new Uint32Array(result.indices),
      }
    }
    // Mock fallback: return empty mesh
    return {
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([]),
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
    if (this.wasm?.add_wall) {
      const result = this.wasm.add_wall(startX, startY, endX, endY, height, thickness)
      return {
        positions: new Float32Array(result.positions),
        normals: new Float32Array(result.normals),
        indices: new Uint32Array(result.indices),
      }
    }
    return {
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([]),
    }
  }

  async generatePlanView(wallsJson: string): Promise<string> {
    if (this.wasm?.generate_plan_view) {
      return this.wasm.generate_plan_view(wallsJson)
    }
    return JSON.stringify({ wall_lines: [] })
  }

  async importFile(data: Uint8Array, format: string): Promise<TessellatedMesh[]> {
    if (format === 'step' && this.wasm?.import_step_data) {
      const result = this.wasm.import_step_data(data)
      if (Array.isArray(result)) {
        return result.map((m: { positions: number[]; normals: number[]; indices: number[] }) => ({
          positions: new Float32Array(m.positions),
          normals: new Float32Array(m.normals),
          indices: new Uint32Array(m.indices),
        }))
      }
      return []
    }
    throw new Error(`Import format "${format}" is not supported`)
  }

  async exportFile(format: string): Promise<ArrayBuffer> {
    if (format === 'step' && this.wasm?.export_step_from_box) {
      // Export the default scene box (1x1x1) as STEP
      const bytes: Uint8Array = this.wasm.export_step_from_box(1.0, 1.0, 1.0)
      // Copy to avoid returning the WASM linear memory buffer directly
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
    throw new Error(`Export format "${format}" is not supported`)
  }

  async getMaterialLibrary(): Promise<PbrMaterial[]> {
    if (this.wasm?.get_material_library) {
      // get_material_library returns a JsValue (JS Array), not a JSON string
      const result = this.wasm.get_material_library()
      return result as PbrMaterial[]
    }
    // Mock fallback: return default material library
    return [
      { id: 'steel', name: 'Steel', base_color: [0.7, 0.7, 0.72, 1.0], metallic: 0.9, roughness: 0.4 },
      { id: 'aluminum', name: 'Aluminum', base_color: [0.8, 0.82, 0.84, 1.0], metallic: 0.85, roughness: 0.35 },
      { id: 'concrete', name: 'Concrete', base_color: [0.6, 0.58, 0.55, 1.0], metallic: 0.0, roughness: 0.9 },
      { id: 'glass', name: 'Glass', base_color: [0.85, 0.9, 0.95, 0.3], metallic: 0.0, roughness: 0.05 },
      { id: 'wood-oak', name: 'Oak Wood', base_color: [0.55, 0.35, 0.18, 1.0], metallic: 0.0, roughness: 0.7 },
      { id: 'copper', name: 'Copper', base_color: [0.72, 0.45, 0.2, 1.0], metallic: 0.95, roughness: 0.3 },
    ]
  }

  async saveProject(projectJson: string): Promise<ArrayBuffer> {
    if (this.wasm?.save_project) {
      const bytes: Uint8Array = this.wasm.save_project(projectJson)
      // Copy to avoid returning the WASM linear memory buffer directly
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
    // Mock fallback: return the JSON as UTF-8 bytes
    return new TextEncoder().encode(projectJson).buffer
  }

  async loadProject(data: ArrayBuffer): Promise<string> {
    if (this.wasm?.load_project) {
      return this.wasm.load_project(new Uint8Array(data))
    }
    // Mock fallback: decode as UTF-8
    return new TextDecoder().decode(data)
  }
}
