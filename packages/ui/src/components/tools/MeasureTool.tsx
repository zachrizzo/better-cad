import { useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'

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
  const planeRef = useRef<THREE.Mesh>(null)
  const [pt1, setPt1] = useState<[number, number, number] | null>(null)
  const [pt2, setPt2] = useState<[number, number, number] | null>(null)
  const [cursorPos, setCursorPos] = useState<[number, number, number] | null>(null)

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure') return
    const point = e.point as THREE.Vector3
    if (!point) return

    if (!pt1) {
      setPt1([point.x, point.y, point.z])
      setPt2(null)
    } else {
      const p2: [number, number, number] = [point.x, point.y, point.z]
      setPt2(p2)
      const dx = p2[0] - pt1[0]
      const dy = p2[1] - pt1[1]
      const dz = p2[2] - pt1[2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      console.log(`[BetterCAD] Measure: ${d.toFixed(3)} units`)
      // After showing measurement, reset for next measurement on next click
      setTimeout(() => {
        setPt1(null)
        setPt2(null)
        setCursorPos(null)
      }, 3000)
    }
  }

  const handlePointerMove = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure' || !pt1 || pt2) return
    const point = e.point as THREE.Vector3
    if (!point) return
    setCursorPos([point.x, point.y, point.z])
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
        position={[0, 0, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
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

      {/* Distance label - rendered as a small sphere at midpoint with color indicating measurement */}
      {pt1 && pt2 && distance !== null && (
        <mesh position={[(pt1[0]+pt2[0])/2, (pt1[1]+pt2[1])/2 + 0.3, (pt1[2]+pt2[2])/2]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </>
  )
}
