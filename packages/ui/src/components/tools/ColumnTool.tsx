import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useColumnDrawing } from '../../hooks/useColumnDrawing'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
  previewPlaneRotation,
} from '../../utils/viewport-helpers'

interface ColumnToolProps {
  mode: ViewportMode
}

/**
 * Unified column placement tool.
 * Works in both 2D and 3D — all logic lives in useColumnDrawing.
 */
export function ColumnTool({ mode }: ColumnToolProps) {
  const {
    isActive,
    preview,
    snapMarker,
    cursorColor,
    elevation,
    activeSurfaceElevation,
    defaultColumnWidth,
    defaultColumnDepth,
    defaultColumnHeight,
    lengthUnit,
    planeRef,
    columns,
    levelDataById,
    surfaceOffsetByLevel,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  } = useColumnDrawing(mode)

  const plane = interactionPlaneProps(mode, activeSurfaceElevation)
  const _previewRotation = previewPlaneRotation(mode)

  return (
    <>
      {/* Always render placed columns in 3D; in 2D the plan renderer handles them */}
      {mode === '3d' && columns.map((col) => {
        const levelData = col.meta.level_id ? levelDataById.get(col.meta.level_id) : undefined
        const slabOffset = col.meta.level_id ? (surfaceOffsetByLevel.get(col.meta.level_id) ?? 0) : 0
        const colElevation = (levelData?.elevation ?? 0) + slabOffset
        const visibility = levelData?.visibility ?? 'visible'
        if (visibility === 'hidden') return null
        const opacity = visibility === 'ghosted' ? 0.28 : 1
        return (
          <mesh
            key={col.meta.id}
            position={[col.center[0], colElevation + col.height / 2, col.center[1]]}
          >
            <boxGeometry args={[col.width, col.height, col.depth]} />
            <meshStandardMaterial color="#6b7280" transparent={opacity < 0.99} opacity={opacity} depthWrite={opacity >= 0.99} />
          </mesh>
        )
      })}

      {isActive && (
        <>
          {/* Invisible interaction plane */}
          <mesh
            ref={planeRef}
            position={plane.position}
            rotation={plane.rotation}
            onClick={handleClick}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <planeGeometry args={[200, 200]} />
            <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
          </mesh>

          {/* Preview */}
          {preview && (
            <>
              {/* 3D box preview */}
              {mode === '3d' && (
                <mesh position={[preview[0], activeSurfaceElevation + defaultColumnHeight / 2, preview[1]]}>
                  <boxGeometry args={[defaultColumnWidth, defaultColumnHeight, defaultColumnDepth]} />
                  <meshStandardMaterial color="#9ca3af" opacity={0.45} transparent />
                </mesh>
              )}

              {/* 2D rectangle footprint preview */}
              {mode === '2d' && (
                <mesh
                  position={toWorldPosition(preview, mode, elevation, 0.01)}
                  rotation={_previewRotation}
                >
                  <planeGeometry args={[defaultColumnWidth, defaultColumnDepth]} />
                  <meshBasicMaterial color="#9ca3af" transparent opacity={0.35} side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* Cursor dot */}
              <mesh position={
                mode === '3d'
                  ? [preview[0], activeSurfaceElevation + 0.05, preview[1]]
                  : toWorldPosition(preview, mode, elevation, 0.04)
              }>
                {mode === '3d'
                  ? <sphereGeometry args={[0.05, 12, 12]} />
                  : <circleGeometry args={[0.06, 14]} />}
                <meshBasicMaterial color={cursorColor} />
              </mesh>

              {/* Snap ring */}
              {snapMarker && (
                <mesh position={toWorldPosition(snapMarker, mode, mode === '3d' ? activeSurfaceElevation : elevation, 0.04)}>
                  <ringGeometry args={[0.1, 0.14, 20]} />
                  <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* Dimension badge */}
              <Html
                position={
                  mode === '3d'
                    ? [preview[0], activeSurfaceElevation + defaultColumnHeight + 0.2, preview[1]]
                    : toWorldPosition(preview, mode, elevation, 0.3)
                }
                center
              >
                <div className="measurement-badge">
                  {formatLength(defaultColumnWidth, lengthUnit)} x {formatLength(defaultColumnDepth, lengthUnit)} x {formatLength(defaultColumnHeight, lengthUnit)}
                </div>
              </Html>
            </>
          )}
        </>
      )}
    </>
  )
}

/** Backward-compatible 3D export */
export function ColumnPlane() {
  return <ColumnTool mode="3d" />
}

/** 2D plan view export */
export function ColumnPlane2D() {
  return <ColumnTool mode="2d" />
}
