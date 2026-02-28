import type { KernelBackend, TessellatedMesh } from './kernel-bridge'

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
      console.warn('[BetterCAD] WASM module not available, running in mock mode', e)
    }
  }

  async ping(): Promise<string> {
    if (this.wasm) return this.wasm.ping()
    return 'pong (mock)'
  }

  async createBox(_width: number, _height: number, _depth: number): Promise<string> {
    return 'mock-box-id'
  }

  async tessellate(_bodyId: string): Promise<TessellatedMesh> {
    return {
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([]),
    }
  }

  async extrudeSketchPoints(_points: [number, number][], _height: number): Promise<string> {
    return 'stub-id'
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
      return bytes.buffer
    }
    throw new Error(`Export format "${format}" is not supported`)
  }
}
