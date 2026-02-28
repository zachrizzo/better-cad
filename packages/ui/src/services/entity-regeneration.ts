import type { KernelBackend } from './kernel-bridge'
import { useDocumentStore } from '../stores/document-store'
import { isFloorElement, isStairElement, isWallElement, useEntityStore } from '../stores/entity-store'
import { mapKernelPlanMeshToScene } from '../utils/mesh-coordinates'

export async function syncEntitiesAndRegenerateMeshes(kernel: KernelBackend): Promise<void> {
  const elements = await kernel.queryElements()
  useEntityStore.getState().setElements(elements)

  const renderableIds = new Set(
    elements
      .filter((element) => isWallElement(element) || isFloorElement(element) || isStairElement(element))
      .map((element) => element.meta.id),
  )

  const meshes = await kernel.regenView()
  const meshIds = new Set<string>()

  for (const mesh of meshes) {
    meshIds.add(mesh.id)
    useDocumentStore.getState().addCadMesh(mesh.id, mapKernelPlanMeshToScene(mesh))
  }

  for (const existingId of useDocumentStore.getState().cadMeshes.keys()) {
    if (renderableIds.has(existingId) && !meshIds.has(existingId)) {
      useDocumentStore.getState().removeCadMesh(existingId)
    }
  }
}
