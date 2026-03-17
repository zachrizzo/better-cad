import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useSpotElevationDrawing } from '../../hooks/useSpotElevationDrawing'
import { useSettingsStore } from '../../stores/settings-store'
import { useEntityStore, isSpotElevationElement } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { formatLength } from '../../utils/units'
import { MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface SpotElevationToolProps {
  mode: ViewportMode
}

/**
 * Unified spot elevation tool.
 * Works in both 2D and 3D -- all logic lives in useSpotElevationDrawing.
 */
export function SpotElevationTool({ mode }: SpotElevationToolProps) {
  const {
    isActive,
    cursorPoint,
    snapMarker,
    snappedCandidate,
    elevation,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  } = useSpotElevationDrawing(mode)

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

      {/* Cursor indicator */}
      {cursorPoint && (
        <mesh position={toWorldPosition(cursorPoint, mode, elevation, 0.05)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.06, 12, 12]} />
            : <circleGeometry args={[0.06, 12]} />}
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#ff9900'} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh
          position={toWorldPosition(snapMarker, mode, elevation, 0.05)}
          rotation={mode === '3d' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
        >
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

/* ------------------------------------------------------------------ */
/*  Compatibility wrappers                                             */
/* ------------------------------------------------------------------ */

/** 3D spot elevation tool (drop-in replacement for the old SpotElevationPlane) */
export function SpotElevationPlane() {
  return <SpotElevationTool mode="3d" />
}

/** 2D spot elevation tool (drop-in replacement for the old SpotElevationPlane2D) */
export function SpotElevationPlane2D() {
  return <SpotElevationTool mode="2d" />
}

/* ------------------------------------------------------------------ */
/*  SpotElevationOverlay3D (unchanged from original)                   */
/* ------------------------------------------------------------------ */

/** Renders all persisted spot elevation elements in the 3D scene. */
export function SpotElevationOverlay3D() {
  const elements = useEntityStore((s) => s.elements)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const levels = useLevelStore((s) => s.levels)

  const spotElevations = useMemo(
    () => Array.from(elements.values()).filter(isSpotElevationElement),
    [elements],
  )

  const levelElevations = useMemo(() => {
    const map = new Map<string, number>()
    for (const lvl of levels) map.set(lvl.id, lvl.elevation)
    return map
  }, [levels])

  if (spotElevations.length === 0) return null

  return (
    <>
      {spotElevations.map((spot) => {
        const elev = spot.meta.level_id ? (levelElevations.get(spot.meta.level_id) ?? 0) : 0
        return (
          <group key={spot.meta.id} position={[spot.position[0], elev + 0.02, spot.position[1]]}>
            {/* Crosshair */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.08, 0.12, 20]} />
              <meshBasicMaterial color="#ff9900" side={THREE.DoubleSide} />
            </mesh>
            {/* Elevation label */}
            <Html position={[0, 0.15, 0]} center>
              <div className="measurement-badge" style={{ background: '#ff9900', padding: '2px 6px', borderRadius: 3, fontSize: 11, color: '#fff' }}>
                {formatLength(spot.elevation, lengthUnit)}
              </div>
            </Html>
          </group>
        )
      })}
    </>
  )
}
