import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useSlabDrawing } from '../../hooks/useSlabDrawing'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
  rectOutlinePoints,
  previewPlaneRotation,
} from '../../utils/viewport-helpers'

interface SlabToolProps {
  mode: ViewportMode
}

/**
 * Unified floor / foundation / parking tool.
 * Works in both 2D and 3D — all logic lives in useSlabDrawing.
 */
export function SlabTool({ mode }: SlabToolProps) {
  const {
    isActive,
    previewData,
    cursorPoint,
    snapMarker,
    toolColor,
    cursorColor,
    elevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handleCancel,
    handlePointerLeave,
  } = useSlabDrawing(mode)

  if (!isActive) return null

  const plane = interactionPlaneProps(mode, elevation)
  const previewRotation = previewPlaneRotation(mode)

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
        <mesh position={toWorldPosition(cursorPoint, mode, elevation, 0.04)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.05, 12, 12]} />
            : <circleGeometry args={[0.06, 14]} />}
          <meshBasicMaterial color={cursorColor} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={toWorldPosition(snapMarker, mode, elevation, 0.04)}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Preview rectangle */}
      {previewData && (
        <>
          {/* Fill */}
          <mesh
            position={toWorldPosition(previewData.center, mode, elevation, 0.01)}
            rotation={previewRotation}
          >
            <planeGeometry args={[previewData.width, previewData.depth]} />
            <meshBasicMaterial color={toolColor} transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>

          {/* Outline */}
          <Line
            points={rectOutlinePoints(
              previewData.minX, previewData.maxX,
              previewData.minZ, previewData.maxZ,
              mode, elevation, 0.02,
            )}
            color={toolColor}
            lineWidth={2}
          />

          {/* Dimension badge */}
          <Html position={toWorldPosition(previewData.center, mode, elevation, 0.3)} center>
            <div className="measurement-badge">
              {formatLength(previewData.width, lengthUnit)} x {formatLength(previewData.depth, lengthUnit)}
            </div>
          </Html>
        </>
      )}
    </>
  )
}
