import type { KernelBackend, LevelElement, PrototypeElement } from './kernel-bridge'
import { useDocumentStore } from '../stores/document-store'
import {
  isBeamElement,
  isColumnElement,
  isDoorElement,
  isFloorElement,
  isFoundationElement,
  isRoofElement,
  isStairElement,
  isWallElement,
  isWindowElement,
  useEntityStore,
} from '../stores/entity-store'
import { useLevelStore } from '../stores/level-store'
import { mapKernelPlanMeshToScene } from '../utils/mesh-coordinates'

function isRenderableElement(element: PrototypeElement): boolean {
  return (
    isWallElement(element) ||
    isFloorElement(element) ||
    isStairElement(element) ||
    isColumnElement(element) ||
    isBeamElement(element) ||
    isFoundationElement(element) ||
    isRoofElement(element) ||
    isDoorElement(element) ||
    isWindowElement(element)
  )
}

export async function syncEntitiesAndRegenerateMeshes(kernel: KernelBackend): Promise<void> {
  const elements = await kernel.queryElements()
  useEntityStore.getState().setElements(elements)

  const kernelLevels = elements
    .filter((element): element is LevelElement => element.kind === 'level')
    .map((level) => ({
      id: level.meta.id,
      name: level.meta.name,
      elevation: level.elevation,
    }))
    .sort((a, b) => a.elevation - b.elevation)

  if (kernelLevels.length > 0) {
    const kernelLevelIds = new Set(kernelLevels.map((level) => level.id))
    const countsByLevel = new Map<string, number>()
    elements.forEach((element) => {
      if (element.kind === 'level') return
      const levelId = element.meta.level_id
      if (!levelId || !kernelLevelIds.has(levelId)) return
      countsByLevel.set(levelId, (countsByLevel.get(levelId) ?? 0) + 1)
    })
    const preferredActiveLevelId =
      Array.from(countsByLevel.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]

    useLevelStore.getState().syncFromKernelLevels(kernelLevels, preferredActiveLevelId)
  }

  const renderableIds = new Set(
    elements
      .filter(isRenderableElement)
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
