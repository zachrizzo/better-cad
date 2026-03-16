import type { KernelBackend, DimensionElement, PrototypeElement, WallElement, DoorElement, WindowElement } from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'
import { wallFaceOffset, wallNormal, type WallFace } from './wall-reference'

export interface OpeningDimensionOptions {
  levelId?: string
  wallFace: WallFace
  finishThickness: number
  includeWidth: boolean
  includeSill: boolean
  includeHead: boolean
  offset: number
}

/**
 * Auto-dimension doors and windows on the given level.
 * Creates width dimensions across each opening, and optionally
 * sill/head height dimensions.
 */
export async function generateOpeningDimensions(
  kernel: KernelBackend,
  elements: PrototypeElement[],
  options: OpeningDimensionOptions,
): Promise<string[]> {
  const {
    levelId,
    wallFace,
    finishThickness,
    includeWidth,
    offset,
  } = options

  const walls = new Map<string, WallElement>()
  const openings: (DoorElement | WindowElement)[] = []
  const existingDimIds = new Set<string>()

  for (const el of elements) {
    if (el.kind === 'wall') walls.set(el.meta.id, el as WallElement)
    if ((el.kind === 'door' || el.kind === 'window') && (!levelId || el.meta.level_id === levelId)) {
      openings.push(el as DoorElement | WindowElement)
    }
    if (el.kind === 'dimension') {
      const dim = el as DimensionElement
      if (dim.anchor1?.element_id) existingDimIds.add(dim.anchor1.element_id)
      if (dim.anchor2?.element_id) existingDimIds.add(dim.anchor2.element_id)
    }
  }

  const createdIds: string[] = []

  for (const opening of openings) {
    // Skip openings that already have dimension annotations
    if (existingDimIds.has(opening.meta.id)) continue

    const wall = walls.get(opening.wall_id)
    if (!wall) continue

    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const wallLen = Math.hypot(dx, dy)
    if (wallLen < 1e-6) continue

    const ux = dx / wallLen
    const uy = dy / wallLen
    const [nx, ny] = wallNormal(wall)
    const faceOff = wallFaceOffset(wall, wallFace, finishThickness)

    // Opening edges in plan
    const halfWidth = opening.width / 2
    const centerT = opening.position_along_wall / wallLen
    const centerX = wall.start[0] + ux * opening.position_along_wall + nx * faceOff
    const centerY = wall.start[1] + uy * opening.position_along_wall + ny * faceOff

    const p1: [number, number] = [centerX - ux * halfWidth, centerY - uy * halfWidth]
    const p2: [number, number] = [centerX + ux * halfWidth, centerY + uy * halfWidth]

    if (includeWidth) {
      const dimId = `dim-opening-w-${crypto.randomUUID()}`
      const dimElement: DimensionElement = {
        kind: 'dimension',
        meta: {
          id: dimId,
          name: `${opening.kind === 'door' ? 'Door' : 'Window'} Width`,
          level_id: opening.meta.level_id,
        },
        p1,
        p2,
        offset,
        anchor1: { element_id: opening.meta.id, anchor: 'opening_left' },
        anchor2: { element_id: opening.meta.id, anchor: 'opening_right' },
      }
      try {
        await kernel.createElement(dimElement)
        createdIds.push(dimId)
      } catch (err) {
        console.error('[BetterCAD] Failed to create opening dimension:', err)
      }
    }
  }

  if (createdIds.length > 0) {
    await syncEntitiesAndRegenerateMeshes(kernel)
  }

  return createdIds
}
