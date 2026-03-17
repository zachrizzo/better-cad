import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from './usePlanSnapPoints'
import { useActiveDrawingSurface } from './useActiveDrawingSurface'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../utils/measurement-snap-settings'
import { formatLength, type LengthUnit } from '../utils/units'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

type Point2 = [number, number]

const SNAP_THRESHOLD = 0.3

export interface MeasureDrawingState {
  isActive: boolean
  pt1: Point2 | null
  pt2: Point2 | null
  cursorPos: Point2 | null
  snapMarker: Point2 | null
  snappedCandidate: PlanSnapCandidate | null
  distance: number | null
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for the two-point distance measurement tool.
 * Contains ALL logic -- the component is just a renderer.
 */
export function useMeasureDrawing(mode: ViewportMode): MeasureDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const measurementSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.measure)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const snapCandidates = usePlanSnapCandidates()
  const { activeSurfaceElevation } = useActiveDrawingSurface()
  const resetCounter = useMeasurementStore((s) => s.resetCounter)
  const planeRef = useRef<THREE.Mesh>(null)

  const [pt1, setPt1] = useState<Point2 | null>(null)
  const [pt2, setPt2] = useState<Point2 | null>(null)
  const [cursorPos, setCursorPos] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  const elevation = activeSurfaceElevation

  // Clean up when tool changes
  useEffect(() => {
    if (activeTool !== 'measure') {
      setSnapMarker(null)
      setSnappedCandidate(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  // Reset local state when an external reset is requested (e.g. Escape key)
  useEffect(() => {
    setPt1(null)
    setPt2(null)
    setCursorPos(null)
    setSnapMarker(null)
    setSnappedCandidate(null)
  }, [resetCounter])

  const applySnap = useCallback((raw: Point2): Point2 => {
    const { point, snapped } = snapPlanCandidate(raw, snapCandidates, enabledSnapModes, SNAP_THRESHOLD)
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return point
  }, [enabledSnapModes, snapCandidates])

  const depthLabel = mode === '3d' ? 'Z' : 'Y'

  const formatDeltas = useCallback((from: Point2, to: Point2) => {
    const dx = Math.abs(to[0] - from[0])
    const dy = Math.abs(to[1] - from[1])
    const d = Math.hypot(to[0] - from[0], to[1] - from[1])
    return `dX:${formatLength(dx, lengthUnit)} d${depthLabel}:${formatLength(dy, lengthUnit)} D:${formatLength(d, lengthUnit)}`
  }, [depthLabel, lengthUnit])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setMeasurementCursor([point[0], elevation, point[1]])

    // If a measurement is already complete, reset and start fresh
    if (pt1 && pt2) {
      setPt1(point)
      setPt2(null)
      setCursorPos(null)
      setToolReadout(`Measure start X:${formatLength(point[0], lengthUnit)} ${depthLabel}:${formatLength(point[1], lengthUnit)}`)
      return
    }

    if (!pt1) {
      setPt1(point)
      setPt2(null)
      setToolReadout(`Measure start X:${formatLength(point[0], lengthUnit)} ${depthLabel}:${formatLength(point[1], lengthUnit)}`)
    } else {
      setPt2(point)
      setToolReadout(formatDeltas(pt1, point))
    }
  }, [activeTool, applySnap, depthLabel, elevation, formatDeltas, lengthUnit, mode, pt1, pt2, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'measure') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setCursorPos(point)
    setMeasurementCursor([point[0], elevation, point[1]])
    if (pt1 && !pt2) {
      setToolReadout(formatDeltas(pt1, point))
    } else if (!pt1) {
      setToolReadout('Measure: pick first point')
    }
  }, [activeTool, applySnap, elevation, formatDeltas, mode, pt1, pt2, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (!pt1) setToolReadout(null)
  }, [pt1, setMeasurementCursor, setToolReadout])

  const distance = pt1 && pt2 ? Math.hypot(pt2[0] - pt1[0], pt2[1] - pt1[1]) : null

  return {
    isActive: activeTool === 'measure',
    pt1,
    pt2,
    cursorPos,
    snapMarker,
    snappedCandidate,
    distance,
    elevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  }
}
