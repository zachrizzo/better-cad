import { Canvas } from '@react-three/fiber'
import { MapControls, Line } from '@react-three/drei'
import { useBimStore } from '../../stores/bim-store'
import { useMemo } from 'react'

interface PlanLine {
  start: [number, number]
  end: [number, number]
}

function PlanLines() {
  const walls = useBimStore((s) => s.walls)
  const doors = useBimStore((s) => s.doors)

  const lines = useMemo(() => {
    const result: PlanLine[] = []
    walls.forEach((wall) => {
      const dx = wall.end[0] - wall.start[0]
      const dy = wall.end[1] - wall.start[1]
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1e-10) return
      const nx = (-dy / len) * (wall.thickness / 2)
      const ny = (dx / len) * (wall.thickness / 2)

      // Inner edge
      result.push({
        start: [wall.start[0] + nx, wall.start[1] + ny],
        end: [wall.end[0] + nx, wall.end[1] + ny],
      })
      // Outer edge
      result.push({
        start: [wall.start[0] - nx, wall.start[1] - ny],
        end: [wall.end[0] - nx, wall.end[1] - ny],
      })
      // Start cap
      result.push({
        start: [wall.start[0] + nx, wall.start[1] + ny],
        end: [wall.start[0] - nx, wall.start[1] - ny],
      })
      // End cap
      result.push({
        start: [wall.end[0] + nx, wall.end[1] + ny],
        end: [wall.end[0] - nx, wall.end[1] - ny],
      })
    })
    return result
  }, [walls])

  const doorSpans = useMemo(() => {
    const spans: PlanLine[] = []
    doors.forEach((door) => {
      const half = door.width / 2
      spans.push({
        start: [door.center[0] - door.direction[0] * half, door.center[1] - door.direction[1] * half],
        end: [door.center[0] + door.direction[0] * half, door.center[1] + door.direction[1] * half],
      })
    })
    return spans
  }, [doors])

  const doorArcs = useMemo(() => {
    const arcs: [number, number][][] = []
    doors.forEach((door) => {
      const half = door.width / 2
      const hinge: [number, number] = [
        door.center[0] - door.direction[0] * half,
        door.center[1] - door.direction[1] * half,
      ]
      const radius = door.width
      const normal: [number, number] = [-door.direction[1], door.direction[0]]
      const arcPoints: [number, number][] = []
      const segments = 14
      for (let i = 0; i <= segments; i += 1) {
        const theta = (Math.PI / 2) * (i / segments)
        const x = hinge[0] + radius * (door.direction[0] * Math.cos(theta) + normal[0] * Math.sin(theta))
        const y = hinge[1] + radius * (door.direction[1] * Math.cos(theta) + normal[1] * Math.sin(theta))
        arcPoints.push([x, y])
      }
      arcs.push(arcPoints)
    })
    return arcs
  }, [doors])

  return (
    <>
      {lines.map((line, i) => (
        <Line
          key={i}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#c0c0d0"
          lineWidth={1.5}
        />
      ))}
      {doorSpans.map((line, i) => (
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
      {doorArcs.map((arc, i) => (
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
