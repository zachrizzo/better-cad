import type {
  KernelBackend,
  PrototypeElement,
  RoomElement,
  DoorElement,
  WindowElement,
  WallElement,
  TagElement,
} from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'
import { resolveRoomName } from './room-utils'

// ── Geometry helpers ──────────────────────────────────────────────────────

function computePolygonCentroid(boundary: [number, number][]): [number, number] {
  const n = boundary.length
  let cx = 0
  let cy = 0
  for (const [x, y] of boundary) {
    cx += x
    cy += y
  }
  return [cx / n, cy / n]
}

function computePolygonArea(boundary: [number, number][]): number {
  let area = 0
  const n = boundary.length
  for (let i = 0; i < n; i++) {
    const [x1, y1] = boundary[i]
    const [x2, y2] = boundary[(i + 1) % n]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
}

// ── Tag generators ────────────────────────────────────────────────────────

/**
 * Auto-generate room tags for all RoomElements.
 * Creates a TagElement at each room's centroid showing name + area.
 * Skips rooms that already have a tag targeting them.
 */
export async function generateRoomTags(
  kernel: KernelBackend,
  elements: PrototypeElement[],
): Promise<string[]> {
  const rooms = elements.filter((e): e is RoomElement => e.kind === 'room')
  const existingTags = elements.filter((e): e is TagElement => e.kind === 'tag')
  const taggedIds = new Set(existingTags.map((t) => t.target_element_id))

  const ids: string[] = []

  for (const room of rooms) {
    if (taggedIds.has(room.meta.id)) continue
    if (room.boundary.length < 3) continue

    const centroid = computePolygonCentroid(room.boundary)
    const _area = computePolygonArea(room.boundary)
    const roomName = resolveRoomName(room)

    const tag: TagElement = {
      kind: 'tag',
      meta: {
        id: crypto.randomUUID(),
        name: `Tag: ${roomName}`,
      },
      position: centroid,
      target_element_id: room.meta.id,
      tag_type: 'room',
      auto_text: true,
    }

    const id = await kernel.createElement(tag)
    ids.push(id)
  }

  if (ids.length > 0) {
    await syncEntitiesAndRegenerateMeshes(kernel)
  }
  return ids
}

/**
 * Auto-generate door tags (D01, D02, ...).
 * Creates a TagElement near each door's position.
 * Skips doors that already have a tag targeting them.
 */
export async function generateDoorTags(
  kernel: KernelBackend,
  elements: PrototypeElement[],
): Promise<string[]> {
  const doors = elements.filter((e): e is DoorElement => e.kind === 'door')
  const walls = elements.filter((e): e is WallElement => e.kind === 'wall')
  const wallMap = new Map<string, WallElement>()
  for (const w of walls) wallMap.set(w.meta.id, w)

  const existingTags = elements.filter((e): e is TagElement => e.kind === 'tag')
  const taggedIds = new Set(existingTags.map((t) => t.target_element_id))

  const ids: string[] = []
  let doorIndex = 1

  for (const door of doors) {
    if (taggedIds.has(door.meta.id)) {
      doorIndex++
      continue
    }

    const wall = wallMap.get(door.wall_id)
    if (!wall) {
      doorIndex++
      continue
    }

    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const cx = wall.start[0] + dx * door.position_along_wall
    const cy = wall.start[1] + dy * door.position_along_wall

    // Offset slightly from wall centerline
    const len = Math.hypot(dx, dy)
    const nx = len > 1e-8 ? -dy / len : 0
    const ny = len > 1e-8 ? dx / len : 0
    const tagOffset = 0.3

    const tag: TagElement = {
      kind: 'tag',
      meta: {
        id: crypto.randomUUID(),
        name: `D${String(doorIndex).padStart(2, '0')}`,
      },
      position: [cx + nx * tagOffset, cy + ny * tagOffset],
      target_element_id: door.meta.id,
      tag_type: 'door',
      auto_text: true,
    }

    const id = await kernel.createElement(tag)
    ids.push(id)
    doorIndex++
  }

  if (ids.length > 0) {
    await syncEntitiesAndRegenerateMeshes(kernel)
  }
  return ids
}

/**
 * Auto-generate window tags (W01, W02, ...).
 * Creates a TagElement near each window's position.
 * Skips windows that already have a tag targeting them.
 */
export async function generateWindowTags(
  kernel: KernelBackend,
  elements: PrototypeElement[],
): Promise<string[]> {
  const windows = elements.filter((e): e is WindowElement => e.kind === 'window')
  const walls = elements.filter((e): e is WallElement => e.kind === 'wall')
  const wallMap = new Map<string, WallElement>()
  for (const w of walls) wallMap.set(w.meta.id, w)

  const existingTags = elements.filter((e): e is TagElement => e.kind === 'tag')
  const taggedIds = new Set(existingTags.map((t) => t.target_element_id))

  const ids: string[] = []
  let winIndex = 1

  for (const win of windows) {
    if (taggedIds.has(win.meta.id)) {
      winIndex++
      continue
    }

    const wall = wallMap.get(win.wall_id)
    if (!wall) {
      winIndex++
      continue
    }

    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const cx = wall.start[0] + dx * win.position_along_wall
    const cy = wall.start[1] + dy * win.position_along_wall

    const len = Math.hypot(dx, dy)
    const nx = len > 1e-8 ? -dy / len : 0
    const ny = len > 1e-8 ? dx / len : 0
    const tagOffset = 0.3

    const tag: TagElement = {
      kind: 'tag',
      meta: {
        id: crypto.randomUUID(),
        name: `W${String(winIndex).padStart(2, '0')}`,
      },
      position: [cx + nx * tagOffset, cy + ny * tagOffset],
      target_element_id: win.meta.id,
      tag_type: 'window',
      auto_text: true,
    }

    const id = await kernel.createElement(tag)
    ids.push(id)
    winIndex++
  }

  if (ids.length > 0) {
    await syncEntitiesAndRegenerateMeshes(kernel)
  }
  return ids
}

/**
 * Auto-generate all tags (rooms, doors, windows) in one call.
 */
export async function generateAllTags(
  kernel: KernelBackend,
): Promise<{ rooms: string[]; doors: string[]; windows: string[] }> {
  const elements = await kernel.queryElements()

  const rooms = await generateRoomTags(kernel, elements)
  // Re-query after room tags to get updated element list
  const elementsAfterRooms = await kernel.queryElements()
  const doors = await generateDoorTags(kernel, elementsAfterRooms)
  const elementsAfterDoors = await kernel.queryElements()
  const windows = await generateWindowTags(kernel, elementsAfterDoors)

  return { rooms, doors, windows }
}

export { computePolygonCentroid, computePolygonArea }
