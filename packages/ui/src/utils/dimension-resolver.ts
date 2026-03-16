import type { PrototypeElement, WallElement, DoorElement, WindowElement } from '../services/kernel-bridge'

export interface DimensionAnchor {
  element_id: string
  anchor: 'start' | 'end' | 'center' | 'opening_left' | 'opening_right'
}

export function resolveDimensionPoint(
  anchorDef: DimensionAnchor,
  elements: PrototypeElement[],
): [number, number] | null {
  const el = elements.find((e) => e.meta?.id === anchorDef.element_id)
  if (!el) return null

  // Opening anchors for doors/windows
  if (anchorDef.anchor === 'opening_left' || anchorDef.anchor === 'opening_right') {
    if (el.kind === 'door' || el.kind === 'window') {
      const opening = el as DoorElement | WindowElement
      const wall = elements.find((e) => e.meta?.id === opening.wall_id) as WallElement | undefined
      if (!wall) return null

      const dx = wall.end[0] - wall.start[0]
      const dy = wall.end[1] - wall.start[1]
      const wallLen = Math.hypot(dx, dy)
      if (wallLen < 1e-6) return null

      const ux = dx / wallLen
      const uy = dy / wallLen
      const halfW = opening.width / 2
      const cx = wall.start[0] + ux * opening.position_along_wall
      const cy = wall.start[1] + uy * opening.position_along_wall

      if (anchorDef.anchor === 'opening_left') {
        return [cx - ux * halfW, cy - uy * halfW]
      }
      return [cx + ux * halfW, cy + uy * halfW]
    }
  }

  if ('start' in el && 'end' in el) {
    const start = el.start as [number, number]
    const end = el.end as [number, number]
    switch (anchorDef.anchor) {
      case 'start':
        return [start[0], start[1]]
      case 'end':
        return [end[0], end[1]]
      case 'center':
        return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    }
  }

  if ('center' in el) {
    const center = (el as { center: [number, number] }).center
    return [center[0], center[1]]
  }

  if ('boundary' in el) {
    const boundary = (el as { boundary: [number, number][] }).boundary
    if (boundary.length === 0) return null
    const cx = boundary.reduce((s, p) => s + p[0], 0) / boundary.length
    const cy = boundary.reduce((s, p) => s + p[1], 0) / boundary.length
    return [cx, cy]
  }

  return null
}
