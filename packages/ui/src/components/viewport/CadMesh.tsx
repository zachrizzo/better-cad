import { useMemo } from 'react'
import * as THREE from 'three'

interface CadMeshProps {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  color?: string
  metalness?: number
  roughness?: number
}

export function CadMesh({ positions, normals, indices, color = '#cccccc', metalness = 0.1, roughness = 0.7 }: CadMeshProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    return geo
  }, [positions, normals, indices])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}
