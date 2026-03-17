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
import type { ColumnElement } from '../services/kernel-bridge'
import { isColumnElement, isFloorElement, useEntityStore } from '../stores/entity-store'
import { useKernel } from './useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { columnFootprint, polygonsOverlapArea, type Point2 as CollisionPoint2 } from '../utils/plan-collision'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

type Point2 = [number, number]

export interface ColumnDrawingState {
  isActive: boolean
  preview: Point2 | null
  snapMarker: Point2 | null
  cursorColor: string
  elevation: number
  activeSurfaceElevation: number
  defaultColumnWidth: number
  defaultColumnDepth: number
  defaultColumnHeight: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  columns: ColumnElement[]
  levelDataById: Map<string, { elevation: number; visibility: string }>
  surfaceOffsetByLevel: Map<string, number>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for column placement.
 * Contains ALL logic — the component is just a renderer.
 */
export function useColumnDrawing(mode: ViewportMode): ColumnDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const defaultColumnWidth = useBimStore((s) => s.defaultColumnWidth)
  const defaultColumnDepth = useBimStore((s) => s.defaultColumnDepth)
  const defaultColumnHeight = useBimStore((s) => s.defaultColumnHeight)
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
  const [preview, setPreview] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const snapPoints = usePlanSnapPoints()

  const columns = useMemo(
    () => Array.from(elements.values()).filter(isColumnElement),
    [elements],
  )
  const columnsOnActiveLevel = useMemo(
    () => columns.filter((column) => !column.meta.level_id || column.meta.level_id === activeLevelId),
    [activeLevelId, columns],
  )
  const surfaceOffsetByLevel = useMemo(() => {
    const offsets = new Map<string, number>()
    for (const element of elements.values()) {
      if (!isFloorElement(element)) continue
      const levelId = element.meta.level_id
      if (!levelId) continue
      offsets.set(levelId, Math.max(offsets.get(levelId) ?? 0, element.thickness))
    }
    return offsets
  }, [elements])
  const activeLevelSurfaceOffset = surfaceOffsetByLevel.get(activeLevelId) ?? 0
  const activeSurfaceElevation = activeLevelElevation + activeLevelSurfaceOffset

  useEffect(() => {
    if (activeTool !== 'column') {
      setPreview(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: Point2) => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'column') return
    const rawPoint = extractPlanPoint(e, mode)
    const { point, snapped } = applySnap(rawPoint)
    setPreview(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])
    setToolReadout(
      `Column W:${formatLength(defaultColumnWidth, lengthUnit)} D:${formatLength(defaultColumnDepth, lengthUnit)} H:${formatLength(defaultColumnHeight, lengthUnit)}`,
    )
  }, [activeSurfaceElevation, activeTool, applySnap, defaultColumnWidth, defaultColumnDepth, defaultColumnHeight, lengthUnit, mode, setMeasurementCursor, setToolReadout])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'column') return

    const rawPoint = extractPlanPoint(e, mode)
    const { point, snapped } = applySnap(rawPoint)
    const center: Point2 = point
    setSnapMarker(snapped)

    const candidate = columnFootprint(center as CollisionPoint2, defaultColumnWidth, defaultColumnDepth)
    const intersectsExistingColumn = columnsOnActiveLevel.some((column) => (
      polygonsOverlapArea(
        candidate,
        columnFootprint(column.center as CollisionPoint2, column.width, column.depth),
      )
    ))
    if (intersectsExistingColumn) {
      setToolReadout('Column blocked: footprint intersects an existing column')
      return
    }

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; column entity was not persisted')
      return
    }

    const columnId = `column-${crypto.randomUUID()}`
    const columnElement: ColumnElement = {
      kind: 'column',
      meta: {
        id: columnId,
        name: `Column ${columns.length + 1}`,
        level_id: activeLevelId,
      },
      center,
      width: defaultColumnWidth,
      depth: defaultColumnDepth,
      height: defaultColumnHeight,
    }

    setToolReadout(
      `Column placed W:${formatLength(defaultColumnWidth, lengthUnit)} D:${formatLength(defaultColumnDepth, lengthUnit)} H:${formatLength(defaultColumnHeight, lengthUnit)}`,
    )

    void (async () => {
      try {
        await kernel.createElement(columnElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create column entity:', err)
      }
    })()
  }, [
    activeTool,
    activeLevelId,
    applySnap,
    columns.length,
    columnsOnActiveLevel,
    defaultColumnWidth,
    defaultColumnDepth,
    defaultColumnHeight,
    kernel,
    lengthUnit,
    mode,
    ready,
    setToolReadout,
  ])

  const handlePointerLeave = useCallback(() => {
    setPreview(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setToolReadout])

  const cursorColor = snapMarker ? '#00ff88' : '#9ca3af'

  return {
    isActive: activeTool === 'column',
    preview,
    snapMarker,
    cursorColor,
    elevation: activeLevelElevation,
    activeSurfaceElevation,
    defaultColumnWidth,
    defaultColumnDepth,
    defaultColumnHeight,
    lengthUnit,
    planeRef,
    columns,
    levelDataById,
    surfaceOffsetByLevel,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  }
}
