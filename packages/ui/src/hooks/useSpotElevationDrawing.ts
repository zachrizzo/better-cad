import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useKernel } from './useKernel'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { formatLength, type LengthUnit } from '../utils/units'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from './usePlanSnapPoints'
import { getEnabledMeasurementSnapModes } from '../utils/measurement-snap-settings'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { useLevelStore } from '../stores/level-store'
import type { SpotElevationElement } from '../services/kernel-bridge'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

const SNAP_DISTANCE = 0.3

type Point2 = [number, number]

export interface SpotElevationDrawingState {
  isActive: boolean
  cursorPoint: Point2 | null
  snapMarker: Point2 | null
  snappedCandidate: PlanSnapCandidate | null
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for spot elevation placement.
 * Contains ALL logic — the component is just a renderer.
 * Works for both 2D and 3D viewports via the `mode` parameter.
 */
export function useSpotElevationDrawing(mode: ViewportMode): SpotElevationDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const dimensionSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.dimension)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const planSnapCandidates = usePlanSnapCandidates()
  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(dimensionSnapModeSettings, snapEnabled),
    [dimensionSnapModeSettings, snapEnabled],
  )

  const planeRef = useRef<THREE.Mesh>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  // Reset state when tool deactivated
  useEffect(() => {
    if (activeTool !== 'spot_elevation') {
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const snapToNearest = useCallback((raw: Point2): { point: Point2; snapped: Point2 | null } => {
    const { point, snapped } = snapPlanCandidate(raw, planSnapCandidates, enabledSnapModes, SNAP_DISTANCE)
    setSnappedCandidate(snapped)
    setSnapMarker(snapped?.point ?? null)
    return { point, snapped: snapped?.point ?? null }
  }, [enabledSnapModes, planSnapCandidates])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'spot_elevation') return
    const raw = extractPlanPoint(e, mode)
    const { point } = snapToNearest(raw)
    setCursorPoint(point)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    setToolReadout(`Spot Elev: ${formatLength(activeLevelElevation, lengthUnit)}`)
  }, [activeTool, snapToNearest, activeLevelElevation, lengthUnit, mode, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'spot_elevation') return

    const raw = extractPlanPoint(e, mode)
    const { point } = snapToNearest(raw)

    const elId = `spot-elev-${crypto.randomUUID()}`
    const spotEl: SpotElevationElement = {
      kind: 'spot_elevation',
      meta: { id: elId, name: `Spot ${formatLength(activeLevelElevation, lengthUnit)}`, level_id: activeLevelId },
      position: point,
      elevation: activeLevelElevation,
      symbol_style: 'circle',
    }

    setToolReadout(`Placed: ${formatLength(activeLevelElevation, lengthUnit)}`)

    if (!ready || !kernel) return
    void (async () => {
      try {
        await kernel.createElement(spotEl)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create spot elevation:', err)
      }
    })()
  }, [activeTool, snapToNearest, activeLevelElevation, activeLevelId, lengthUnit, mode, kernel, ready, setToolReadout])

  return {
    isActive: activeTool === 'spot_elevation',
    cursorPoint,
    snapMarker,
    snappedCandidate,
    elevation: activeLevelElevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  }
}
