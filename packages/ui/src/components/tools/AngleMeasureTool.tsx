import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useAngleMeasureDrawing } from '../../hooks/useAngleMeasureDrawing'
import { MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface AngleMeasureToolProps {
  mode: ViewportMode
}

/**
 * Unified three-click angle measurement tool.
 * Works in both 2D and 3D -- all logic lives in useAngleMeasureDrawing.
 */
export function AngleMeasureTool({ mode }: AngleMeasureToolProps) {
  const {
    isActive,
    ptA,
    ptB,
    ptC,
    phase,
    cursorPos,
    snapMarker,
    snappedCandidate,
    angleDeg,
    arcPoints,
    arcMidpoint,
    elevation,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  } = useAngleMeasureDrawing(mode)

  if (!isActive) return null

  const plane = interactionPlaneProps(mode, elevation)

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

      {/* Point A */}
      {ptA && (
        <mesh position={toWorldPosition(ptA, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Point B (vertex) */}
      {ptB && (
        <mesh position={toWorldPosition(ptB, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Point C */}
      {ptC && (
        <mesh position={toWorldPosition(ptC, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      )}

      {/* Solid line B -> A */}
      {ptA && ptB && (
        <Line
          points={[
            toWorldPosition(ptB, mode, elevation, 0.01),
            toWorldPosition(ptA, mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Solid line B -> C (when confirmed) */}
      {ptB && ptC && (
        <Line
          points={[
            toWorldPosition(ptB, mode, elevation, 0.01),
            toWorldPosition(ptC, mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Dashed preview line from last confirmed point to cursor */}
      {phase === 1 && ptA && cursorPos && (
        <Line
          points={[
            toWorldPosition(ptA, mode, elevation, 0.01),
            toWorldPosition(cursorPos, mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}
      {phase === 2 && ptB && cursorPos && (
        <Line
          points={[
            toWorldPosition(ptB, mode, elevation, 0.01),
            toWorldPosition(cursorPos, mode, elevation, 0.01),
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Arc indicator at vertex */}
      {arcPoints && arcPoints.length > 1 && (
        <Line
          points={arcPoints}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Angle label */}
      {angleDeg !== null && arcMidpoint && (
        <Html position={[arcMidpoint[0], arcMidpoint[1] + (mode === '3d' ? 0.2 : 0.15), arcMidpoint[2]]} center>
          <div className="measurement-badge">
            <span>{angleDeg.toFixed(1)}&deg;</span>
          </div>
        </Html>
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
        <Html position={toWorldPosition(snapMarker, mode, elevation, 0.2)} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}
    </>
  )
}

/** 3D-viewport export -- same name as the original for backwards compatibility */
export function AngleMeasurePlane() {
  return <AngleMeasureTool mode="3d" />
}

/** 2D-viewport export -- replaces the old AngleMeasurePlane2D component */
export function AngleMeasurePlane2D() {
  return <AngleMeasureTool mode="2d" />
}
