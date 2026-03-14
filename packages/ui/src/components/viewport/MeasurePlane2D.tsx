import { useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates } from '../../hooks/usePlanSnapPoints'
import { getEnabledMeasurementSnapModes } from '../../utils/measurement-snap-settings'
import { formatLength } from '../../utils/units'
import { useLevelStore } from '../../stores/level-store'

type Point2 = [number, number]

const SNAP_THRESHOLD = 0.3
const PLANE_Z = 0.1

/**
 * 2D measure tool — rendered inside the Viewport2D Canvas.
 * Two-click workflow: first click sets start point, second click measures distance.
 * Coordinates are in plan space (X right, Y up in the 2D orthographic view).
 */
export function MeasurePlane2D() {
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

  const [pt1, setPt1] = useState<Point2 | null>(null)
  const [pt2, setPt2] = useState<Point2 | null>(null)
  const [cursorPos, setCursorPos] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  useEffect(() => {
    if (activeTool !== 'measure') {
      setPt1(null)
      setPt2(null)
      setCursorPos(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((raw: Point2): Point2 => {
    const { point, snapped } = snapPlanCandidate(raw, snapCandidates, enabledSnapModes, SNAP_THRESHOLD)
    setSnapMarker(snapped?.point ?? null)
    return point
  }, [enabledSnapModes, snapCandidates])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure') return
    // In the 2D orthographic canvas: e.point.x = plan X, e.point.y = plan Y (kernel Y)
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)

    if (!pt1) {
      setPt1(point)
      setPt2(null)
      setToolReadout(`Measure start X:${formatLength(point[0], lengthUnit)} Y:${formatLength(point[1], lengthUnit)}`)
    } else {
      setPt2(point)
      const d = Math.hypot(point[0] - pt1[0], point[1] - pt1[1])
      setToolReadout(`Distance: ${formatLength(d, lengthUnit)}`)
      setTimeout(() => {
        setPt1(null)
        setPt2(null)
        setCursorPos(null)
        setSnapMarker(null)
        setToolReadout(null)
      }, 3000)
    }
  }, [activeTool, applySnap, lengthUnit, pt1, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'measure') return
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)
    setCursorPos(point)
    // Store cursor in 3D world format: [x, elevation, y]
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    if (pt1 && !pt2) {
      const d = Math.hypot(point[0] - pt1[0], point[1] - pt1[1])
      setToolReadout(`Measure preview: ${formatLength(d, lengthUnit)}`)
    } else if (!pt1) {
      setToolReadout('Measure: pick first point')
    }
  }, [activeLevelElevation, activeTool, applySnap, lengthUnit, pt1, pt2, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (!pt1) setToolReadout(null)
  }, [pt1, setMeasurementCursor, setToolReadout])

  if (activeTool !== 'measure') return null

  const distance = pt1 && pt2 ? Math.hypot(pt2[0] - pt1[0], pt2[1] - pt1[1]) : null
  const z = PLANE_Z

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

      {/* Start point */}
      {pt1 && (
        <mesh position={[pt1[0], pt1[1], z + 0.01]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* End point */}
      {pt2 && (
        <mesh position={[pt2[0], pt2[1], z + 0.01]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Confirmed measurement line */}
      {pt1 && pt2 && (
        <Line
          points={[[pt1[0], pt1[1], z + 0.01], [pt2[0], pt2[1], z + 0.01]]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Preview line (to cursor) */}
      {pt1 && !pt2 && cursorPos && (
        <Line
          points={[[pt1[0], pt1[1], z + 0.01], [cursorPos[0], cursorPos[1], z + 0.01]]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Cursor indicator */}
      {cursorPos && (
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

      {/* Distance label */}
      {pt1 && pt2 && distance !== null && (
        <Html position={[(pt1[0] + pt2[0]) / 2, (pt1[1] + pt2[1]) / 2, z + 0.02]} center>
          <div className="measurement-badge">{formatLength(distance, lengthUnit)}</div>
        </Html>
      )}
    </>
  )
}
