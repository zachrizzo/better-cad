import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useRoofDrawing, normalizeRoofType } from '../../hooks/useRoofDrawing'
import type { RoofElement } from '../../services/kernel-bridge'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
  previewPlaneRotation,
  PLANE_2D_Z,
} from '../../utils/viewport-helpers'

type Point2 = [number, number]
type RoofType = RoofElement['roof_type']

const MAX_ROOF_PITCH_DEGREES = 75

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeAngleDegrees(angle: number): number {
  let normalized = angle % 360
  if (normalized < 0) normalized += 360
  return normalized
}

function subdivideTopTriangles(geometry: THREE.BufferGeometry, topZ: number): void {
  const posAttr = geometry.getAttribute('position')
  if (!(posAttr instanceof THREE.BufferAttribute) || posAttr.itemSize !== 3) return

  const source = posAttr.array as Float32Array
  if (source.length < 9) return

  const topEps = Math.max(Math.abs(topZ), 1) * 1e-4
  const out: number[] = []

  for (let i = 0; i + 8 < source.length; i += 9) {
    const x0 = source[i]
    const y0 = source[i + 1]
    const z0 = source[i + 2]
    const x1 = source[i + 3]
    const y1 = source[i + 4]
    const z1 = source[i + 5]
    const x2 = source[i + 6]
    const y2 = source[i + 7]
    const z2 = source[i + 8]

    const isTop = Math.abs(z0 - topZ) <= topEps && Math.abs(z1 - topZ) <= topEps && Math.abs(z2 - topZ) <= topEps
    if (!isTop) {
      out.push(x0, y0, z0, x1, y1, z1, x2, y2, z2)
      continue
    }

    const cx = (x0 + x1 + x2) / 3
    const cy = (y0 + y1 + y2) / 3
    const cz = topZ

    out.push(
      x0, y0, z0, x1, y1, z1, cx, cy, cz,
      x1, y1, z1, x2, y2, z2, cx, cy, cz,
      x2, y2, z2, x0, y0, z0, cx, cy, cz,
    )
  }

  if (out.length !== source.length) {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3))
    if (geometry.getAttribute('normal')) geometry.deleteAttribute('normal')
  }
}

/* ------------------------------------------------------------------ */
/*  RoofMesh — renders a placed roof in 3D                             */
/* ------------------------------------------------------------------ */
function RoofMesh({ boundary, thickness, elevation, roofType, pitchDegrees, ridgeAngleDegrees, color, opacity = 0.85 }: {
  boundary: Point2[]
  thickness: number
  elevation: number
  roofType: RoofType
  pitchDegrees: number
  ridgeAngleDegrees: number
  color: string
  opacity?: number
}) {
  const geometry = useMemo(() => {
    if (boundary.length < 3) return null

    const localBoundary: Point2[] = boundary.map(([x, z]) => [x, -z])

    const shape = new THREE.Shape()
    shape.moveTo(localBoundary[0][0], localBoundary[0][1])
    for (let i = 1; i < localBoundary.length; i++) {
      shape.lineTo(localBoundary[i][0], localBoundary[i][1])
    }
    shape.closePath()

    const extrudeSettings = { depth: thickness, bevelEnabled: false, steps: 1 }
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings).toNonIndexed()

    const normalizedRoofType = normalizeRoofType(roofType)
    const normalizedPitch = clamp(pitchDegrees, 0, MAX_ROOF_PITCH_DEGREES)
    if (normalizedRoofType === 'flat' || normalizedPitch <= 0.001) {
      geom.computeVertexNormals()
      return geom
    }

    subdivideTopTriangles(geom, thickness)

    const ridgeWorldAngle = THREE.MathUtils.degToRad(normalizeAngleDegrees(ridgeAngleDegrees))
    const ridgeWorldX = Math.cos(ridgeWorldAngle)
    const ridgeWorldZ = Math.sin(ridgeWorldAngle)
    const ridgeDirX = ridgeWorldX
    const ridgeDirY = -ridgeWorldZ
    const slopeDirX = -ridgeDirY
    const slopeDirY = ridgeDirX

    let minAlong = Number.POSITIVE_INFINITY
    let maxAlong = Number.NEGATIVE_INFINITY
    let minPerp = Number.POSITIVE_INFINITY
    let maxPerp = Number.NEGATIVE_INFINITY

    for (const [x, y] of localBoundary) {
      const along = x * slopeDirX + y * slopeDirY
      const perp = x * ridgeDirX + y * ridgeDirY
      minAlong = Math.min(minAlong, along)
      maxAlong = Math.max(maxAlong, along)
      minPerp = Math.min(minPerp, perp)
      maxPerp = Math.max(maxPerp, perp)
    }

    const alongSpan = Math.max(0, maxAlong - minAlong)
    const perpSpan = Math.max(0, maxPerp - minPerp)
    if (alongSpan < 1e-6) {
      geom.computeVertexNormals()
      return geom
    }

    const tanPitch = Math.tan(THREE.MathUtils.degToRad(normalizedPitch))
    const linearRise = tanPitch * alongSpan
    const hipRise = tanPitch * Math.max(1e-6, Math.min(alongSpan, perpSpan))
    const thicknessSafe = Math.max(1e-6, thickness)

    const pos = geom.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const along = x * slopeDirX + y * slopeDirY
      const t = alongSpan > 1e-6 ? clamp((along - minAlong) / alongSpan, 0, 1) : 0.5

      let displacement = 0
      if (normalizedRoofType === 'shed') {
        displacement = t * linearRise
      } else if (normalizedRoofType === 'gable') {
        displacement = (1 - Math.abs(2 * t - 1)) * linearRise
      } else if (normalizedRoofType === 'hip') {
        const perp = x * ridgeDirX + y * ridgeDirY
        const u = perpSpan > 1e-6 ? clamp((perp - minPerp) / perpSpan, 0, 1) : 0.5
        const edgeFactor = clamp(Math.min(t, 1 - t, u, 1 - u) / 0.5, 0, 1)
        displacement = edgeFactor * hipRise
      }

      const topFactor = clamp(z / thicknessSafe, 0, 1)
      pos.setZ(i, z + displacement * topFactor)
    }

    pos.needsUpdate = true
    geom.computeVertexNormals()
    return geom
  }, [boundary, thickness, roofType, pitchDegrees, ridgeAngleDegrees])

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={opacity >= 0.99} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/*  RoofTool — unified 2D / 3D                                        */
/* ------------------------------------------------------------------ */
interface RoofToolProps {
  mode: ViewportMode
}

/**
 * Unified roof drawing tool.
 * Works in both 2D and 3D — all logic lives in useRoofDrawing.
 */
export function RoofTool({ mode }: RoofToolProps) {
  const {
    isActive,
    cursorPoint,
    snapMarker,
    previewData,
    cursorColor,
    toolColor,
    elevation,
    roofDrawElevation,
    lengthUnit,
    planeRef,
    placedRoofVisuals,
    handlePointerMove,
    handleClick,
    handleCancel,
    handlePointerLeave,
  } = useRoofDrawing(mode)

  const planeElevation = mode === '3d' ? roofDrawElevation : elevation
  const plane = interactionPlaneProps(mode, planeElevation)
  const _previewRotation = previewPlaneRotation(mode)

  /* ---------- Placed roof meshes (3D only) ---------- */
  const roofMeshes = mode === '3d'
    ? placedRoofVisuals.map(({ roof, elevation: roofElev, roofType, pitchDegrees, ridgeAngleDegrees, opacity }) => (
      <RoofMesh
        key={roof.meta.id}
        boundary={roof.boundary}
        thickness={roof.thickness}
        elevation={roofElev}
        roofType={roofType}
        pitchDegrees={pitchDegrees}
        ridgeAngleDegrees={ridgeAngleDegrees}
        color="#92400e"
        opacity={opacity}
      />
    ))
    : null

  if (!isActive) {
    return <>{roofMeshes}</>
  }

  /**
   * Map a preview loop polyline (plan-local [x, offsetY, z]) to world space.
   * In 3D: [x, roofDrawElevation + offsetY, z]
   * In 2D: [x, z, PLANE_2D_Z + offsetY]
   */
  const offsetLoop = (loop: [number, number, number][]): [number, number, number][] =>
    mode === '3d'
      ? loop.map(([x, y, z]) => [x, roofDrawElevation + y, z])
      : loop.map(([x, y, z]) => [x, z, PLANE_2D_Z + y])

  return (
    <>
      {roofMeshes}

      {/* Interaction plane */}
      <mesh
        ref={planeRef}
        position={plane.position}
        rotation={plane.rotation}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Cursor */}
      {cursorPoint && (
        <mesh position={
          mode === '3d'
            ? [cursorPoint[0], roofDrawElevation + 0.04, cursorPoint[1]]
            : toWorldPosition(cursorPoint, mode, elevation, 0.04)
        }>
          {mode === '3d'
            ? <sphereGeometry args={[0.05, 12, 12]} />
            : <circleGeometry args={[0.06, 14]} />}
          <meshBasicMaterial color={cursorColor} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={
          mode === '3d'
            ? [snapMarker[0], roofDrawElevation + 0.04, snapMarker[1]]
            : toWorldPosition(snapMarker, mode, elevation, 0.04)
        }>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Preview rectangle */}
      {previewData && (
        <>
          {/* Fill */}
          <mesh
            position={
              mode === '3d'
                ? [previewData.center[0], roofDrawElevation + 0.01, previewData.center[1]]
                : toWorldPosition(previewData.center, mode, elevation, 0.01)
            }
            rotation={_previewRotation}
          >
            <planeGeometry args={[previewData.width, previewData.depth]} />
            <meshBasicMaterial color={toolColor} transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>

          {/* Outline */}
          <Line
            points={offsetLoop(previewData.loop)}
            color={toolColor}
            lineWidth={2}
          />

          {/* Dimension badge */}
          <Html
            position={
              mode === '3d'
                ? [previewData.center[0], roofDrawElevation + 0.3, previewData.center[1]]
                : toWorldPosition(previewData.center, mode, elevation, 0.3)
            }
            center
          >
            <div className="measurement-badge">
              {formatLength(previewData.width, lengthUnit)} x {formatLength(previewData.depth, lengthUnit)}
            </div>
          </Html>
        </>
      )}
    </>
  )
}

/** Backward-compatible 3D export */
export function RoofPlane() {
  return <RoofTool mode="3d" />
}

/** 2D plan view export */
export function RoofPlane2D() {
  return <RoofTool mode="2d" />
}
