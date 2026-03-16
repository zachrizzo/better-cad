import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from '../../hooks/usePlanSnapPoints'
import { useActiveDrawingSurface } from '../../hooks/useActiveDrawingSurface'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength } from '../../utils/units'

/**
 * 3D cumulative path measurement tool.
 * Multi-click workflow: each click adds a point. Right-click or double-click finishes the path.
 * Shows segment distances at midpoints and cumulative total at the last point.
 */
export function PathMeasurePlane() {
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

  const [points, setPoints] = useState<[number, number, number][]>([])
  const [cursorPos, setCursorPos] = useState<[number, number, number] | null>(null)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)
  const [finished, setFinished] = useState(false)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  // Clean up when tool deactivates
  useEffect(() => {
    if (activeTool !== 'measure_path') {
      setSnapMarker(null)
      setSnappedCandidate(null)
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

  const applySnap = useCallback((point: [number, number, number]): [number, number, number] => {
    const { point: snappedPoint, snapped } = snapPlanCandidate([point[0], point[2]], snapCandidates, enabledSnapModes, 0.3)
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return [snappedPoint[0], activeSurfaceElevation, snappedPoint[1]]
  }, [activeSurfaceElevation, enabledSnapModes, snapCandidates])

  const computeSegmentDistance = useCallback((a: [number, number, number], b: [number, number, number]) => {
    return Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2)
  }, [])

  const computeTotalDistance = useCallback((pts: [number, number, number][]) => {
    let total = 0
    for (let i = 1; i < pts.length; i++) {
      total += Math.sqrt(
        (pts[i][0] - pts[i - 1][0]) ** 2 +
        (pts[i][1] - pts[i - 1][1]) ** 2 +
        (pts[i][2] - pts[i - 1][2]) ** 2,
      )
    }
    return total
  }, [])

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure_path') return
    const hitPoint = e.point as THREE.Vector3
    if (!hitPoint) return

    // If path is finished, start a new one
    if (finished) {
      setPoints([])
      setFinished(false)
    }

    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)

    setPoints((prev) => {
      const next = [...prev, point]
      const total = computeTotalDistance(next)
      if (next.length >= 2) {
        const segDist = computeSegmentDistance(next[next.length - 2], point)
        setToolReadout(`Segment: ${formatLength(segDist, lengthUnit)} | Total: ${formatLength(total, lengthUnit)}`)
      } else {
        setToolReadout(`Path start X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[2], lengthUnit)}`)
      }
      return next
    })
  }

  const handleDoubleClick = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure_path' || points.length < 2) return
    e.point // just to consume the event
    setFinished(true)
    const total = computeTotalDistance(points)
    setToolReadout(`Path total: ${formatLength(total, lengthUnit)} (${points.length} points)`)
  }

  const handleContextMenu = (e: { stopPropagation?: () => void; nativeEvent?: { preventDefault?: () => void } }) => {
    if (activeTool !== 'measure_path') return
    e.stopPropagation?.()
    e.nativeEvent?.preventDefault?.()
    if (points.length >= 2) {
      setFinished(true)
      const total = computeTotalDistance(points)
      setToolReadout(`Path total: ${formatLength(total, lengthUnit)} (${points.length} points)`)
    }
  }

  const handlePointerMove = (e: { point?: THREE.Vector3 }) => {
    const hitPoint = e.point as THREE.Vector3
    if (activeTool !== 'measure_path' || !hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)
    setCursorPos(point)
    if (points.length > 0 && !finished) {
      const lastPt = points[points.length - 1]
      const segDist = computeSegmentDistance(lastPt, point)
      const total = computeTotalDistance(points) + segDist
      setToolReadout(`Segment: ${formatLength(segDist, lengthUnit)} | Total: ${formatLength(total, lengthUnit)}`)
    } else if (points.length === 0) {
      setToolReadout('Path measure: pick first point')
    }
  }

  const handlePointerLeave = () => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (points.length === 0) setToolReadout(null)
  }

  if (activeTool !== 'measure_path') return null

  const totalDistance = computeTotalDistance(points)

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, activeSurfaceElevation, 0]}
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
        <mesh key={i} position={pt}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      ))}

      {/* Confirmed line segments */}
      {points.length >= 2 && (
        <Line
          points={points}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Dashed preview from last point to cursor */}
      {points.length > 0 && !finished && cursorPos && (
        <Line
          points={[points[points.length - 1], cursorPos]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Cursor indicator */}
      {cursorPos && !finished && (
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

      {/* Segment distance labels at midpoints */}
      {points.map((pt, i) => {
        if (i === 0) return null
        const prev = points[i - 1]
        const segDist = computeSegmentDistance(prev, pt)
        const mid: [number, number, number] = [
          (prev[0] + pt[0]) / 2,
          (prev[1] + pt[1]) / 2 + 0.28,
          (prev[2] + pt[2]) / 2,
        ]
        return (
          <Html key={`seg-${i}`} position={mid} center>
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
            points[points.length - 1][1] + 0.5,
            points[points.length - 1][2],
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
