import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import { formatLength } from '../../utils/units'
import type { FloorElement } from '../../services/kernel-bridge'
import { isFloorElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import { polygonsOverlapArea, type Point2 as CollisionPoint2 } from '../../utils/plan-collision'
import { rectFromCorners } from '../../utils/rect-from-corners'

const MIN_FLOOR_DIMENSION = 0.2
const PLANE_Z = 0.05

type Point2 = [number, number]

/**
 * 2D drawing plane for foundation / floor / parking tools.
 * Rendered inside the Viewport2D Canvas (orthographic, XY plan space).
 * Two-click workflow: first click sets one corner, second click completes the rectangle.
 */
export function FloorPlane2D() {
  const activeTool = useUIStore((s) => s.activeTool)
  const isFoundationTool = activeTool === 'foundation'
  const isParkingTool = activeTool === 'parking'
  const isFloorTool = activeTool === 'floor'
  const isFloorLikeTool = isFoundationTool || isParkingTool || isFloorTool
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const defaultFloorThickness = useBimStore((s) => s.defaultFloorThickness)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [startCorner, setStartCorner] = useState<Point2 | null>(null)
  const [previewCorner, setPreviewCorner] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const snapPoints = usePlanSnapPoints()

  const floorElements = useMemo(() => Array.from(elements.values()).filter(isFloorElement), [elements])
  const slabsOnActiveLevel = useMemo(
    () => floorElements.filter((floor) => !floor.meta.level_id || floor.meta.level_id === activeLevelId),
    [activeLevelId, floorElements],
  )
  const foundationCount = useMemo(
    () => floorElements.filter((floor) => floor.meta.type_id === 'foundation').length,
    [floorElements],
  )
  const parkingCount = useMemo(
    () => floorElements.filter((floor) => floor.meta.type_id === 'parking_lot').length,
    [floorElements],
  )
  const floorCount = useMemo(
    () => floorElements.filter((floor) => !floor.meta.type_id).length,
    [floorElements],
  )

  const slabLabel = isFoundationTool ? 'Foundation' : isParkingTool ? 'Parking Lot' : 'Floor'
  const slabPrefix = isFoundationTool ? 'foundation' : isParkingTool ? 'parking-lot' : 'floor'
  const slabCount = isFoundationTool ? foundationCount : isParkingTool ? parkingCount : floorCount

  useEffect(() => {
    if (!isFloorLikeTool) {
      setStartCorner(null)
      setPreviewCorner(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [isFloorLikeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: Point2) => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const updateReadout = useCallback((point: Point2) => {
    if (!startCorner) {
      setToolReadout(
        `${slabLabel} thickness ${formatLength(defaultFloorThickness, lengthUnit)} \u2022 pick first corner`,
      )
      return
    }

    const rect = rectFromCorners(startCorner, point)
    setToolReadout(
      `${slabLabel} W:${formatLength(rect.width, lengthUnit)} D:${formatLength(rect.depth, lengthUnit)} A:${rect.area.toFixed(2)} m\u00B2 T:${formatLength(defaultFloorThickness, lengthUnit)}`,
    )
  }, [defaultFloorThickness, lengthUnit, setToolReadout, slabLabel, startCorner])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isFloorLikeTool) return
    const rawPoint: Point2 = [e.point.x, e.point.y]
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    if (startCorner) {
      setPreviewCorner(point)
    }
    updateReadout(point)
  }, [activeLevelElevation, applySnap, isFloorLikeTool, setMeasurementCursor, startCorner, updateReadout])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!isFloorLikeTool) return

    const rawPoint: Point2 = [e.point.x, e.point.y]
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])

    if (!startCorner) {
      setStartCorner(point)
      setPreviewCorner(point)
      setToolReadout(
        `${slabLabel} start X:${formatLength(point[0], lengthUnit)} Y:${formatLength(point[1], lengthUnit)}`,
      )
      return
    }

    const rect = rectFromCorners(startCorner, point)
    const { width, depth } = rect

    if (width < MIN_FLOOR_DIMENSION || depth < MIN_FLOOR_DIMENSION) {
      setToolReadout(`${slabLabel} too small \u2022 minimum side is ${formatLength(MIN_FLOOR_DIMENSION, lengthUnit)}`)
      return
    }

    const candidateBoundary = rect.boundary as CollisionPoint2[]
    const intersectsExistingSlab = slabsOnActiveLevel.some((existing) => (
      polygonsOverlapArea(candidateBoundary, existing.boundary as CollisionPoint2[])
    ))
    if (intersectsExistingSlab) {
      setToolReadout(`${slabLabel} blocked \u2022 cannot intersect an existing slab on this level`)
      return
    }

    const floorElement: FloorElement = {
      kind: 'floor',
      meta: {
        id: `${slabPrefix}-${crypto.randomUUID()}`,
        name: `${slabLabel} ${slabCount + 1}`,
        level_id: activeLevelId,
        type_id: isFoundationTool ? 'foundation' : isParkingTool ? 'parking_lot' : undefined,
      },
      boundary: rect.boundary,
      thickness: defaultFloorThickness,
    }

    setStartCorner(null)
    setPreviewCorner(null)
    setToolReadout(
      `${slabLabel} placed W:${formatLength(width, lengthUnit)} D:${formatLength(depth, lengthUnit)} T:${formatLength(defaultFloorThickness, lengthUnit)}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; slab entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(floorElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create slab entity:', err)
      }
    })()
  }, [
    applySnap,
    activeLevelElevation,
    activeLevelId,
    defaultFloorThickness,
    isFloorLikeTool,
    isFoundationTool,
    isParkingTool,
    kernel,
    lengthUnit,
    ready,
    slabCount,
    slabLabel,
    slabPrefix,
    slabsOnActiveLevel,
    setMeasurementCursor,
    setToolReadout,
    startCorner,
  ])

  const handleCancel = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setStartCorner(null)
    setPreviewCorner(null)
    setSnapMarker(null)
    setToolReadout(`${slabLabel} placement canceled`)
  }, [setToolReadout, slabLabel])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  if (!isFloorLikeTool) return null

  const previewData = startCorner && previewCorner
    ? (() => {
      const rect = rectFromCorners(startCorner, previewCorner)
      if (rect.width < 1e-6 || rect.depth < 1e-6) return null
      return rect
    })()
    : null

  const toolColor = isFoundationTool ? '#f59e0b' : isParkingTool ? '#94a3b8' : '#34d399'
  const cursorColor = snapMarker
    ? '#00ff88'
    : (isFoundationTool ? '#f59e0b' : isParkingTool ? '#64748b' : '#10b981')

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        ref={planeRef}
        position={[0, 0, PLANE_Z]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Cursor indicator */}
      {cursorPoint && (
        <mesh position={[cursorPoint[0], cursorPoint[1], PLANE_Z + 0.01]}>
          <circleGeometry args={[0.06, 14]} />
          <meshBasicMaterial color={cursorColor} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={[snapMarker[0], snapMarker[1], PLANE_Z + 0.01]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Preview rectangle */}
      {previewData && (
        <>
          {/* Filled preview */}
          <mesh position={[previewData.center[0], previewData.center[1], PLANE_Z + 0.005]}>
            <planeGeometry args={[previewData.width, previewData.depth]} />
            <meshBasicMaterial color={toolColor} transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>

          {/* Outline */}
          <Line
            points={[
              [previewData.minX, previewData.minZ, PLANE_Z + 0.01],
              [previewData.maxX, previewData.minZ, PLANE_Z + 0.01],
              [previewData.maxX, previewData.maxZ, PLANE_Z + 0.01],
              [previewData.minX, previewData.maxZ, PLANE_Z + 0.01],
              [previewData.minX, previewData.minZ, PLANE_Z + 0.01],
            ]}
            color={toolColor}
            lineWidth={2}
          />

          {/* Dimension badge */}
          <Html position={[previewData.center[0], previewData.center[1], PLANE_Z + 0.02]} center>
            <div className="measurement-badge">
              {formatLength(previewData.width, lengthUnit)} x {formatLength(previewData.depth, lengthUnit)}
            </div>
          </Html>
        </>
      )}
    </>
  )
}
