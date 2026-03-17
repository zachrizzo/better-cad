import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from './usePlanSnapPoints'
import { useActiveDrawingSurface } from './useActiveDrawingSurface'
import { getEnabledMeasurementSnapModes } from '../utils/measurement-snap-settings'
import { formatLength, type LengthUnit } from '../utils/units'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

type Point2 = [number, number]

const SNAP_THRESHOLD = 0.3

export interface PathMeasureDrawingState {
  isActive: boolean
  points: Point2[]
  cursorPos: Point2 | null
  snapMarker: Point2 | null
  snappedCandidate: PlanSnapCandidate | null
  finished: boolean
  totalDistance: number
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  segmentDistance: (a: Point2, b: Point2) => number
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handleDoubleClick: (e: ThreeEvent<PointerEvent>) => void
  handleContextMenu: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for the cumulative path measurement tool.
 * Contains ALL logic -- the component is just a renderer.
 */
export function usePathMeasureDrawing(mode: ViewportMode): PathMeasureDrawingState {
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

  const [points, setPoints] = useState<Point2[]>([])
  const [cursorPos, setCursorPos] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)
  const [finished, setFinished] = useState(false)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  const elevation = activeSurfaceElevation
  const depthLabel = mode === '3d' ? 'Z' : 'Y'

  // Clean up when tool deactivates
  useEffect(() => {
    if (activeTool !== 'measure_path') {
      setPoints([])
      setCursorPos(null)
      setSnapMarker(null)
      setSnappedCandidate(null)
      setFinished(false)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  // Reset local state when an external reset is requested (e.g. Escape key)
  useEffect(() => {
    setPoints([])
    setCursorPos(null)
    setSnapMarker(null)
    setSnappedCandidate(null)
    setFinished(false)
  }, [resetCounter])

  const applySnap = useCallback((raw: Point2): Point2 => {
    const { point, snapped } = snapPlanCandidate(raw, snapCandidates, enabledSnapModes, SNAP_THRESHOLD)
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return point
  }, [enabledSnapModes, snapCandidates])

  const segmentDistance = useCallback((a: Point2, b: Point2) => {
    return Math.hypot(b[0] - a[0], b[1] - a[1])
  }, [])

  const computeTotalDistance = useCallback((pts: Point2[]) => {
    let total = 0
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    }
    return total
  }, [])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure_path') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setMeasurementCursor([point[0], elevation, point[1]])

    // If path is finished, start a new one
    if (finished) {
      setPoints([])
      setFinished(false)
    }

    setPoints((prev) => {
      const next = [...prev, point]
      const total = computeTotalDistance(next)
      if (next.length >= 2) {
        const segDist = segmentDistance(next[next.length - 2], point)
        setToolReadout(`Segment: ${formatLength(segDist, lengthUnit)} | Total: ${formatLength(total, lengthUnit)}`)
      } else {
        setToolReadout(`Path start X:${formatLength(point[0], lengthUnit)} ${depthLabel}:${formatLength(point[1], lengthUnit)}`)
      }
      return next
    })
  }, [activeTool, applySnap, computeTotalDistance, depthLabel, elevation, finished, lengthUnit, mode, segmentDistance, setMeasurementCursor, setToolReadout])

  const handleDoubleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure_path' || points.length < 2) return
    setFinished(true)
    const total = computeTotalDistance(points)
    setToolReadout(`Path total: ${formatLength(total, lengthUnit)} (${points.length} points)`)
  }, [activeTool, computeTotalDistance, lengthUnit, points, setToolReadout])

  const handleContextMenu = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure_path') return
    if (points.length >= 2) {
      setFinished(true)
      const total = computeTotalDistance(points)
      setToolReadout(`Path total: ${formatLength(total, lengthUnit)} (${points.length} points)`)
    }
  }, [activeTool, computeTotalDistance, lengthUnit, points, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'measure_path') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setCursorPos(point)
    setMeasurementCursor([point[0], elevation, point[1]])
    if (points.length > 0 && !finished) {
      const lastPt = points[points.length - 1]
      const segDist = segmentDistance(lastPt, point)
      const total = computeTotalDistance(points) + segDist
      setToolReadout(`Segment: ${formatLength(segDist, lengthUnit)} | Total: ${formatLength(total, lengthUnit)}`)
    } else if (points.length === 0) {
      setToolReadout('Path measure: pick first point')
    }
  }, [activeTool, applySnap, computeTotalDistance, elevation, finished, lengthUnit, mode, points, segmentDistance, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (points.length === 0) setToolReadout(null)
  }, [points.length, setMeasurementCursor, setToolReadout])

  const totalDistance = computeTotalDistance(points)

  return {
    isActive: activeTool === 'measure_path',
    points,
    cursorPos,
    snapMarker,
    snappedCandidate,
    finished,
    totalDistance,
    elevation,
    lengthUnit,
    planeRef,
    segmentDistance,
    handlePointerMove,
    handleClick,
    handleDoubleClick,
    handleContextMenu,
    handlePointerLeave,
  }
}
