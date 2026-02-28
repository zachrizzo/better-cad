import type { KernelBackend, TessellatedMesh } from './kernel-bridge'

// @tauri-apps/api is only available at runtime inside Tauri.
// We dynamically import it so this file can be parsed by TypeScript
// without requiring the dependency to be installed.
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // @ts-expect-error -- @tauri-apps/api is only available at runtime inside Tauri
  const mod = await import(/* @vite-ignore */ '@tauri-apps/api/core')
  return (mod as { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<T> }).invoke(cmd, args)
}

export class TauriBackend implements KernelBackend {
  async ping(): Promise<string> {
    return tauriInvoke<string>('ping')
  }

  async createBox(width: number, height: number, depth: number): Promise<string> {
    return tauriInvoke<string>('create_box', { width, height, depth })
  }

  async tessellate(bodyId: string): Promise<TessellatedMesh> {
    return tauriInvoke<TessellatedMesh>('tessellate', { bodyId })
  }

  async extrudeSketchPoints(_points: [number, number][], _height: number): Promise<string> {
    return 'stub-id'
  }

  async createAndTessellateBox(width: number, height: number, depth: number): Promise<TessellatedMesh> {
    return tauriInvoke<TessellatedMesh>('create_and_tessellate_box', { width, height, depth })
  }

  async addWall(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    height: number,
    thickness: number,
  ): Promise<TessellatedMesh> {
    return tauriInvoke<TessellatedMesh>('add_wall', {
      startX,
      startY,
      endX,
      endY,
      height,
      thickness,
    })
  }

  async generatePlanView(wallsJson: string): Promise<string> {
    return tauriInvoke<string>('generate_plan_view', { wallsJson })
  }

  async importFile(_data: Uint8Array, _format: string): Promise<TessellatedMesh[]> {
    // Tauri import not yet implemented
    throw new Error('Import not yet supported in Tauri backend')
  }

  async exportFile(_format: string): Promise<ArrayBuffer> {
    // Tauri export not yet implemented
    throw new Error('Export not yet supported in Tauri backend')
  }
}
