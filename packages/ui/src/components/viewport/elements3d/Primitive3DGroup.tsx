import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { PrimitiveSpec, MaterialId } from '../../../standards/element3d-specs'
import { MATERIAL_LIBRARY } from '../../../standards/element3d-materials'

interface Primitive3DGroupProps {
  specs: PrimitiveSpec[]
  position: [number, number, number]
  rotation: number
  isSelected?: boolean
  isHovered?: boolean
  levelOpacity?: number
  onClick?: (e: ThreeEvent<MouseEvent>) => void
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void
}

interface ResolvedMaterialProps {
  color: string
  metalness: number
  roughness: number
  opacity: number
  transparent: boolean
  emissive: string
  emissiveIntensity: number
  depthWrite: boolean
  side?: THREE.Side
}

/**
 * Resolves a MaterialId to meshStandardMaterial props,
 * applying selection/hover emissive overlays and level opacity.
 */
function useMaterialProps(
  materialId: MaterialId,
  isSelected: boolean,
  isHovered: boolean,
  levelOpacity: number,
): ResolvedMaterialProps {
  return useMemo(() => {
    const mat = MATERIAL_LIBRARY[materialId]
    const baseOpacity = mat.opacity ?? 1.0
    const finalOpacity = baseOpacity * levelOpacity
    const isTransparent = finalOpacity < 0.99 || (mat.transparent ?? false)

    // Match CadMesh.tsx selection emissive pattern
    let emissive: string
    let emissiveIntensity: number
    if (isSelected) {
      emissive = '#3a6aff'
      emissiveIntensity = 0.4
    } else if (isHovered) {
      emissive = '#2a4aaa'
      emissiveIntensity = 0.2
    } else {
      emissive = '#000000'
      emissiveIntensity = 0
    }

    return {
      color: mat.color,
      metalness: mat.metalness,
      roughness: mat.roughness,
      opacity: finalOpacity,
      transparent: isTransparent,
      emissive,
      emissiveIntensity,
      depthWrite: finalOpacity >= 0.99,
    }
  }, [materialId, isSelected, isHovered, levelOpacity])
}

/**
 * Internal component for a single mesh primitive.
 * Separated so each primitive can call useMaterialProps as a hook.
 */
function PrimitiveMesh({
  spec,
  isSelected,
  isHovered,
  levelOpacity,
  onClick,
  onPointerOver,
  onPointerOut,
}: {
  spec: Exclude<PrimitiveSpec, { type: 'group' }>
  isSelected: boolean
  isHovered: boolean
  levelOpacity: number
  onClick?: (e: ThreeEvent<MouseEvent>) => void
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void
}) {
  const matProps = useMaterialProps(spec.material, isSelected, isHovered, levelOpacity)
  const specRotation = 'rotation' in spec ? spec.rotation : undefined
  const rotation = specRotation
    ? ([specRotation[0], specRotation[1], specRotation[2]] as [number, number, number])
    : undefined

  switch (spec.type) {
    case 'box':
      return (
        <mesh
          position={spec.position}
          rotation={rotation}
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[spec.width, spec.height, spec.depth]} />
          <meshStandardMaterial
            color={matProps.color}
            metalness={matProps.metalness}
            roughness={matProps.roughness}
            opacity={matProps.opacity}
            transparent={matProps.transparent}
            emissive={matProps.emissive}
            emissiveIntensity={matProps.emissiveIntensity}
            depthWrite={matProps.depthWrite}
          />
        </mesh>
      )

    case 'cylinder':
      return (
        <mesh
          position={spec.position}
          rotation={rotation}
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          castShadow
          receiveShadow
        >
          <cylinderGeometry
            args={[spec.radiusTop, spec.radiusBottom, spec.height, spec.segments ?? 16]}
          />
          <meshStandardMaterial
            color={matProps.color}
            metalness={matProps.metalness}
            roughness={matProps.roughness}
            opacity={matProps.opacity}
            transparent={matProps.transparent}
            emissive={matProps.emissive}
            emissiveIntensity={matProps.emissiveIntensity}
            depthWrite={matProps.depthWrite}
          />
        </mesh>
      )

    case 'sphere':
      return (
        <mesh
          position={spec.position}
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[spec.radius, spec.segments ?? 16, spec.segments ?? 16]} />
          <meshStandardMaterial
            color={matProps.color}
            metalness={matProps.metalness}
            roughness={matProps.roughness}
            opacity={matProps.opacity}
            transparent={matProps.transparent}
            emissive={matProps.emissive}
            emissiveIntensity={matProps.emissiveIntensity}
            depthWrite={matProps.depthWrite}
          />
        </mesh>
      )

    case 'plane':
      return (
        <mesh
          position={spec.position}
          rotation={rotation}
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          receiveShadow
        >
          <planeGeometry args={[spec.width, spec.height]} />
          <meshStandardMaterial
            color={matProps.color}
            metalness={matProps.metalness}
            roughness={matProps.roughness}
            opacity={matProps.opacity}
            transparent={matProps.transparent}
            emissive={matProps.emissive}
            emissiveIntensity={matProps.emissiveIntensity}
            depthWrite={matProps.depthWrite}
            side={THREE.DoubleSide}
          />
        </mesh>
      )
  }
}

/**
 * Recursively renders an array of PrimitiveSpec[] as Three.js meshes.
 * Each primitive is positioned relative to its parent group.
 * Materials are resolved from the MATERIAL_LIBRARY with selection/hover emissive overlay.
 */
export function Primitive3DGroup({
  specs,
  position,
  rotation,
  isSelected = false,
  isHovered = false,
  levelOpacity = 1.0,
  onClick,
  onPointerOver,
  onPointerOut,
}: Primitive3DGroupProps) {
  const eulerRotation = useMemo<[number, number, number]>(
    () => [0, rotation, 0],
    [rotation],
  )

  function renderPrimitive(spec: PrimitiveSpec, index: number): React.JSX.Element {
    if (spec.type === 'group') {
      const groupRotation = spec.rotation
        ? ([spec.rotation[0], spec.rotation[1], spec.rotation[2]] as [number, number, number])
        : undefined
      return (
        <group
          key={index}
          position={spec.position}
          rotation={groupRotation}
        >
          {spec.children.map((child, childIdx) => renderPrimitive(child, childIdx))}
        </group>
      )
    }

    return (
      <PrimitiveMesh
        key={index}
        spec={spec}
        isSelected={isSelected}
        isHovered={isHovered}
        levelOpacity={levelOpacity}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      />
    )
  }

  return (
    <group position={position} rotation={eulerRotation}>
      {specs.map((spec, idx) => renderPrimitive(spec, idx))}
    </group>
  )
}
