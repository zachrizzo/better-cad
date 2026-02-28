import { invoke } from '@tauri-apps/api/core'
import type { KernelBackend, TessellatedMesh } from './kernel-bridge'
import type { PbrMaterial } from '../stores/material-store'

export class TauriBackend implements KernelBackend {
  async ping(): Promise<string> {
    return invoke<string>('ping')
  }

  async createBox(width: number, height: number, depth: number): Promise<string> {
    // Body ID management is simplified – the kernel creates the solid internally.
    // Return a stable synthetic ID; tessellation is always done via
    // createAndTessellateBox.
    void width; void height; void depth
    return 'box-0'
  }

  async tessellate(_bodyId: string): Promise<TessellatedMesh> {
    // Stub: individual tessellation by ID is not yet exposed as a command.
    return {
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([]),
    }
  }

  async createAndTessellateBox(
    width: number,
    height: number,
    depth: number,
  ): Promise<TessellatedMesh> {
    const result = await invoke<{ positions: number[]; normals: number[]; indices: number[] }>(
      'create_and_tessellate_box',
      { width, height, depth },
    )
    return {
      positions: new Float32Array(result.positions),
      normals: new Float32Array(result.normals),
      indices: new Uint32Array(result.indices),
    }
  }

  async extrudeSketchPoints(points: [number, number][], height: number): Promise<TessellatedMesh> {
    const flatPoints = points.flatMap(([x, y]) => [x, y])
    const result = await invoke<{ positions: number[]; normals: number[]; indices: number[] }>(
      'extrude_sketch_points',
      { points: flatPoints, height },
    )
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
    const result = await invoke<{ positions: number[]; normals: number[]; indices: number[] }>(
      'add_wall',
      { startX, startY, endX, endY, height, thickness },
    )
    return {
      positions: new Float32Array(result.positions),
      normals: new Float32Array(result.normals),
      indices: new Uint32Array(result.indices),
    }
  }

  async generatePlanView(wallsJson: string): Promise<string> {
    return invoke<string>('generate_plan_view', { wallsJson })
  }

  async importFile(data: Uint8Array, format: string): Promise<TessellatedMesh[]> {
    if (format === 'step') {
      const result = await invoke<
        { positions: number[]; normals: number[]; indices: number[] }[]
      >('import_step', { data: Array.from(data) })
      return result.map((m) => ({
        positions: new Float32Array(m.positions),
        normals: new Float32Array(m.normals),
        indices: new Uint32Array(m.indices),
      }))
    }
    throw new Error(`Format "${format}" not supported in Tauri backend`)
  }

  async exportFile(format: string): Promise<ArrayBuffer> {
    if (format === 'step') {
      const bytes = await invoke<number[]>('export_step', { width: 1, height: 1, depth: 1 })
      return new Uint8Array(bytes).buffer
    }
    throw new Error(`Format "${format}" not supported in Tauri backend`)
  }

  async getMaterialLibrary(): Promise<PbrMaterial[]> {
    return invoke<PbrMaterial[]>('get_material_library')
  }

  async saveProject(projectJson: string): Promise<ArrayBuffer> {
    const bytes = await invoke<number[]>('save_project', { projectJson })
    return new Uint8Array(bytes).buffer
  }

  async loadProject(data: ArrayBuffer): Promise<string> {
    const bytes = Array.from(new Uint8Array(data))
    return invoke<string>('load_project', { data: bytes })
  }
}
