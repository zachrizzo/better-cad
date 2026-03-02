import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'
import { useActiveDrawingSurface } from '../../hooks/useActiveDrawingSurface'

const GUIDE_HALF_SIZE = 40

function isDrawingTool(tool: string): boolean {
  return tool === 'sketch' || tool === 'foundation' || tool === 'parking' || tool === 'wall' || tool === 'door' || tool === 'floor' || tool === 'stair' || tool === 'measure'
}

export function DrawingPlaneGuide() {
  const activeTool = useUIStore((s) => s.activeTool)
  const theme = useUIStore((s) => s.theme)
  const { activeSurfaceElevation } = useActiveDrawingSurface()

  if (!isDrawingTool(activeTool)) return null

  const fillColor = theme === 'light' ? '#2563eb' : '#22d3ee'
  const lineColor = theme === 'light' ? '#1d4ed8' : '#67e8f9'

  return (
    <group position={[0, activeSurfaceElevation + 0.001, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[GUIDE_HALF_SIZE * 2, GUIDE_HALF_SIZE * 2]} />
        <meshBasicMaterial
          color={fillColor}
          transparent
          opacity={0.06}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Line
        points={[
          [-GUIDE_HALF_SIZE, 0, -GUIDE_HALF_SIZE],
          [GUIDE_HALF_SIZE, 0, -GUIDE_HALF_SIZE],
          [GUIDE_HALF_SIZE, 0, GUIDE_HALF_SIZE],
          [-GUIDE_HALF_SIZE, 0, GUIDE_HALF_SIZE],
          [-GUIDE_HALF_SIZE, 0, -GUIDE_HALF_SIZE],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />
      <Line
        points={[
          [-GUIDE_HALF_SIZE, 0, 0],
          [GUIDE_HALF_SIZE, 0, 0],
        ]}
        color={lineColor}
        lineWidth={1}
      />
      <Line
        points={[
          [0, 0, -GUIDE_HALF_SIZE],
          [0, 0, GUIDE_HALF_SIZE],
        ]}
        color={lineColor}
        lineWidth={1}
      />
    </group>
  )
}
