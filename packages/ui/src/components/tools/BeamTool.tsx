import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useBeamDrawing, formatSupport } from '../../hooks/useBeamDrawing'
import type { BeamElement } from '../../services/kernel-bridge'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

/* ------------------------------------------------------------------ */
/*  BeamMesh — renders a placed beam in 3D                             */
/* ------------------------------------------------------------------ */
function BeamMesh({
  beam,
  elevationOffset = 0,
  visibility = 'visible',
}: {
  beam: BeamElement
  elevationOffset?: number
  visibility?: 'visible' | 'ghosted' | 'hidden'
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  if (visibility === 'hidden') return null
  const opacity = visibility === 'ghosted' ? 0.28 : 1

  const startScene = useMemo(
    () => new THREE.Vector3(beam.start[0], beam.start[2] + elevationOffset, beam.start[1]),
    [beam.start, elevationOffset],
  )
  const endScene = useMemo(
    () => new THREE.Vector3(beam.end[0], beam.end[2] + elevationOffset, beam.end[1]),
    [beam.end, elevationOffset],
  )

  const midpoint = useMemo(
    () => new THREE.Vector3().addVectors(startScene, endScene).multiplyScalar(0.5),
    [startScene, endScene],
  )

  const length = useMemo(
    () => startScene.distanceTo(endScene),
    [startScene, endScene],
  )

  const quaternion = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(endScene, startScene).normalize()
    const quat = new THREE.Quaternion()
    quat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
    return quat
  }, [startScene, endScene])

  if (length < 1e-6) return null

  return (
    <mesh
      ref={meshRef}
      position={midpoint}
      quaternion={quaternion}
    >
      <boxGeometry args={[length, beam.depth, beam.width]} />
      <meshStandardMaterial color="#57534e" transparent={opacity < 0.99} opacity={opacity} depthWrite={opacity >= 0.99} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/*  BeamTool — unified 2D / 3D                                        */
/* ------------------------------------------------------------------ */
interface BeamToolProps {
  mode: ViewportMode
}

/**
 * Unified beam drawing tool.
 * Works in both 2D and 3D — all logic lives in useBeamDrawing.
 */
export function BeamTool({ mode }: BeamToolProps) {
  const {
    isActive,
    pendingStart,
    previewEnd,
    cursorPoint,
    snapMarker,
    cursorColor,
    startColor,
    elevation,
    activeSurfaceElevation,
    activeLevelElevation,
    defaultBeamWidth,
    defaultBeamDepth,
    lengthUnit,
    planeRef,
    renderedBeams,
    previewSegment,
    previewLength,
    handlePointerMove,
    handleClick,
    handleCancel,
    handlePointerLeave,
  } = useBeamDrawing(mode)

  const plane = interactionPlaneProps(mode, activeSurfaceElevation)

  /* ---------- Placed beam meshes (3D only) ---------- */
  const beamMeshes = mode === '3d'
    ? renderedBeams.map(({ beam, elevationOffset, visibility }) => (
      <BeamMesh key={beam.meta.id} beam={beam} elevationOffset={elevationOffset} visibility={visibility} />
    ))
    : null

  if (!isActive) {
    return <>{beamMeshes}</>
  }

  /* ---------- 2D line helpers ---------- */
  const line2D = (
    startPt: [number, number],
    endPt: [number, number],
    offset: number,
  ): [number, number, number][] => [
    toWorldPosition(startPt, mode, elevation, offset),
    toWorldPosition(endPt, mode, elevation, offset),
  ]

  /* ---------- 3D line helpers ---------- */
  const previewLinePoints3D = pendingStart && previewEnd
    ? [
      [pendingStart.point[0], activeSurfaceElevation + 0.05, pendingStart.point[1]] as [number, number, number],
      [previewEnd.point[0], activeSurfaceElevation + 0.05, previewEnd.point[1]] as [number, number, number],
    ]
    : null

  const previewLinePoints2D = pendingStart && previewEnd
    ? line2D(pendingStart.point, previewEnd.point, 0.05)
    : null

  return (
    <>
      {beamMeshes}

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
            ? [cursorPoint[0], activeSurfaceElevation + 0.05, cursorPoint[1]]
            : toWorldPosition(cursorPoint, mode, elevation, 0.04)
        }>
          {mode === '3d'
            ? <sphereGeometry args={[0.06, 12, 12]} />
            : <circleGeometry args={[0.07, 14]} />}
          <meshBasicMaterial color={cursorColor} />
        </mesh>
      )}

      {/* Pending start marker */}
      {pendingStart && (
        <mesh position={
          mode === '3d'
            ? [pendingStart.point[0], activeSurfaceElevation + 0.05, pendingStart.point[1]]
            : toWorldPosition(pendingStart.point, mode, elevation, 0.05)
        }>
          {mode === '3d'
            ? <sphereGeometry args={[0.1, 16, 16]} />
            : <circleGeometry args={[0.1, 16]} />}
          <meshBasicMaterial color={startColor} />
        </mesh>
      )}

      {/* Preview dashed line */}
      {pendingStart && previewEnd && (
        <>
          <Line
            points={mode === '3d' ? previewLinePoints3D! : previewLinePoints2D!}
            color="#78716c"
            lineWidth={2}
            dashed
            dashSize={0.3}
            gapSize={0.15}
          />

          {/* 3D beam cross-section preview */}
          {mode === '3d' && previewLength !== null && previewLength > 0.01 && (() => {
            const sx = pendingStart.point[0]
            const sy = activeLevelElevation + (previewSegment?.startElevation ?? pendingStart.elevation)
            const sz = pendingStart.point[1]
            const ex = previewEnd.point[0]
            const ey = activeLevelElevation + (previewSegment?.endElevation ?? previewEnd.elevation)
            const ez = previewEnd.point[1]
            const mx = (sx + ex) / 2
            const my = (sy + ey) / 2
            const mz = (sz + ez) / 2
            const dir = new THREE.Vector3(ex - sx, ey - sy, ez - sz).normalize()
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
            return (
              <mesh
                position={[mx, my, mz]}
                quaternion={quat}
              >
                <boxGeometry args={[previewLength, defaultBeamDepth, defaultBeamWidth]} />
                <meshStandardMaterial color="#78716c" transparent opacity={0.4} />
              </mesh>
            )
          })()}

          {/* 2D beam width preview */}
          {mode === '2d' && previewLength !== null && previewLength > 0.01 && (() => {
            const dx = previewEnd.point[0] - pendingStart.point[0]
            const dz = previewEnd.point[1] - pendingStart.point[1]
            const len = Math.hypot(dx, dz)
            if (len < 1e-6) return null
            const nx = -dz / len * (defaultBeamWidth / 2)
            const nz = dx / len * (defaultBeamWidth / 2)
            const leftStart: [number, number] = [pendingStart.point[0] + nx, pendingStart.point[1] + nz]
            const leftEnd: [number, number] = [previewEnd.point[0] + nx, previewEnd.point[1] + nz]
            const rightStart: [number, number] = [pendingStart.point[0] - nx, pendingStart.point[1] - nz]
            const rightEnd: [number, number] = [previewEnd.point[0] - nx, previewEnd.point[1] - nz]
            return (
              <>
                <Line points={line2D(leftStart, leftEnd, 0.03)} color="#78716c" lineWidth={1} />
                <Line points={line2D(rightStart, rightEnd, 0.03)} color="#78716c" lineWidth={1} />
              </>
            )
          })()}

          {/* Length badge */}
          {previewLength !== null && (
            <Html
              position={
                mode === '3d'
                  ? [
                    (pendingStart.point[0] + previewEnd.point[0]) / 2,
                    activeLevelElevation + ((previewSegment?.startElevation ?? pendingStart.elevation) + (previewSegment?.endElevation ?? previewEnd.elevation)) / 2 + 0.3,
                    (pendingStart.point[1] + previewEnd.point[1]) / 2,
                  ]
                  : toWorldPosition(
                    [(pendingStart.point[0] + previewEnd.point[0]) / 2, (pendingStart.point[1] + previewEnd.point[1]) / 2],
                    mode, elevation, 0.3,
                  )
              }
              center
            >
              <div className="measurement-badge">{formatLength(previewLength, lengthUnit)}</div>
            </Html>
          )}
        </>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={toWorldPosition(snapMarker.point, mode, mode === '3d' ? activeSurfaceElevation : elevation, 0.04)}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color={cursorColor} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}

/** Backward-compatible 3D export */
export function BeamPlane() {
  return <BeamTool mode="3d" />
}

/** 2D plan view export */
export function BeamPlane2D() {
  return <BeamTool mode="2d" />
}

// Re-export for consumers that import formatSupport from this module
export { formatSupport }
