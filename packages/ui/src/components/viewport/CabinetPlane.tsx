import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore, CABINET_DEFAULT_SIZES } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useLevelStore } from '../../stores/level-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import type { CabinetElement } from '../../services/kernel-bridge'
import { isFloorElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

type PlanePointerEvent = ThreeEvent<PointerEvent>

const CABINET_COLOR = '#92400e'

export function CabinetPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)

  const defaultCabinetType = useBimStore((s) => s.defaultCabinetType)
  const defaultCabinetRotation = useBimStore((s) => s.defaultCabinetRotation)
  const defaultCabinetDoorCount = useBimStore((s) => s.defaultCabinetDoorCount)
  const defaultCabinetDrawerCount = useBimStore((s) => s.defaultCabinetDrawerCount)

  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [preview, setPreview] = useState<[number, number] | null>(null)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)
  const snapPoints = usePlanSnapPoints()

  const isActive = activeTool === 'cabinet'

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

  const previewSize = CABINET_DEFAULT_SIZES[defaultCabinetType] ?? { width: 0.61, depth: 0.61, height: 0.91 }

  const elementCount = useMemo(() => {
    let count = 0
    for (const el of elements.values()) {
      if (el.kind === 'cabinet') count++
    }
    return count
  }, [elements])

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
    setToolReadout(`Cabinet: ${defaultCabinetType.replace(/_/g, ' ')} (${defaultCabinetRotation}\u00b0)`)
  }, [isActive, applySnap, activeSurfaceElevation, defaultCabinetType, defaultCabinetRotation, setMeasurementCursor, setToolReadout])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (!isActive) return
    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; cabinet was not placed')
      return
    }

    const rawPoint: [number, number] = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setSnapMarker(snapped)

    const id = `cabinet-${crypto.randomUUID()}`
    const rotRad = (defaultCabinetRotation * Math.PI) / 180
    const label = defaultCabinetType.replace(/_/g, ' ')
    const namePrefix = label.charAt(0).toUpperCase() + label.slice(1)
    const size = CABINET_DEFAULT_SIZES[defaultCabinetType] ?? { width: 0.61, depth: 0.61, height: 0.91 }

    const element: CabinetElement = {
      kind: 'cabinet',
      meta: { id, name: `${namePrefix} ${elementCount + 1}`, level_id: activeLevelId },
      cabinet_type: defaultCabinetType,
      position: point,
      rotation: rotRad,
      width: size.width,
      depth: size.depth,
      height: size.height,
      door_count: defaultCabinetDoorCount,
      drawer_count: defaultCabinetDrawerCount,
    }

    setToolReadout(`Placed ${namePrefix}`)

    void (async () => {
      try {
        await kernel.createElement(element)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create cabinet element:', err)
      }
    })()
  }, [
    isActive,
    activeLevelId,
    applySnap,
    defaultCabinetRotation,
    defaultCabinetType,
    defaultCabinetDoorCount,
    defaultCabinetDrawerCount,
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

  const rotRad = (defaultCabinetRotation * Math.PI) / 180

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
            <meshBasicMaterial color={CABINET_COLOR} opacity={0.35} transparent side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[preview[0], activeSurfaceElevation + 0.02, preview[1]]}>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshBasicMaterial color={snapMarker ? '#00ff88' : CABINET_COLOR} />
          </mesh>
        </>
      )}
    </>
  )
}
