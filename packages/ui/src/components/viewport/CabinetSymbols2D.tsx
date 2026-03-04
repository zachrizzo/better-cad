import { useMemo } from 'react'
import type { AnnotationDensity, PlanSymbolProfileId } from '../../standards/plan-symbol-profile'
import type { CabinetElement, PrototypeElement } from '../../services/kernel-bridge'
import { isCabinetElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { useUIStore } from '../../stores/ui-store'
import { generateCabinetPrimitives } from '../../standards/symbol-generators/cabinet'
import { renderSymbolPrimitives2D } from '../../standards/renderers/viewport-symbol-renderer'

interface CabinetSymbols2DProps {
  elements?: PrototypeElement[]
  annotationDensity?: AnnotationDensity
  showLabels?: boolean
  symbolProfile?: PlanSymbolProfileId
}

export function CabinetSymbols2D({
  elements: externalElements,
  annotationDensity,
  showLabels,
  symbolProfile,
}: CabinetSymbols2DProps) {
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

  const cabinetElements = useMemo(
    () => allElements.filter((e): e is CabinetElement => isCabinetElement(e)),
    [allElements],
  )

  return (
    <>
      {cabinetElements.map((el) => {
        const bundle = generateCabinetPrimitives(el, {
          planSymbolProfile: resolvedProfile,
          annotationDensity: resolvedDensity,
          showLabels: resolvedShowLabels,
        })
        return (
          <group key={`cab-${el.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `cab-${el.meta.id}`)}
          </group>
        )
      })}
    </>
  )
}
