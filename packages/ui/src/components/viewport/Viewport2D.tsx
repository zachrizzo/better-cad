import { Canvas } from '@react-three/fiber'
import { MapControls, Line } from '@react-three/drei'
import { useMemo } from 'react'
import {
  isDoorElement,
  isFloorElement,
  isStairElement,
  isWallElement,
  useEntityStore,
} from '../../stores/entity-store'
import type { DoorElement, FloorElement, StairElement, WallElement } from '../../services/kernel-bridge'

interface PlanLine {
  start: [number, number]
  end: [number, number]
}

function normalizeSwing(swing?: string): 'left' | 'right' {
  return swing === 'left' ? 'left' : 'right'
}

function PlanLines() {
  const elements = useEntityStore((s) => s.elements)

  const walls = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )

  const doors = useMemo(
    () => Array.from(elements.values()).filter(isDoorElement),
    [elements],
  )

  const floors = useMemo(
    () => Array.from(elements.values()).filter(isFloorElement),
    [elements],
  )

  const stairs = useMemo(
    () => Array.from(elements.values()).filter(isStairElement),
    [elements],
  )

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

  return (
    <>
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
