import { useCallback, useMemo, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import {
  useEntityStore,
  isFurnitureElement,
  isPlumbingElement,
  isElectricalElement,
  isHvacElement,
  isFireSafetyElement,
  isAccessibilityElement,
} from '../../../stores/entity-store'
import { useUIStore } from '../../../stores/ui-store'
import { Primitive3DGroup } from './Primitive3DGroup'
import { getElement3DSpec } from '../../../standards/element3d-generators'
import type { PrototypeElement } from '../../../services/kernel-bridge'
import type { Element3DSpec } from '../../../standards/element3d-specs'

interface Elements3DGroupProps {
  elementLevelInfo: Map<string, { opacity: number; elevationOffset: number }>
}

/** Type guard: element has the shape fields we need for 3D rendering. */
function isNonStructuralElement(el: PrototypeElement): boolean {
  return (
    isFurnitureElement(el) ||
    isPlumbingElement(el) ||
    isElectricalElement(el) ||
    isHvacElement(el) ||
    isFireSafetyElement(el) ||
    isAccessibilityElement(el)
  )
}

/**
 * Extract position and rotation from any non-structural element.
 * All supported element types share position: [number, number] and rotation: number.
 */
function getElementTransform(el: PrototypeElement): {
  position: [number, number]
  rotation: number
} {
  // All non-structural elements have position and rotation at top level
  const anyEl = el as { position: [number, number]; rotation: number }
  return {
    position: anyEl.position,
    rotation: anyEl.rotation,
  }
}

interface Renderable3DElement {
  id: string
  spec: Element3DSpec
  scenePosition: [number, number, number]
  rotation: number
  opacity: number
}

/**
 * Renders all non-structural elements (furniture, plumbing, electrical, HVAC,
 * fire safety, accessibility) as parametric 3D primitives via Primitive3DGroup.
 *
 * This component sits alongside the CadMesh-based structural element rendering
 * in the 3D scene, providing lightweight procedural geometry for MEP and FF&E
 * elements that don't need kernel tessellation.
 */
export function Elements3DGroup({ elementLevelInfo }: Elements3DGroupProps) {
  const elements = useEntityStore((s) => s.elements)
  const selectedBodyId = useUIStore((s) => s.selectedBodyId)
  const activeTool = useUIStore((s) => s.activeTool)
  const isSelectMode = activeTool === 'select'

  // Local hover state (not in global store, matching how Scene handles hover)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Build the list of renderable 3D elements
  const renderables = useMemo<Renderable3DElement[]>(() => {
    const result: Renderable3DElement[] = []

    for (const [id, el] of elements) {
      if (!isNonStructuralElement(el)) continue

      const spec = getElement3DSpec(el)
      if (!spec) continue

      const { position, rotation } = getElementTransform(el)
      const lvlInfo = elementLevelInfo.get(id)
      const opacity = lvlInfo?.opacity ?? 1.0
      const elevationOffset = lvlInfo?.elevationOffset ?? 0

      // Skip fully hidden elements
      if (opacity <= 0) continue

      // Domain coordinate mapping: kernel (x, y) -> R3F scene (x, elevationOffset, y)
      // BetterCAD uses Y-up in R3F, with domain Y mapped to scene Z
      const scenePosition: [number, number, number] = [
        position[0],
        elevationOffset,
        position[1],
      ]

      result.push({
        id,
        spec,
        scenePosition,
        rotation,
        opacity,
      })
    }

    return result
  }, [elements, elementLevelInfo])

  // Selection handlers — only active in select mode
  const handleClick = useCallback(
    (elementId: string) => (e: ThreeEvent<MouseEvent>) => {
      if (!isSelectMode) return
      e.stopPropagation()
      const current = useUIStore.getState().selectedBodyId
      useUIStore.getState().selectBody(current === elementId ? null : elementId)
    },
    [isSelectMode],
  )

  const handlePointerOver = useCallback(
    (elementId: string) => (e: ThreeEvent<PointerEvent>) => {
      if (!isSelectMode) return
      e.stopPropagation()
      setHoveredId(elementId)
    },
    [isSelectMode],
  )

  const handlePointerOut = useCallback(
    (_elementId: string) => (e: ThreeEvent<PointerEvent>) => {
      if (!isSelectMode) return
      e.stopPropagation()
      setHoveredId(null)
    },
    [isSelectMode],
  )

  return (
    <group name="elements-3d-group">
      {renderables.map((item) => (
        <Primitive3DGroup
          key={item.id}
          specs={item.spec.primitives}
          position={item.scenePosition}
          rotation={item.rotation}
          isSelected={isSelectMode && selectedBodyId === item.id}
          isHovered={isSelectMode && hoveredId === item.id}
          levelOpacity={item.opacity}
          onClick={isSelectMode ? handleClick(item.id) : undefined}
          onPointerOver={isSelectMode ? handlePointerOver(item.id) : undefined}
          onPointerOut={isSelectMode ? handlePointerOut(item.id) : undefined}
        />
      ))}
    </group>
  )
}
