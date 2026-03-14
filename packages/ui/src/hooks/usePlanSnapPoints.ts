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
import type { MeasurementSnapMode } from '../utils/measurement-snap-settings'

type Point2 = [number, number]
type MutablePlanSnapCandidate = { point: Point2; modes: Set<MeasurementSnapMode> }

export interface PlanSnapCandidate {
  point: Point2
  modes: MeasurementSnapMode[]
}

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
    candidates: PlanSnapCandidate[]
    points: Point2[]
  }
  | null = null

function quantize(value: number): number {
  return Math.round(value / SNAP_POINT_PRECISION) * SNAP_POINT_PRECISION
}

function addSnapCandidate(
  bucket: Map<string, MutablePlanSnapCandidate>,
  x: number,
  z: number,
  mode: MeasurementSnapMode,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false
  const qx = quantize(x)
  const qz = quantize(z)
  const key = `${qx}:${qz}`
  const existing = bucket.get(key)
  if (!existing) {
    bucket.set(key, {
      point: [qx, qz],
      modes: new Set([mode]),
    })
    return true
  }
  existing.modes.add(mode)
  return false
}

function collectElementSnapPoints(
  elements: Iterable<PrototypeElement>,
  bucket: Map<string, MutablePlanSnapCandidate>,
  hiddenLevelIds: Set<string>,
) {
  for (const element of elements) {
    const levelId = element.meta.level_id
    if (levelId && hiddenLevelIds.has(levelId)) continue

    if (isWallElement(element)) {
      addSnapCandidate(bucket, element.start[0], element.start[1], 'endpoint')
      addSnapCandidate(bucket, element.end[0], element.end[1], 'endpoint')
      addSnapCandidate(bucket, (element.start[0] + element.end[0]) / 2, (element.start[1] + element.end[1]) / 2, 'midpoint')
      continue
    }
    if (isFloorElement(element) || isRoofElement(element) || isRoomElement(element)) {
      const boundary = element.boundary
      for (let i = 0; i < boundary.length; i++) {
        const [x, z] = boundary[i]
        addSnapCandidate(bucket, x, z, 'endpoint')
        const next = boundary[(i + 1) % boundary.length]
        addSnapCandidate(bucket, (x + next[0]) / 2, (z + next[1]) / 2, 'midpoint')
      }
      continue
    }
    if (isStairElement(element)) {
      addSnapCandidate(bucket, element.start[0], element.start[1], 'endpoint')
      addSnapCandidate(bucket, element.end[0], element.end[1], 'endpoint')
      addSnapCandidate(bucket, (element.start[0] + element.end[0]) / 2, (element.start[1] + element.end[1]) / 2, 'midpoint')
      continue
    }
    if (isColumnElement(element)) {
      addSnapCandidate(bucket, element.center[0], element.center[1], 'center')
      continue
    }
    if (isBeamElement(element)) {
      // Beam XY in kernel maps to XZ in scene placement tools.
      addSnapCandidate(bucket, element.start[0], element.start[1], 'endpoint')
      addSnapCandidate(bucket, element.end[0], element.end[1], 'endpoint')
      addSnapCandidate(bucket, (element.start[0] + element.end[0]) / 2, (element.start[1] + element.end[1]) / 2, 'midpoint')
      continue
    }
    if (isDimensionElement(element)) {
      addSnapCandidate(bucket, element.p1[0], element.p1[1], 'endpoint')
      addSnapCandidate(bucket, element.p2[0], element.p2[1], 'endpoint')
      addSnapCandidate(bucket, (element.p1[0] + element.p2[0]) / 2, (element.p1[1] + element.p2[1]) / 2, 'midpoint')
      continue
    }
    if (isTextAnnotationElement(element)) {
      addSnapCandidate(bucket, element.position[0], element.position[1], 'nearest')
      continue
    }
  }
}

function segmentIntersection(
  a1: Point2, a2: Point2,
  b1: Point2, b2: Point2,
): Point2 | null {
  const d1x = a2[0] - a1[0], d1y = a2[1] - a1[1]
  const d2x = b2[0] - b1[0], d2y = b2[1] - b1[1]
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-10) return null // parallel
  const t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / cross
  const u = ((b1[0] - a1[0]) * d1y - (b1[1] - a1[1]) * d1x) / cross
  if (t < 0 || t > 1 || u < 0 || u > 1) return null // outside segments
  return [a1[0] + t * d1x, a1[1] + t * d1y]
}

function collectWallIntersections(
  elements: Iterable<PrototypeElement>,
  bucket: Map<string, MutablePlanSnapCandidate>,
  hiddenLevelIds: Set<string>,
) {
  const walls: Array<{ start: Point2; end: Point2 }> = []
  for (const element of elements) {
    if (!isWallElement(element)) continue
    if (element.meta.level_id && hiddenLevelIds.has(element.meta.level_id)) continue
    walls.push({ start: element.start, end: element.end })
  }
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const pt = segmentIntersection(walls[i].start, walls[i].end, walls[j].start, walls[j].end)
      if (pt) addSnapCandidate(bucket, pt[0], pt[1], 'intersection')
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
  bucket: Map<string, MutablePlanSnapCandidate>,
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
      if (addSnapCandidate(bucket, x, z, 'nearest')) {
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

      if (addSnapCandidate(bucket, ax, az, 'nearest')) pointsAdded += 1
      if (pointsAdded >= MAX_MESH_POINTS_PER_MESH) break
      if (addSnapCandidate(bucket, bx, bz, 'nearest')) pointsAdded += 1
      if (pointsAdded >= MAX_MESH_POINTS_PER_MESH) break

      const edgeLength2D = Math.hypot(bx - ax, bz - az)
      if (!Number.isFinite(edgeLength2D) || edgeLength2D < EDGE_SAMPLE_SPACING * 0.75) continue

      const sampleCount = Math.min(MAX_EDGE_SAMPLES_PER_EDGE, Math.floor(edgeLength2D / EDGE_SAMPLE_SPACING))
      for (let s = 1; s <= sampleCount && pointsAdded < MAX_MESH_POINTS_PER_MESH; s += 1) {
        const t = s / (sampleCount + 1)
        const sx = ax + (bx - ax) * t
        const sz = az + (bz - az) * t
        if (addSnapCandidate(bucket, sx, sz, 'nearest')) {
          pointsAdded += 1
        }
      }
    }
  }
}

export function usePlanSnapCandidates(): PlanSnapCandidate[] {
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
      return snapCache.candidates
    }

    const hiddenLevelIds = new Set(
      levels
        .filter((level) => level.visibility === 'hidden')
        .map((level) => level.id),
    )

    const bucket = new Map<string, MutablePlanSnapCandidate>()
    collectElementSnapPoints(elements.values(), bucket, hiddenLevelIds)
    collectWallIntersections(elements.values(), bucket, hiddenLevelIds)

    const visibleMeshes: Array<Pick<CadMeshData, 'positions' | 'indices'>> = []
    for (const [meshId, mesh] of cadMeshes.entries()) {
      const levelId = elements.get(meshId)?.meta.level_id
      if (levelId && hiddenLevelIds.has(levelId)) continue
      visibleMeshes.push(mesh)
    }

    collectMeshSnapPoints(visibleMeshes, bucket)
    const candidates = Array.from(bucket.values(), (candidate) => ({
      point: candidate.point,
      modes: Array.from(candidate.modes.values()),
    }))
    const points = candidates.map((candidate) => candidate.point)
    snapCache = {
      elementsRef: elements,
      cadMeshesRef: cadMeshes,
      levelsRef: levels,
      candidates,
      points,
    }
    return candidates
  }, [elements, cadMeshes, levels])
}

export function usePlanSnapPoints(): Point2[] {
  const candidates = usePlanSnapCandidates()
  return useMemo(() => candidates.map((candidate) => candidate.point), [candidates])
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

export function snapPlanCandidate(
  raw: Point2,
  candidates: PlanSnapCandidate[],
  enabledModes: MeasurementSnapMode[],
  threshold: number,
): { point: Point2; snapped: PlanSnapCandidate | null } {
  if (enabledModes.length === 0 || candidates.length === 0) {
    return { point: raw, snapped: null }
  }

  const enabledModeSet = new Set(enabledModes)
  let nearest: PlanSnapCandidate | null = null
  let nearestDist = Infinity

  for (const candidate of candidates) {
    if (!candidate.modes.some((mode) => enabledModeSet.has(mode))) continue

    const d = Math.hypot(raw[0] - candidate.point[0], raw[1] - candidate.point[1])
    if (d < nearestDist) {
      nearestDist = d
      nearest = candidate
    }
  }

  if (nearest && nearestDist <= threshold) {
    return { point: nearest.point, snapped: nearest }
  }

  return { point: raw, snapped: null }
}
