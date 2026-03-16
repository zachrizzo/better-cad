import { useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from '../../hooks/usePlanSnapPoints'
import { useActiveDrawingSurface } from '../../hooks/useActiveDrawingSurface'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength } from '../../utils/units'

const SNAP_THRESHOLD = 0.3
const ARC_RADIUS = 0.3
const ARC_SEGMENTS = 30

/**
 * Build arc points from angleStart to angleEnd at given center and radius.
 * Returns points in XZ plane (3D ground plane) at the given elevation.
 */
function buildArcPoints(
  center: [number, number, number],
  radius: number,
  angleStart: number,
  angleEnd: number,
  segments: number,
): [number, number, number][] {
  // Ensure we sweep the shorter arc
  let start = angleStart
  let end = angleEnd
  let diff = end - start
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
      center[1],
      center[2] + radius * Math.sin(a),
    ])
  }
  return pts
}

/**
 * 3D angle measure plane — three-click workflow to measure angles on the ground plane.
 * Click 1: first leg endpoint (A)
 * Click 2: vertex (B)
 * Click 3: second leg endpoint (C)
 * Then displays the angle at B between legs BA and BC.
 */
export function AngleMeasurePlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const measurementSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.measure)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const snapCandidates = usePlanSnapCandidates()
  const { activeSurfaceElevation } = useActiveDrawingSurface()
  const resetCounter = useMeasurementStore((s) => s.resetCounter)

  const [ptA, setPtA] = useState<[number, number, number] | null>(null)
  const [ptB, setPtB] = useState<[number, number, number] | null>(null)
  const [ptC, setPtC] = useState<[number, number, number] | null>(null)
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0)
  const [cursorPos, setCursorPos] = useState<[number, number, number] | null>(null)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  // Clear state when tool deactivates
  useEffect(() => {
    if (activeTool !== 'measure_angle') {
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

  const applySnap = useCallback((point: [number, number, number]): [number, number, number] => {
    const { point: snappedPoint, snapped } = snapPlanCandidate(
      [point[0], point[2]],
      snapCandidates,
      enabledSnapModes,
      SNAP_THRESHOLD,
    )
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return [snappedPoint[0], activeSurfaceElevation, snappedPoint[1]]
  }, [activeSurfaceElevation, enabledSnapModes, snapCandidates])

  const computeAngle = useCallback((a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    // Project to XZ plane (ground plane)
    const BA = [a[0] - b[0], a[2] - b[2]]
    const BC = [c[0] - b[0], c[2] - b[2]]
    const dot = BA[0] * BC[0] + BA[1] * BC[1]
    const magBA = Math.hypot(BA[0], BA[1])
    const magBC = Math.hypot(BC[0], BC[1])
    if (magBA === 0 || magBC === 0) return 0
    const angleRad = Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC))))
    return angleRad * 180 / Math.PI
  }, [])

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure_angle') return
    const hitPoint = e.point as THREE.Vector3
    if (!hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)

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
      const legAB = Math.hypot(ptA![0] - ptB![0], ptA![2] - ptB![2])
      const legBC = Math.hypot(point[0] - ptB![0], point[2] - ptB![2])
      setToolReadout(
        `Angle: ${angleDeg.toFixed(1)}\u00B0  |  Leg1: ${formatLength(legAB, lengthUnit)}  Leg2: ${formatLength(legBC, lengthUnit)}`,
      )
    }
  }

  const handlePointerMove = (e: { point?: THREE.Vector3 }) => {
    const hitPoint = e.point as THREE.Vector3
    if (activeTool !== 'measure_angle' || !hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)
    setCursorPos(point)

    if (phase === 0) {
      setToolReadout('Angle: pick first leg endpoint')
    } else if (phase === 1 && ptA) {
      setToolReadout('Angle: pick vertex (2nd point)')
    } else if (phase === 2 && ptA && ptB) {
      const angleDeg = computeAngle(ptA, ptB, point)
      const legAB = Math.hypot(ptA[0] - ptB[0], ptA[2] - ptB[2])
      const legBC = Math.hypot(point[0] - ptB[0], point[2] - ptB[2])
      setToolReadout(
        `Angle: ${angleDeg.toFixed(1)}\u00B0  |  Leg1: ${formatLength(legAB, lengthUnit)}  Leg2: ${formatLength(legBC, lengthUnit)}`,
      )
    }
  }

  const handlePointerLeave = () => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (phase === 0) setToolReadout(null)
  }

  if (activeTool !== 'measure_angle') return null

  // Compute angle for rendering
  const effectiveC = phase === 3 ? ptC : phase === 2 ? cursorPos : null
  const angleDeg =
    ptA && ptB && effectiveC ? computeAngle(ptA, ptB, effectiveC) : null

  // Arc points for the angle indicator
  const arcPoints = useMemo(() => {
    if (!ptA || !ptB || !effectiveC) return null
    const BA = [ptA[0] - ptB[0], ptA[2] - ptB[2]]
    const BC = [effectiveC[0] - ptB[0], effectiveC[2] - ptB[2]]
    const angleBA = Math.atan2(BA[1], BA[0])
    const angleBC = Math.atan2(BC[1], BC[0])
    return buildArcPoints(ptB, ARC_RADIUS, angleBA, angleBC, ARC_SEGMENTS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptA, ptB, effectiveC])

  // Arc midpoint for label placement
  const arcMidpoint = useMemo(() => {
    if (!arcPoints || arcPoints.length === 0) return null
    const mid = Math.floor(arcPoints.length / 2)
    return arcPoints[mid]
  }, [arcPoints])

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, activeSurfaceElevation, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Point A */}
      {ptA && (
        <mesh position={ptA}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Point B (vertex) */}
      {ptB && (
        <mesh position={ptB}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Point C */}
      {ptC && (
        <mesh position={ptC}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Solid line B -> A */}
      {ptA && ptB && (
        <Line
          points={[ptB, ptA]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Solid line B -> C (when confirmed) */}
      {ptB && ptC && (
        <Line
          points={[ptB, ptC]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Dashed preview line from last confirmed point to cursor */}
      {phase === 1 && ptA && cursorPos && (
        <Line
          points={[ptA, cursorPos]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}
      {phase === 2 && ptB && cursorPos && (
        <Line
          points={[ptB, cursorPos]}
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
        <Html position={[arcMidpoint[0], arcMidpoint[1] + 0.2, arcMidpoint[2]]} center>
          <div className="measurement-badge">
            <span>{angleDeg.toFixed(1)}&deg;</span>
          </div>
        </Html>
      )}

      {/* Cursor indicator */}
      {cursorPos && (
        <mesh position={[cursorPos[0], cursorPos[1], cursorPos[2]]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#22d3ee'} />
        </mesh>
      )}

      {/* Snap type label */}
      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], activeSurfaceElevation + 0.15, snapMarker[1]]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}
    </>
  )
}
