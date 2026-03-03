import { useMemo } from 'react'
import type { AnnotationDensity, PlanSymbolProfileId } from '../../standards/plan-symbol-profile'
import type { DoorElement, PrototypeElement, WallElement, WindowElement } from '../../services/kernel-bridge'
import { isDoorElement, isWallElement, isWindowElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { useUIStore } from '../../stores/ui-store'
import { generateDoorPrimitives } from '../../standards/symbol-generators/doors'
import { generateWindowPrimitives } from '../../standards/symbol-generators/windows'
import { renderSymbolPrimitives2D } from '../../standards/renderers/viewport-symbol-renderer'

interface DoorWindowSymbols2DProps {
  elements?: PrototypeElement[]
  annotationDensity?: AnnotationDensity
  showLabels?: boolean
  symbolProfile?: PlanSymbolProfileId
}

export function DoorWindowSymbols2D({
  elements: externalElements,
  annotationDensity,
  showLabels,
  symbolProfile,
}: DoorWindowSymbols2DProps) {
  const storeElements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const densityFromStore = useUIStore((s) => s.annotationDensity)
  const showLabelsFromStore = useUIStore((s) => s.showFurnitureLabels)
  const profileFromStore = useUIStore((s) => s.planSymbolProfile)

  const resolvedDensity = annotationDensity ?? densityFromStore
  const resolvedShowLabels = showLabels ?? showLabelsFromStore
  const resolvedProfile = symbolProfile ?? profileFromStore

  const allElements = useMemo(() => {
    if (externalElements) return externalElements
    return Array.from(storeElements.values()).filter(
      (e) => !e.meta.level_id || e.meta.level_id === activeLevelId,
    )
  }, [externalElements, storeElements, activeLevelId])

  const doors = useMemo(
    () => allElements.filter((e): e is DoorElement => isDoorElement(e)),
    [allElements],
  )

  const windows = useMemo(
    () => allElements.filter((e): e is WindowElement => isWindowElement(e)),
    [allElements],
  )

  const wallById = useMemo(() => {
    const map = new Map<string, WallElement>()
    allElements
      .filter((e): e is WallElement => isWallElement(e))
      .forEach((w) => map.set(w.meta.id, w))
    return map
  }, [allElements])

  const options = useMemo(() => ({
    planSymbolProfile: resolvedProfile,
    annotationDensity: resolvedDensity,
    showLabels: resolvedShowLabels,
  }), [resolvedProfile, resolvedDensity, resolvedShowLabels])

  return (
    <>
      {doors.map((door) => {
        const wall = wallById.get(door.wall_id)
        if (!wall) return null
        const bundle = generateDoorPrimitives({ door, wall }, options)
        return (
          <group key={`door-sym-${door.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `door-${door.meta.id}`)}
          </group>
        )
      })}

      {windows.map((win) => {
        const wall = wallById.get(win.wall_id)
        if (!wall) return null
        const bundle = generateWindowPrimitives({ window: win, wall }, options)
        return (
          <group key={`win-sym-${win.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `win-${win.meta.id}`)}
          </group>
        )
      })}
    </>
  )
}
