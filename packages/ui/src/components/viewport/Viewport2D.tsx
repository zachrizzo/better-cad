import { Canvas } from '@react-three/fiber'
import { MapControls, Line, Text } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import {
  isBeamElement,
  isColumnElement,
  isDimensionElement,
  isDoorElement,
  isFloorElement,
  isRoofElement,
  isRoomElement,
  isStairElement,
  isTextAnnotationElement,
  isWallElement,
  isWindowElement,
  useEntityStore,
} from '../../stores/entity-store'
import type { BeamElement, ColumnElement, DimensionElement, DoorElement, FloorElement, PrototypeElement, RoofElement, RoomElement, StairElement, TextAnnotationElement, WallElement, WindowElement } from '../../services/kernel-bridge'
import { useLevelStore } from '../../stores/level-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import { polygonCentroid } from '../../services/room-detection'

interface PlanLine {
  start: [number, number]
  end: [number, number]
}

function normalizeSwing(swing?: string): 'left' | 'right' {
  return swing === 'left' ? 'left' : 'right'
}

function isOnActiveLevel(element: PrototypeElement, activeLevelId: string): boolean {
  return !element.meta.level_id || element.meta.level_id === activeLevelId
}

function PlanLines() {
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)

  const walls = useMemo(
    () => Array.from(elements.values()).filter((e): e is WallElement => isWallElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const doors = useMemo(
    () => Array.from(elements.values()).filter((e): e is DoorElement => isDoorElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const floors = useMemo(
    () => Array.from(elements.values()).filter((e): e is FloorElement => isFloorElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const stairs = useMemo(
    () => Array.from(elements.values()).filter((e): e is StairElement => isStairElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const windows = useMemo(
    () => Array.from(elements.values()).filter((e): e is WindowElement => isWindowElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const columns = useMemo(
    () => Array.from(elements.values()).filter((e): e is ColumnElement => isColumnElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const beams = useMemo(
    () => Array.from(elements.values()).filter((e): e is BeamElement => isBeamElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const roofs = useMemo(
    () => Array.from(elements.values()).filter((e): e is RoofElement => isRoofElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const rooms = useMemo(
    () => Array.from(elements.values()).filter((e): e is RoomElement => isRoomElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const dimensions = useMemo(
    () => Array.from(elements.values()).filter((e): e is DimensionElement => isDimensionElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const textAnnotations = useMemo(
    () => Array.from(elements.values()).filter((e): e is TextAnnotationElement => isTextAnnotationElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const roomOverlays = useMemo(() => {
    return rooms.map((room) => {
      if (room.boundary.length < 3) return null
      const shape = new THREE.Shape()
      shape.moveTo(room.boundary[0][0], room.boundary[0][1])
      for (let i = 1; i < room.boundary.length; i++) {
        shape.lineTo(room.boundary[i][0], room.boundary[i][1])
      }
      shape.closePath()
      const centroid = polygonCentroid(room.boundary)
      const area = Math.abs(
        room.boundary.reduce((sum, pt, i) => {
          const next = room.boundary[(i + 1) % room.boundary.length]
          return sum + pt[0] * next[1] - next[0] * pt[1]
        }, 0) / 2,
      )
      return {
        id: room.meta.id,
        shape,
        centroid,
        name: room.name,
        color: room.color || '#8b5cf6',
        area,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rooms])

  const roofLoops = useMemo(() => {
    return roofs
      .map((roof: RoofElement) => {
        if (roof.boundary.length < 3) return null
        const pts = roof.boundary.map((pt) => [pt[0], pt[1], 0] as [number, number, number])
        pts.push([roof.boundary[0][0], roof.boundary[0][1], 0])
        return { id: roof.meta.id, points: pts }
      })
      .filter((loop): loop is { id: string; points: [number, number, number][] } => loop !== null)
  }, [roofs])

  const wallById = useMemo(() => {
    const map = new Map<string, WallElement>()
    walls.forEach((wall) => map.set(wall.meta.id, wall))
    return map
  }, [walls])

  const wallLines = useMemo(() => {
    const result: PlanLine[] = []
    walls.forEach((wall) => {
      const dx = wall.end[0] - wall.start[0]
      const dy = wall.end[1] - wall.start[1]
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1e-10) return
      const nx = (-dy / len) * (wall.thickness / 2)
      const ny = (dx / len) * (wall.thickness / 2)

      result.push({
        start: [wall.start[0] + nx, wall.start[1] + ny],
        end: [wall.end[0] + nx, wall.end[1] + ny],
      })
      result.push({
        start: [wall.start[0] - nx, wall.start[1] - ny],
        end: [wall.end[0] - nx, wall.end[1] - ny],
      })
      result.push({
        start: [wall.start[0] + nx, wall.start[1] + ny],
        end: [wall.start[0] - nx, wall.start[1] - ny],
      })
      result.push({
        start: [wall.end[0] + nx, wall.end[1] + ny],
        end: [wall.end[0] - nx, wall.end[1] - ny],
      })
    })
    return result
  }, [walls])

  const floorLoops = useMemo(() => {
    return floors
      .map((floor: FloorElement) => {
        if (floor.boundary.length < 3) return null
        const pts = floor.boundary.map((pt) => [pt[0], pt[1], 0] as [number, number, number])
        pts.push([floor.boundary[0][0], floor.boundary[0][1], 0])
        return { id: floor.meta.id, points: pts }
      })
      .filter((loop): loop is { id: string; points: [number, number, number][] } => loop !== null)
  }, [floors])

  const stairPreview = useMemo(() => {
    const edgeLines: PlanLine[] = []
    const riserLines: PlanLine[] = []

    stairs.forEach((stair: StairElement) => {
      const dx = stair.end[0] - stair.start[0]
      const dz = stair.end[1] - stair.start[1]
      const len = Math.hypot(dx, dz)
      if (len < 1e-8) return

      const dir: [number, number] = [dx / len, dz / len]
      const normal: [number, number] = [
        -dir[1] * (stair.width / 2),
        dir[0] * (stair.width / 2),
      ]

      const leftStart: [number, number] = [stair.start[0] + normal[0], stair.start[1] + normal[1]]
      const leftEnd: [number, number] = [stair.end[0] + normal[0], stair.end[1] + normal[1]]
      const rightStart: [number, number] = [stair.start[0] - normal[0], stair.start[1] - normal[1]]
      const rightEnd: [number, number] = [stair.end[0] - normal[0], stair.end[1] - normal[1]]

      edgeLines.push({ start: leftStart, end: leftEnd })
      edgeLines.push({ start: rightStart, end: rightEnd })
      edgeLines.push({ start: leftStart, end: rightStart })
      edgeLines.push({ start: leftEnd, end: rightEnd })

      const risers = Math.max(1, stair.risers)
      for (let i = 0; i <= risers; i += 1) {
        const t = i / risers
        const cx = stair.start[0] + dx * t
        const cz = stair.start[1] + dz * t
        riserLines.push({
          start: [cx + normal[0], cz + normal[1]],
          end: [cx - normal[0], cz - normal[1]],
        })
      }
    })

    return { edgeLines, riserLines }
  }, [stairs])

  const doorOverlay = useMemo(() => {
    const spans: PlanLine[] = []
    const leaves: PlanLine[] = []
    const arcs: [number, number][][] = []

    doors.forEach((door: DoorElement) => {
      const wall = wallById.get(door.wall_id)
      if (!wall) return
      const dx = wall.end[0] - wall.start[0]
      const dz = wall.end[1] - wall.start[1]
      const len = Math.max(1e-8, Math.hypot(dx, dz))
      const dir: [number, number] = [dx / len, dz / len]
      const center: [number, number] = [
        wall.start[0] + dx * door.position_along_wall,
        wall.start[1] + dz * door.position_along_wall,
      ]
      const half = door.width / 2
      spans.push({
        start: [center[0] - dir[0] * half, center[1] - dir[1] * half],
        end: [center[0] + dir[0] * half, center[1] + dir[1] * half],
      })

      const normal: [number, number] = [-dir[1], dir[0]]
      const swing = normalizeSwing(door.swing)
      const hinge: [number, number] = swing === 'left'
        ? [center[0] - dir[0] * half, center[1] - dir[1] * half]
        : [center[0] + dir[0] * half, center[1] + dir[1] * half]
      const closedDir: [number, number] = swing === 'left' ? dir : [-dir[0], -dir[1]]
      const openDir: [number, number] = swing === 'left' ? normal : [-normal[0], -normal[1]]

      leaves.push({
        start: hinge,
        end: [hinge[0] + openDir[0] * door.width, hinge[1] + openDir[1] * door.width],
      })

      const arcPoints: [number, number][] = []
      const segments = 14
      for (let i = 0; i <= segments; i += 1) {
        const theta = (Math.PI / 2) * (i / segments)
        const x = hinge[0] + door.width * (closedDir[0] * Math.cos(theta) + openDir[0] * Math.sin(theta))
        const y = hinge[1] + door.width * (closedDir[1] * Math.cos(theta) + openDir[1] * Math.sin(theta))
        arcPoints.push([x, y])
      }
      arcs.push(arcPoints)
    })

    return { spans, leaves, arcs }
  }, [doors, wallById])

  const windowOverlay = useMemo(() => {
    const lines: { start: [number, number]; end: [number, number] }[] = []

    windows.forEach((win: WindowElement) => {
      const wall = wallById.get(win.wall_id)
      if (!wall) return
      const dx = wall.end[0] - wall.start[0]
      const dz = wall.end[1] - wall.start[1]
      const len = Math.max(1e-8, Math.hypot(dx, dz))
      const dir: [number, number] = [dx / len, dz / len]
      const normal: [number, number] = [-dir[1], dir[0]]
      const center: [number, number] = [
        wall.start[0] + dx * win.position_along_wall,
        wall.start[1] + dz * win.position_along_wall,
      ]
      const half = win.width / 2
      const offset = wall.thickness * 0.3

      // Two parallel lines offset from wall center (standard window symbol)
      lines.push({
        start: [center[0] - dir[0] * half + normal[0] * offset, center[1] - dir[1] * half + normal[1] * offset],
        end: [center[0] + dir[0] * half + normal[0] * offset, center[1] + dir[1] * half + normal[1] * offset],
      })
      lines.push({
        start: [center[0] - dir[0] * half - normal[0] * offset, center[1] - dir[1] * half - normal[1] * offset],
        end: [center[0] + dir[0] * half - normal[0] * offset, center[1] + dir[1] * half - normal[1] * offset],
      })
    })

    return lines
  }, [windows, wallById])

  const columnOverlay = useMemo(() => {
    const edges: PlanLine[] = []
    const crosses: PlanLine[] = []

    columns.forEach((col: ColumnElement) => {
      const hw = col.width / 2
      const hd = col.depth / 2
      const cx = col.center[0]
      const cy = col.center[1]

      // Rectangle edges
      edges.push({ start: [cx - hw, cy - hd], end: [cx + hw, cy - hd] })
      edges.push({ start: [cx + hw, cy - hd], end: [cx + hw, cy + hd] })
      edges.push({ start: [cx + hw, cy + hd], end: [cx - hw, cy + hd] })
      edges.push({ start: [cx - hw, cy + hd], end: [cx - hw, cy - hd] })

      // X cross-hatch
      crosses.push({ start: [cx - hw, cy - hd], end: [cx + hw, cy + hd] })
      crosses.push({ start: [cx + hw, cy - hd], end: [cx - hw, cy + hd] })
    })

    return { edges, crosses }
  }, [columns])

  return (
    <>
      {/* Room overlays (filled shapes with labels) */}
      {roomOverlays.map((room) => (
        <group key={`room-${room.id}`}>
          <mesh position={[0, 0, -0.01]}>
            <shapeGeometry args={[room.shape]} />
            <meshBasicMaterial color={room.color} transparent opacity={0.18} side={THREE.DoubleSide} />
          </mesh>
          <Line
            points={[
              ...room.shape.getPoints().map((p) => [p.x, p.y, 0] as [number, number, number]),
              [room.shape.getPoints()[0].x, room.shape.getPoints()[0].y, 0] as [number, number, number],
            ]}
            color={room.color}
            lineWidth={1.5}
          />
          <Text
            position={[room.centroid[0], room.centroid[1], 0.01]}
            fontSize={0.3}
            color={room.color}
            anchorX="center"
            anchorY="middle"
          >
            {`${room.name}\n${room.area.toFixed(1)} m\u00B2`}
          </Text>
        </group>
      ))}
      {wallLines.map((line, i) => (
        <Line
          key={`wall-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#c0c0d0"
          lineWidth={1.5}
        />
      ))}
      {floorLoops.map((loop) => (
        <Line
          key={loop.id}
          points={loop.points}
          color="#4ade80"
          lineWidth={1.6}
        />
      ))}
      {stairPreview.edgeLines.map((line, i) => (
        <Line
          key={`stair-edge-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#38bdf8"
          lineWidth={1.2}
        />
      ))}
      {stairPreview.riserLines.map((line, i) => (
        <Line
          key={`stair-riser-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#7dd3fc"
          lineWidth={0.9}
        />
      ))}
      {doorOverlay.spans.map((line, i) => (
        <Line
          key={`door-span-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#f59e0b"
          lineWidth={2}
        />
      ))}
      {doorOverlay.leaves.map((line, i) => (
        <Line
          key={`door-leaf-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#fbbf24"
          lineWidth={1.5}
        />
      ))}
      {doorOverlay.arcs.map((arc, i) => (
        <Line
          key={`door-arc-${i}`}
          points={arc.map((p) => [p[0], p[1], 0])}
          color="#fbbf24"
          lineWidth={1}
          dashed
          dashSize={0.12}
          gapSize={0.08}
        />
      ))}
      {windowOverlay.map((line, i) => (
        <Line
          key={`window-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#60a5fa"
          lineWidth={2}
        />
      ))}
      {columnOverlay.edges.map((line, i) => (
        <Line
          key={`col-edge-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#9ca3af"
          lineWidth={2}
        />
      ))}
      {columnOverlay.crosses.map((line, i) => (
        <Line
          key={`col-cross-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#6b7280"
          lineWidth={1}
        />
      ))}
      {beams.map((beam: BeamElement) => (
        <Line
          key={`beam-${beam.meta.id}`}
          points={[
            [beam.start[0], beam.start[1], 0],
            [beam.end[0], beam.end[1], 0],
          ]}
          color="#78716c"
          lineWidth={1.5}
          dashed
          dashSize={0.15}
          gapSize={0.1}
        />
      ))}
      {roofLoops.map((loop) => (
        <Line
          key={`roof-${loop.id}`}
          points={loop.points}
          color="#b45309"
          lineWidth={1.6}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      ))}

      {/* Dimension lines */}
      {dimensions.map((dim) => (
        <DimensionLine2D key={dim.meta.id} dim={dim} lengthUnit={lengthUnit} />
      ))}

      {/* Text annotations */}
      {textAnnotations.map((ann) => (
        <Text
          key={ann.meta.id}
          position={[ann.position[0], ann.position[1], 0.01]}
          rotation={[0, 0, ann.rotation]}
          fontSize={ann.font_size}
          color="#38bdf8"
          anchorX="left"
          anchorY="bottom"
        >
          {ann.text}
        </Text>
      ))}

      {/* Element tags */}
      {doors.map((door, i) => {
        const wall = wallById.get(door.wall_id)
        if (!wall) return null
        const dx = wall.end[0] - wall.start[0]
        const dz = wall.end[1] - wall.start[1]
        const cx = wall.start[0] + dx * door.position_along_wall
        const cy = wall.start[1] + dz * door.position_along_wall
        return (
          <Text
            key={`tag-door-${door.meta.id}`}
            position={[cx, cy - 0.3, 0.02]}
            fontSize={0.15}
            color="#f59e0b"
            anchorX="center"
            anchorY="top"
          >
            {`D${String(i + 1).padStart(2, '0')}`}
          </Text>
        )
      })}
      {walls.map((wall, i) => {
        const mx = (wall.start[0] + wall.end[0]) / 2
        const my = (wall.start[1] + wall.end[1]) / 2
        return (
          <Text
            key={`tag-wall-${wall.meta.id}`}
            position={[mx, my + 0.25, 0.02]}
            fontSize={0.12}
            color="#9ca3af"
            anchorX="center"
            anchorY="bottom"
          >
            {`W${String(i + 1).padStart(2, '0')}`}
          </Text>
        )
      })}
    </>
  )
}

function DimensionLine2D({ dim, lengthUnit }: { dim: DimensionElement; lengthUnit: string }) {
  const { p1, p2, offset } = dim

  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null

  const nx = -dy / len
  const ny = dx / len

  const off1: [number, number, number] = [p1[0] + nx * offset, p1[1] + ny * offset, 0.01]
  const off2: [number, number, number] = [p2[0] + nx * offset, p2[1] + ny * offset, 0.01]

  const w1Start: [number, number, number] = [p1[0], p1[1], 0.01]
  const w1End: [number, number, number] = [p1[0] + nx * (offset + 0.1), p1[1] + ny * (offset + 0.1), 0.01]
  const w2Start: [number, number, number] = [p2[0], p2[1], 0.01]
  const w2End: [number, number, number] = [p2[0] + nx * (offset + 0.1), p2[1] + ny * (offset + 0.1), 0.01]

  const tickLen = 0.08
  const tdx = dx / len * tickLen
  const tdy = dy / len * tickLen

  const tick1a: [number, number, number] = [off1[0] + tdx + nx * tickLen, off1[1] + tdy + ny * tickLen, 0.01]
  const tick1b: [number, number, number] = [off1[0] + tdx - nx * tickLen, off1[1] + tdy - ny * tickLen, 0.01]
  const tick2a: [number, number, number] = [off2[0] - tdx + nx * tickLen, off2[1] - tdy + ny * tickLen, 0.01]
  const tick2b: [number, number, number] = [off2[0] - tdx - nx * tickLen, off2[1] - tdy - ny * tickLen, 0.01]

  const midX = (off1[0] + off2[0]) / 2
  const midY = (off1[1] + off2[1]) / 2
  const angle = Math.atan2(dy, dx)
  const displayText = dim.text_override || formatLength(len, lengthUnit as Parameters<typeof formatLength>[1])

  return (
    <>
      <Line points={[w1Start, w1End]} color="#ff6b6b" lineWidth={0.6} />
      <Line points={[w2Start, w2End]} color="#ff6b6b" lineWidth={0.6} />
      <Line points={[off1, off2]} color="#ff6b6b" lineWidth={1} />
      <Line points={[tick1a, off1, tick1b]} color="#ff6b6b" lineWidth={0.8} />
      <Line points={[tick2a, off2, tick2b]} color="#ff6b6b" lineWidth={0.8} />
      <Text
        position={[midX + nx * 0.05, midY + ny * 0.05, 0.02]}
        rotation={[0, 0, angle]}
        fontSize={0.12}
        color="#ff6b6b"
        anchorX="center"
        anchorY="bottom"
      >
        {displayText}
      </Text>
    </>
  )
}

interface Viewport2DProps {
  background: string
}

export function Viewport2D({ background }: Viewport2DProps) {
  return (
    <Canvas
      orthographic
      camera={{
        position: [0, 0, 50],
        zoom: 40,
        near: 0.1,
        far: 1000,
        up: [0, 1, 0],
      }}
    >
      <color attach="background" args={[background]} />
      <PlanLines />
      <MapControls enableRotate={false} />
    </Canvas>
  )
}
