import { useState, useCallback, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import { useActiveDrawingSurface } from '../../hooks/useActiveDrawingSurface'
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
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const snapPoints = usePlanSnapPoints()
  const { activeSurfaceElevation } = useActiveDrawingSurface()
  const planeRef = useRef<THREE.Mesh>(null)
  const [pt1, setPt1] = useState<[number, number, number] | null>(null)
  const [pt2, setPt2] = useState<[number, number, number] | null>(null)
  const [cursorPos, setCursorPos] = useState<[number, number, number] | null>(null)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (activeTool !== 'measure') {
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((point: [number, number, number]): [number, number, number] => {
    const { point: snappedPoint, snapped } = snapPlanPoint([point[0], point[2]], snapPoints, snapEnabled, 0.3)
    setSnapMarker(snapped)
    return [snappedPoint[0], activeSurfaceElevation, snappedPoint[1]]
  }, [activeSurfaceElevation, snapEnabled, snapPoints])

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure') return
    const hitPoint = e.point as THREE.Vector3
    if (!hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)

    if (!pt1) {
      setPt1(point)
      setPt2(null)
      setToolReadout(`Measure start X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[2], lengthUnit)}`)
    } else {
      const p2: [number, number, number] = point
      setPt2(p2)
      const dx = p2[0] - pt1[0]
      const dy = p2[1] - pt1[1]
      const dz = p2[2] - pt1[2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      setToolReadout(`Distance: ${formatLength(d, lengthUnit)}`)
      console.log(`[BetterCAD] Measure: ${d.toFixed(3)} units`)
      // After showing measurement, reset for next measurement on next click
      setTimeout(() => {
        setPt1(null)
        setPt2(null)
        setCursorPos(null)
        setSnapMarker(null)
        setToolReadout(null)
      }, 3000)
    }
  }

  const handlePointerMove = (e: { point?: THREE.Vector3 }) => {
    const hitPoint = e.point as THREE.Vector3
    if (activeTool !== 'measure' || !hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)
    setCursorPos(point)
    if (pt1 && !pt2) {
      const dx = point[0] - pt1[0]
      const dy = point[1] - pt1[1]
      const dz = point[2] - pt1[2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      setToolReadout(`Measure preview: ${formatLength(d, lengthUnit)}`)
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

      {/* Distance label - rendered as a small sphere at midpoint with color indicating measurement */}
      {pt1 && pt2 && distance !== null && (
        <Html position={[(pt1[0] + pt2[0]) / 2, (pt1[1] + pt2[1]) / 2 + 0.28, (pt1[2] + pt2[2]) / 2]} center>
          <div className="measurement-badge">{formatLength(distance, lengthUnit)}</div>
        </Html>
      )}
    </>
  )
}
