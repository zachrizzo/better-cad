import { Line } from '@react-three/drei'
import { useSketchStore } from '../../stores/sketch-store'

export function SketchOverlay() {
  const { active, points, lines } = useSketchStore()
  if (!active) return null

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
            color="#00aaff"
            lineWidth={2}
          />
        )
      })}
      {Array.from(points.values()).map((pt) => (
        <mesh key={pt.id} position={[pt.x, 0.01, pt.y]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      ))}
    </>
  )
}
