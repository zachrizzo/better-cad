import { useMemo } from 'react'
import { type CadMeshData, useDocumentStore } from '../stores/document-store'
import { type Level, useLevelStore } from '../stores/level-store'
import {
  isBeamElement,
  isColumnElement,
  isDimensionElement,
  isFloorElement,
  isRoofElement,
  isRoomElement,
  isStairElement,
  isTextAnnotationElement,
  isWallElement,
  useEntityStore,
} from '../stores/entity-store'
import type { PrototypeElement } from '../services/kernel-bridge'

type Point2 = [number, number]

const SNAP_POINT_PRECISION = 0.01
const EDGE_SAMPLE_SPACING = 0.25
const MAX_EDGE_SAMPLES_PER_EDGE = 16
const MAX_MESH_POINTS_PER_MESH = 12000
const MAX_MESH_EDGES_PER_MESH = 40000

let snapCache:
  | {
    elementsRef: Map<string, PrototypeElement>
    cadMeshesRef: Map<string, CadMeshData>
    levelsRef: Level[]
    points: Point2[]
  }
  | null = null

function quantize(value: number): number {
  return Math.round(value / SNAP_POINT_PRECISION) * SNAP_POINT_PRECISION
}

function addSnapPoint(bucket: Map<string, Point2>, x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false
  const qx = quantize(x)
  const qz = quantize(z)
  const key = `${qx}:${qz}`
  if (!bucket.has(key)) {
    bucket.set(key, [qx, qz])
    return true
  }
  return false
}

function collectElementSnapPoints(
  elements: Iterable<PrototypeElement>,
  bucket: Map<string, Point2>,
  hiddenLevelIds: Set<string>,
) {
  for (const element of elements) {
    const levelId = element.meta.level_id
    if (levelId && hiddenLevelIds.has(levelId)) continue

    if (isWallElement(element)) {
      addSnapPoint(bucket, element.start[0], element.start[1])
      addSnapPoint(bucket, element.end[0], element.end[1])
      continue
    }
    if (isFloorElement(element) || isRoofElement(element) || isRoomElement(element)) {
      for (const [x, z] of element.boundary) {
        addSnapPoint(bucket, x, z)
      }
      continue
    }
    if (isStairElement(element)) {
      addSnapPoint(bucket, element.start[0], element.start[1])
      addSnapPoint(bucket, element.end[0], element.end[1])
      continue
    }
    if (isColumnElement(element)) {
      addSnapPoint(bucket, element.center[0], element.center[1])
      continue
    }
    if (isBeamElement(element)) {
      // Beam XY in kernel maps to XZ in scene placement tools.
      addSnapPoint(bucket, element.start[0], element.start[1])
      addSnapPoint(bucket, element.end[0], element.end[1])
      continue
    }
    if (isDimensionElement(element)) {
      addSnapPoint(bucket, element.p1[0], element.p1[1])
      addSnapPoint(bucket, element.p2[0], element.p2[1])
      continue
    }
    if (isTextAnnotationElement(element)) {
      addSnapPoint(bucket, element.position[0], element.position[1])
      continue
    }
  }
}

function collectUniqueMeshEdges(
  indices: Uint32Array,
  vertexCount: number,
): Array<[number, number]> {
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()

  const pushEdge = (a: number, b: number) => {
    if (a === b || a < 0 || b < 0 || a >= vertexCount || b >= vertexCount) return
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const key = `${lo}:${hi}`
    if (seen.has(key)) return
    if (seen.size >= MAX_MESH_EDGES_PER_MESH) return
    seen.add(key)
    edges.push([lo, hi])
  }

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    pushEdge(a, b)
    pushEdge(b, c)
    pushEdge(c, a)
  }

  return edges
}

function collectMeshSnapPoints(
  meshes: Iterable<Pick<CadMeshData, 'positions' | 'indices'>>,
  bucket: Map<string, Point2>,
) {
  for (const mesh of meshes) {
    const vertexCount = Math.floor(mesh.positions.length / 3)
    if (vertexCount <= 0) continue

    let pointsAdded = 0
    const vertexBudget = Math.floor(MAX_MESH_POINTS_PER_MESH * 0.55)
    const vertexStride = Math.max(1, Math.ceil(vertexCount / Math.max(1, vertexBudget)))

    for (let i = 0; i < vertexCount && pointsAdded < MAX_MESH_POINTS_PER_MESH; i += vertexStride) {
      const x = mesh.positions[i * 3]
      const z = mesh.positions[i * 3 + 2]
      if (addSnapPoint(bucket, x, z)) {
        pointsAdded += 1
      }
    }

    if (pointsAdded >= MAX_MESH_POINTS_PER_MESH) continue

    const edges = collectUniqueMeshEdges(mesh.indices, vertexCount)
    for (const [a, b] of edges) {
      if (pointsAdded >= MAX_MESH_POINTS_PER_MESH) break

      const ax = mesh.positions[a * 3]
      const az = mesh.positions[a * 3 + 2]
      const bx = mesh.positions[b * 3]
      const bz = mesh.positions[b * 3 + 2]

      if (addSnapPoint(bucket, ax, az)) pointsAdded += 1
      if (pointsAdded >= MAX_MESH_POINTS_PER_MESH) break
      if (addSnapPoint(bucket, bx, bz)) pointsAdded += 1
      if (pointsAdded >= MAX_MESH_POINTS_PER_MESH) break

      const edgeLength2D = Math.hypot(bx - ax, bz - az)
      if (!Number.isFinite(edgeLength2D) || edgeLength2D < EDGE_SAMPLE_SPACING * 0.75) continue

      const sampleCount = Math.min(MAX_EDGE_SAMPLES_PER_EDGE, Math.floor(edgeLength2D / EDGE_SAMPLE_SPACING))
      for (let s = 1; s <= sampleCount && pointsAdded < MAX_MESH_POINTS_PER_MESH; s += 1) {
        const t = s / (sampleCount + 1)
        const sx = ax + (bx - ax) * t
        const sz = az + (bz - az) * t
        if (addSnapPoint(bucket, sx, sz)) {
          pointsAdded += 1
        }
      }
    }
  }
}

export function usePlanSnapPoints(): Point2[] {
  const elements = useEntityStore((s) => s.elements)
  const cadMeshes = useDocumentStore((s) => s.cadMeshes)
  const levels = useLevelStore((s) => s.levels)

  return useMemo(() => {
    if (
      snapCache &&
      snapCache.elementsRef === elements &&
      snapCache.cadMeshesRef === cadMeshes &&
      snapCache.levelsRef === levels
    ) {
      return snapCache.points
    }

    const hiddenLevelIds = new Set(
      levels
        .filter((level) => level.visibility === 'hidden')
        .map((level) => level.id),
    )

    const bucket = new Map<string, Point2>()
    collectElementSnapPoints(elements.values(), bucket, hiddenLevelIds)

    const visibleMeshes: Array<Pick<CadMeshData, 'positions' | 'indices'>> = []
    for (const [meshId, mesh] of cadMeshes.entries()) {
      const levelId = elements.get(meshId)?.meta.level_id
      if (levelId && hiddenLevelIds.has(levelId)) continue
      visibleMeshes.push(mesh)
    }

    collectMeshSnapPoints(visibleMeshes, bucket)
    const points = Array.from(bucket.values())
    snapCache = {
      elementsRef: elements,
      cadMeshesRef: cadMeshes,
      levelsRef: levels,
      points,
    }
    return points
  }, [elements, cadMeshes, levels])
}

export function snapPlanPoint(
  raw: Point2,
  snapPoints: Point2[],
  enabled: boolean,
  threshold: number,
): { point: Point2; snapped: Point2 | null } {
  if (!enabled || snapPoints.length === 0) {
    return { point: raw, snapped: null }
  }

  let nearest: Point2 | null = null
  let nearestDist = Infinity

  for (const snap of snapPoints) {
    const d = Math.hypot(raw[0] - snap[0], raw[1] - snap[1])
    if (d < nearestDist) {
      nearestDist = d
      nearest = snap
    }
  }

  if (nearest && nearestDist <= threshold) {
    return { point: nearest, snapped: nearest }
  }

  return { point: raw, snapped: null }
}
