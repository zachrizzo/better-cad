import type { PrototypeElement, RoomElement } from './kernel-bridge'

type RoomLike = Pick<RoomElement, 'meta'> & { name?: unknown }

export function resolveRoomName(room: RoomLike, fallback = 'Room'): string {
  const directName = typeof room.name === 'string' ? room.name.trim() : ''
  if (directName.length > 0) return directName

  const metaName = typeof room.meta?.name === 'string' ? room.meta.name.trim() : ''
  if (metaName.length > 0) return metaName

  return fallback
}

/**
 * Older project data may carry room names only in meta.name.
 * Normalize queried elements so room.name is always populated for renderers.
 */
export function normalizeQueriedElements(elements: PrototypeElement[]): PrototypeElement[] {
  let roomIndex = 0

  return elements.map((element) => {
    if (element.kind !== 'room') return element

    roomIndex += 1
    const room = element as RoomLike
    const rawRoomName = room.name
    const rawMetaName = element.meta?.name as unknown
    const hasRoomName = typeof rawRoomName === 'string' && rawRoomName.trim().length > 0
    const hasMetaName = typeof rawMetaName === 'string' && rawMetaName.trim().length > 0

    if (hasRoomName && hasMetaName) return element

    const resolvedName = resolveRoomName(room, `Room ${roomIndex}`)
    return {
      ...element,
      name: hasRoomName ? (rawRoomName as string) : resolvedName,
      meta: hasMetaName ? element.meta : { ...element.meta, name: resolvedName },
    }
  })
}
