import { useMemo } from 'react'
import { useEntityStore } from '../stores/entity-store'
import { checkDimensionHealth, type DimensionHealth } from '../services/dimension-associativity'
import type { DimensionElement } from '../services/kernel-bridge'

/**
 * Returns a map from dimension ID to its health status.
 * Only includes dimensions that have associative anchors.
 */
export function useDimensionHealth(): Map<string, DimensionHealth> {
  const elements = useEntityStore((s) => s.elements)

  return useMemo(() => {
    const healthMap = new Map<string, DimensionHealth>()
    for (const el of elements.values()) {
      if (el.kind !== 'dimension') continue
      const dim = el as DimensionElement
      if (!dim.anchor1 && !dim.anchor2) continue
      healthMap.set(dim.meta.id, checkDimensionHealth(dim, elements))
    }
    return healthMap
  }, [elements])
}
