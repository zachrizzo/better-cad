import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useStairDrawing, normalizeSpiralTurns } from '../../hooks/useStairDrawing'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
  PLANE_2D_Z,
} from '../../utils/viewport-helpers'

type Polyline3 = [number, number, number][]

interface StairToolProps {
  mode: ViewportMode
}

/**
 * Unified stair drawing tool.
 * Works in both 2D and 3D — all logic lives in useStairDrawing.
 */
export function StairTool({ mode }: StairToolProps) {
  const {
    isActive,
    startPoint,
    cursorPoint,
    snapMarker,
    preview,
    cursorColor,
    elevation,
    activeSurfaceElevation,
    defaultStairRisers,
    defaultSpiralTurns,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handleCancel,
    handlePointerLeave,
  } = useStairDrawing(mode)

  if (!isActive) return null

  const plane = interactionPlaneProps(mode, activeSurfaceElevation)
  const planeY = activeSurfaceElevation

  /**
   * Map a preview polyline (plan-local [x, offsetY, z]) to world space.
   * In 3D: [x, planeY + offsetY, z]
   * In 2D: [x, z, PLANE_2D_Z + offsetY]
   */
  const offsetLine = (line: Polyline3): Polyline3 =>
    mode === '3d'
      ? line.map(([x, y, z]) => [x, planeY + y, z])
      : line.map(([x, y, z]) => [x, z, PLANE_2D_Z + y])

  /**
   * Map a plan-space point to a world position for placing markers.
   */
  const markerPos = (pt: [number, number], offset: number): [number, number, number] =>
    mode === '3d'
      ? [pt[0], planeY + offset, pt[1]]
      : toWorldPosition(pt, mode, elevation, offset)

  return (
    <>
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
        <mesh position={markerPos(cursorPoint, 0.04)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.05, 12, 12]} />
            : <circleGeometry args={[0.06, 14]} />}
          <meshBasicMaterial color={cursorColor} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={markerPos(snapMarker, 0.04)}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Start point marker */}
      {startPoint && (
        <mesh position={markerPos(startPoint, 0.05)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 14, 14]} />
            : <circleGeometry args={[0.09, 14]} />}
          <meshBasicMaterial color="#0ea5e9" />
        </mesh>
      )}

      {/* Straight stair preview */}
      {preview?.mode === 'straight' && (
        <>
          <Line
            points={offsetLine(preview.centerLine)}
            color="#0ea5e9"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.12}
          />
          <Line points={offsetLine(preview.leftLine)} color="#38bdf8" lineWidth={1.6} />
          <Line points={offsetLine(preview.rightLine)} color="#38bdf8" lineWidth={1.6} />
          {preview.riserLines.map((line, idx) => (
            <Line key={idx} points={offsetLine(line)} color="#7dd3fc" lineWidth={1} />
          ))}
          <Html position={markerPos(preview.center, 0.35)} center>
            <div className="measurement-badge">
              {formatLength(preview.run, lengthUnit)} &bull; {defaultStairRisers} risers
            </div>
          </Html>
        </>
      )}

      {/* Spiral stair preview */}
      {preview?.mode === 'spiral' && (
        <>
          <Line
            points={offsetLine(preview.radiusLine)}
            color="#0ea5e9"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.12}
          />
          <Line points={offsetLine(preview.outerLine)} color="#38bdf8" lineWidth={1.6} />
          <Line points={offsetLine(preview.innerLine)} color="#38bdf8" lineWidth={1.6} />
          <Line points={offsetLine(preview.startBoundary)} color="#38bdf8" lineWidth={1.4} />
          <Line points={offsetLine(preview.endBoundary)} color="#38bdf8" lineWidth={1.4} />
          {preview.riserLines.map((line, idx) => (
            <Line key={idx} points={offsetLine(line)} color="#7dd3fc" lineWidth={1} />
          ))}
          <Html position={markerPos(preview.label, 0.35)} center>
            <div className="measurement-badge">
              {formatLength(preview.run, lengthUnit)} &bull; {defaultStairRisers} risers &bull; {normalizeSpiralTurns(defaultSpiralTurns).toFixed(2)} turns
            </div>
          </Html>
        </>
      )}
    </>
  )
}

/** Backward-compatible 3D export */
export function StairPlane() {
  return <StairTool mode="3d" />
}

/** 2D plan view export */
export function StairPlane2D() {
  return <StairTool mode="2d" />
}
