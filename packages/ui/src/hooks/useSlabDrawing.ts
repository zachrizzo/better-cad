import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useBimStore } from '../stores/bim-store'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { snapPlanPoint, usePlanSnapPoints } from './usePlanSnapPoints'
import { formatLength, type LengthUnit } from '../utils/units'
import type { FloorElement, FoundationElement } from '../services/kernel-bridge'
import { isFloorElement, isFoundationElement, useEntityStore } from '../stores/entity-store'
import { useKernel } from './useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { useLevelStore } from '../stores/level-store'
import { polygonsOverlapArea, type Point2 as CollisionPoint2 } from '../utils/plan-collision'
import { rectFromCorners, type RectFromCorners } from '../utils/rect-from-corners'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

const MIN_FLOOR_DIMENSION = 0.2

type Point2 = [number, number]

export interface SlabDrawingState {
  isActive: boolean
  startCorner: Point2 | null
  previewData: RectFromCorners | null
  cursorPoint: Point2 | null
  snapMarker: Point2 | null
  toolColor: string
  cursorColor: string
  slabLabel: string
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handleCancel: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for floor / foundation / parking drawing.
 * Contains ALL logic — the component is just a renderer.
 */
export function useSlabDrawing(mode: ViewportMode): SlabDrawingState {
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
  const elevation = useMemo(() => {
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
  const foundationElements = useMemo(() => Array.from(elements.values()).filter(isFoundationElement), [elements])
  const allSlabElements = useMemo(() => [...floorElements, ...foundationElements], [floorElements, foundationElements])
  const slabsOnActiveLevel = useMemo(
    () => allSlabElements.filter((slab) => !slab.meta.level_id || slab.meta.level_id === activeLevelId),
    [activeLevelId, allSlabElements],
  )
  const foundationCount = foundationElements.length
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

  // Reset state when tool deactivated
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
    const rawPoint = extractPlanPoint(e, mode)
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], elevation, point[1]])
    if (startCorner) setPreviewCorner(point)
    updateReadout(point)
  }, [elevation, applySnap, isFloorLikeTool, mode, setMeasurementCursor, startCorner, updateReadout])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!isFloorLikeTool) return

    const rawPoint = extractPlanPoint(e, mode)
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], elevation, point[1]])

    if (!startCorner) {
      setStartCorner(point)
      setPreviewCorner(point)
      setToolReadout(
        `${slabLabel} start X:${formatLength(point[0], lengthUnit)} ${mode === '3d' ? 'Z' : 'Y'}:${formatLength(point[1], lengthUnit)}`,
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

    const slabElement: FloorElement | FoundationElement = isFoundationTool
      ? {
        kind: 'foundation',
        meta: {
          id: `${slabPrefix}-${crypto.randomUUID()}`,
          name: `${slabLabel} ${slabCount + 1}`,
          level_id: activeLevelId,
        },
        boundary: rect.boundary,
        thickness: defaultFloorThickness,
      }
      : {
        kind: 'floor',
        meta: {
          id: `${slabPrefix}-${crypto.randomUUID()}`,
          name: `${slabLabel} ${slabCount + 1}`,
          level_id: activeLevelId,
          type_id: isParkingTool ? 'parking_lot' : undefined,
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
        await kernel.createElement(slabElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create slab entity:', err)
      }
    })()
  }, [
    applySnap,
    activeLevelId,
    defaultFloorThickness,
    elevation,
    isFloorLikeTool,
    isFoundationTool,
    isParkingTool,
    kernel,
    lengthUnit,
    mode,
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

  // Compute preview rectangle
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

  return {
    isActive: isFloorLikeTool,
    startCorner,
    previewData,
    cursorPoint,
    snapMarker,
    toolColor,
    cursorColor,
    slabLabel,
    elevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handleCancel,
    handlePointerLeave,
  }
}
