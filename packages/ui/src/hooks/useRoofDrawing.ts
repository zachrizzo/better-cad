import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useBimStore } from '../stores/bim-store'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { useLevelStore } from '../stores/level-store'
import { snapPlanPoint, usePlanSnapPoints } from './usePlanSnapPoints'
import { formatLength, type LengthUnit } from '../utils/units'
import type { RoofElement } from '../services/kernel-bridge'
import { isBeamElement, isColumnElement, isFloorElement, isRoofElement, isStairElement, isWallElement, useEntityStore } from '../stores/entity-store'
import { useKernel } from './useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { polygonsOverlapArea, type Point2 as CollisionPoint2 } from '../utils/plan-collision'
import { rectFromCorners, type RectFromCorners } from '../utils/rect-from-corners'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

const MIN_ROOF_DIMENSION = 0.2
const MAX_ROOF_PITCH_DEGREES = 75
const AUTO_ROOF_CLEARANCE = 0.01

type Point2 = [number, number]
type RoofType = RoofElement['roof_type']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizeRoofType(type: RoofElement['roof_type'] | undefined): RoofType {
  if (type === 'shed' || type === 'gable' || type === 'hip') return type
  return 'flat'
}

function normalizeAngleDegrees(angle: number): number {
  let normalized = angle % 360
  if (normalized < 0) normalized += 360
  return normalized
}

export interface PlacedRoofVisual {
  roof: RoofElement
  elevation: number
  roofType: RoofType
  pitchDegrees: number
  ridgeAngleDegrees: number
  opacity: number
}

export interface RoofPreviewData extends RectFromCorners {
  loop: [number, number, number][]
}

export interface RoofDrawingState {
  isActive: boolean
  cursorPoint: Point2 | null
  snapMarker: Point2 | null
  previewData: RoofPreviewData | null
  cursorColor: string
  toolColor: string
  elevation: number
  roofDrawElevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  placedRoofVisuals: PlacedRoofVisual[]
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handleCancel: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for roof drawing.
 * Contains ALL logic — the component is just a renderer.
 */
export function useRoofDrawing(mode: ViewportMode): RoofDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const defaultRoofThickness = useBimStore((s) => s.defaultRoofThickness)
  const defaultRoofElevation = useBimStore((s) => s.defaultRoofElevation)
  const defaultRoofAutoElevation = useBimStore((s) => s.defaultRoofAutoElevation)
  const defaultRoofType = useBimStore((s) => s.defaultRoofType)
  const defaultRoofPitchDegrees = useBimStore((s) => s.defaultRoofPitchDegrees)
  const defaultRoofRidgeAngleDegrees = useBimStore((s) => s.defaultRoofRidgeAngleDegrees)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const level = levels.find((l) => l.id === activeLevelId)
    return level?.elevation ?? 0
  }, [levels, activeLevelId])
  const levelDataById = useMemo(
    () => new Map(levels.map((level) => [level.id, { elevation: level.elevation, visibility: level.visibility }])),
    [levels],
  )
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [startCorner, setStartCorner] = useState<Point2 | null>(null)
  const [previewCorner, setPreviewCorner] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const snapPoints = usePlanSnapPoints()

  const roofCount = useMemo(
    () => Array.from(elements.values()).filter(isRoofElement).length,
    [elements],
  )

  const placedRoofs = useMemo(
    () => Array.from(elements.values()).filter(isRoofElement),
    [elements],
  )
  const roofsOnActiveLevel = useMemo(
    () => placedRoofs.filter((roof) => !roof.meta.level_id || roof.meta.level_id === activeLevelId),
    [activeLevelId, placedRoofs],
  )

  const supportTopByLevel = useMemo(() => {
    const levelMaxSlabOffset = new Map<string, number>()
    for (const element of elements.values()) {
      if (!isFloorElement(element)) continue
      const levelId = element.meta.level_id
      if (!levelId) continue
      levelMaxSlabOffset.set(levelId, Math.max(levelMaxSlabOffset.get(levelId) ?? 0, element.thickness))
    }

    const supportTop = new Map<string, number>()
    for (const level of levels) {
      supportTop.set(level.id, levelMaxSlabOffset.get(level.id) ?? 0)
    }

    for (const element of elements.values()) {
      const levelId = element.meta.level_id
      if (!levelId) continue

      const slabOffset = levelMaxSlabOffset.get(levelId) ?? 0
      const current = supportTop.get(levelId) ?? slabOffset
      let candidate = current

      if (isWallElement(element)) {
        candidate = slabOffset + element.height
      } else if (isColumnElement(element)) {
        candidate = slabOffset + element.height
      } else if (isStairElement(element)) {
        candidate = slabOffset + element.total_height
      } else if (isBeamElement(element)) {
        candidate = Math.max(element.start[2], element.end[2]) + element.depth / 2
      } else {
        continue
      }

      supportTop.set(levelId, Math.max(current, candidate))
    }

    return supportTop
  }, [elements, levels])

  const activeSupportTop = supportTopByLevel.get(activeLevelId) ?? 0
  const effectiveDefaultRoofOffset = defaultRoofAutoElevation
    ? Math.max(defaultRoofElevation, activeSupportTop + AUTO_ROOF_CLEARANCE)
    : defaultRoofElevation

  const placedRoofVisuals = useMemo(
    () => placedRoofs.flatMap((roof) => {
      const levelData = roof.meta.level_id ? levelDataById.get(roof.meta.level_id) : undefined
      const visibility = levelData?.visibility ?? 'visible'
      if (visibility === 'hidden') return []

      const levelSupportTop = roof.meta.level_id ? (supportTopByLevel.get(roof.meta.level_id) ?? 0) : 0
      const autoElevation = roof.auto_elevation !== false
      const roofOffsetRaw = Number.isFinite(roof.elevation) ? roof.elevation : 0
      const roofOffset = autoElevation ? Math.max(roofOffsetRaw, levelSupportTop + AUTO_ROOF_CLEARANCE) : roofOffsetRaw

      return [{
        roof,
        elevation: (levelData?.elevation ?? 0) + roofOffset,
        roofType: normalizeRoofType(roof.roof_type),
        pitchDegrees: Number.isFinite(roof.pitch_degrees) ? roof.pitch_degrees : defaultRoofPitchDegrees,
        ridgeAngleDegrees: Number.isFinite(roof.ridge_angle_degrees) ? roof.ridge_angle_degrees : 0,
        opacity: visibility === 'ghosted' ? 0.28 : 0.85,
      }]
    }),
    [defaultRoofPitchDegrees, levelDataById, placedRoofs, supportTopByLevel],
  )

  const roofDrawElevation = activeLevelElevation + effectiveDefaultRoofOffset

  useEffect(() => {
    if (activeTool !== 'roof') {
      setStartCorner(null)
      setPreviewCorner(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: Point2): { point: Point2; snapped: Point2 | null } => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const updateReadout = useCallback((point: Point2) => {
    const roofType = normalizeRoofType(defaultRoofType)
    const roofPitch = clamp(defaultRoofPitchDegrees, 0, MAX_ROOF_PITCH_DEGREES).toFixed(1)
    const roofElevationLabel = defaultRoofAutoElevation
      ? `${formatLength(effectiveDefaultRoofOffset, lengthUnit)} (auto)`
      : formatLength(defaultRoofElevation, lengthUnit)

    if (!startCorner) {
      setToolReadout(
        `Roof ${roofType} T:${formatLength(defaultRoofThickness, lengthUnit)} Pitch:${roofPitch}\u00B0 Elev:${roofElevationLabel} \u2022 pick first corner`,
      )
      return
    }

    const rect = rectFromCorners(startCorner, point)
    setToolReadout(
      `Roof ${roofType} W:${formatLength(rect.width, lengthUnit)} D:${formatLength(rect.depth, lengthUnit)} A:${rect.area.toFixed(2)} m\u00B2 T:${formatLength(defaultRoofThickness, lengthUnit)}`,
    )
  }, [
    defaultRoofAutoElevation,
    defaultRoofElevation,
    defaultRoofPitchDegrees,
    defaultRoofThickness,
    defaultRoofType,
    effectiveDefaultRoofOffset,
    lengthUnit,
    setToolReadout,
    startCorner,
  ])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'roof') return
    const rawPoint = extractPlanPoint(e, mode)
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], roofDrawElevation, point[1]])
    if (startCorner) {
      setPreviewCorner(point)
    }
    updateReadout(point)
  }, [activeTool, applySnap, mode, roofDrawElevation, setMeasurementCursor, startCorner, updateReadout])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'roof') return

    const rawPoint = extractPlanPoint(e, mode)
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], roofDrawElevation, point[1]])

    if (!startCorner) {
      setStartCorner(point)
      setPreviewCorner(point)
      setToolReadout(`Roof start X:${formatLength(point[0], lengthUnit)} ${mode === '3d' ? 'Z' : 'Y'}:${formatLength(point[1], lengthUnit)}`)
      return
    }

    const rect = rectFromCorners(startCorner, point)
    if (rect.width < MIN_ROOF_DIMENSION || rect.depth < MIN_ROOF_DIMENSION) {
      setToolReadout(`Roof too small \u2022 minimum side is ${formatLength(MIN_ROOF_DIMENSION, lengthUnit)}`)
      return
    }

    const intersectsExistingRoof = roofsOnActiveLevel.some((roof) => (
      polygonsOverlapArea(rect.boundary as CollisionPoint2[], roof.boundary as CollisionPoint2[])
    ))
    if (intersectsExistingRoof) {
      setToolReadout('Roof blocked: footprint intersects an existing roof on this level')
      return
    }

    const roofElement: RoofElement = {
      kind: 'roof',
      meta: {
        id: `roof-${crypto.randomUUID()}`,
        name: `Roof ${roofCount + 1}`,
        level_id: activeLevelId,
      },
      boundary: rect.boundary,
      thickness: defaultRoofThickness,
      elevation: effectiveDefaultRoofOffset,
      auto_elevation: defaultRoofAutoElevation,
      roof_type: normalizeRoofType(defaultRoofType),
      pitch_degrees: clamp(defaultRoofPitchDegrees, 0, MAX_ROOF_PITCH_DEGREES),
      ridge_angle_degrees: normalizeAngleDegrees(defaultRoofRidgeAngleDegrees),
    }

    setStartCorner(null)
    setPreviewCorner(null)
    setToolReadout(
      `Roof placed W:${formatLength(rect.width, lengthUnit)} D:${formatLength(rect.depth, lengthUnit)} A:${rect.area.toFixed(2)} m\u00B2 ${roofElement.roof_type} Pitch:${roofElement.pitch_degrees.toFixed(1)}\u00B0`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; roof entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(roofElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create roof entity:', err)
      }
    })()
  }, [
    activeLevelId,
    activeTool,
    applySnap,
    defaultRoofAutoElevation,
    defaultRoofPitchDegrees,
    defaultRoofRidgeAngleDegrees,
    defaultRoofThickness,
    defaultRoofType,
    effectiveDefaultRoofOffset,
    kernel,
    lengthUnit,
    mode,
    ready,
    roofCount,
    roofDrawElevation,
    roofsOnActiveLevel,
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
    setToolReadout('Roof placement canceled')
  }, [setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  // Build preview rect + outline loop
  const previewData: RoofPreviewData | null = startCorner && previewCorner
    ? (() => {
      const rect = rectFromCorners(startCorner, previewCorner)
      if (rect.width < 1e-6 || rect.depth < 1e-6) return null
      // Loop in plan-local: [x, y_offset, z]
      const loop: [number, number, number][] = [
        [rect.minX, 0.02, rect.minZ],
        [rect.maxX, 0.02, rect.minZ],
        [rect.maxX, 0.02, rect.maxZ],
        [rect.minX, 0.02, rect.maxZ],
        [rect.minX, 0.02, rect.minZ],
      ]
      return { ...rect, loop }
    })()
    : null

  const cursorColor = snapMarker ? '#00ff88' : '#b45309'
  const toolColor = '#b45309'

  return {
    isActive: activeTool === 'roof',
    cursorPoint,
    snapMarker,
    previewData,
    cursorColor,
    toolColor,
    elevation: activeLevelElevation,
    roofDrawElevation,
    lengthUnit,
    planeRef,
    placedRoofVisuals,
    handlePointerMove,
    handleClick,
    handleCancel,
    handlePointerLeave,
  }
}
