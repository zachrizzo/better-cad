import { useMemo } from 'react'
import type { AnnotationDensity, PlanSymbolProfileId } from '../../standards/plan-symbol-profile'
import type { AccessibilityElement, PrototypeElement } from '../../services/kernel-bridge'
import { isAccessibilityElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { useUIStore } from '../../stores/ui-store'
import { generateAccessibilityPrimitives } from '../../standards/symbol-generators/accessibility'
import { renderSymbolPrimitives2D } from '../../standards/renderers/viewport-symbol-renderer'

interface AccessibilitySymbols2DProps {
  elements?: PrototypeElement[]
  annotationDensity?: AnnotationDensity
  showLabels?: boolean
  symbolProfile?: PlanSymbolProfileId
}

export function AccessibilitySymbols2D({
  elements: externalElements,
  annotationDensity,
  showLabels,
  symbolProfile,
}: AccessibilitySymbols2DProps) {
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

  const accessibilityElements = useMemo(
    () => allElements.filter((e): e is AccessibilityElement => isAccessibilityElement(e)),
    [allElements],
  )

  return (
    <>
      {accessibilityElements.map((el) => {
        const bundle = generateAccessibilityPrimitives(el, {
          planSymbolProfile: resolvedProfile,
          annotationDensity: resolvedDensity,
          showLabels: resolvedShowLabels,
        })
        return (
          <group key={`access-${el.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `access-${el.meta.id}`)}
          </group>
        )
      })}
    </>
  )
}
