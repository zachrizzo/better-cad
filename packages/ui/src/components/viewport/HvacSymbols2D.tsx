import { useMemo } from 'react'
import type { AnnotationDensity, PlanSymbolProfileId } from '../../standards/plan-symbol-profile'
import type { HvacElement, PrototypeElement } from '../../services/kernel-bridge'
import { isHvacElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { useUIStore } from '../../stores/ui-store'
import { generateHvacPrimitives } from '../../standards/symbol-generators/hvac'
import { renderSymbolPrimitives2D } from '../../standards/renderers/viewport-symbol-renderer'

interface HvacSymbols2DProps {
  elements?: PrototypeElement[]
  annotationDensity?: AnnotationDensity
  showLabels?: boolean
  symbolProfile?: PlanSymbolProfileId
}

export function HvacSymbols2D({
  elements: externalElements,
  annotationDensity,
  showLabels,
  symbolProfile,
}: HvacSymbols2DProps) {
  const storeElements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const densityFromStore = useUIStore((s) => s.annotationDensity)
  const showLabelsFromStore = useUIStore((s) => s.showMepText)
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

  const hvacElements = useMemo(
    () => allElements.filter((e): e is HvacElement => isHvacElement(e)),
    [allElements],
  )

  return (
    <>
      {hvacElements.map((el) => {
        const bundle = generateHvacPrimitives(el, {
          planSymbolProfile: resolvedProfile,
          annotationDensity: resolvedDensity,
          showLabels: resolvedShowLabels,
        })
        return (
          <group key={`hvac-${el.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `hvac-${el.meta.id}`)}
          </group>
        )
      })}
    </>
  )
}
