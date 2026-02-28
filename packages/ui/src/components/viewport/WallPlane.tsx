import { useRef } from 'react'
import * as THREE from 'three'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useDocumentStore } from '../../stores/document-store'
import { useKernel } from '../../hooks/useKernel'

const DEFAULT_WALL_HEIGHT = 3.0
const DEFAULT_WALL_THICKNESS = 0.2

export function WallPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const pendingWallStart = useBimStore((s) => s.pendingWallStart)
  const setPendingWallStart = useBimStore((s) => s.setPendingWallStart)
  const addWall = useBimStore((s) => s.addWall)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const { kernel, ready } = useKernel()
  const planeRef = useRef<THREE.Mesh>(null)

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'wall') return
    const point = e.point as THREE.Vector3
    if (!point) return

    const x = point.x
    const z = point.z

    if (!pendingWallStart) {
      setPendingWallStart([x, z])
    } else {
      const [sx, sz] = pendingWallStart
      const wallId = `wall-${Date.now()}`

      addWall({
        id: wallId,
        start: [sx, sz],
        end: [x, z],
        height: DEFAULT_WALL_HEIGHT,
        thickness: DEFAULT_WALL_THICKNESS,
      })

      if (ready && kernel) {
        kernel
          .addWall(sx, sz, x, z, DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS)
          .then((mesh) => {
            if (mesh.positions.length > 0) {
              addCadMesh(wallId, mesh)
            }
          })
          .catch((err) => console.error('[BetterCAD] addWall failed:', err))
      }

      setPendingWallStart(null)
    }
  }

  if (activeTool !== 'wall') return null

  return (
    <mesh
      ref={planeRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onClick={handleClick}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  )
}
