import { useMemo } from 'react'
import { isFloorElement, useEntityStore } from '../stores/entity-store'
import { useLevelStore } from '../stores/level-store'

export interface ActiveDrawingSurface {
  activeLevelId: string
  activeLevelElevation: number
  activeSurfaceElevation: number
  slabOffset: number
}

/**
 * Drawing surface used by wall/measure/grid guides.
 * It tracks the active level plus the tallest slab (floor/foundation)
 * on that level so guides stay visible on top of the slab.
 */
export function useActiveDrawingSurface(): ActiveDrawingSurface {
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const elements = useEntityStore((s) => s.elements)

  const activeLevelElevation = useMemo(() => {
    const level = levels.find((l) => l.id === activeLevelId)
    return level?.elevation ?? 0
  }, [levels, activeLevelId])

  const slabOffset = useMemo(() => {
    let maxThickness = 0
    for (const element of elements.values()) {
      if (!isFloorElement(element)) continue
      if (element.meta.level_id && element.meta.level_id !== activeLevelId) continue
      maxThickness = Math.max(maxThickness, element.thickness)
    }
    return maxThickness
  }, [activeLevelId, elements])

  return {
    activeLevelId,
    activeLevelElevation,
    activeSurfaceElevation: activeLevelElevation + slabOffset,
    slabOffset,
  }
}

