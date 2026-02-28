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
}
