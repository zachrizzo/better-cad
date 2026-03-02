import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import { usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import { isWallElement, isDimensionElement, useEntityStore } from '../../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import type { DimensionElement, WallElement } from '../../services/kernel-bridge'

const SNAP_DISTANCE = 0.2
const DEFAULT_OFFSET = 0.5

type Point2 = [number, number]

export function DimensionPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const planeRef = useRef<THREE.Mesh>(null)
  const [p1, setP1] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)

  const wallElements = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )
  const planSnapPoints = usePlanSnapPoints()

  // Snap points: wall endpoints, door/window edges
  const snapPoints = useMemo<Point2[]>(() => {
    const points: Point2[] = []
    wallElements.forEach((wall: WallElement) => {
      points.push(wall.start, wall.end)
    })
    points.push(...planSnapPoints)
    return points
  }, [wallElements, planSnapPoints])

  const snapToNearest = useCallback((raw: Point2): { point: Point2; snapped: Point2 | null } => {
    if (!snapEnabled) {
      return { point: raw, snapped: null }
    }
    let nearest: Point2 | null = null
    let nearestDist = Infinity
    for (const sp of snapPoints) {
      const d = Math.hypot(raw[0] - sp[0], raw[1] - sp[1])
      if (d < nearestDist) {
        nearestDist = d
        nearest = sp
      }
    }
    if (nearest && nearestDist <= SNAP_DISTANCE) {
      return { point: nearest, snapped: nearest }
    }
    return { point: raw, snapped: null }
  }, [snapPoints, snapEnabled])

  useEffect(() => {
    if (activeTool !== 'dimension') {
      setP1(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'dimension') return
    const raw: Point2 = [e.point.x, e.point.z]
    const { point, snapped } = snapToNearest(raw)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])

    if (p1) {
      const dist = Math.hypot(point[0] - p1[0], point[1] - p1[1])
      setToolReadout(`Dimension: ${formatLength(dist, lengthUnit)}${snapped ? ' SNAP' : ''}`)
    } else {
      setToolReadout('Dimension: pick first point')
    }
  }, [activeLevelElevation, activeTool, p1, snapToNearest, lengthUnit, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'dimension') return

    const raw: Point2 = [e.point.x, e.point.z]
    const { point } = snapToNearest(raw)

    if (!p1) {
      setP1(point)
      setToolReadout(`Dimension: pick second point`)
      return
    }

    const dist = Math.hypot(point[0] - p1[0], point[1] - p1[1])
    if (dist < 0.05) return

    const dimId = `dim-${crypto.randomUUID()}`
    const dimElement: DimensionElement = {
      kind: 'dimension',
      meta: {
        id: dimId,
        name: `Dim ${formatLength(dist, lengthUnit)}`,
        level_id: activeLevelId,
      },
      p1: p1,
      p2: point,
      offset: DEFAULT_OFFSET,
    }

    setP1(null)
    setCursorPoint(null)
    setToolReadout(`Dimension placed: ${formatLength(dist, lengthUnit)}`)

    if (!ready || !kernel) return
    void (async () => {
      try {
        await kernel.createElement(dimElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create dimension:', err)
      }
    })()
  }

  if (activeTool !== 'dimension') return null

  const planeY = activeLevelElevation

  return (
    <>
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, planeY, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], planeY + 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#ff6b6b'} />
        </mesh>
      )}

      {p1 && (
        <mesh position={[p1[0], planeY + 0.05, p1[1]]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ff6b6b" />
        </mesh>
      )}

      {p1 && cursorPoint && (
        <Line
          points={[
            [p1[0], planeY + 0.05, p1[1]],
            [cursorPoint[0], planeY + 0.05, cursorPoint[1]],
          ]}
          color="#ff6b6b"
          lineWidth={1.5}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {snapMarker && (
        <mesh position={[snapMarker[0], planeY + 0.05, snapMarker[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}

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
