import { useRef } from 'react'
import * as THREE from 'three'
import { useSketchStore } from '../../stores/sketch-store'

export function SketchPlane() {
  const { active, pendingPoint, setPendingPoint, addPoint, addLine } = useSketchStore()
  const planeRef = useRef<THREE.Mesh>(null)

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (!active) return
    const point = e.point as THREE.Vector3
    if (!point) return

    const x = point.x
    const z = point.z  // in XZ plane, Z maps to sketch Y

    if (!pendingPoint) {
      // First corner of rectangle
      setPendingPoint({ id: 'p-corner-a', x, y: z })
    } else {
      // Second corner - build rectangle
      const ax = pendingPoint.x, ay = pendingPoint.y
      const bx = x, by = z

      const p0 = `p-${Date.now()}-0`
      const p1 = `p-${Date.now()}-1`
      const p2 = `p-${Date.now()}-2`
      const p3 = `p-${Date.now()}-3`

      addPoint(p0, ax, ay)
      addPoint(p1, bx, ay)
      addPoint(p2, bx, by)
      addPoint(p3, ax, by)

      addLine(`l-${Date.now()}-0`, p0, p1)
      addLine(`l-${Date.now()}-1`, p1, p2)
      addLine(`l-${Date.now()}-2`, p2, p3)
      addLine(`l-${Date.now()}-3`, p3, p0)

      setPendingPoint(null)
    }
  }

  if (!active) return null

  return (
    <mesh
      ref={planeRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onClick={handleClick}
    >
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  )
}
