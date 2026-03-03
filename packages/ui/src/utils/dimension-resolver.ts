import type { PrototypeElement } from '../services/kernel-bridge'

export interface DimensionAnchor {
  element_id: string
  anchor: 'start' | 'end' | 'center'
}

export function resolveDimensionPoint(
  anchorDef: DimensionAnchor,
  elements: PrototypeElement[],
): [number, number] | null {
  const el = elements.find((e) => e.meta?.id === anchorDef.element_id)
  if (!el) return null

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
