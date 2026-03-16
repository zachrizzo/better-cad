import type { DimensionElement, PrototypeElement } from './kernel-bridge'
import { resolveDimensionPoint, type DimensionAnchor } from '../utils/dimension-resolver'
import { wallFaceOffset, wallNormal } from './wall-reference'
import type { WallFace } from './wall-reference'

export type DimensionHealth = 'healthy' | 'stale' | 'detached'

const TOLERANCE = 0.001

/**
 * Resolve an anchor ref from a DimensionElement into a 2D point,
 * accounting for wall face offset if specified.
 */
function resolveAnchorPoint(
  anchor: NonNullable<DimensionElement['anchor1']>,
  elements: Map<string, PrototypeElement>,
  wallFace: WallFace,
  finishThickness: number,
): [number, number] | null {
  const el = elements.get(anchor.element_id)
  if (!el) return null

  const elemArray = Array.from(elements.values())
  const base = resolveDimensionPoint(
    { element_id: anchor.element_id, anchor: anchor.anchor as DimensionAnchor['anchor'] },
    elemArray,
  )
  if (!base) return null

  // Apply wall face offset if the anchor has a face override or use global setting
  const face = (anchor.face as WallFace) ?? wallFace
  if (face !== 'centerline' && el.kind === 'wall') {
    const wallEl = el as import('./kernel-bridge').WallElement
    const offset = wallFaceOffset(wallEl, face, finishThickness)
    const [nx, ny] = wallNormal(wallEl)
    return [base[0] + nx * offset, base[1] + ny * offset]
  }

  return base
}

/**
 * Check the health of a single dimension's associative anchors.
 */
export function checkDimensionHealth(
  dim: DimensionElement,
  elements: Map<string, PrototypeElement>,
): DimensionHealth {
  if (!dim.anchor1 && !dim.anchor2) return 'healthy' // non-associative

  let detached = false
  let stale = false

  if (dim.anchor1) {
    const el = elements.get(dim.anchor1.element_id)
    if (!el) {
      detached = true
    } else {
      const resolved = resolveDimensionPoint(
        { element_id: dim.anchor1.element_id, anchor: dim.anchor1.anchor as DimensionAnchor['anchor'] },
        Array.from(elements.values()),
      )
      if (resolved && (Math.abs(resolved[0] - dim.p1[0]) > TOLERANCE || Math.abs(resolved[1] - dim.p1[1]) > TOLERANCE)) {
        stale = true
      }
    }
  }

  if (dim.anchor2) {
    const el = elements.get(dim.anchor2.element_id)
    if (!el) {
      detached = true
    } else {
      const resolved = resolveDimensionPoint(
        { element_id: dim.anchor2.element_id, anchor: dim.anchor2.anchor as DimensionAnchor['anchor'] },
        Array.from(elements.values()),
      )
      if (resolved && (Math.abs(resolved[0] - dim.p2[0]) > TOLERANCE || Math.abs(resolved[1] - dim.p2[1]) > TOLERANCE)) {
        stale = true
      }
    }
  }

  if (detached) return 'detached'
  if (stale) return 'stale'
  return 'healthy'
}

/**
 * Recompute all associative dimensions whose anchor points have moved.
 * Returns only the dimensions that actually changed.
 */
export function recomputeAssociativeDimensions(
  elements: Map<string, PrototypeElement>,
  wallFace: WallFace,
  finishThickness: number,
): DimensionElement[] {
  const dirty: DimensionElement[] = []

  for (const el of elements.values()) {
    if (el.kind !== 'dimension') continue
    const dim = el as DimensionElement
    if (!dim.anchor1 && !dim.anchor2) continue

    let newP1 = dim.p1
    let newP2 = dim.p2
    let changed = false

    if (dim.anchor1) {
      const resolved = resolveAnchorPoint(dim.anchor1, elements, wallFace, finishThickness)
      if (resolved && (Math.abs(resolved[0] - dim.p1[0]) > TOLERANCE || Math.abs(resolved[1] - dim.p1[1]) > TOLERANCE)) {
        newP1 = resolved
        changed = true
      }
    }

    if (dim.anchor2) {
      const resolved = resolveAnchorPoint(dim.anchor2, elements, wallFace, finishThickness)
      if (resolved && (Math.abs(resolved[0] - dim.p2[0]) > TOLERANCE || Math.abs(resolved[1] - dim.p2[1]) > TOLERANCE)) {
        newP2 = resolved
        changed = true
      }
    }

    if (changed) {
      dirty.push({ ...dim, p1: newP1, p2: newP2 })
    }
  }

  return dirty
}
