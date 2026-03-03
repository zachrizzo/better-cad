import { invoke } from '@tauri-apps/api/core'
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

export class TauriBackend implements KernelBackend {
  async getCapabilities(): Promise<BackendCapabilities> {
    return invoke<BackendCapabilities>('get_capabilities')
  }

  async ping(): Promise<string> {
    return invoke<string>('ping')
  }

  async resetProject(name: string, units: string): Promise<void> {
    await invoke('reset_project', { name, units })
  }

  async createElement(element: PrototypeElement): Promise<string> {
    return invoke<string>('create_element', { elementJson: JSON.stringify(element) })
  }

  async updateElement(elementId: string, element: PrototypeElement): Promise<void> {
    await invoke('update_element', { elementId, elementJson: JSON.stringify(element) })
  }

  async deleteElement(elementId: string): Promise<void> {
    await invoke('delete_element', { elementId })
  }

  async queryElements(): Promise<PrototypeElement[]> {
    const raw = await invoke<string>('query_elements')
    return normalizeQueriedElements(JSON.parse(raw) as PrototypeElement[])
  }

  async regenView(_opts?: RegenOptions): Promise<RegeneratedMesh[]> {
    const result = await invoke<{ id: string; positions: number[]; normals: number[]; indices: number[] }[]>(
      'regen_view',
    )
    return result.map((m) => ({
      id: m.id,
      positions: new Float32Array(m.positions),
      normals: new Float32Array(m.normals),
      indices: new Uint32Array(m.indices),
    }))
  }

  async createBox(_width: number, _height: number, _depth: number): Promise<string> {
    throw new Error('createBox() is removed in prototype-velocity mode; use createElement()')
  }

  async tessellate(_bodyId: string): Promise<TessellatedMesh> {
    throw new Error('tessellate() by body id is not supported in prototype-velocity mode')
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

  async generatePlanViewV2(): Promise<EnrichedPlanViewData> {
    const raw = await invoke<string>('generate_plan_view_v2')
    return JSON.parse(raw) as EnrichedPlanViewData
  }

  async generateSectionCut(
    cutStartX: number,
    cutStartY: number,
    cutEndX: number,
    cutEndY: number,
    cutHeight: number,
  ): Promise<SectionViewData> {
    const raw = await invoke<string>('generate_section_cut_view', {
      cutStartX,
      cutStartY,
      cutEndX,
      cutEndY,
      cutHeight,
    })
    return JSON.parse(raw) as SectionViewData
  }

  async generateElevation(direction: string): Promise<ElevationViewData> {
    const raw = await invoke<string>('generate_elevation_view', { direction })
    return JSON.parse(raw) as ElevationViewData
  }

  async importModel(data: Uint8Array, format: ImportFormat): Promise<ImportResult> {
    if (format === 'step') {
      const result = await invoke<
        { positions: number[]; normals: number[]; indices: number[] }[]
      >('import_step', { data: Array.from(data) })
      const meshes = result.map((m) => ({
        positions: new Float32Array(m.positions),
        normals: new Float32Array(m.normals),
        indices: new Uint32Array(m.indices),
      }))
      return { meshes, stateMutated: false }
    }

    if (format === 'dxf') {
      const raw = await invoke<string>('import_dxf_data', { data: Array.from(data) })
      const imported = JSON.parse(raw) as unknown[]
      return { meshes: [], stateMutated: true, importedElementCount: imported.length }
    }

    if (format === 'ifc') {
      const raw = await invoke<string>('import_ifc_data', { data: Array.from(data) })
      const imported = JSON.parse(raw) as unknown[]
      return { meshes: [], stateMutated: true, importedElementCount: imported.length, warnings: [] }
    }

    throw new Error(`Import format "${format}" is not supported`)
  }

  async exportModel(format: ExportFormat): Promise<ArrayBuffer> {
    if (format === 'step') {
      const bytes = await invoke<number[]>('export_step_project')
      return new Uint8Array(bytes).buffer
    }
    if (format === 'dxf') {
      const bytes = await invoke<number[]>('export_dxf_project')
      return new Uint8Array(bytes).buffer
    }
    if (format === 'ifc') {
      const bytes = await invoke<number[]>('export_ifc_project')
      return new Uint8Array(bytes).buffer
    }
    if (format === 'gltf') {
      const bytes = await invoke<number[]>('export_gltf_project')
      return new Uint8Array(bytes).buffer
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
    return invoke<PbrMaterial[]>('get_material_library')
  }

  async saveProject(projectJson?: string): Promise<ArrayBuffer> {
    const bytes = await invoke<number[]>('save_project', { projectJson })
    return new Uint8Array(bytes).buffer
  }

  async loadProject(data: ArrayBuffer): Promise<string> {
    const bytes = Array.from(new Uint8Array(data))
    return invoke<string>('load_project', { data: bytes })
  }
}
