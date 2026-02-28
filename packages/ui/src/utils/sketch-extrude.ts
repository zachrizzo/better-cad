import type { KernelBackend, TessellatedMesh } from '../services/kernel-bridge'
import type { SketchExtrudeMode, WallData } from '../stores/bim-store'
import type { CadMeshData } from '../stores/document-store'
import type { SketchProfile } from '../stores/sketch-store'
import { mapKernelPlanMeshToScene } from './mesh-coordinates'

const MIN_VALUE = 0.01
const MIN_EDGE_LENGTH = 1e-6

interface ExtrudeSketchProfileOptions {
  profile: SketchProfile
  mode: SketchExtrudeMode
  height: number
  thickness: number
  kernel: KernelBackend | null
  ready: boolean
  addCadMesh: (id: string, mesh: CadMeshData) => void
  addWall: (wall: WallData) => void
}

export interface ExtrudeSketchProfileResult {
  meshIds: string[]
  wallIds: string[]
}

function asCadMesh(mesh: TessellatedMesh): CadMeshData {
  return {
    positions: mesh.positions,
    normals: mesh.normals,
    indices: mesh.indices,
  }
}

export async function extrudeSketchProfile({
  profile,
  mode,
  height,
  thickness,
  kernel,
  ready,
  addCadMesh,
  addWall,
}: ExtrudeSketchProfileOptions): Promise<ExtrudeSketchProfileResult> {
  const h = Math.max(MIN_VALUE, height)
  const t = Math.max(MIN_VALUE, thickness)

  if (profile.points.length < 3) {
    throw new Error(`Sketch profile ${profile.id} has fewer than 3 points`)
  }

  if (mode === 'solid') {
    if (!ready || !kernel) {
      throw new Error('Kernel not ready for sketch extrusion')
    }
    const kernelPoints = profile.points.map(([x, z]) => [x, -z] as [number, number])
    const mesh = await kernel.extrudeSketchPoints(kernelPoints, h)
    const meshId = `${profile.id}-solid`
    addCadMesh(meshId, asCadMesh(mapKernelPlanMeshToScene(mesh)))
    return { meshIds: [meshId], wallIds: [] }
  }

  const meshIds: string[] = []
  const wallIds: string[] = []

  for (let i = 0; i < profile.points.length; i += 1) {
    const start = profile.points[i]
    const end = profile.points[(i + 1) % profile.points.length]
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_EDGE_LENGTH) {
      continue
    }

    const wallId = `${profile.id}-wall-${i}`
    addWall({
      id: wallId,
      start: [start[0], start[1]],
      end: [end[0], end[1]],
      height: h,
      thickness: t,
    })
    wallIds.push(wallId)

    if (ready && kernel) {
      const mesh = await kernel.addWall(start[0], -start[1], end[0], -end[1], h, t)
      addCadMesh(wallId, asCadMesh(mapKernelPlanMeshToScene(mesh)))
      meshIds.push(wallId)
    }
  }

  return { meshIds, wallIds }
}
