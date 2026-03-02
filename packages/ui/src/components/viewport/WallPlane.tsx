import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useLevelStore } from '../../stores/level-store'
import { useActiveDrawingSurface } from '../../hooks/useActiveDrawingSurface'
import { formatLength } from '../../utils/units'
import type { FloorElement, WallElement } from '../../services/kernel-bridge'
import { isFloorElement, isWallElement, useEntityStore } from '../../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { cleanupWalls } from '../../services/wall-cleanup'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'

const WALL_SNAP_DISTANCE = 0.35
const WALL_EDGE_SNAP_DISTANCE = 0.25
const WALL_MESH_SNAP_DISTANCE = 0.2
const WALL_EDGE_ENDPOINT_GUARD_DISTANCE = 0.3
const WALL_INTERIOR_POINT_TOLERANCE = 0.03
const MIN_WALL_LENGTH = 0.2
const INTERSECTION_EPS = 1e-6
const ENDPOINT_PARAM_EPS = 1e-3
const FOUNDATION_SNAP_DISTANCE = 0.35
const FOUNDATION_CONTAINMENT_EPS = 0.02
const FOUNDATION_SEGMENT_SAMPLE_SPACING = 0.2

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>
type SnapType = 'endpoint' | 'edge' | 'mesh' | 'foundation'
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

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

function isEndpointParam(t: number): boolean {
  return t <= ENDPOINT_PARAM_EPS || t >= 1 - ENDPOINT_PARAM_EPS
}

type SegmentIntersection =
  | { kind: 'none' }
  | { kind: 'point'; t: number; u: number }
  | { kind: 'overlap'; tStart: number; tEnd: number }

function segmentIntersection(startA: Point2, endA: Point2, startB: Point2, endB: Point2): SegmentIntersection {
  const rX = endA[0] - startA[0]
  const rY = endA[1] - startA[1]
  const sX = endB[0] - startB[0]
  const sY = endB[1] - startB[1]
  const denom = cross2(rX, rY, sX, sY)
  const qpx = startB[0] - startA[0]
  const qpy = startB[1] - startA[1]
  const qpxr = cross2(qpx, qpy, rX, rY)

  if (Math.abs(denom) < INTERSECTION_EPS) {
    if (Math.abs(qpxr) >= INTERSECTION_EPS) {
      return { kind: 'none' }
    }

    // Collinear case: compute overlap in A's segment parameter space.
    const rLenSq = rX * rX + rY * rY
    if (rLenSq < INTERSECTION_EPS) return { kind: 'none' }
    const t0 = ((startB[0] - startA[0]) * rX + (startB[1] - startA[1]) * rY) / rLenSq
    const t1 = ((endB[0] - startA[0]) * rX + (endB[1] - startA[1]) * rY) / rLenSq
    const tMin = Math.max(0, Math.min(t0, t1))
    const tMax = Math.min(1, Math.max(t0, t1))
    if (tMax < tMin - INTERSECTION_EPS) return { kind: 'none' }
    return { kind: 'overlap', tStart: tMin, tEnd: tMax }
  }

  const t = cross2(qpx, qpy, sX, sY) / denom
  const u = cross2(qpx, qpy, rX, rY) / denom
  const tOnSeg = t >= -INTERSECTION_EPS && t <= 1 + INTERSECTION_EPS
  const uOnSeg = u >= -INTERSECTION_EPS && u <= 1 + INTERSECTION_EPS
  if (!tOnSeg || !uOnSeg) return { kind: 'none' }
  return { kind: 'point', t: clamp(t, 0, 1), u: clamp(u, 0, 1) }
}

function wallSegmentPassesThroughExistingWalls(start: Point2, end: Point2, walls: WallElement[]): boolean {
  for (const wall of walls) {
    const hit = segmentIntersection(start, end, wall.start, wall.end)
    if (hit.kind === 'none') continue

    if (hit.kind === 'point') {
      // Allow valid joints: if the intersection is at an endpoint of either segment.
      if (isEndpointParam(hit.t) || isEndpointParam(hit.u)) continue
      return true
    }

    // Collinear overlap: allow touching only at one endpoint, reject true overlap.
    if (hit.tEnd - hit.tStart > ENDPOINT_PARAM_EPS) {
      return true
    }
  }
  return false
}

function isPointOnBoundary(point: Point2, boundary: Point2[], tolerance = FOUNDATION_CONTAINMENT_EPS): boolean {
  if (boundary.length < 2) return false
  for (let i = 0; i < boundary.length; i += 1) {
    const a = boundary[i]
    const b = boundary[(i + 1) % boundary.length]
    const { distance } = projectPointOntoSegment(point, a, b)
    if (distance <= tolerance) return true
  }
  return false
}

function isPointInPolygon(point: Point2, boundary: Point2[]): boolean {
  if (boundary.length < 3) return false
  let inside = false
  const px = point[0]
  const pz = point[1]

  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i, i += 1) {
    const xi = boundary[i][0]
    const zi = boundary[i][1]
    const xj = boundary[j][0]
    const zj = boundary[j][1]
    const intersects = ((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / ((zj - zi) || 1e-12) + xi)
    if (intersects) inside = !inside
  }

  return inside
}

function isPointOnOrInsideFoundations(point: Point2, foundations: FloorElement[]): boolean {
  for (const foundation of foundations) {
    const boundary = foundation.boundary as Point2[]
    if (boundary.length < 3) continue
    if (isPointOnBoundary(point, boundary) || isPointInPolygon(point, boundary)) return true
  }
  return false
}

function wallSegmentRespectsFoundations(start: Point2, end: Point2, foundations: FloorElement[]): boolean {
  if (foundations.length === 0) return false
  if (!isPointOnOrInsideFoundations(start, foundations) || !isPointOnOrInsideFoundations(end, foundations)) {
    return false
  }

  const length = Math.hypot(end[0] - start[0], end[1] - start[1])
  const samples = Math.max(1, Math.ceil(length / FOUNDATION_SEGMENT_SAMPLE_SPACING))
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples
    const sample: Point2 = [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ]
    if (!isPointOnOrInsideFoundations(sample, foundations)) {
      return false
    }
  }
  return true
}

function isPointNearWallInterior(point: Point2, walls: WallElement[]): boolean {
  for (const wall of walls) {
    const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    if (wallLength < 1e-6) continue

    const { distance, t } = projectPointOntoSegment(point, wall.start, wall.end)
    if (distance > WALL_INTERIOR_POINT_TOLERANCE) continue

    const nearestEndpointDistance = Math.min(t * wallLength, (1 - t) * wallLength)
    if (nearestEndpointDistance >= WALL_EDGE_ENDPOINT_GUARD_DISTANCE) {
      return true
    }
  }
  return false
}

function getFoundationSnap(point: Point2, foundations: FloorElement[]): SnapResult | null {
  let nearestCorner: Point2 | null = null
  let nearestCornerDist = Infinity

  let nearestEdge: Point2 | null = null
  let nearestEdgeDist = Infinity

  for (const foundation of foundations) {
    const boundary = foundation.boundary as Point2[]
    if (boundary.length < 2) continue

    for (let i = 0; i < boundary.length; i += 1) {
      const corner = boundary[i]
      const d = Math.hypot(point[0] - corner[0], point[1] - corner[1])
      if (d < nearestCornerDist) {
        nearestCornerDist = d
        nearestCorner = corner
      }
    }

    for (let i = 0; i < boundary.length; i += 1) {
      const a = boundary[i]
      const b = boundary[(i + 1) % boundary.length]
      const { projection, distance } = projectPointOntoSegment(point, a, b)
      if (distance < nearestEdgeDist) {
        nearestEdgeDist = distance
        nearestEdge = projection
      }
    }
  }

  if (nearestCorner && nearestCornerDist <= FOUNDATION_SNAP_DISTANCE) {
    return { point: nearestCorner, type: 'foundation' }
  }

  if (nearestEdge && nearestEdgeDist <= FOUNDATION_SNAP_DISTANCE) {
    return { point: nearestEdge, type: 'foundation' }
  }

  return null
}

export function WallPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const pendingWallStart = useBimStore((s) => s.pendingWallStart)
  const setPendingWallStart = useBimStore((s) => s.setPendingWallStart)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const { activeSurfaceElevation } = useActiveDrawingSurface()

  const planeRef = useRef<THREE.Mesh>(null)
  const [previewEnd, setPreviewEnd] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<SnapResult | null>(null)

  const wallElements = useMemo(
    () => Array.from(elements.values()).filter(
      (el): el is WallElement => isWallElement(el) && (!el.meta.level_id || el.meta.level_id === activeLevelId),
    ),
    [activeLevelId, elements],
  )
  const foundationElements = useMemo(
    () => Array.from(elements.values()).filter(
      (el): el is FloorElement => (
        isFloorElement(el)
        && el.meta.type_id === 'foundation'
        && (!el.meta.level_id || el.meta.level_id === activeLevelId)
      ),
    ),
    [activeLevelId, elements],
  )
  const planSnapPoints = usePlanSnapPoints()

  const getConstrainedPoint = useCallback((rawPoint: Point2, shiftKey: boolean) => {
    let point = rawPoint
    if (pendingWallStart && shiftKey) {
      point = applyOrthoConstraint(pendingWallStart, point)
    }

    const foundationSnap = getFoundationSnap(point, foundationElements)

    if (!snapEnabled) {
      return foundationSnap
        ? { point: foundationSnap.point, snap: foundationSnap }
        : { point, snap: null }
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

    // Phase 2: Foundation snap (required support context)
    if (foundationSnap) {
      return { point: foundationSnap.point, snap: foundationSnap }
    }

    // Phase 3: Edge snap (lower priority)
    let nearestEdge: Point2 | null = null
    let nearestEdgeDist = Infinity
    for (const wall of wallElements) {
      const { projection, distance, t } = projectPointOntoSegment(point, wall.start, wall.end)
      const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      if (wallLength < 1e-6) continue
      // Keep a guard zone near wall ends so endpoint snaps win consistently.
      const nearestEndpointDistance = Math.min(t * wallLength, (1 - t) * wallLength)
      if (nearestEndpointDistance < WALL_EDGE_ENDPOINT_GUARD_DISTANCE) continue
      if (distance < nearestEdgeDist) {
        nearestEdgeDist = distance
        nearestEdge = projection
      }
    }
    if (nearestEdge && nearestEdgeDist <= WALL_EDGE_SNAP_DISTANCE) {
      return { point: nearestEdge, snap: { point: nearestEdge, type: 'edge' as SnapType } }
    }

    // Phase 4: mesh / generic geometry snap fallback.
    const { point: meshPoint, snapped } = snapPlanPoint(point, planSnapPoints, snapEnabled, WALL_MESH_SNAP_DISTANCE)
    if (snapped && !isPointNearWallInterior(meshPoint, wallElements)) {
      return { point: meshPoint, snap: { point: meshPoint, type: 'mesh' as SnapType } }
    }

    return { point, snap: null }
  }, [foundationElements, pendingWallStart, planSnapPoints, snapEnabled, wallElements])

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
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])

    const snapLabel = snap ? ` SNAP:${snap.type}` : ''
    const hasFoundation = foundationElements.length > 0
    if (pendingWallStart) {
      const length = Math.hypot(point[0] - pendingWallStart[0], point[1] - pendingWallStart[1])
      const blockedByFoundation = hasFoundation
        ? !wallSegmentRespectsFoundations(pendingWallStart, point, foundationElements)
        : true
      const blocked = wallSegmentPassesThroughExistingWalls(pendingWallStart, point, wallElements)
      setToolReadout(
        !hasFoundation
          ? 'Create a foundation on this level before drawing walls.'
          : blockedByFoundation
            ? 'Wall must stay on foundation. Snap to foundation edge/corner.'
            : blocked
              ? 'Wall blocked: cannot pass through existing wall. End at a snap/junction.'
              : `Wall L:${formatLength(length, lengthUnit)} H:${formatLength(defaultWallHeight, lengthUnit)} T:${formatLength(defaultWallThickness, lengthUnit)}${snapLabel}`,
      )
      setPreviewEnd(point)
    } else {
      setToolReadout(
        hasFoundation
          ? `Wall defaults H:${formatLength(defaultWallHeight, lengthUnit)} T:${formatLength(defaultWallThickness, lengthUnit)} • pick start`
          : 'Create a foundation on this level before drawing walls.',
      )
    }
  }, [
    activeSurfaceElevation,
    activeTool,
    defaultWallHeight,
    defaultWallThickness,
    foundationElements,
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
    setMeasurementCursor([x, activeSurfaceElevation, z])

    if (foundationElements.length === 0) {
      setToolReadout('Create a foundation on this level before drawing walls.')
      return
    }

    if (!pendingWallStart) {
      if (!isPointOnOrInsideFoundations(point, foundationElements)) {
        setToolReadout('Wall start must be on a foundation.')
        return
      }
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

    if (!wallSegmentRespectsFoundations(pendingWallStart, point, foundationElements)) {
      setPreviewEnd(point)
      setToolReadout('Wall must stay on foundation. Snap to foundation edge/corner.')
      return
    }

    if (wallSegmentPassesThroughExistingWalls(pendingWallStart, point, wallElements)) {
      setPreviewEnd(point)
      setToolReadout('Wall blocked: cannot pass through existing wall. End at a snap/junction.')
      return
    }

    const wallId = `wall-${crypto.randomUUID()}`
    const wallElement: WallElement = {
      kind: 'wall',
      meta: {
        id: wallId,
        name: `Wall ${wallElements.length + 1}`,
        level_id: activeLevelId,
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
        const levelWalls = Array.from(useEntityStore.getState().elements.values()).filter(
          (el): el is WallElement => isWallElement(el) && (!el.meta.level_id || el.meta.level_id === activeLevelId),
        )
        const result = cleanupWalls(levelWalls)
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
        [sx + nx, activeSurfaceElevation + 0.03, sz + nz],
        [sx - nx, activeSurfaceElevation + 0.03, sz - nz],
        [ex - nx, activeSurfaceElevation + 0.03, ez - nz],
        [ex + nx, activeSurfaceElevation + 0.03, ez + nz],
        [sx + nx, activeSurfaceElevation + 0.03, sz + nz],
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
        position={[0, activeSurfaceElevation, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], activeSurfaceElevation + 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial
            color={
              snapMarker
                ? (snapMarker.type === 'endpoint'
                  ? '#00ff88'
                  : snapMarker.type === 'foundation'
                    ? '#22c55e'
                  : snapMarker.type === 'edge'
                    ? '#00ccff'
                    : '#bb86fc')
                : '#ffaa00'
            }
          />
        </mesh>
      )}

      {pendingWallStart && previewEnd && (
        <>
          <Line
            points={[
              [pendingWallStart[0], activeSurfaceElevation + 0.05, pendingWallStart[1]],
              [previewEnd[0], activeSurfaceElevation + 0.05, previewEnd[1]],
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
                activeSurfaceElevation + 0.2,
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
        <mesh position={[pendingWallStart[0], activeSurfaceElevation + 0.05, pendingWallStart[1]]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {snapMarker && snapMarker.type === 'endpoint' && (
        <mesh position={[snapMarker.point[0], activeSurfaceElevation + 0.05, snapMarker.point[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}
      {snapMarker && snapMarker.type === 'edge' && (
        <mesh position={[snapMarker.point[0], activeSurfaceElevation + 0.05, snapMarker.point[1]]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <ringGeometry args={[0.1, 0.14, 4]} />
          <meshBasicMaterial color="#00ccff" side={THREE.DoubleSide} />
        </mesh>
      )}
      {snapMarker && snapMarker.type === 'foundation' && (
        <mesh position={[snapMarker.point[0], activeSurfaceElevation + 0.05, snapMarker.point[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.14, 8]} />
          <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} />
        </mesh>
      )}
      {snapMarker && snapMarker.type === 'mesh' && (
        <mesh position={[snapMarker.point[0], activeSurfaceElevation + 0.05, snapMarker.point[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.08, 0.12, 6]} />
          <meshBasicMaterial color="#bb86fc" side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}
