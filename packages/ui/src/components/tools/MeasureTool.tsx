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

// Measure tool state: two points clicked, shows distance
export function useMeasureTool() {
  const activeTool = useUIStore((s) => s.activeTool)
  const [point1, setPoint1] = useState<[number, number, number] | null>(null)
  const [point2, setPoint2] = useState<[number, number, number] | null>(null)
  const [distance, setDistance] = useState<number | null>(null)

  const handleClick = useCallback((point: [number, number, number]) => {
    if (activeTool !== 'measure') return
    if (!point1) {
      setPoint1(point)
      setPoint2(null)
      setDistance(null)
    } else {
      setPoint2(point)
      const dx = point[0] - point1[0]
      const dy = point[1] - point1[1]
      const dz = point[2] - point1[2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      setDistance(d)
      console.log(`[BetterCAD] Measure: ${d.toFixed(3)} units`)
    }
  }, [activeTool, point1])

  const reset = useCallback(() => {
    setPoint1(null)
    setPoint2(null)
    setDistance(null)
  }, [])

  return { point1, point2, distance, handleClick, reset }
}

// Invisible plane for capturing measure tool clicks in the 3D viewport
export function MeasurePlane() {
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
  const [pt1, setPt1] = useState<[number, number, number] | null>(null)
  const [pt2, setPt2] = useState<[number, number, number] | null>(null)
  const [cursorPos, setCursorPos] = useState<[number, number, number] | null>(null)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)
  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

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

  const applySnap = useCallback((point: [number, number, number]): [number, number, number] => {
    const { point: snappedPoint, snapped } = snapPlanCandidate([point[0], point[2]], snapCandidates, enabledSnapModes, 0.3)
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return [snappedPoint[0], activeSurfaceElevation, snappedPoint[1]]
  }, [activeSurfaceElevation, enabledSnapModes, snapCandidates])

  const formatDeltas = useCallback((from: [number, number, number], to: [number, number, number]) => {
    const dx = Math.abs(to[0] - from[0])
    const dz = Math.abs(to[2] - from[2])
    const d = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2 + (to[2] - from[2]) ** 2)
    return `dX:${formatLength(dx, lengthUnit)} dY:${formatLength(dz, lengthUnit)} D:${formatLength(d, lengthUnit)}`
  }, [lengthUnit])

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure') return
    const hitPoint = e.point as THREE.Vector3
    if (!hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)

    // If a measurement is already complete, reset and start fresh
    if (pt1 && pt2) {
      setPt1(point)
      setPt2(null)
      setCursorPos(null)
      setToolReadout(`Measure start X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[2], lengthUnit)}`)
      return
    }

    if (!pt1) {
      setPt1(point)
      setPt2(null)
      setToolReadout(`Measure start X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[2], lengthUnit)}`)
    } else {
      setPt2(point)
      setToolReadout(formatDeltas(pt1, point))
    }
  }

  const handlePointerMove = (e: { point?: THREE.Vector3 }) => {
    const hitPoint = e.point as THREE.Vector3
    if (activeTool !== 'measure' || !hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)
    setCursorPos(point)
    if (pt1 && !pt2) {
      setToolReadout(formatDeltas(pt1, point))
    } else if (!pt1) {
      setToolReadout('Measure: pick first point')
    }
  }

  const handlePointerLeave = () => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (!pt1) setToolReadout(null)
  }

  if (activeTool !== 'measure') return null

  const distance = pt1 && pt2
    ? Math.sqrt((pt2[0]-pt1[0])**2 + (pt2[1]-pt1[1])**2 + (pt2[2]-pt1[2])**2)
    : null

  return (
    <>
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, activeSurfaceElevation, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Start point */}
      {pt1 && (
        <mesh position={pt1}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* End point */}
      {pt2 && (
        <mesh position={pt2}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Measurement line (confirmed) */}
      {pt1 && pt2 && (
        <Line
          points={[pt1, pt2]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Preview line (to cursor) */}
      {pt1 && !pt2 && cursorPos && (
        <Line
          points={[pt1, cursorPos]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

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

      {/* Distance label with deltas */}
      {pt1 && pt2 && distance !== null && (
        <Html position={[(pt1[0] + pt2[0]) / 2, (pt1[1] + pt2[1]) / 2 + 0.28, (pt1[2] + pt2[2]) / 2]} center>
          <div className="measurement-badge">
            <span>{formatLength(distance, lengthUnit)}</span>
            <span className="measurement-badge-deltas">
              dX:{formatLength(Math.abs(pt2[0] - pt1[0]), lengthUnit)} dY:{formatLength(Math.abs(pt2[2] - pt1[2]), lengthUnit)}
            </span>
          </div>
        </Html>
      )}
    </>
  )
}
