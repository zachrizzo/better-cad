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
import { extractPlanPoint, toWorldPosition, type ViewportMode } from '../utils/viewport-helpers'

type Point2 = [number, number]

const SNAP_THRESHOLD = 0.3
const ARC_RADIUS = 0.3
const ARC_SEGMENTS = 30

/**
 * Build arc points in world-space between two angles around a center.
 */
function buildArcPointsWorld(
  center: Point2,
  radius: number,
  angleStart: number,
  angleEnd: number,
  segments: number,
  mode: ViewportMode,
  elevation: number,
  zOffset: number,
): [number, number, number][] {
  let start = angleStart
  let end = angleEnd
  let diff = end - start
  // Ensure we sweep the shorter arc
  if (diff > Math.PI) {
    start = angleEnd
    end = angleStart
    diff = end - start
  }
  if (diff < -Math.PI) {
    diff += 2 * Math.PI
  }

  const pts: [number, number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const a = start + diff * t
    const planPt: Point2 = [
      center[0] + radius * Math.cos(a),
      center[1] + radius * Math.sin(a),
    ]
    pts.push(toWorldPosition(planPt, mode, elevation, zOffset))
  }
  return pts
}

export interface AngleMeasureDrawingState {
  isActive: boolean
  ptA: Point2 | null
  ptB: Point2 | null
  ptC: Point2 | null
  phase: 0 | 1 | 2 | 3
  cursorPos: Point2 | null
  snapMarker: Point2 | null
  snappedCandidate: PlanSnapCandidate | null
  angleDeg: number | null
  arcPoints: [number, number, number][] | null
  arcMidpoint: [number, number, number] | null
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for the three-click angle measurement tool.
 * Contains ALL logic -- the component is just a renderer.
 */
export function useAngleMeasureDrawing(mode: ViewportMode): AngleMeasureDrawingState {
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

  const [ptA, setPtA] = useState<Point2 | null>(null)
  const [ptB, setPtB] = useState<Point2 | null>(null)
  const [ptC, setPtC] = useState<Point2 | null>(null)
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0)
  const [cursorPos, setCursorPos] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  const elevation = activeSurfaceElevation

  // Clear state when tool deactivates
  useEffect(() => {
    if (activeTool !== 'measure_angle') {
      setPtA(null)
      setPtB(null)
      setPtC(null)
      setPhase(0)
      setCursorPos(null)
      setSnapMarker(null)
      setSnappedCandidate(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  // Reset on external reset (Escape key)
  useEffect(() => {
    setPtA(null)
    setPtB(null)
    setPtC(null)
    setPhase(0)
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

  const computeAngle = useCallback((a: Point2, b: Point2, c: Point2) => {
    const BA = [a[0] - b[0], a[1] - b[1]]
    const BC = [c[0] - b[0], c[1] - b[1]]
    const dot = BA[0] * BC[0] + BA[1] * BC[1]
    const magBA = Math.hypot(BA[0], BA[1])
    const magBC = Math.hypot(BC[0], BC[1])
    if (magBA === 0 || magBC === 0) return 0
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC))))
    return angleRad * 180 / Math.PI
  }, [])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure_angle') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setMeasurementCursor([point[0], elevation, point[1]])

    if (phase === 0 || phase === 3) {
      // Start fresh
      setPtA(point)
      setPtB(null)
      setPtC(null)
      setPhase(1)
      setCursorPos(null)
      setToolReadout('Angle: pick vertex (2nd point)')
    } else if (phase === 1) {
      setPtB(point)
      setPhase(2)
      setToolReadout('Angle: pick end of second leg')
    } else if (phase === 2) {
      setPtC(point)
      setPhase(3)
      const angleDeg = computeAngle(ptA!, ptB!, point)
      const legAB = Math.hypot(ptA![0] - ptB![0], ptA![1] - ptB![1])
      const legBC = Math.hypot(point[0] - ptB![0], point[1] - ptB![1])
      setToolReadout(
        `Angle: ${angleDeg.toFixed(1)}\u00B0  |  Leg1: ${formatLength(legAB, lengthUnit)}  Leg2: ${formatLength(legBC, lengthUnit)}`,
      )
    }
  }, [activeTool, applySnap, computeAngle, elevation, lengthUnit, mode, phase, ptA, ptB, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'measure_angle') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setCursorPos(point)
    setMeasurementCursor([point[0], elevation, point[1]])

    if (phase === 0) {
      setToolReadout('Angle: pick first leg endpoint')
    } else if (phase === 1 && ptA) {
      setToolReadout('Angle: pick vertex (2nd point)')
    } else if (phase === 2 && ptA && ptB) {
      const angleDeg = computeAngle(ptA, ptB, point)
      const legAB = Math.hypot(ptA[0] - ptB[0], ptA[1] - ptB[1])
      const legBC = Math.hypot(point[0] - ptB[0], point[1] - ptB[1])
      setToolReadout(
        `Angle: ${angleDeg.toFixed(1)}\u00B0  |  Leg1: ${formatLength(legAB, lengthUnit)}  Leg2: ${formatLength(legBC, lengthUnit)}`,
      )
    }
  }, [activeTool, applySnap, computeAngle, elevation, lengthUnit, mode, phase, ptA, ptB, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (phase === 0) setToolReadout(null)
  }, [phase, setMeasurementCursor, setToolReadout])

  // Compute angle for rendering
  const effectiveC = phase === 3 ? ptC : phase === 2 ? cursorPos : null
  const angleDeg =
    ptA && ptB && effectiveC ? computeAngle(ptA, ptB, effectiveC) : null

  // Arc points for the angle indicator (in world space)
  const arcPoints = useMemo(() => {
    if (!ptA || !ptB || !effectiveC) return null
    const BA = [ptA[0] - ptB[0], ptA[1] - ptB[1]]
    const BC = [effectiveC[0] - ptB[0], effectiveC[1] - ptB[1]]
    const angleBA = Math.atan2(BA[1], BA[0])
    const angleBC = Math.atan2(BC[1], BC[0])
    return buildArcPointsWorld(ptB, ARC_RADIUS, angleBA, angleBC, ARC_SEGMENTS, mode, elevation, 0.01)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptA, ptB, effectiveC, mode, elevation])

  // Arc midpoint for label placement
  const arcMidpoint = useMemo(() => {
    if (!arcPoints || arcPoints.length === 0) return null
    const mid = Math.floor(arcPoints.length / 2)
    return arcPoints[mid]
  }, [arcPoints])

  return {
    isActive: activeTool === 'measure_angle',
    ptA,
    ptB,
    ptC,
    phase,
    cursorPos,
    snapMarker,
    snappedCandidate,
    angleDeg,
    arcPoints,
    arcMidpoint,
    elevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  }
}
