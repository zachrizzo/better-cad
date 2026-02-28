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
    </>
  )
}

export function Viewport2D() {
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
      <color attach="background" args={['#1e1e2e']} />
      <PlanLines />
      <MapControls enableRotate={false} />
    </Canvas>
  )
}
