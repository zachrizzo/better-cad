import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useMaterialStore } from '../../stores/material-store'

type MeshPointerEvent = ThreeEvent<PointerEvent>

interface CadMeshProps {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  color?: string
  metalness?: number
  roughness?: number
  materialId?: string
  isSelected?: boolean
  isHovered?: boolean
  levelOpacity?: number
  elevationOffset?: number
  onClick?: (e: MeshPointerEvent) => void
  onPointerOver?: (e: MeshPointerEvent) => void
  onPointerOut?: (e: MeshPointerEvent) => void
}

export function CadMesh({
  positions,
  normals,
  indices,
  color = '#cccccc',
  metalness = 0.1,
  roughness = 0.7,
  materialId,
  isSelected = false,
  isHovered = false,
  levelOpacity = 1.0,
  elevationOffset = 0,
  onClick,
  onPointerOver,
  onPointerOut,
}: CadMeshProps) {
  const material = useMaterialStore((s) => materialId ? s.materials.get(materialId) : undefined)

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    return geo
  }, [positions, normals, indices])

  const emissiveColor = isSelected ? '#3a6aff' : isHovered ? '#2a4aaa' : '#000000'
  const emissiveIntensity = isSelected ? 0.4 : isHovered ? 0.2 : 0

  const yOffset = elevationOffset !== 0 ? [0, elevationOffset, 0] as const : undefined
  const hasLevelTransparency = levelOpacity < 0.99

  if (material) {
    const [r, g, b] = material.base_color
    const matColor = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
    const baseOpacity = material.base_color[3]
    const finalOpacity = baseOpacity * levelOpacity
    const isTransparent = finalOpacity < 0.99

    return (
      <mesh
        geometry={geometry}
        position={yOffset}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <meshStandardMaterial
          color={matColor}
          metalness={material.metallic}
          roughness={material.roughness}
          transparent={isTransparent}
          opacity={finalOpacity}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          depthWrite={!hasLevelTransparency}
        />
      </mesh>
    )
  }

  return (
    <mesh
      geometry={geometry}
      position={yOffset}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        transparent={hasLevelTransparency}
        opacity={levelOpacity}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
        depthWrite={!hasLevelTransparency}
      />
    </mesh>
  )
}
