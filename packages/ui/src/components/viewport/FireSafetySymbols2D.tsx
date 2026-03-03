import { useMemo } from 'react'
import type { AnnotationDensity, PlanSymbolProfileId } from '../../standards/plan-symbol-profile'
import type { FireSafetyElement, PrototypeElement } from '../../services/kernel-bridge'
import { isFireSafetyElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { useUIStore } from '../../stores/ui-store'
import { generateFireSafetyPrimitives } from '../../standards/symbol-generators/fire-safety'
import { renderSymbolPrimitives2D } from '../../standards/renderers/viewport-symbol-renderer'

interface FireSafetySymbols2DProps {
  elements?: PrototypeElement[]
  annotationDensity?: AnnotationDensity
  showLabels?: boolean
  symbolProfile?: PlanSymbolProfileId
}

export function FireSafetySymbols2D({
  elements: externalElements,
  annotationDensity,
  showLabels,
  symbolProfile,
}: FireSafetySymbols2DProps) {
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

  const fireSafetyElements = useMemo(
    () => allElements.filter((e): e is FireSafetyElement => isFireSafetyElement(e)),
    [allElements],
  )

  return (
    <>
      {fireSafetyElements.map((el) => {
        const bundle = generateFireSafetyPrimitives(el, {
          planSymbolProfile: resolvedProfile,
          annotationDensity: resolvedDensity,
          showLabels: resolvedShowLabels,
        })
        return (
          <group key={`fire-${el.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `fire-${el.meta.id}`)}
          </group>
        )
      })}
    </>
  )
}
