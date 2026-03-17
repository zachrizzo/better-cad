import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useMeasureDrawing } from '../../hooks/useMeasureDrawing'
import { MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface MeasureToolProps {
  mode: ViewportMode
}

/**
 * Unified two-point distance measurement tool.
 * Works in both 2D and 3D -- all logic lives in useMeasureDrawing.
 */
export function MeasureTool({ mode }: MeasureToolProps) {
  const {
    isActive,
    pt1,
    pt2,
    cursorPos,
    snapMarker,
    snappedCandidate,
    distance,
    elevation,
    lengthUnit,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  } = useMeasureDrawing(mode)

  if (!isActive) return null

  const plane = interactionPlaneProps(mode, elevation)
  const depthLabel = mode === '3d' ? 'Y' : 'Y'

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
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Start point */}
      {pt1 && (
        <mesh position={toWorldPosition(pt1, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* End point */}
      {pt2 && (
        <mesh position={toWorldPosition(pt2, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Measurement line (confirmed) */}
      {pt1 && pt2 && (
        <Line
          points={[
            toWorldPosition(pt1, mode, elevation, 0.01),
            toWorldPosition(pt2, mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Preview line (to cursor) */}
      {pt1 && !pt2 && cursorPos && (
        <Line
          points={[
            toWorldPosition(pt1, mode, elevation, 0.01),
            toWorldPosition(cursorPos, mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Cursor indicator */}
      {cursorPos && (
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
        <Html position={toWorldPosition(snapMarker, mode, elevation, 0.15)} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}

      {/* Distance label with deltas */}
      {pt1 && pt2 && distance !== null && (
        <Html
          position={toWorldPosition(
            [(pt1[0] + pt2[0]) / 2, (pt1[1] + pt2[1]) / 2],
            mode,
            elevation,
            0.28,
          )}
          center
        >
          <div className="measurement-badge">
            <span>{formatLength(distance, lengthUnit)}</span>
            <span className="measurement-badge-deltas">
              dX:{formatLength(Math.abs(pt2[0] - pt1[0]), lengthUnit)} d{depthLabel}:{formatLength(Math.abs(pt2[1] - pt1[1]), lengthUnit)}
            </span>
          </div>
        </Html>
      )}
    </>
  )
}

/** 3D-viewport export — same name as the original for backwards compatibility */
export function MeasurePlane() {
  return <MeasureTool mode="3d" />
}

/** 2D-viewport export — replaces the old MeasurePlane2D component */
export function MeasurePlane2D() {
  return <MeasureTool mode="2d" />
}
