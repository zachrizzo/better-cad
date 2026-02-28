import type { WallElement } from './kernel-bridge'

type Point2 = [number, number]

export interface WallCleanupResult {
  modified: WallElement[]
  created: WallElement[]
  deleted: string[]
}

const ENDPOINT_TOLERANCE = 0.02

function dist(a: Point2, b: Point2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function pointsEqual(a: Point2, b: Point2, tol: number = ENDPOINT_TOLERANCE): boolean {
  return dist(a, b) < tol
}

/** Project point onto segment, returning parameter t (unclamped), projection, and distance. */
function projectOnSegment(
  point: Point2,
  segStart: Point2,
  segEnd: Point2,
): { t: number; projection: Point2; distance: number } {
  const dx = segEnd[0] - segStart[0]
  const dy = segEnd[1] - segStart[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-12) {
    return { t: 0, projection: segStart, distance: dist(point, segStart) }
  }
  const t = ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / lenSq
  const tClamped = Math.max(0, Math.min(1, t))
  const projection: Point2 = [
    segStart[0] + tClamped * dx,
    segStart[1] + tClamped * dy,
  ]
  return { t: tClamped, projection, distance: dist(point, projection) }
}

/** Compute intersection of two infinite lines defined by point+direction. Returns null if parallel. */
function lineLineIntersection(
  p1: Point2,
  d1: Point2,
  p2: Point2,
  d2: Point2,
): Point2 | null {
  const cross = d1[0] * d2[1] - d1[1] * d2[0]
  if (Math.abs(cross) < 1e-10) return null
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const t = (dx * d2[1] - dy * d2[0]) / cross
  return [p1[0] + t * d1[0], p1[1] + t * d1[1]]
}

function wallDirection(w: WallElement): Point2 {
  return [w.end[0] - w.start[0], w.end[1] - w.start[1]]
}

/** Check if two walls are approximately parallel. */
function areParallel(w1: WallElement, w2: WallElement): boolean {
  const d1 = wallDirection(w1)
  const d2 = wallDirection(w2)
  const len1 = Math.hypot(d1[0], d1[1])
  const len2 = Math.hypot(d2[0], d2[1])
  if (len1 < 1e-10 || len2 < 1e-10) return false
  const cross = Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) / (len1 * len2)
  return cross < 0.05 // ~3 degrees
}

/** Project a point onto the infinite line defined by a wall's centerline. */
function projectOnLine(point: Point2, w: WallElement): { t: number; projection: Point2 } {
  const dx = w.end[0] - w.start[0]
  const dy = w.end[1] - w.start[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-12) return { t: 0, projection: w.start }
  const t = ((point[0] - w.start[0]) * dx + (point[1] - w.start[1]) * dy) / lenSq
  return { t, projection: [w.start[0] + t * dx, w.start[1] + t * dy] }
}

/** Perpendicular distance from a point to the infinite line of a wall. */
function perpendicularDistance(point: Point2, w: WallElement): number {
  const { projection } = projectOnLine(point, w)
  return dist(point, projection)
}

interface TJunction {
  /** The wall whose endpoint touches the host. */
  incomingWallId: string
  /** Which endpoint of the incoming wall (0 = start, 1 = end). */
  incomingEndpoint: 0 | 1
  /** The wall being split. */
  hostWallId: string
  /** The junction point on the host wall. */
  junctionPoint: Point2
  /** Parameter t along the host wall. */
  t: number
}

function detectTJunctions(walls: WallElement[], threshold: number): TJunction[] {
  const junctions: TJunction[] = []
  // Track which (incoming, host) pairs we've already found to avoid duplicates
  const seen = new Set<string>()

  for (const incoming of walls) {
    for (const epIndex of [0, 1] as const) {
      const ep: Point2 = epIndex === 0 ? incoming.start : incoming.end

      for (const host of walls) {
        if (host.meta.id === incoming.meta.id) continue

        // Skip if the endpoint is near an endpoint of the host (that's an L-junction, not T)
        if (pointsEqual(ep, host.start, threshold) || pointsEqual(ep, host.end, threshold)) continue

        const { t, projection, distance } = projectOnSegment(ep, host.start, host.end)
        // Must be interior to the host segment (not at endpoints)
        if (t <= 0.01 || t >= 0.99) continue
        if (distance > threshold) continue

        const key = `${incoming.meta.id}:${epIndex}:${host.meta.id}`
        if (seen.has(key)) continue
        seen.add(key)

        junctions.push({
          incomingWallId: incoming.meta.id,
          incomingEndpoint: epIndex,
          hostWallId: host.meta.id,
          junctionPoint: projection,
          t,
        })
      }
    }
  }

  return junctions
}

interface LJunction {
  wallAId: string
  wallAEndpoint: 0 | 1
  wallBId: string
  wallBEndpoint: 0 | 1
  intersectionPoint: Point2
}

function detectLJunctions(walls: WallElement[], threshold: number): LJunction[] {
  const junctions: LJunction[] = []
  const seen = new Set<string>()

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const wA = walls[i]
      const wB = walls[j]

      // Skip parallel walls (they can't form L-junctions)
      if (areParallel(wA, wB)) continue

      // Check each pair of endpoints
      for (const epA of [0, 1] as const) {
        for (const epB of [0, 1] as const) {
          const ptA: Point2 = epA === 0 ? wA.start : wA.end
          const ptB: Point2 = epB === 0 ? wB.start : wB.end

          const d = dist(ptA, ptB)
          if (d > threshold) continue

          const key = [wA.meta.id, epA, wB.meta.id, epB].sort().join(':')
          if (seen.has(key)) continue
          seen.add(key)

          // Find intersection of the two infinite wall centerlines
          const dA = wallDirection(wA)
          const dB = wallDirection(wB)
          const intersection = lineLineIntersection(wA.start, dA, wB.start, dB)
          if (!intersection) continue

          // Sanity check: intersection shouldn't be too far from the endpoints
          if (dist(intersection, ptA) > threshold * 5 && dist(intersection, ptB) > threshold * 5) continue

          junctions.push({
            wallAId: wA.meta.id,
            wallAEndpoint: epA,
            wallBId: wB.meta.id,
            wallBEndpoint: epB,
            intersectionPoint: intersection,
          })
        }
      }
    }
  }

  return junctions
}

interface OverlapPair {
  wallAId: string
  wallBId: string
}

function detectOverlaps(walls: WallElement[], threshold: number): OverlapPair[] {
  const pairs: OverlapPair[] = []
  const seen = new Set<string>()

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const wA = walls[i]
      const wB = walls[j]

      if (!areParallel(wA, wB)) continue
      // Walls must have same thickness and height to merge
      if (Math.abs(wA.thickness - wB.thickness) > 0.01) continue
      if (Math.abs(wA.height - wB.height) > 0.01) continue

      // Check perpendicular distance between centerlines is small
      const perpDist = perpendicularDistance(wB.start, wA)
      if (perpDist > threshold) continue

      // Check that projections overlap along the wall direction
      const { t: tBs } = projectOnLine(wB.start, wA)
      const { t: tBe } = projectOnLine(wB.end, wA)
      const minB = Math.min(tBs, tBe)
      const maxB = Math.max(tBs, tBe)

      // Wall A spans t=[0, 1]. Check overlap.
      if (maxB < -0.01 || minB > 1.01) continue

      const key = [wA.meta.id, wB.meta.id].sort().join(':')
      if (seen.has(key)) continue
      seen.add(key)

      pairs.push({ wallAId: wA.meta.id, wallBId: wB.meta.id })
    }
  }

  return pairs
}

/**
 * Runs wall cleanup: T-junction splits, L-junction corner trims, and overlap merges.
 * This is a pure function -- it returns a description of changes but does not mutate anything.
 */
export function cleanupWalls(
  walls: WallElement[],
  snapThreshold: number = 0.15,
): WallCleanupResult {
  if (walls.length < 2) return { modified: [], created: [], deleted: [] }

  // Work on a mutable copy indexed by id
  const wallMap = new Map<string, WallElement>()
  for (const w of walls) {
    wallMap.set(w.meta.id, { ...w, start: [...w.start] as Point2, end: [...w.end] as Point2 })
  }

  const modifiedIds = new Set<string>()
  const createdWalls: WallElement[] = []
  const deletedIds = new Set<string>()

  // --- Phase 1: T-junction splits ---
  const tJunctions = detectTJunctions(Array.from(wallMap.values()), snapThreshold)

  // Group T-junctions by host wall (a wall may be split at multiple points)
  const splitsByHost = new Map<string, TJunction[]>()
  for (const tj of tJunctions) {
    if (!splitsByHost.has(tj.hostWallId)) splitsByHost.set(tj.hostWallId, [])
    splitsByHost.get(tj.hostWallId)!.push(tj)
  }

  for (const [hostId, splits] of splitsByHost) {
    const host = wallMap.get(hostId)
    if (!host) continue

    // Sort split points by t parameter
    splits.sort((a, b) => a.t - b.t)

    // Snap incoming wall endpoints to the junction points
    for (const tj of splits) {
      const incoming = wallMap.get(tj.incomingWallId)
      if (!incoming) continue
      if (tj.incomingEndpoint === 0) {
        incoming.start = [...tj.junctionPoint] as Point2
      } else {
        incoming.end = [...tj.junctionPoint] as Point2
      }
      modifiedIds.add(incoming.meta.id)
    }

    // Build split segments from the host wall
    const points: Point2[] = [[...host.start] as Point2]
    for (const tj of splits) {
      points.push([...tj.junctionPoint] as Point2)
    }
    points.push([...host.end] as Point2)

    // First segment reuses the original host wall id
    const firstSeg: WallElement = {
      ...host,
      start: points[0],
      end: points[1],
    }
    wallMap.set(hostId, firstSeg)
    modifiedIds.add(hostId)

    // Additional segments are new walls
    for (let k = 1; k < points.length - 1; k++) {
      const newId = `wall-${crypto.randomUUID()}`
      const newWall: WallElement = {
        kind: 'wall',
        meta: { id: newId, name: `${host.meta.name} (split ${k})` },
        start: points[k],
        end: points[k + 1],
        height: host.height,
        thickness: host.thickness,
      }
      wallMap.set(newId, newWall)
      createdWalls.push(newWall)
    }
  }

  // --- Phase 2: L-junction corner trims ---
  const currentWalls = Array.from(wallMap.values()).filter((w) => !deletedIds.has(w.meta.id))
  const lJunctions = detectLJunctions(currentWalls, snapThreshold)

  for (const lj of lJunctions) {
    const wA = wallMap.get(lj.wallAId)
    const wB = wallMap.get(lj.wallBId)
    if (!wA || !wB) continue
    if (deletedIds.has(lj.wallAId) || deletedIds.has(lj.wallBId)) continue

    if (lj.wallAEndpoint === 0) {
      wA.start = [...lj.intersectionPoint] as Point2
    } else {
      wA.end = [...lj.intersectionPoint] as Point2
    }
    modifiedIds.add(lj.wallAId)

    if (lj.wallBEndpoint === 0) {
      wB.start = [...lj.intersectionPoint] as Point2
    } else {
      wB.end = [...lj.intersectionPoint] as Point2
    }
    modifiedIds.add(lj.wallBId)
  }

  // --- Phase 3: Overlap merges ---
  const currentWalls2 = Array.from(wallMap.values()).filter((w) => !deletedIds.has(w.meta.id))
  const overlaps = detectOverlaps(currentWalls2, snapThreshold)

  for (const { wallAId, wallBId } of overlaps) {
    if (deletedIds.has(wallAId) || deletedIds.has(wallBId)) continue
    const wA = wallMap.get(wallAId)
    const wB = wallMap.get(wallBId)
    if (!wA || !wB) continue

    // Project all four endpoints onto wall A's direction to find the merged extent
    const dir = wallDirection(wA)
    const len = Math.hypot(dir[0], dir[1])
    if (len < 1e-10) continue
    const projections = [
      { t: 0, point: wA.start },
      { t: 1, point: wA.end },
      { t: projectOnLine(wB.start, wA).t, point: wB.start },
      { t: projectOnLine(wB.end, wA).t, point: wB.end },
    ]

    projections.sort((a, b) => a.t - b.t)
    const minPt = projections[0]
    const maxPt = projections[projections.length - 1]

    // Project onto the line to get clean collinear points
    const mergedStart: Point2 = [
      wA.start[0] + minPt.t * dir[0],
      wA.start[1] + minPt.t * dir[1],
    ]
    const mergedEnd: Point2 = [
      wA.start[0] + maxPt.t * dir[0],
      wA.start[1] + maxPt.t * dir[1],
    ]

    // Keep wall A as the merged wall, delete wall B
    wA.start = mergedStart
    wA.end = mergedEnd
    modifiedIds.add(wallAId)

    deletedIds.add(wallBId)
    wallMap.delete(wallBId)
  }

  // Build result
  const modified: WallElement[] = []
  for (const id of modifiedIds) {
    if (deletedIds.has(id)) continue
    const w = wallMap.get(id)
    if (!w) continue
    // Only include if it wasn't created in this pass (those go in created[])
    if (!createdWalls.find((c) => c.meta.id === id)) {
      modified.push(w)
    }
  }

  return {
    modified,
    created: createdWalls,
    deleted: Array.from(deletedIds),
  }
}
