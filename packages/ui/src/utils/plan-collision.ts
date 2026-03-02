export type Point2 = [number, number]

const EPS = 1e-6

function normalizePolygon(points: Point2[]): Point2[] {
  if (points.length <= 1) return points
  const first = points[0]
  const last = points[points.length - 1]
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= EPS) {
    return points.slice(0, -1)
  }
  return points
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

function pointOnSegment(point: Point2, a: Point2, b: Point2): boolean {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const apx = point[0] - a[0]
  const apy = point[1] - a[1]
  if (Math.abs(cross(abx, aby, apx, apy)) > EPS) return false

  const dot = apx * abx + apy * aby
  if (dot < -EPS) return false

  const lenSq = abx * abx + aby * aby
  if (dot - lenSq > EPS) return false
  return true
}

function segmentsProperlyIntersect(a1: Point2, a2: Point2, b1: Point2, b2: Point2): boolean {
  const r: Point2 = [a2[0] - a1[0], a2[1] - a1[1]]
  const s: Point2 = [b2[0] - b1[0], b2[1] - b1[1]]
  const denom = cross(r[0], r[1], s[0], s[1])
  const qmp: Point2 = [b1[0] - a1[0], b1[1] - a1[1]]

  if (Math.abs(denom) < EPS) return false

  const t = cross(qmp[0], qmp[1], s[0], s[1]) / denom
  const u = cross(qmp[0], qmp[1], r[0], r[1]) / denom
  return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS
}

function pointInPolygonStrict(point: Point2, polygon: Point2[]): boolean {
  if (polygon.length < 3) return false

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (pointOnSegment(point, a, b)) return false
  }

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]

    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || EPS) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function polygonBounds(points: Point2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const p of points) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
  }

  return { minX, maxX, minY, maxY }
}

function boundsOverlap(a: { minX: number; maxX: number; minY: number; maxY: number }, b: { minX: number; maxX: number; minY: number; maxY: number }): boolean {
  return !(a.maxX < b.minX + EPS || b.maxX < a.minX + EPS || a.maxY < b.minY + EPS || b.maxY < a.minY + EPS)
}

function polygonCentroid(points: Point2[]): Point2 {
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p[0]
    cy += p[1]
  }
  return [cx / points.length, cy / points.length]
}

/**
 * Returns true only for area overlap.
 * Shared borders or touching corners are treated as non-overlap.
 */
export function polygonsOverlapArea(aRaw: Point2[], bRaw: Point2[]): boolean {
  const a = normalizePolygon(aRaw)
  const b = normalizePolygon(bRaw)
  if (a.length < 3 || b.length < 3) return false

  if (!boundsOverlap(polygonBounds(a), polygonBounds(b))) return false

  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j += 1) {
      const b1 = b[j]
      const b2 = b[(j + 1) % b.length]
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return true
    }
  }

  for (const p of a) {
    if (pointInPolygonStrict(p, b)) return true
  }
  for (const p of b) {
    if (pointInPolygonStrict(p, a)) return true
  }

  if (pointInPolygonStrict(polygonCentroid(a), b)) return true
  if (pointInPolygonStrict(polygonCentroid(b), a)) return true
  return false
}

export function axisAlignedRect(minX: number, maxX: number, minY: number, maxY: number): Point2[] {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]
}

export function columnFootprint(center: Point2, width: number, depth: number): Point2[] {
  const halfW = width / 2
  const halfD = depth / 2
  return axisAlignedRect(center[0] - halfW, center[0] + halfW, center[1] - halfD, center[1] + halfD)
}
