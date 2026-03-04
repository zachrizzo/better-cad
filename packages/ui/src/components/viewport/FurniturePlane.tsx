import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore, FURNITURE_DEFAULT_SIZES } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useLevelStore } from '../../stores/level-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import type { FurnitureElement, PlumbingElement, ElectricalElement, HvacElement, FireSafetyElement, AccessibilityElement } from '../../services/kernel-bridge'
import { isFloorElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

type PlanePointerEvent = ThreeEvent<PointerEvent>

const TOOL_COLORS: Record<string, string> = {
  furniture: '#a855f7',
  plumbing: '#3b82f6',
  electrical: '#ef4444',
  hvac: '#7c3aed',
  fire_safety: '#dc2626',
  accessibility: '#0891b2',
}

const PLUMBING_SIZES: Record<string, { width: number; depth: number }> = {
  toilet: { width: 0.4, depth: 0.7 },
  sink: { width: 0.5, depth: 0.4 },
  bathtub: { width: 1.5, depth: 0.7 },
  shower: { width: 0.9, depth: 0.9 },
  water_heater: { width: 0.5, depth: 0.5 },
  hose_bib: { width: 0.15, depth: 0.15 },
  floor_drain: { width: 0.15, depth: 0.15 },
  dishwasher: { width: 0.6, depth: 0.6 },
  washing_machine: { width: 0.6, depth: 0.6 },
  urinal: { width: 0.4, depth: 0.35 },
}

const ELECTRICAL_SIZES: Record<string, { width: number; depth: number }> = {
  outlet: { width: 0.1, depth: 0.1 },
  switch: { width: 0.08, depth: 0.08 },
  light_fixture: { width: 0.3, depth: 0.3 },
  panel: { width: 0.6, depth: 0.2 },
  smoke_detector: { width: 0.12, depth: 0.12 },
  junction_box: { width: 0.1, depth: 0.1 },
  three_way_switch: { width: 0.08, depth: 0.08 },
  dimmer_switch: { width: 0.08, depth: 0.08 },
  gfci_outlet: { width: 0.1, depth: 0.1 },
  floor_outlet: { width: 0.1, depth: 0.1 },
  ceiling_fan: { width: 1.2, depth: 1.2 },
  thermostat: { width: 0.1, depth: 0.05 },
}

const HVAC_SIZES: Record<string, { width: number; depth: number }> = {
  supply_vent: { width: 0.3, depth: 0.3 },
  return_vent: { width: 0.6, depth: 0.3 },
  thermostat: { width: 0.1, depth: 0.1 },
  exhaust_fan: { width: 0.3, depth: 0.3 },
  ductwork: { width: 0.6, depth: 0.3 },
  mini_split: { width: 0.9, depth: 0.2 },
  air_handler: { width: 0.8, depth: 0.6 },
  condensing_unit: { width: 0.8, depth: 0.8 },
  damper: { width: 0.3, depth: 0.1 },
  diffuser: { width: 0.6, depth: 0.6 },
}

const FIRE_SAFETY_SIZES: Record<string, { width: number; depth: number }> = {
  fire_extinguisher: { width: 0.15, depth: 0.15 },
  sprinkler_head: { width: 0.1, depth: 0.1 },
  exit_sign: { width: 0.3, depth: 0.05 },
  pull_station: { width: 0.15, depth: 0.1 },
  smoke_alarm: { width: 0.15, depth: 0.15 },
  fire_alarm_panel: { width: 0.4, depth: 0.2 },
  fire_hose_cabinet: { width: 0.6, depth: 0.2 },
  annunciator: { width: 0.4, depth: 0.1 },
}

const ACCESSIBILITY_SIZES: Record<string, { width: number; depth: number }> = {
  wheelchair: { width: 0.7, depth: 1.2 },
  ramp: { width: 1.0, depth: 2.0 },
  grab_bar: { width: 0.6, depth: 0.05 },
  accessible_parking: { width: 3.6, depth: 5.4 },
  tactile_warning: { width: 0.6, depth: 0.6 },
  ada_restroom: { width: 1.5, depth: 1.5 },
  hearing_loop: { width: 0.3, depth: 0.3 },
}

function getPreviewSize(tool: string, subtype: string): { width: number; depth: number } {
  if (tool === 'furniture') return FURNITURE_DEFAULT_SIZES[subtype as keyof typeof FURNITURE_DEFAULT_SIZES] ?? { width: 1.0, depth: 0.5 }
  if (tool === 'plumbing') return PLUMBING_SIZES[subtype] ?? { width: 0.5, depth: 0.5 }
  if (tool === 'electrical') return ELECTRICAL_SIZES[subtype] ?? { width: 0.15, depth: 0.15 }
  if (tool === 'hvac') return HVAC_SIZES[subtype] ?? { width: 0.3, depth: 0.3 }
  if (tool === 'fire_safety') return FIRE_SAFETY_SIZES[subtype] ?? { width: 0.15, depth: 0.15 }
  if (tool === 'accessibility') return ACCESSIBILITY_SIZES[subtype] ?? { width: 0.7, depth: 0.7 }
  return { width: 0.5, depth: 0.5 }
}

export function FurniturePlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)

  const defaultFurnitureType = useBimStore((s) => s.defaultFurnitureType)
  const defaultFurnitureRotation = useBimStore((s) => s.defaultFurnitureRotation)
  const defaultPlumbingType = useBimStore((s) => s.defaultPlumbingType)
  const defaultPlumbingRotation = useBimStore((s) => s.defaultPlumbingRotation)
  const defaultElectricalType = useBimStore((s) => s.defaultElectricalType)
  const defaultElectricalRotation = useBimStore((s) => s.defaultElectricalRotation)
  const defaultHvacType = useBimStore((s) => s.defaultHvacType)
  const defaultHvacRotation = useBimStore((s) => s.defaultHvacRotation)
  const defaultFireSafetyType = useBimStore((s) => s.defaultFireSafetyType)
  const defaultFireSafetyRotation = useBimStore((s) => s.defaultFireSafetyRotation)
  const defaultAccessibilityType = useBimStore((s) => s.defaultAccessibilityType)
  const defaultAccessibilityRotation = useBimStore((s) => s.defaultAccessibilityRotation)

  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [preview, setPreview] = useState<[number, number] | null>(null)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)
  const snapPoints = usePlanSnapPoints()

  const isActive = activeTool === 'furniture' || activeTool === 'plumbing' || activeTool === 'electrical'
    || activeTool === 'hvac' || activeTool === 'fire_safety' || activeTool === 'accessibility'

  const activeLevelElevation = useMemo(() => {
    const level = levels.find((l) => l.id === activeLevelId)
    return level?.elevation ?? 0
  }, [levels, activeLevelId])

  const activeSurfaceElevation = useMemo(() => {
    let slabOffset = 0
    for (const element of elements.values()) {
      if (!isFloorElement(element)) continue
      if (element.meta.level_id === activeLevelId) {
        slabOffset = Math.max(slabOffset, element.thickness)
      }
    }
    return activeLevelElevation + slabOffset
  }, [elements, activeLevelId, activeLevelElevation])

  const currentSubtype = activeTool === 'furniture' ? defaultFurnitureType
    : activeTool === 'plumbing' ? defaultPlumbingType
    : activeTool === 'electrical' ? defaultElectricalType
    : activeTool === 'hvac' ? defaultHvacType
    : activeTool === 'fire_safety' ? defaultFireSafetyType
    : activeTool === 'accessibility' ? defaultAccessibilityType
    : defaultElectricalType
  const currentRotation = activeTool === 'furniture' ? defaultFurnitureRotation
    : activeTool === 'plumbing' ? defaultPlumbingRotation
    : activeTool === 'electrical' ? defaultElectricalRotation
    : activeTool === 'hvac' ? defaultHvacRotation
    : activeTool === 'fire_safety' ? defaultFireSafetyRotation
    : activeTool === 'accessibility' ? defaultAccessibilityRotation
    : defaultElectricalRotation
  const previewSize = getPreviewSize(activeTool, currentSubtype)
  const color = TOOL_COLORS[activeTool] ?? '#888'

  const elementCount = useMemo(() => {
    let count = 0
    for (const el of elements.values()) {
      if (el.kind === activeTool) count++
    }
    return count
  }, [elements, activeTool])

  useEffect(() => {
    if (!isActive) {
      setPreview(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [isActive, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: [number, number]) => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (!isActive) return
    const rawPoint: [number, number] = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setPreview(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])
    setToolReadout(`${activeTool}: ${currentSubtype} (${currentRotation}°)`)
  }, [activeTool, isActive, applySnap, activeSurfaceElevation, currentSubtype, currentRotation, setMeasurementCursor, setToolReadout])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (!isActive) return
    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; element was not persisted')
      return
    }

    const rawPoint: [number, number] = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setSnapMarker(snapped)

    const id = `${activeTool}-${crypto.randomUUID()}`
    const rotRad = (currentRotation * Math.PI) / 180
    const label = currentSubtype.replace(/_/g, ' ')
    const namePrefix = label.charAt(0).toUpperCase() + label.slice(1)

    let element: FurnitureElement | PlumbingElement | ElectricalElement | HvacElement | FireSafetyElement | AccessibilityElement

    if (activeTool === 'furniture') {
      const size = FURNITURE_DEFAULT_SIZES[defaultFurnitureType] ?? { width: 1.0, depth: 0.5 }
      element = {
        kind: 'furniture',
        meta: { id, name: `${namePrefix} ${elementCount + 1}`, level_id: activeLevelId },
        symbol_type: defaultFurnitureType,
        position: point,
        rotation: rotRad,
        width: size.width,
        depth: size.depth,
      }
    } else if (activeTool === 'plumbing') {
      element = {
        kind: 'plumbing',
        meta: { id, name: `${namePrefix} ${elementCount + 1}`, level_id: activeLevelId },
        symbol_type: defaultPlumbingType,
        position: point,
        rotation: rotRad,
      }
    } else if (activeTool === 'electrical') {
      element = {
        kind: 'electrical',
        meta: { id, name: `${namePrefix} ${elementCount + 1}`, level_id: activeLevelId },
        symbol_type: defaultElectricalType,
        position: point,
        rotation: rotRad,
      }
    } else if (activeTool === 'hvac') {
      const size = HVAC_SIZES[defaultHvacType] ?? { width: 0.3, depth: 0.3 }
      element = {
        kind: 'hvac',
        meta: { id, name: `${namePrefix} ${elementCount + 1}`, level_id: activeLevelId },
        symbol_type: defaultHvacType,
        position: point,
        rotation: rotRad,
        width: size.width,
        depth: size.depth,
      }
    } else if (activeTool === 'fire_safety') {
      element = {
        kind: 'fire_safety',
        meta: { id, name: `${namePrefix} ${elementCount + 1}`, level_id: activeLevelId },
        symbol_type: defaultFireSafetyType,
        position: point,
        rotation: rotRad,
      }
    } else {
      const size = ACCESSIBILITY_SIZES[defaultAccessibilityType] ?? { width: 0.7, depth: 0.7 }
      element = {
        kind: 'accessibility',
        meta: { id, name: `${namePrefix} ${elementCount + 1}`, level_id: activeLevelId },
        symbol_type: defaultAccessibilityType,
        position: point,
        rotation: rotRad,
        width: size.width,
        depth: size.depth,
      }
    }

    setToolReadout(`Placed ${namePrefix}`)

    void (async () => {
      try {
        await kernel.createElement(element)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error(`[BetterCAD] Failed to create ${activeTool} element:`, err)
      }
    })()
  }, [
    activeTool,
    isActive,
    activeLevelId,
    applySnap,
    currentRotation,
    currentSubtype,
    defaultElectricalType,
    defaultFurnitureType,
    defaultPlumbingType,
    defaultHvacType,
    defaultFireSafetyType,
    defaultAccessibilityType,
    elementCount,
    kernel,
    ready,
    setToolReadout,
  ])

  const handlePointerLeave = useCallback(() => {
    setPreview(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setToolReadout])

  const rotRad = (currentRotation * Math.PI) / 180

  return (
    <>
      {isActive && (
        <mesh
          ref={planeRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, activeSurfaceElevation, 0]}
          onClick={handleClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {preview && isActive && (
        <>
          <mesh
            position={[preview[0], activeSurfaceElevation + 0.01, preview[1]]}
            rotation={[-Math.PI / 2, rotRad, 0]}
          >
            <planeGeometry args={[previewSize.width, previewSize.depth]} />
            <meshBasicMaterial color={color} opacity={0.35} transparent side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[preview[0], activeSurfaceElevation + 0.02, preview[1]]}>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshBasicMaterial color={snapMarker ? '#00ff88' : color} />
          </mesh>
        </>
      )}
    </>
  )
}
