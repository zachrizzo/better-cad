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

/**
 * 2D cumulative path measurement tool -- rendered inside the Viewport2D Canvas.
 * Multi-click workflow: each click adds a point. Right-click or double-click finishes the path.
 * Shows segment distances at midpoints and cumulative total at the last point.
 */
export function PathMeasurePlane2D() {
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
  const [points, setPoints] = useState<Point2[]>([])
  const [cursorPos, setCursorPos] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)
  const [finished, setFinished] = useState(false)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

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
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)

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
        setToolReadout(`Path start X:${formatLength(point[0], lengthUnit)} Y:${formatLength(point[1], lengthUnit)}`)
      }
      return next
    })
  }, [activeTool, applySnap, computeTotalDistance, finished, lengthUnit, segmentDistance, setToolReadout])

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
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)
    setCursorPos(point)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    if (points.length > 0 && !finished) {
      const lastPt = points[points.length - 1]
      const segDist = segmentDistance(lastPt, point)
      const total = computeTotalDistance(points) + segDist
      setToolReadout(`Segment: ${formatLength(segDist, lengthUnit)} | Total: ${formatLength(total, lengthUnit)}`)
    } else if (points.length === 0) {
      setToolReadout('Path measure: pick first point')
    }
  }, [activeLevelElevation, activeTool, applySnap, computeTotalDistance, finished, lengthUnit, points, segmentDistance, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (points.length === 0) setToolReadout(null)
  }, [points.length, setMeasurementCursor, setToolReadout])

  if (activeTool !== 'measure_path') return null

  const z = PLANE_Z
  const totalDistance = computeTotalDistance(points)

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        position={[0, 0, z]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Points */}
      {points.map((pt, i) => (
        <mesh key={i} position={[pt[0], pt[1], z + 0.01]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      ))}

      {/* Confirmed line segments */}
      {points.length >= 2 && (
        <Line
          points={points.map((pt) => [pt[0], pt[1], z + 0.01] as [number, number, number])}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Dashed preview from last point to cursor */}
      {points.length > 0 && !finished && cursorPos && (
        <Line
          points={[
            [points[points.length - 1][0], points[points.length - 1][1], z + 0.01],
            [cursorPos[0], cursorPos[1], z + 0.01],
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Cursor indicator */}
      {cursorPos && !finished && (
        <mesh position={[cursorPos[0], cursorPos[1], z + 0.01]}>
          <circleGeometry args={[0.05, 10]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#22d3ee'} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={[snapMarker[0], snapMarker[1], z + 0.01]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Snap type label */}
      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], snapMarker[1] + 0.2, z + 0.02]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}

      {/* Segment distance labels at midpoints */}
      {points.map((pt, i) => {
        if (i === 0) return null
        const prev = points[i - 1]
        const segDist = segmentDistance(prev, pt)
        return (
          <Html key={`seg-${i}`} position={[(prev[0] + pt[0]) / 2, (prev[1] + pt[1]) / 2, z + 0.02]} center>
            <div className="measurement-badge">
              <span>{formatLength(segDist, lengthUnit)}</span>
            </div>
          </Html>
        )
      })}

      {/* Total distance label at last point */}
      {points.length >= 2 && (
        <Html
          position={[
            points[points.length - 1][0],
            points[points.length - 1][1] + 0.3,
            z + 0.02,
          ]}
          center
        >
          <div className="measurement-badge" style={{ background: 'rgba(0,100,255,0.85)' }}>
            <span>Total: {formatLength(totalDistance, lengthUnit)}</span>
          </div>
        </Html>
      )}
    </>
  )
}
