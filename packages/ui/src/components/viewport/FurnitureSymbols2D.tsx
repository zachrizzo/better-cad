import { useMemo } from 'react'
import type { AnnotationDensity, PlanSymbolProfileId } from '../../standards/plan-symbol-profile'
import type { FurnitureElement, PrototypeElement } from '../../services/kernel-bridge'
import { isFurnitureElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { useUIStore } from '../../stores/ui-store'
import { generateFurniturePrimitives } from '../../standards/symbol-generators/furniture'
import { renderSymbolPrimitives2D } from '../../standards/renderers/viewport-symbol-renderer'

interface FurnitureSymbols2DProps {
  elements?: PrototypeElement[]
  annotationDensity?: AnnotationDensity
  showLabels?: boolean
  symbolProfile?: PlanSymbolProfileId
}

export function FurnitureSymbols2D({
  elements: externalElements,
  annotationDensity,
  showLabels,
  symbolProfile,
}: FurnitureSymbols2DProps) {
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

  const furnitureElements = useMemo(
    () => allElements.filter((e): e is FurnitureElement => isFurnitureElement(e)),
    [allElements],
  )

  return (
    <>
      {furnitureElements.map((el) => {
        const bundle = generateFurniturePrimitives(el, {
          planSymbolProfile: resolvedProfile,
          annotationDensity: resolvedDensity,
          showLabels: resolvedShowLabels,
        })
        return (
          <group key={`furn-${el.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `furn-${el.meta.id}`)}
          </group>
        )
      })}
    </>
  )
}
