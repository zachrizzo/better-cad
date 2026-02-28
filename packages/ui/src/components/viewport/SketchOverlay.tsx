import { Line } from '@react-three/drei'
import { useSketchStore } from '../../stores/sketch-store'
import { constraintStatusColor } from '../../utils/sketch-solver'

const CIRCLE_SEGMENTS = 64

export function SketchOverlay() {
  const { active, points, lines, circles, solverStatus } = useSketchStore()
  if (!active) return null

  const color = constraintStatusColor(solverStatus)

  return (
    <>
      {Array.from(lines.values()).map((line) => {
        const p1 = points.get(line.p1)
        const p2 = points.get(line.p2)
        if (!p1 || !p2) return null
        return (
          <Line
            key={line.id}
            points={[[p1.x, 0.001, p1.y], [p2.x, 0.001, p2.y]]}
            color={color}
            lineWidth={2}
          />
        )
      })}
      {Array.from(circles.values()).map((circ) => {
        const center = points.get(circ.center)
        if (!center) return null
        const circlePoints: [number, number, number][] = []
        for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
          const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2
          circlePoints.push([
            center.x + circ.radius * Math.cos(angle),
            0.001,
            center.y + circ.radius * Math.sin(angle),
          ])
        }
        return (
          <Line
            key={circ.id}
            points={circlePoints}
            color={color}
            lineWidth={2}
          />
        )
      })}
      {Array.from(points.values()).map((pt) => (
        <mesh key={pt.id} position={[pt.x, 0.01, pt.y]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </>
  )
}
