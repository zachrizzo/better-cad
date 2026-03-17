import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useSectionDrawing } from '../../hooks/useSectionDrawing'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface SectionToolProps {
  mode: ViewportMode
}

/**
 * Unified section cut-line tool.
 * Works in both 2D and 3D -- all logic lives in useSectionDrawing.
 */
function SectionToolInner({ mode }: SectionToolProps) {
  const {
    isActive,
    firstPoint,
    cursorPoint,
    previewLine,
    elevation,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  } = useSectionDrawing(mode)

  if (!isActive) return null

  const plane = interactionPlaneProps(mode, elevation)
  const markerOffset = 0.06

  return (
    <>
      {/* Invisible ground plane for raycasting */}
      <mesh
        ref={planeRef}
        rotation={plane.rotation}
        position={plane.position}
        visible={false}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* First point marker */}
      {firstPoint && (
        <mesh position={toWorldPosition(firstPoint, mode, elevation, markerOffset)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      )}

      {/* Preview cut line */}
      {previewLine && (
        <Line
          points={[previewLine.start, previewLine.end]}
          color="#f59e0b"
          lineWidth={2}
          dashed
          dashSize={0.3}
          gapSize={0.15}
        />
      )}

      {/* Direction arrow (perpendicular to line, shows viewing direction) */}
      {previewLine && firstPoint && cursorPoint && (() => {
        const dx = cursorPoint[0] - firstPoint[0]
        const dz = cursorPoint[1] - firstPoint[1]
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.01) return null
        const nx = -dz / len
        const nz = dx / len
        const midX = (firstPoint[0] + cursorPoint[0]) / 2
        const midZ = (firstPoint[1] + cursorPoint[1]) / 2
        const arrowLen = Math.min(len * 0.3, 1.5)
        const arrowStart = toWorldPosition([midX, midZ], mode, elevation, markerOffset)
        const arrowEnd = toWorldPosition([midX + nx * arrowLen, midZ + nz * arrowLen], mode, elevation, markerOffset)
        return (
          <Line
            points={[arrowStart, arrowEnd]}
            color="#f59e0b"
            lineWidth={3}
          />
        )
      })()}
    </>
  )
}

/**
 * SectionPlane - 3D viewport section tool (drop-in replacement for the old SectionPlane).
 */
export function SectionPlane() {
  return <SectionToolInner mode="3d" />
}

/**
 * SectionPlane2D - 2D viewport section tool.
 */
export function SectionPlane2D() {
  return <SectionToolInner mode="2d" />
}
