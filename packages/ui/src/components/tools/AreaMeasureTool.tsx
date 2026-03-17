import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useAreaMeasureDrawing } from '../../hooks/useAreaMeasureDrawing'
import { MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength, formatArea } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
  previewPlaneRotation,
} from '../../utils/viewport-helpers'

interface AreaMeasureToolProps {
  mode: ViewportMode
}

/**
 * Unified polygon area measurement tool.
 * Works in both 2D and 3D -- all logic lives in useAreaMeasureDrawing.
 */
export function AreaMeasureTool({ mode }: AreaMeasureToolProps) {
  const {
    isActive,
    vertices,
    cursorPos,
    closed,
    snapMarker,
    snappedCandidate,
    elevation,
    lengthUnit,
    planeRef,
    fillShape,
    centroid,
    areaValue,
    perimeterValue,
    linePoints,
    handlePointerMove,
    handleClick,
    handleDoubleClick,
    handleContextMenu,
    handlePointerLeave,
  } = useAreaMeasureDrawing(mode)

  if (!isActive) return null

  const plane = interactionPlaneProps(mode, elevation)
  const fillRotation = previewPlaneRotation(mode)

  // Build world-space line points
  const worldLinePoints = linePoints.map((pt) => toWorldPosition(pt, mode, elevation, 0.01))

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        ref={planeRef}
        position={plane.position}
        rotation={plane.rotation}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertex points */}
      {vertices.map((v, i) => (
        <mesh key={i} position={toWorldPosition(v, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      ))}

      {/* Polygon outline */}
      {worldLinePoints.length >= 2 && (
        <Line
          points={worldLinePoints}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Preview dashed line from last vertex to cursor */}
      {!closed && vertices.length > 0 && cursorPos && (
        <Line
          points={[
            toWorldPosition(vertices[vertices.length - 1], mode, elevation, 0.01),
            toWorldPosition(cursorPos, mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Preview dashed line from cursor back to first vertex (when >= 3 points) */}
      {!closed && vertices.length >= 3 && cursorPos && (
        <Line
          points={[
            toWorldPosition(cursorPos, mode, elevation, 0.01),
            toWorldPosition(vertices[0], mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.15}
          gapSize={0.1}
        />
      )}

      {/* Semi-transparent polygon fill when closed */}
      {closed && fillShape && (
        <mesh
          rotation={fillRotation}
          position={toWorldPosition([0, 0], mode, elevation, 0.005)}
        >
          <shapeGeometry args={[fillShape]} />
          <meshBasicMaterial color="#00ff88" transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Cursor indicator */}
      {cursorPos && !closed && (
        <mesh position={toWorldPosition(cursorPos, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.05, 10, 10]} />
            : <circleGeometry args={[0.05, 10]} />}
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#22d3ee'} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={toWorldPosition(snapMarker, mode, elevation, 0.01)}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Snap type label */}
      {snapMarker && snappedCandidate && (
        <Html position={toWorldPosition(snapMarker, mode, elevation, 0.2)} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}

      {/* Area badge at centroid */}
      {closed && centroid && (
        <Html position={toWorldPosition(centroid, mode, elevation, 0.3)} center>
          <div className="measurement-badge">
            <span>{formatArea(areaValue, lengthUnit)}</span>
            <span className="measurement-badge-deltas">
              Perimeter: {formatLength(perimeterValue, lengthUnit)}
            </span>
          </div>
        </Html>
      )}
    </>
  )
}

/** 3D-viewport export -- same name as the original for backwards compatibility */
export function AreaMeasurePlane() {
  return <AreaMeasureTool mode="3d" />
}

/** 2D-viewport export -- replaces the old AreaMeasurePlane2D component */
export function AreaMeasurePlane2D() {
  return <AreaMeasureTool mode="2d" />
}
