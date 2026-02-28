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

  async createAndTessellateBox(width: number, height: number, depth: number): Promise<TessellatedMesh> {
    return tauriInvoke<TessellatedMesh>('create_and_tessellate_box', { width, height, depth })
  }
}
