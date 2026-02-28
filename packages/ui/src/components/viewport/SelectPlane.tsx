import { useRef } from 'react'
import * as THREE from 'three'
import { useUIStore } from '../../stores/ui-store'

// Background click plane: clicking empty space deselects the current selection
export function SelectPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const selectBody = useUIStore((s) => s.selectBody)
  const planeRef = useRef<THREE.Mesh>(null)

  const handleClick = () => {
    if (activeTool !== 'select') return
    selectBody(null)
  }

  if (activeTool !== 'select') return null

  return (
    <mesh
      ref={planeRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      onClick={handleClick}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  )
}
