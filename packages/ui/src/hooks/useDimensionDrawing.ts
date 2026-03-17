import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useKernel } from './useKernel'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { formatLength, type LengthUnit } from '../utils/units'
import { snapPlanCandidate, type PlanSnapCandidate, usePlanSnapCandidates } from './usePlanSnapPoints'
import { isWallElement, useEntityStore } from '../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { useLevelStore } from '../stores/level-store'
import type { DimensionElement, WallElement } from '../services/kernel-bridge'
import { getEnabledMeasurementSnapModes } from '../utils/measurement-snap-settings'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

const SNAP_DISTANCE = 0.2
const DEFAULT_OFFSET = 0.5

type Point2 = [number, number]

export interface DimensionDrawingState {
  isActive: boolean
  p1: Point2 | null
  cursorPoint: Point2 | null
  snapMarker: Point2 | null
  snappedCandidate: PlanSnapCandidate | null
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handleContextMenu: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for dimension drawing.
 * Contains ALL logic — the component is just a renderer.
 * Works for both 2D and 3D viewports via the `mode` parameter.
 */
export function useDimensionDrawing(mode: ViewportMode): DimensionDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const dimensionSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.dimension)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const dimensionSubMode = useUIStore((s) => s.dimensionSubMode)

  const planeRef = useRef<THREE.Mesh>(null)
  const [p1, setP1] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  // Chain / baseline / ordinate state
  const [chainGroupId] = useState(() => `chain-${crypto.randomUUID()}`)
  const [baselineOrigin, setBaselineOrigin] = useState<Point2 | null>(null)
  const [baselineCount, setBaselineCount] = useState(0)
  const [ordinateDatum, setOrdinateDatum] = useState<Point2 | null>(null)

  const wallElements = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )
  const planSnapCandidates = usePlanSnapCandidates()
  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(dimensionSnapModeSettings, snapEnabled),
    [dimensionSnapModeSettings, snapEnabled],
  )

  // Snap candidates: wall endpoints (always included) + plan snap candidates
  const snapCandidates = useMemo<PlanSnapCandidate[]>(() => {
    const wallCandidates = wallElements.flatMap<PlanSnapCandidate>((wall: WallElement) => [
      { point: wall.start, modes: ['endpoint'] },
      { point: wall.end, modes: ['endpoint'] },
    ])
    return [...wallCandidates, ...planSnapCandidates]
  }, [planSnapCandidates, wallElements])

  const snapToNearest = useCallback((raw: Point2): { point: Point2; snapped: Point2 | null } => {
    const { point, snapped } = snapPlanCandidate(raw, snapCandidates, enabledSnapModes, SNAP_DISTANCE)
    setSnappedCandidate(snapped)
    return {
      point,
      snapped: snapped?.point ?? null,
    }
  }, [enabledSnapModes, snapCandidates])

  // Reset state when tool deactivated
  useEffect(() => {
    if (activeTool !== 'dimension') {
      setP1(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
      setBaselineOrigin(null)
      setBaselineCount(0)
      setOrdinateDatum(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'dimension') return
    const raw = extractPlanPoint(e, mode)
    const { point, snapped } = snapToNearest(raw)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])

    if (p1) {
      const dist = Math.hypot(point[0] - p1[0], point[1] - p1[1])
      setToolReadout(`Dimension: ${formatLength(dist, lengthUnit)}${snapped ? ' SNAP' : ''}`)
    } else {
      setToolReadout('Dimension: pick first point')
    }
  }, [activeLevelElevation, activeTool, p1, snapToNearest, lengthUnit, mode, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'dimension') return

    const raw = extractPlanPoint(e, mode)
    const { point } = snapToNearest(raw)

    // --- Ordinate mode ---
    if (dimensionSubMode === 'ordinate') {
      if (!ordinateDatum) {
        setOrdinateDatum(point)
        setP1(point)
        setToolReadout('Ordinate: datum set, pick points (right-click to end)')
        return
      }
      // Each click creates a dimension from datum to this point
      const dx = Math.abs(point[0] - ordinateDatum[0])
      const dy = Math.abs(point[1] - ordinateDatum[1])
      const axis: 'x' | 'y' = dx > dy ? 'x' : 'y'
      const dist = axis === 'x' ? dx : dy
      if (dist < 0.01) return

      const dimId = `dim-${crypto.randomUUID()}`
      const dimElement: DimensionElement = {
        kind: 'dimension',
        meta: {
          id: dimId,
          name: `Ord ${formatLength(dist, lengthUnit)}`,
          level_id: activeLevelId,
        },
        p1: ordinateDatum,
        p2: point,
        offset: DEFAULT_OFFSET,
        dimension_mode: 'ordinate',
        ordinate_axis: axis,
        ordinate_datum: ordinateDatum,
      }

      setToolReadout(`Ordinate placed: ${formatLength(dist, lengthUnit)} (${axis.toUpperCase()})`)

      if (!ready || !kernel) return
      void (async () => {
        try {
          await kernel.createElement(dimElement)
          await syncEntitiesAndRegenerateMeshes(kernel)
        } catch (err) {
          console.error('[BetterCAD] Failed to create ordinate dimension:', err)
        }
      })()
      return
    }

    // --- Baseline mode: first click sets origin ---
    if (dimensionSubMode === 'baseline' && !baselineOrigin) {
      setBaselineOrigin(point)
      setP1(point)
      setToolReadout('Baseline: origin set, pick points (right-click to end)')
      return
    }

    // --- Normal first-point pick for aligned/horizontal/vertical/chain ---
    if (!p1) {
      setP1(point)
      setToolReadout('Dimension: pick second point')
      return
    }

    // --- Second point: compute effective p2 based on sub-mode ---
    let effectiveP2 = point
    if (dimensionSubMode === 'horizontal') effectiveP2 = [point[0], p1[1]]
    if (dimensionSubMode === 'vertical') effectiveP2 = [p1[0], point[1]]

    const dist = Math.hypot(effectiveP2[0] - p1[0], effectiveP2[1] - p1[1])
    if (dist < 0.05) return

    // Baseline mode: measure from baselineOrigin with increasing offset
    const isBaseline = dimensionSubMode === 'baseline' && baselineOrigin
    const dimP1 = isBaseline ? baselineOrigin : p1
    const dimP2 = effectiveP2
    const dimDist = isBaseline
      ? Math.hypot(dimP2[0] - dimP1[0], dimP2[1] - dimP1[1])
      : dist
    const dimOffset = isBaseline
      ? DEFAULT_OFFSET + baselineCount * 0.3
      : DEFAULT_OFFSET

    const dimId = `dim-${crypto.randomUUID()}`
    const dimElement: DimensionElement = {
      kind: 'dimension',
      meta: {
        id: dimId,
        name: `Dim ${formatLength(dimDist, lengthUnit)}`,
        level_id: activeLevelId,
      },
      p1: dimP1,
      p2: dimP2,
      offset: dimOffset,
      dimension_mode: dimensionSubMode as DimensionElement['dimension_mode'],
      ...(dimensionSubMode === 'chain' ? { chain_group_id: chainGroupId } : {}),
      ...(isBaseline ? { chain_group_id: chainGroupId, baseline_origin: baselineOrigin } : {}),
    }

    // After placing, update state based on mode
    if (dimensionSubMode === 'chain') {
      setP1(effectiveP2)
      setCursorPoint(null)
      setToolReadout(`Chain dim placed: ${formatLength(dist, lengthUnit)} \u2014 pick next point (right-click to end)`)
    } else if (isBaseline) {
      setBaselineCount((c) => c + 1)
      setP1(baselineOrigin)
      setCursorPoint(null)
      setToolReadout(`Baseline dim placed: ${formatLength(dimDist, lengthUnit)} \u2014 pick next point (right-click to end)`)
    } else {
      setP1(null)
      setCursorPoint(null)
      setToolReadout(`Dimension placed: ${formatLength(dist, lengthUnit)}`)
    }

    if (!ready || !kernel) return
    void (async () => {
      try {
        await kernel.createElement(dimElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create dimension:', err)
      }
    })()
  }, [
    activeLevelId,
    activeTool,
    baselineCount,
    baselineOrigin,
    chainGroupId,
    dimensionSubMode,
    kernel,
    lengthUnit,
    mode,
    ordinateDatum,
    p1,
    ready,
    setToolReadout,
    snapToNearest,
  ])

  const handleContextMenu = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (dimensionSubMode === 'chain' || dimensionSubMode === 'baseline' || dimensionSubMode === 'ordinate') {
      setP1(null)
      setCursorPoint(null)
      setBaselineOrigin(null)
      setBaselineCount(0)
      setOrdinateDatum(null)
      setToolReadout('Dimension: pick first point')
    }
  }, [dimensionSubMode, setToolReadout])

  return {
    isActive: activeTool === 'dimension',
    p1,
    cursorPoint,
    snapMarker,
    snappedCandidate,
    elevation: activeLevelElevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handleContextMenu,
    handlePointerLeave,
  }
}
