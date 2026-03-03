import type {
  KernelBackend,
  PrototypeElement,
  WallElement,
  FloorElement,
  StairElement,
  ColumnElement,
  BeamElement,
  RoofElement,
  FoundationElement,
} from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'

// ── Params ──────────────────────────────────────────────────────────────────

export interface LinearArrayParams {
  count: number
  spacingX: number
  spacingY: number
}

export interface PolarArrayParams {
  count: number
  centerX: number
  centerY: number
  totalAngleDeg: number
}

// ── Clone helpers ───────────────────────────────────────────────────────────

function newId(kind: string): string {
  return `${kind}-${crypto.randomUUID()}`
}

function cloneWithOffset(
  source: PrototypeElement,
  dx: number,
  dy: number,
): PrototypeElement | null {
  const id = newId(source.kind)

  switch (source.kind) {
    case 'wall': {
      const w = source as WallElement
      return {
        ...w,
        meta: { ...w.meta, id, name: `${w.meta.name} copy` },
        start: [w.start[0] + dx, w.start[1] + dy],
        end: [w.end[0] + dx, w.end[1] + dy],
      }
    }
    case 'floor':
    case 'foundation': {
      const f = source as FloorElement | FoundationElement
      return {
        ...f,
        meta: { ...f.meta, id, name: `${f.meta.name} copy` },
        boundary: f.boundary.map(([x, y]) => [x + dx, y + dy] as [number, number]),
      }
    }
    case 'roof': {
      const r = source as RoofElement
      return {
        ...r,
        meta: { ...r.meta, id, name: `${r.meta.name} copy` },
        boundary: r.boundary.map(([x, y]) => [x + dx, y + dy] as [number, number]),
      }
    }
    case 'stair': {
      const s = source as StairElement
      return {
        ...s,
        meta: { ...s.meta, id, name: `${s.meta.name} copy` },
        start: [s.start[0] + dx, s.start[1] + dy],
        end: [s.end[0] + dx, s.end[1] + dy],
      }
    }
    case 'column': {
      const c = source as ColumnElement
      return {
        ...c,
        meta: { ...c.meta, id, name: `${c.meta.name} copy` },
        center: [c.center[0] + dx, c.center[1] + dy],
      }
    }
    case 'beam': {
      const b = source as BeamElement
      return {
        ...b,
        meta: { ...b.meta, id, name: `${b.meta.name} copy` },
        start: [b.start[0] + dx, b.start[1] + dy, b.start[2]],
        end: [b.end[0] + dx, b.end[1] + dy, b.end[2]],
      }
    }
    // Doors, windows, rooms, dimensions, text annotations, levels are not arrayable
    default:
      return null
  }
}

function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number,
): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = px - cx
  const dy = py - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

function cloneWithRotation(
  source: PrototypeElement,
  cx: number,
  cy: number,
  angle: number,
): PrototypeElement | null {
  const id = newId(source.kind)

  switch (source.kind) {
    case 'wall': {
      const w = source as WallElement
      return {
        ...w,
        meta: { ...w.meta, id, name: `${w.meta.name} copy` },
        start: rotatePoint(w.start[0], w.start[1], cx, cy, angle),
        end: rotatePoint(w.end[0], w.end[1], cx, cy, angle),
      }
    }
    case 'floor':
    case 'foundation': {
      const f = source as FloorElement | FoundationElement
      return {
        ...f,
        meta: { ...f.meta, id, name: `${f.meta.name} copy` },
        boundary: f.boundary.map(([x, y]) => rotatePoint(x, y, cx, cy, angle)),
      }
    }
    case 'roof': {
      const r = source as RoofElement
      return {
        ...r,
        meta: { ...r.meta, id, name: `${r.meta.name} copy` },
        boundary: r.boundary.map(([x, y]) => rotatePoint(x, y, cx, cy, angle)),
      }
    }
    case 'stair': {
      const s = source as StairElement
      return {
        ...s,
        meta: { ...s.meta, id, name: `${s.meta.name} copy` },
        start: rotatePoint(s.start[0], s.start[1], cx, cy, angle),
        end: rotatePoint(s.end[0], s.end[1], cx, cy, angle),
      }
    }
    case 'column': {
      const c = source as ColumnElement
      return {
        ...c,
        meta: { ...c.meta, id, name: `${c.meta.name} copy` },
        center: rotatePoint(c.center[0], c.center[1], cx, cy, angle),
      }
    }
    case 'beam': {
      const b = source as BeamElement
      const [sx, sy] = rotatePoint(b.start[0], b.start[1], cx, cy, angle)
      const [ex, ey] = rotatePoint(b.end[0], b.end[1], cx, cy, angle)
      return {
        ...b,
        meta: { ...b.meta, id, name: `${b.meta.name} copy` },
        start: [sx, sy, b.start[2]],
        end: [ex, ey, b.end[2]],
      }
    }
    default:
      return null
  }
}

// ── Smart duplicate offset ──────────────────────────────────────────────────

/**
 * Compute a smart offset for Ctrl+D based on element kind/dimensions so
 * copies don't overlap.
 */
export function smartDuplicateOffset(source: PrototypeElement): [number, number] {
  switch (source.kind) {
    case 'wall': {
      const w = source as WallElement
      // Offset perpendicular to wall direction by thickness * 2
      const dx = w.end[0] - w.start[0]
      const dy = w.end[1] - w.start[1]
      const len = Math.hypot(dx, dy)
      if (len < 1e-8) return [1, 0]
      // Perpendicular direction
      const perpX = -dy / len
      const perpY = dx / len
      const offset = w.thickness * 3
      return [perpX * offset, perpY * offset]
    }
    case 'column': {
      const c = source as ColumnElement
      return [c.width * 2, 0]
    }
    case 'beam': {
      const b = source as BeamElement
      return [b.width * 3, 0]
    }
    case 'stair': {
      const s = source as StairElement
      return [s.width * 1.5, 0]
    }
    default:
      // Floors, roofs, foundations: offset 1m in X
      return [1, 0]
  }
}

// ── Array operations ────────────────────────────────────────────────────────

export function isArrayableElement(el: PrototypeElement): boolean {
  return ['wall', 'floor', 'foundation', 'roof', 'stair', 'column', 'beam'].includes(el.kind)
}

export async function linearArray(
  sourceElement: PrototypeElement,
  params: LinearArrayParams,
  kernel: KernelBackend,
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 1; i <= params.count; i++) {
    const dx = params.spacingX * i
    const dy = params.spacingY * i
    const clone = cloneWithOffset(sourceElement, dx, dy)
    if (!clone) continue
    const id = await kernel.createElement(clone)
    ids.push(id)
  }
  await syncEntitiesAndRegenerateMeshes(kernel)
  return ids
}

export async function polarArray(
  sourceElement: PrototypeElement,
  params: PolarArrayParams,
  kernel: KernelBackend,
): Promise<string[]> {
  const ids: string[] = []
  const totalRad = (params.totalAngleDeg * Math.PI) / 180
  for (let i = 1; i <= params.count; i++) {
    const angle = (totalRad / params.count) * i
    const clone = cloneWithRotation(
      sourceElement,
      params.centerX,
      params.centerY,
      angle,
    )
    if (!clone) continue
    const id = await kernel.createElement(clone)
    ids.push(id)
  }
  await syncEntitiesAndRegenerateMeshes(kernel)
  return ids
}
