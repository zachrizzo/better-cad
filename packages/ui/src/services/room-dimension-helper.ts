import type { KernelBackend, DimensionElement, PrototypeElement, RoomElement, WallElement } from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'

export interface RoomDimensionOptions {
  levelId?: string
  offset: number
}

/**
 * Auto-dimension room interior clear spans.
 * For each room, finds parallel opposite edges and creates dimensions
 * showing the clear distance between them.
 */
export async function generateRoomClearDimensions(
  kernel: KernelBackend,
  elements: PrototypeElement[],
  options: RoomDimensionOptions,
): Promise<string[]> {
  const { levelId, offset } = options

  const rooms = elements.filter(
    (e): e is RoomElement => e.kind === 'room' && (!levelId || e.meta.level_id === levelId),
  )

  const createdIds: string[] = []

  for (const room of rooms) {
    const boundary = room.boundary
    if (boundary.length < 3) continue

    // Find axis-aligned bounding box of room
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of boundary) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const width = maxX - minX
    const height = maxY - minY

    // Horizontal clear dimension (left-right)
    if (width > 0.1) {
      const dimId = `dim-room-h-${crypto.randomUUID()}`
      const dim: DimensionElement = {
        kind: 'dimension',
        meta: { id: dimId, name: `${room.name} Width`, level_id: room.meta.level_id },
        p1: [minX, cy],
        p2: [maxX, cy],
        offset: -offset,
      }
      try {
        await kernel.createElement(dim)
        createdIds.push(dimId)
      } catch (err) {
        console.error('[BetterCAD] Failed to create room dimension:', err)
      }
    }

    // Vertical clear dimension (top-bottom)
    if (height > 0.1) {
      const dimId = `dim-room-v-${crypto.randomUUID()}`
      const dim: DimensionElement = {
        kind: 'dimension',
        meta: { id: dimId, name: `${room.name} Depth`, level_id: room.meta.level_id },
        p1: [cx, minY],
        p2: [cx, maxY],
        offset,
      }
      try {
        await kernel.createElement(dim)
        createdIds.push(dimId)
      } catch (err) {
        console.error('[BetterCAD] Failed to create room dimension:', err)
      }
    }
  }

  if (createdIds.length > 0) {
    await syncEntitiesAndRegenerateMeshes(kernel)
  }

  return createdIds
}
