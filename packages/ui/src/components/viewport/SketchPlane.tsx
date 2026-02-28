import { useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useSketchStore } from '../../stores/sketch-store'
import { useBimStore } from '../../stores/bim-store'
import { useDocumentStore } from '../../stores/document-store'
import { useKernel } from '../../hooks/useKernel'
import { extrudeSketchProfile } from '../../utils/sketch-extrude'

const MIN_RECT_SIDE = 1e-5

export function SketchPlane() {
  const {
    active,
    pendingPoint,
    setPendingPoint,
    addPoint,
    addLine,
    addProfile,
    setPreviewPoint,
  } = useSketchStore()
  const autoExtrudeSketch = useBimStore((s) => s.autoExtrudeSketch)
  const sketchExtrudeMode = useBimStore((s) => s.sketchExtrudeMode)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const addWall = useBimStore((s) => s.addWall)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const { kernel, ready } = useKernel()
  const planeRef = useRef<THREE.Mesh>(null)
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null)

  const handlePointerMove = useCallback((e: { point?: THREE.Vector3 }) => {
    if (!active) return
    const point = e.point as THREE.Vector3
    if (!point) return
    const preview: [number, number] = [point.x, point.z]
    setHoverPoint(preview)
    setPreviewPoint(preview)
  }, [active, setPreviewPoint])

  const handlePointerLeave = useCallback(() => {
    setHoverPoint(null)
    setPreviewPoint(null)
  }, [setPreviewPoint])

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (!active) return
    const point = e.point as THREE.Vector3
    if (!point) return

    const x = point.x
    const z = point.z // in XZ plane, Z maps to sketch Y
    const current: [number, number] = [x, z]
    setHoverPoint(current)
    setPreviewPoint(current)

    if (!pendingPoint) {
      // First corner of rectangle
      setPendingPoint({ id: 'p-corner-a', x, y: z })
    } else {
      // Second corner - build rectangle
      const ax = pendingPoint.x, ay = pendingPoint.y
      const bx = x, by = z

      if (Math.abs(bx - ax) < MIN_RECT_SIDE || Math.abs(by - ay) < MIN_RECT_SIDE) {
        setPendingPoint(null)
        return
      }

      const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      const p0 = `p-${uid}-0`
      const p1 = `p-${uid}-1`
      const p2 = `p-${uid}-2`
      const p3 = `p-${uid}-3`
      const profileId = `sketch-${uid}`
      const profilePoints: [number, number][] = [
        [ax, ay],
        [bx, ay],
        [bx, by],
        [ax, by],
      ]

      addPoint(p0, ax, ay)
      addPoint(p1, bx, ay)
      addPoint(p2, bx, by)
      addPoint(p3, ax, by)

      addLine(`l-${uid}-0`, p0, p1)
      addLine(`l-${uid}-1`, p1, p2)
      addLine(`l-${uid}-2`, p2, p3)
      addLine(`l-${uid}-3`, p3, p0)
      addProfile({ id: profileId, points: profilePoints })

      if (autoExtrudeSketch) {
        void extrudeSketchProfile({
          profile: { id: profileId, points: profilePoints },
          mode: sketchExtrudeMode,
          height: defaultWallHeight,
          thickness: defaultWallThickness,
          kernel,
          ready,
          addCadMesh,
          addWall,
        }).catch((err) => {
          console.error('[BetterCAD] Auto-extrude sketch failed:', err)
        })
      }

      setPendingPoint(null)
    }
  }

  if (!active) return null

  const previewCorners = pendingPoint && hoverPoint
    ? {
      ax: pendingPoint.x,
      ay: pendingPoint.y,
      bx: hoverPoint[0],
      by: hoverPoint[1],
    }
    : null

  return (
    <>
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {hoverPoint && (
        <mesh position={[hoverPoint[0], 0.05, hoverPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#00d4ff" />
        </mesh>
      )}

      {pendingPoint && (
        <mesh position={[pendingPoint.x, 0.05, pendingPoint.y]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {previewCorners && (
        <Line
          points={[
            [previewCorners.ax, 0.03, previewCorners.ay],
            [previewCorners.bx, 0.03, previewCorners.ay],
            [previewCorners.bx, 0.03, previewCorners.by],
            [previewCorners.ax, 0.03, previewCorners.by],
            [previewCorners.ax, 0.03, previewCorners.ay],
          ]}
          color="#00d4ff"
          lineWidth={2}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}
    </>
  )
}
