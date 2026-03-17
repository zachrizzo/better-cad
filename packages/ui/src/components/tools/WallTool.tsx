import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useWallDrawing, type SnapResult } from '../../hooks/useWallDrawing'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface WallToolProps {
  mode: ViewportMode
}

/**
 * Unified wall drawing tool.
 * Works in both 2D and 3D — all logic lives in useWallDrawing.
 */
export function WallTool({ mode }: WallToolProps) {
  const {
    isActive,
    pendingWallStart,
    previewEnd,
    cursorPoint,
    snapMarker,
    defaultWallThickness,
    elevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handleCancel,
    handlePointerLeave,
  } = useWallDrawing(mode)

  if (!isActive) return null

  const plane = interactionPlaneProps(mode, elevation)

  // Compute footprint preview (wall thickness outline)
  const previewFootprint = pendingWallStart && previewEnd
    ? (() => {
      const [sx, sz] = pendingWallStart
      const [ex, ez] = previewEnd
      const dx = ex - sx
      const dz = ez - sz
      const len = Math.hypot(dx, dz)
      if (len < 1e-6) return null
      const nx = -dz / len * (defaultWallThickness / 2)
      const nz = dx / len * (defaultWallThickness / 2)
      return [
        toWorldPosition([sx + nx, sz + nz], mode, elevation, 0.03),
        toWorldPosition([sx - nx, sz - nz], mode, elevation, 0.03),
        toWorldPosition([ex - nx, ez - nz], mode, elevation, 0.03),
        toWorldPosition([ex + nx, ez + nz], mode, elevation, 0.03),
        toWorldPosition([sx + nx, sz + nz], mode, elevation, 0.03),
      ] as [number, number, number][]
    })()
    : null

  const previewLength = pendingWallStart && previewEnd
    ? Math.hypot(previewEnd[0] - pendingWallStart[0], previewEnd[1] - pendingWallStart[1])
    : null

  const cursorColor = getCursorColor(snapMarker)

  return (
    <>
      {/* Invisible interaction plane */}
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
        <mesh position={toWorldPosition(cursorPoint, mode, elevation, 0.05)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.06, 12, 12]} />
            : <circleGeometry args={[0.07, 14]} />}
          <meshBasicMaterial color={cursorColor} />
        </mesh>
      )}

      {/* Center-line preview */}
      {pendingWallStart && previewEnd && (
        <>
          <Line
            points={[
              toWorldPosition(pendingWallStart, mode, elevation, 0.05),
              toWorldPosition(previewEnd, mode, elevation, 0.05),
            ]}
            color="#ffaa00"
            lineWidth={2}
            dashed
            dashSize={0.3}
            gapSize={0.15}
          />
          {previewLength !== null && (
            <Html
              position={toWorldPosition(
                [(pendingWallStart[0] + previewEnd[0]) / 2, (pendingWallStart[1] + previewEnd[1]) / 2],
                mode,
                elevation,
                0.2,
              )}
              center
            >
              <div className="measurement-badge">{formatLength(previewLength, lengthUnit)}</div>
            </Html>
          )}
        </>
      )}

      {/* Thickness footprint outline */}
      {previewFootprint && (
        <Line
          points={previewFootprint}
          color="#ffcc66"
          lineWidth={1}
        />
      )}

      {/* Start marker */}
      {pendingWallStart && (
        <mesh position={toWorldPosition(pendingWallStart, mode, elevation, 0.05)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.1, 16, 16]} />
            : <circleGeometry args={[0.1, 16]} />}
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {/* Snap indicators */}
      {snapMarker && snapMarker.type === 'endpoint' && (
        <mesh
          position={toWorldPosition(snapMarker.point, mode, elevation, 0.05)}
          rotation={mode === '3d' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
        >
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}
      {snapMarker && snapMarker.type === 'edge' && (
        <mesh
          position={toWorldPosition(snapMarker.point, mode, elevation, 0.05)}
          rotation={mode === '3d' ? [-Math.PI / 2, 0, Math.PI / 4] : [0, 0, Math.PI / 4]}
        >
          <ringGeometry args={[0.1, 0.14, 4]} />
          <meshBasicMaterial color="#00ccff" side={THREE.DoubleSide} />
        </mesh>
      )}
      {snapMarker && snapMarker.type === 'foundation' && (
        <mesh
          position={toWorldPosition(snapMarker.point, mode, elevation, 0.05)}
          rotation={mode === '3d' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
        >
          <ringGeometry args={[0.1, 0.14, 8]} />
          <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} />
        </mesh>
      )}
      {snapMarker && snapMarker.type === 'mesh' && (
        <mesh
          position={toWorldPosition(snapMarker.point, mode, elevation, 0.05)}
          rotation={mode === '3d' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
        >
          <ringGeometry args={[0.08, 0.12, 6]} />
          <meshBasicMaterial color="#bb86fc" side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}

function getCursorColor(snap: SnapResult | null): string {
  if (!snap) return '#ffaa00'
  switch (snap.type) {
    case 'endpoint': return '#00ff88'
    case 'foundation': return '#22c55e'
    case 'edge': return '#00ccff'
    case 'mesh': return '#bb86fc'
    default: return '#ffaa00'
  }
}
