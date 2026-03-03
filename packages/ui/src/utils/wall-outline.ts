import type { WallElement } from '../services/kernel-bridge'

type Point2 = [number, number]

export interface OutlineLine {
  start: Point2
  end: Point2
}

interface Footprint {
  id: string
  corners: [Point2, Point2, Point2, Point2]
  edges: OutlineLine[]
}

const EPS = 1e-8
const MIN_SEGMENT = 1e-5

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

function buildFootprint(wall: WallElement): Footprint | null {
  const dx = wall.end[0] - wall.start[0]
  const dy = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dy)
  if (len < EPS || wall.thickness <= EPS) return null

  const nx = (-dy / len) * (wall.thickness / 2)
  const ny = (dx / len) * (wall.thickness / 2)

  const sPlus: Point2 = [wall.start[0] + nx, wall.start[1] + ny]
  const ePlus: Point2 = [wall.end[0] + nx, wall.end[1] + ny]
  const eMinus: Point2 = [wall.end[0] - nx, wall.end[1] - ny]
  const sMinus: Point2 = [wall.start[0] - nx, wall.start[1] - ny]

  return {
    id: wall.meta.id,
    corners: [sPlus, ePlus, eMinus, sMinus],
    edges: [
      { start: sPlus, end: ePlus },
      { start: sMinus, end: eMinus },
      { start: sPlus, end: sMinus },
      { start: ePlus, end: eMinus },
    ],
  }
}

function intervalInsideConvex(
  segStart: Point2,
  segEnd: Point2,
  polygon: [Point2, Point2, Point2, Point2],
): [number, number] | null {
  const dX = segEnd[0] - segStart[0]
  const dY = segEnd[1] - segStart[1]
  let tEnter = 0
  let tExit = 1

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const edgeX = b[0] - a[0]
    const edgeY = b[1] - a[1]

    // CCW polygon => inside is left of each edge.
    const base = cross(edgeX, edgeY, segStart[0] - a[0], segStart[1] - a[1])
    const slope = cross(edgeX, edgeY, dX, dY)

    // base + slope * t >= -EPS
    if (Math.abs(slope) < EPS) {
      if (base < -EPS) return null
      continue
    }

    const t = (-EPS - base) / slope
    if (slope > 0) {
      tEnter = Math.max(tEnter, t)
    } else {
      tExit = Math.min(tExit, t)
    }
    if (tEnter > tExit) return null
  }

  const start = Math.max(0, tEnter)
  const end = Math.min(1, tExit)
  if (end - start <= EPS) return null
  return [start, end]
}

function subtractInterval(
  visible: Array<[number, number]>,
  cut: [number, number],
): Array<[number, number]> {
  const result: Array<[number, number]> = []
  for (const [start, end] of visible) {
    if (cut[1] <= start + EPS || cut[0] >= end - EPS) {
      result.push([start, end])
      continue
    }
    if (cut[0] > start + EPS) {
      result.push([start, Math.min(cut[0], end)])
    }
    if (cut[1] < end - EPS) {
      result.push([Math.max(cut[1], start), end])
    }
  }
  return result
}

function interpolateSegment(seg: OutlineLine, t: number): Point2 {
  return [
    seg.start[0] + (seg.end[0] - seg.start[0]) * t,
    seg.start[1] + (seg.end[1] - seg.start[1]) * t,
  ]
}

/**
 * Build visible wall outline lines by clipping away wall edge portions that
 * fall inside neighboring wall footprints.
 */
export function buildVisibleWallOutlineLines(walls: WallElement[]): OutlineLine[] {
  const footprints = walls
    .map((wall) => buildFootprint(wall))
    .filter((fp): fp is Footprint => fp !== null)

  const lines: OutlineLine[] = []

  for (const footprint of footprints) {
    for (const edge of footprint.edges) {
      let visible: Array<[number, number]> = [[0, 1]]

      for (const other of footprints) {
        if (other.id === footprint.id) continue
        const cut = intervalInsideConvex(edge.start, edge.end, other.corners)
        if (!cut) continue
        visible = subtractInterval(visible, cut)
        if (visible.length === 0) break
      }

      for (const [startT, endT] of visible) {
        const start = interpolateSegment(edge, startT)
        const end = interpolateSegment(edge, endT)
        if (Math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_SEGMENT) continue
        lines.push({ start, end })
      }
    }
  }

  return lines
}
