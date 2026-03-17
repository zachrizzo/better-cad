import { useMemo } from 'react'
import * as THREE from 'three'
import { Line, Text, Html } from '@react-three/drei'
import { useDimensionDrawing } from '../../hooks/useDimensionDrawing'
import { useSettingsStore } from '../../stores/settings-store'
import { useEntityStore, isDimensionElement } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'
import { formatLength } from '../../utils/units'
import { MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'
import type { DimensionElement } from '../../services/kernel-bridge'

interface DimensionToolProps {
  mode: ViewportMode
}

/**
 * Unified dimension tool.
 * Works in both 2D and 3D -- all logic lives in useDimensionDrawing.
 */
export function DimensionTool({ mode }: DimensionToolProps) {
  const {
    isActive,
    p1,
    cursorPoint,
    snapMarker,
    snappedCandidate,
    elevation,
    planeRef,
    handlePointerMove,
    handleClick,
    handleContextMenu,
    handlePointerLeave,
  } = useDimensionDrawing(mode)

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
        onContextMenu={handleContextMenu}
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
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#ff6b6b'} />
        </mesh>
      )}

      {/* First point marker */}
      {p1 && (
        <mesh position={toWorldPosition(p1, mode, elevation, 0.05)}>
          {mode === '3d'
            ? <sphereGeometry args={[0.1, 16, 16]} />
            : <circleGeometry args={[0.1, 16]} />}
          <meshBasicMaterial color="#ff6b6b" />
        </mesh>
      )}

      {/* Preview line between p1 and cursor */}
      {p1 && cursorPoint && (
        <Line
          points={[
            toWorldPosition(p1, mode, elevation, 0.05),
            toWorldPosition(cursorPoint, mode, elevation, 0.05),
          ]}
          color="#ff6b6b"
          lineWidth={1.5}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
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

/** 3D dimension tool (drop-in replacement for the old DimensionPlane) */
export function DimensionPlane() {
  return <DimensionTool mode="3d" />
}

/** 2D dimension tool (drop-in replacement for the old DimensionPlane2D) */
export function DimensionPlane2D() {
  return <DimensionTool mode="2d" />
}

/* ------------------------------------------------------------------ */
/*  DimensionOverlay3D (unchanged from original)                       */
/* ------------------------------------------------------------------ */

/** Renders all persisted dimension elements in the 3D scene */
export function DimensionOverlay3D() {
  const elements = useEntityStore((s) => s.elements)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const levels = useLevelStore((s) => s.levels)

  const dimensions = useMemo(
    () => Array.from(elements.values()).filter(isDimensionElement),
    [elements],
  )

  const levelElevations = useMemo(() => {
    const map = new Map<string, number>()
    for (const lvl of levels) map.set(lvl.id, lvl.elevation)
    return map
  }, [levels])

  return (
    <>
      {dimensions.map((dim) => {
        const elev = dim.meta.level_id ? (levelElevations.get(dim.meta.level_id) ?? 0) : 0
        return <DimensionLine3D key={dim.meta.id} dim={dim} elevation={elev} lengthUnit={lengthUnit} />
      })}
    </>
  )
}

function DimensionLine3D({ dim, elevation, lengthUnit }: {
  dim: DimensionElement
  elevation: number
  lengthUnit: string
}) {
  const y = elevation + 0.02
  const { p1, p2, offset } = dim

  // Direction vector
  const dx = p2[0] - p1[0]
  const dz = p2[1] - p1[1]
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return null

  // Perpendicular normal (in XZ plane, kernel XY -> scene XZ)
  const nx = -dz / len
  const nz = dx / len

  // Offset points for dimension line
  const off1: [number, number, number] = [p1[0] + nx * offset, y, p1[1] + nz * offset]
  const off2: [number, number, number] = [p2[0] + nx * offset, y, p2[1] + nz * offset]

  // Witness line endpoints
  const w1Start: [number, number, number] = [p1[0], y, p1[1]]
  const w1End: [number, number, number] = [p1[0] + nx * (offset + 0.1), y, p1[1] + nz * (offset + 0.1)]
  const w2Start: [number, number, number] = [p2[0], y, p2[1]]
  const w2End: [number, number, number] = [p2[0] + nx * (offset + 0.1), y, p2[1] + nz * (offset + 0.1)]

  // Arrow tick size
  const tickLen = 0.08
  const tickDx = dx / len * tickLen
  const tickDz = dz / len * tickLen

  // Arrow ticks at each end of dimension line
  const tick1a: [number, number, number] = [off1[0] + tickDx + nx * tickLen, y, off1[2] + tickDz + nz * tickLen]
  const tick1b: [number, number, number] = [off1[0] + tickDx - nx * tickLen, y, off1[2] + tickDz - nz * tickLen]
  const tick2a: [number, number, number] = [off2[0] - tickDx + nx * tickLen, y, off2[2] - tickDz + nz * tickLen]
  const tick2b: [number, number, number] = [off2[0] - tickDx - nx * tickLen, y, off2[2] - tickDz - nz * tickLen]

  const midpoint: [number, number, number] = [
    (off1[0] + off2[0]) / 2,
    y + 0.01,
    (off1[2] + off2[2]) / 2,
  ]

  const displayText = dim.text_override || formatLength(len, lengthUnit as Parameters<typeof formatLength>[1])

  // Calculate rotation for text to be aligned along dimension line in XZ plane
  const angle = Math.atan2(dz, dx)

  return (
    <>
      {/* Witness lines */}
      <Line points={[w1Start, w1End]} color="#ff6b6b" lineWidth={0.8} />
      <Line points={[w2Start, w2End]} color="#ff6b6b" lineWidth={0.8} />

      {/* Dimension line */}
      <Line points={[off1, off2]} color="#ff6b6b" lineWidth={1.2} />

      {/* Arrow ticks */}
      <Line points={[tick1a, off1, tick1b]} color="#ff6b6b" lineWidth={1} />
      <Line points={[tick2a, off2, tick2b]} color="#ff6b6b" lineWidth={1} />

      {/* Text label */}
      <Text
        position={midpoint}
        rotation={[-Math.PI / 2, 0, -angle]}
        fontSize={0.15}
        color="#ff6b6b"
        anchorX="center"
        anchorY="bottom"
      >
        {displayText}
      </Text>
    </>
  )
}
