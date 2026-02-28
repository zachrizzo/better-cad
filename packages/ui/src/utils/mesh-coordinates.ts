import type { TessellatedMesh } from '../services/kernel-bridge'

/**
 * Kernel wall/sketch extrusion data uses XY as plan and +Z as up.
 * UI scene uses XZ as plan and +Y as up.
 * This applies a right-handed basis transform:
 *   x' = x
 *   y' = z
 *   z' = -y
 */
export function mapKernelPlanMeshToScene(mesh: TessellatedMesh): TessellatedMesh {
  const positions = new Float32Array(mesh.positions.length)
  const normals = new Float32Array(mesh.normals.length)

  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]
    const y = mesh.positions[i + 1]
    const z = mesh.positions[i + 2]
    positions[i] = x
    positions[i + 1] = z
    positions[i + 2] = -y
  }

  for (let i = 0; i < mesh.normals.length; i += 3) {
    const nx = mesh.normals[i]
    const ny = mesh.normals[i + 1]
    const nz = mesh.normals[i + 2]
    normals[i] = nx
    normals[i + 1] = nz
    normals[i + 2] = -ny
  }

  return {
    positions,
    normals,
    indices: mesh.indices,
  }
}

