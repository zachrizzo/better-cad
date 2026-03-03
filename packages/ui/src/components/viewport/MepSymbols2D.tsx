import { useMemo } from 'react'
import type { AnnotationDensity, PlanSymbolProfileId } from '../../standards/plan-symbol-profile'
import type { ElectricalElement, PlumbingElement, PrototypeElement } from '../../services/kernel-bridge'
import { isElectricalElement, isPlumbingElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { useUIStore } from '../../stores/ui-store'
import { generateElectricalPrimitives } from '../../standards/symbol-generators/electrical'
import { generatePlumbingPrimitives } from '../../standards/symbol-generators/plumbing'
import { renderSymbolPrimitives2D } from '../../standards/renderers/viewport-symbol-renderer'

interface MepSymbols2DProps {
  elements?: PrototypeElement[]
  annotationDensity?: AnnotationDensity
  showText?: boolean
  symbolProfile?: PlanSymbolProfileId
}

export function MepSymbols2D({
  elements: externalElements,
  annotationDensity,
  showText,
  symbolProfile,
}: MepSymbols2DProps) {
  const storeElements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const densityFromStore = useUIStore((s) => s.annotationDensity)
  const showTextFromStore = useUIStore((s) => s.showMepText)
  const profileFromStore = useUIStore((s) => s.planSymbolProfile)

  const resolvedDensity = annotationDensity ?? densityFromStore
  const resolvedShowText = showText ?? showTextFromStore
  const resolvedProfile = symbolProfile ?? profileFromStore

  const allElements = useMemo(() => {
    if (externalElements) return externalElements
    return Array.from(storeElements.values()).filter(
      (e) => !e.meta.level_id || e.meta.level_id === activeLevelId,
    )
  }, [externalElements, storeElements, activeLevelId])

  const electricalElements = useMemo(
    () => allElements.filter((e): e is ElectricalElement => isElectricalElement(e)),
    [allElements],
  )

  const plumbingElements = useMemo(
    () => allElements.filter((e): e is PlumbingElement => isPlumbingElement(e)),
    [allElements],
  )

  return (
    <>
      {electricalElements.map((el) => {
        const bundle = generateElectricalPrimitives(el, {
          planSymbolProfile: resolvedProfile,
          annotationDensity: resolvedDensity,
          showLabels: resolvedShowText,
        })
        return (
          <group key={`elec-${el.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `elec-${el.meta.id}`)}
          </group>
        )
      })}

      {plumbingElements.map((el) => {
        const bundle = generatePlumbingPrimitives(el, {
          planSymbolProfile: resolvedProfile,
          annotationDensity: resolvedDensity,
          showLabels: resolvedShowText,
        })
        return (
          <group key={`plumb-${el.meta.id}-${resolvedProfile}`}>
            {renderSymbolPrimitives2D(bundle.primitives, bundle.domain, `plumb-${el.meta.id}`)}
          </group>
        )
      })}
    </>
  )
}
