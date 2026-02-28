import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useDocumentStore } from '../../stores/document-store'
import { useKernel } from '../../hooks/useKernel'
import { mapKernelPlanMeshToScene } from '../../utils/mesh-coordinates'

const WALL_SNAP_DISTANCE = 0.35
const MIN_WALL_LENGTH = 0.2

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>

function applyOrthoConstraint(start: Point2, end: Point2): Point2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [end[0], start[1]]
  }
  return [start[0], end[1]]
}

export function WallPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const walls = useBimStore((s) => s.walls)
  const pendingWallStart = useBimStore((s) => s.pendingWallStart)
  const setPendingWallStart = useBimStore((s) => s.setPendingWallStart)
  const addWall = useBimStore((s) => s.addWall)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const { kernel, ready } = useKernel()
  const planeRef = useRef<THREE.Mesh>(null)
  const [previewEnd, setPreviewEnd] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)

  const snapPoints = useMemo<Point2[]>(() => {
    const points: Point2[] = []
    walls.forEach((wall) => {
      points.push(wall.start, wall.end)
    })
    return points
  }, [walls])

  const getConstrainedPoint = useCallback((rawPoint: Point2, shiftKey: boolean) => {
    let point = rawPoint
    if (pendingWallStart && shiftKey) {
      point = applyOrthoConstraint(pendingWallStart, point)
    }

    let snappedPoint: Point2 | null = null
    let nearestDistance = Infinity
    for (const candidate of snapPoints) {
      const distance = Math.hypot(point[0] - candidate[0], point[1] - candidate[1])
      if (distance < nearestDistance) {
        nearestDistance = distance
        snappedPoint = candidate
      }
    }
    if (snappedPoint && nearestDistance <= WALL_SNAP_DISTANCE) {
      return { point: snappedPoint, snappedPoint }
    }
    return { point, snappedPoint: null }
  }, [pendingWallStart, snapPoints])

  useEffect(() => {
    if (activeTool !== 'wall') {
      setPendingWallStart(null)
      setPreviewEnd(null)
      setCursorPoint(null)
      setSnapMarker(null)
    }
  }, [activeTool, setPendingWallStart])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'wall') return
    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point, snappedPoint } = getConstrainedPoint(rawPoint, e.shiftKey)
    setCursorPoint(point)
    setSnapMarker(snappedPoint)
    if (pendingWallStart) {
      setPreviewEnd(point)
    }
  }, [activeTool, getConstrainedPoint, pendingWallStart])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
  }, [])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setPendingWallStart(null)
    setPreviewEnd(null)
  }, [setPendingWallStart])

  const handleClick = (e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'wall') return
    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point } = getConstrainedPoint(rawPoint, e.shiftKey)
    const [x, z] = point
    setCursorPoint(point)

    if (!pendingWallStart) {
      setPendingWallStart(point)
      setPreviewEnd(point)
    } else {
      const [sx, sz] = pendingWallStart
      const wallLength = Math.hypot(x - sx, z - sz)
      if (wallLength < MIN_WALL_LENGTH) {
        setPreviewEnd(point)
        return
      }
      const wallId = `wall-${Date.now()}`

      addWall({
        id: wallId,
        start: [sx, sz],
        end: [x, z],
        height: defaultWallHeight,
        thickness: defaultWallThickness,
      })

      if (ready && kernel) {
        kernel
          .addWall(sx, -sz, x, -z, defaultWallHeight, defaultWallThickness)
          .then((mesh) => {
            if (mesh.positions.length > 0) {
              addCadMesh(wallId, mapKernelPlanMeshToScene(mesh))
            } else {
              console.warn('[BetterCAD] addWall returned empty mesh for', wallId)
            }
          })
          .catch((err) => console.error('[BetterCAD] addWall failed:', err))
      } else {
        console.warn('[BetterCAD] Kernel not ready — wall stored in BIM but no 3D mesh generated')
      }

      // Keep command active for chained walls (common CAD workflow).
      setPendingWallStart(point)
      setPreviewEnd(point)
    }
  }

  if (activeTool !== 'wall') return null

  const previewFootprint = pendingWallStart && previewEnd
    ? (() => {
      const [sx, sz] = pendingWallStart
      const [ex, ez] = previewEnd
      const dx = ex - sx
      const dz = ez - sz
      const len = Math.hypot(dx, dz)
      if (len < 1e-6) return null
      const nx = -dz / len * (defaultWallThickness / 2)
      const nz = dx / len * (defaultWallThickness / 2)
      return [
        [sx + nx, 0.03, sz + nz],
        [sx - nx, 0.03, sz - nz],
        [ex - nx, 0.03, ez - nz],
        [ex + nx, 0.03, ez + nz],
        [sx + nx, 0.03, sz + nz],
      ] as [number, number, number][]
    })()
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
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Cursor indicator */}
      {cursorPoint && (
        <mesh position={[cursorPoint[0], 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#ffaa00'} />
        </mesh>
      )}

      {/* Preview line from first click to cursor */}
      {pendingWallStart && previewEnd && (
        <Line
          points={[
            [pendingWallStart[0], 0.05, pendingWallStart[1]],
            [previewEnd[0], 0.05, previewEnd[1]],
          ]}
          color="#ffaa00"
          lineWidth={2}
          dashed
          dashSize={0.3}
          gapSize={0.15}
        />
      )}

      {/* Preview wall thickness footprint */}
      {previewFootprint && (
        <Line
          points={previewFootprint}
          color="#ffcc66"
          lineWidth={1}
        />
      )}

      {/* Start point indicator */}
      {pendingWallStart && (
        <mesh position={[pendingWallStart[0], 0.05, pendingWallStart[1]]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {/* Snap target indicator */}
      {snapMarker && (
        <mesh position={[snapMarker[0], 0.05, snapMarker[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}
