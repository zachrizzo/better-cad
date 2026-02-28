import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { WallElement } from '../../services/kernel-bridge'
import { isWallElement, useEntityStore } from '../../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { cleanupWalls } from '../../services/wall-cleanup'

const WALL_SNAP_DISTANCE = 0.35
const WALL_EDGE_SNAP_DISTANCE = 0.25
const MIN_WALL_LENGTH = 0.2

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>
type SnapType = 'endpoint' | 'edge'
interface SnapResult {
  point: Point2
  type: SnapType
}

function applyOrthoConstraint(start: Point2, end: Point2): Point2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [end[0], start[1]]
  }
  return [start[0], end[1]]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function projectPointOntoSegment(
  point: Point2,
  segStart: Point2,
  segEnd: Point2,
): { projection: Point2; distance: number; t: number } {
  const dx = segEnd[0] - segStart[0]
  const dz = segEnd[1] - segStart[1]
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-12) {
    return { projection: segStart, distance: Math.hypot(point[0] - segStart[0], point[1] - segStart[1]), t: 0 }
  }
  const t = clamp(((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dz) / lenSq, 0, 1)
  const projection: Point2 = [segStart[0] + t * dx, segStart[1] + t * dz]
  const distance = Math.hypot(point[0] - projection[0], point[1] - projection[1])
  return { projection, distance, t }
}

export function WallPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const pendingWallStart = useBimStore((s) => s.pendingWallStart)
  const setPendingWallStart = useBimStore((s) => s.setPendingWallStart)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)

  const planeRef = useRef<THREE.Mesh>(null)
  const [previewEnd, setPreviewEnd] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<SnapResult | null>(null)

  const wallElements = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )

  const getConstrainedPoint = useCallback((rawPoint: Point2, shiftKey: boolean) => {
    let point = rawPoint
    if (pendingWallStart && shiftKey) {
      point = applyOrthoConstraint(pendingWallStart, point)
    }

    // Phase 1: Endpoint snap (higher priority)
    let nearestEndpoint: Point2 | null = null
    let nearestEndpointDist = Infinity
    for (const wall of wallElements) {
      for (const ep of [wall.start, wall.end] as Point2[]) {
        const d = Math.hypot(point[0] - ep[0], point[1] - ep[1])
        if (d < nearestEndpointDist) {
          nearestEndpointDist = d
          nearestEndpoint = ep
        }
      }
    }
    if (nearestEndpoint && nearestEndpointDist <= WALL_SNAP_DISTANCE) {
      return { point: nearestEndpoint, snap: { point: nearestEndpoint, type: 'endpoint' as SnapType } }
    }

    // Phase 2: Edge snap (lower priority)
    let nearestEdge: Point2 | null = null
    let nearestEdgeDist = Infinity
    for (const wall of wallElements) {
      const { projection, distance, t } = projectPointOntoSegment(point, wall.start, wall.end)
      // Skip projections near segment endpoints — those are effectively endpoint snaps
      if (t < 0.01 || t > 0.99) continue
      if (distance < nearestEdgeDist) {
        nearestEdgeDist = distance
        nearestEdge = projection
      }
    }
    if (nearestEdge && nearestEdgeDist <= WALL_EDGE_SNAP_DISTANCE) {
      return { point: nearestEdge, snap: { point: nearestEdge, type: 'edge' as SnapType } }
    }

    return { point, snap: null }
  }, [pendingWallStart, wallElements])

  useEffect(() => {
    if (activeTool !== 'wall') {
      setPendingWallStart(null)
      setPreviewEnd(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setPendingWallStart, setToolReadout])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'wall') return
    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point, snap } = getConstrainedPoint(rawPoint, e.shiftKey)
    setCursorPoint(point)
    setSnapMarker(snap)
    setMeasurementCursor([point[0], 0, point[1]])

    const snapLabel = snap ? ` SNAP:${snap.type}` : ''
    if (pendingWallStart) {
      const length = Math.hypot(point[0] - pendingWallStart[0], point[1] - pendingWallStart[1])
      setToolReadout(
        `Wall L:${formatLength(length, lengthUnit)} H:${formatLength(defaultWallHeight, lengthUnit)} T:${formatLength(defaultWallThickness, lengthUnit)}${snapLabel}`,
      )
      setPreviewEnd(point)
    } else {
      setToolReadout(
        `Wall defaults H:${formatLength(defaultWallHeight, lengthUnit)} T:${formatLength(defaultWallThickness, lengthUnit)} • pick start`,
      )
    }
  }, [
    activeTool,
    defaultWallHeight,
    defaultWallThickness,
    getConstrainedPoint,
    lengthUnit,
    pendingWallStart,
    setMeasurementCursor,
    setToolReadout,
  ])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setPendingWallStart(null)
    setPreviewEnd(null)
    setToolReadout('Wall chain ended')
  }, [setPendingWallStart, setToolReadout])

  const handleClick = (e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'wall') return

    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point } = getConstrainedPoint(rawPoint, e.shiftKey)
    const [x, z] = point
    setCursorPoint(point)
    setMeasurementCursor([x, 0, z])

    if (!pendingWallStart) {
      setPendingWallStart(point)
      setPreviewEnd(point)
      setToolReadout(`Wall start X:${formatLength(x, lengthUnit)} Z:${formatLength(z, lengthUnit)}`)
      return
    }

    const [sx, sz] = pendingWallStart
    const wallLength = Math.hypot(x - sx, z - sz)
    if (wallLength < MIN_WALL_LENGTH) {
      setPreviewEnd(point)
      return
    }

    const wallId = `wall-${crypto.randomUUID()}`
    const wallElement: WallElement = {
      kind: 'wall',
      meta: {
        id: wallId,
        name: `Wall ${wallElements.length + 1}`,
      },
      start: [sx, sz],
      end: [x, z],
      height: defaultWallHeight,
      thickness: defaultWallThickness,
    }

    // Keep command active for chained walls.
    setPendingWallStart(point)
    setPreviewEnd(point)
    setToolReadout(
      `Wall placed L:${formatLength(wallLength, lengthUnit)} H:${formatLength(defaultWallHeight, lengthUnit)} T:${formatLength(defaultWallThickness, lengthUnit)}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; wall entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(wallElement)
        await syncEntitiesAndRegenerateMeshes(kernel)

        // Run wall cleanup to handle T-junctions, L-junctions, and overlaps
        const allWalls = Array.from(useEntityStore.getState().elements.values()).filter(isWallElement)
        const result = cleanupWalls(allWalls)
        if (result.modified.length || result.created.length || result.deleted.length) {
          for (const w of result.modified) {
            await kernel.updateElement(w.meta.id, w)
          }
          for (const w of result.created) {
            await kernel.createElement(w)
          }
          for (const id of result.deleted) {
            await kernel.deleteElement(id)
          }
          await syncEntitiesAndRegenerateMeshes(kernel)
        }
      } catch (err) {
        console.error('[BetterCAD] Failed to create wall entity:', err)
      }
    })()
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

  const previewLength = pendingWallStart && previewEnd
    ? Math.hypot(previewEnd[0] - pendingWallStart[0], previewEnd[1] - pendingWallStart[1])
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

      {cursorPoint && (
        <mesh position={[cursorPoint[0], 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={snapMarker ? (snapMarker.type === 'endpoint' ? '#00ff88' : '#00ccff') : '#ffaa00'} />
        </mesh>
      )}

      {pendingWallStart && previewEnd && (
        <>
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
          {previewLength !== null && (
            <Html
              position={[
                (pendingWallStart[0] + previewEnd[0]) / 2,
                0.2,
                (pendingWallStart[1] + previewEnd[1]) / 2,
              ]}
              center
            >
              <div className="measurement-badge">{formatLength(previewLength, lengthUnit)}</div>
            </Html>
          )}
        </>
      )}

      {previewFootprint && (
        <Line
          points={previewFootprint}
          color="#ffcc66"
          lineWidth={1}
        />
      )}

      {pendingWallStart && (
        <mesh position={[pendingWallStart[0], 0.05, pendingWallStart[1]]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {snapMarker && snapMarker.type === 'endpoint' && (
        <mesh position={[snapMarker.point[0], 0.05, snapMarker.point[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}
      {snapMarker && snapMarker.type === 'edge' && (
        <mesh position={[snapMarker.point[0], 0.05, snapMarker.point[1]]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <ringGeometry args={[0.1, 0.14, 4]} />
          <meshBasicMaterial color="#00ccff" side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}
