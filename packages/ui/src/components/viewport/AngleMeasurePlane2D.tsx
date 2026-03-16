import { useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from '../../hooks/usePlanSnapPoints'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength } from '../../utils/units'
import { useLevelStore } from '../../stores/level-store'

type Point2 = [number, number]

const SNAP_THRESHOLD = 0.3
const PLANE_Z = 0.1
const ARC_RADIUS = 0.3
const ARC_SEGMENTS = 30

/**
 * Build arc points from angleStart to angleEnd at a given center and radius.
 * Returns points in XY plane at the given z elevation.
 */
function buildArcPoints2D(
  center: Point2,
  radius: number,
  angleStart: number,
  angleEnd: number,
  segments: number,
  z: number,
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
    pts.push([
      center[0] + radius * Math.cos(a),
      center[1] + radius * Math.sin(a),
      z,
    ])
  }
  return pts
}

/**
 * 2D angle measure plane -- three-click workflow to measure angles in the plan view.
 * Click 1: first leg endpoint (A)
 * Click 2: vertex (B)
 * Click 3: second leg endpoint (C)
 * Displays the angle at B between legs BA and BC.
 */
export function AngleMeasurePlane2D() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const measurementSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.measure)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const snapCandidates = usePlanSnapCandidates()
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const resetCounter = useMeasurementStore((s) => s.resetCounter)

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
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)

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
  }, [activeTool, applySnap, computeAngle, lengthUnit, phase, ptA, ptB, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'measure_angle') return
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)
    setCursorPos(point)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])

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
  }, [activeLevelElevation, activeTool, applySnap, computeAngle, lengthUnit, phase, ptA, ptB, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (phase === 0) setToolReadout(null)
  }, [phase, setMeasurementCursor, setToolReadout])

  if (activeTool !== 'measure_angle') return null

  const z = PLANE_Z
  const drawZ = z + 0.01

  // Compute angle for rendering
  const effectiveC = phase === 3 ? ptC : phase === 2 ? cursorPos : null
  const angleDeg =
    ptA && ptB && effectiveC ? computeAngle(ptA, ptB, effectiveC) : null

  // Arc points for the angle indicator
  const arcPoints = (() => {
    if (!ptA || !ptB || !effectiveC) return null
    const BA = [ptA[0] - ptB[0], ptA[1] - ptB[1]]
    const BC = [effectiveC[0] - ptB[0], effectiveC[1] - ptB[1]]
    const angleBA = Math.atan2(BA[1], BA[0])
    const angleBC = Math.atan2(BC[1], BC[0])
    return buildArcPoints2D(ptB, ARC_RADIUS, angleBA, angleBC, ARC_SEGMENTS, drawZ)
  })()

  // Arc midpoint for label placement
  const arcMidpoint = arcPoints && arcPoints.length > 0
    ? arcPoints[Math.floor(arcPoints.length / 2)]
    : null

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        position={[0, 0, z]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Point A */}
      {ptA && (
        <mesh position={[ptA[0], ptA[1], drawZ]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Point B (vertex) */}
      {ptB && (
        <mesh position={[ptB[0], ptB[1], drawZ]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Point C */}
      {ptC && (
        <mesh position={[ptC[0], ptC[1], drawZ]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Solid line B -> A */}
      {ptA && ptB && (
        <Line
          points={[[ptB[0], ptB[1], drawZ], [ptA[0], ptA[1], drawZ]]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Solid line B -> C (when confirmed) */}
      {ptB && ptC && (
        <Line
          points={[[ptB[0], ptB[1], drawZ], [ptC[0], ptC[1], drawZ]]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Dashed preview line from last confirmed point to cursor */}
      {phase === 1 && ptA && cursorPos && (
        <Line
          points={[[ptA[0], ptA[1], drawZ], [cursorPos[0], cursorPos[1], drawZ]]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}
      {phase === 2 && ptB && cursorPos && (
        <Line
          points={[[ptB[0], ptB[1], drawZ], [cursorPos[0], cursorPos[1], drawZ]]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Arc indicator at vertex */}
      {arcPoints && arcPoints.length > 1 && (
        <Line
          points={arcPoints}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Angle label */}
      {angleDeg !== null && arcMidpoint && (
        <Html position={[arcMidpoint[0], arcMidpoint[1] + 0.15, drawZ + 0.01]} center>
          <div className="measurement-badge">
            <span>{angleDeg.toFixed(1)}&deg;</span>
          </div>
        </Html>
      )}

      {/* Cursor indicator */}
      {cursorPos && (
        <mesh position={[cursorPos[0], cursorPos[1], drawZ]}>
          <circleGeometry args={[0.05, 10]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#22d3ee'} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={[snapMarker[0], snapMarker[1], drawZ]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Snap type label */}
      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], snapMarker[1] + 0.2, drawZ + 0.01]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}
    </>
  )
}
