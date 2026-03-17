import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { usePathMeasureDrawing } from '../../hooks/usePathMeasureDrawing'
import { MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface PathMeasureToolProps {
  mode: ViewportMode
}

/**
 * Unified cumulative path measurement tool.
 * Works in both 2D and 3D -- all logic lives in usePathMeasureDrawing.
 */
export function PathMeasureTool({ mode }: PathMeasureToolProps) {
  const {
    isActive,
    points,
    cursorPos,
    snapMarker,
    snappedCandidate,
    finished,
    totalDistance,
    elevation,
    lengthUnit,
    planeRef,
    segmentDistance,
    handlePointerMove,
    handleClick,
    handleDoubleClick,
    handleContextMenu,
    handlePointerLeave,
  } = usePathMeasureDrawing(mode)

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
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Points */}
      {points.map((pt, i) => (
        <mesh key={i} position={toWorldPosition(pt, mode, elevation, 0.01)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.08, 16, 16]} />
            : <circleGeometry args={[0.08, 16]} />}
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      ))}

      {/* Confirmed line segments */}
      {points.length >= 2 && (
        <Line
          points={points.map((pt) => toWorldPosition(pt, mode, elevation, 0.01))}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Dashed preview from last point to cursor */}
      {points.length > 0 && !finished && cursorPos && (
        <Line
          points={[
            toWorldPosition(points[points.length - 1], mode, elevation, 0.01),
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
      {cursorPos && !finished && (
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

      {/* Segment distance labels at midpoints */}
      {points.map((pt, i) => {
        if (i === 0) return null
        const prev = points[i - 1]
        const segDist = segmentDistance(prev, pt)
        const midPlan: [number, number] = [(prev[0] + pt[0]) / 2, (prev[1] + pt[1]) / 2]
        return (
          <Html key={`seg-${i}`} position={toWorldPosition(midPlan, mode, elevation, 0.28)} center>
            <div className="measurement-badge">
              <span>{formatLength(segDist, lengthUnit)}</span>
            </div>
          </Html>
        )
      })}

      {/* Total distance label at last point */}
      {points.length >= 2 && (
        <Html
          position={toWorldPosition(points[points.length - 1], mode, elevation, mode === '3d' ? 0.5 : 0.3)}
          center
        >
          <div className="measurement-badge" style={{ background: 'rgba(0,100,255,0.85)' }}>
            <span>Total: {formatLength(totalDistance, lengthUnit)}</span>
          </div>
        </Html>
      )}
    </>
  )
}

/** 3D-viewport export -- same name as the original for backwards compatibility */
export function PathMeasurePlane() {
  return <PathMeasureTool mode="3d" />
}

/** 2D-viewport export -- replaces the old PathMeasurePlane2D component */
export function PathMeasurePlane2D() {
  return <PathMeasureTool mode="2d" />
}
