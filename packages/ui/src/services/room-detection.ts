import type { WallElement } from './kernel-bridge'

export interface DetectedRoom {
  boundary: [number, number][]
  area: number
  perimeter: number
}

const SNAP_PRECISION = 0.01

/** Round a coordinate to the snap grid to handle near-miss endpoints */
function snap(v: number): number {
  return Math.round(v / SNAP_PRECISION) * SNAP_PRECISION
}

function ptKey(x: number, y: number): string {
  return `${snap(x)},${snap(y)}`
}

/** Compute the signed area of a polygon using the shoelace formula */
function signedArea(pts: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

/** Compute the perimeter of a polygon */
function perimeter(pts: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    sum += Math.hypot(x2 - x1, y2 - y1)
  }
  return sum
}

/**
 * Detect closed rooms formed by wall segments using planar graph face detection.
 *
 * Algorithm:
 * 1. Build a planar graph from wall centerlines (snap endpoints to grid).
 * 2. At each node, sort outgoing edges by angle.
 * 3. Traverse edges always taking the next counter-clockwise turn to find minimal faces.
 * 4. Discard the outer (unbounded) face (the one with the largest absolute area).
 */
export function detectRooms(walls: WallElement[]): DetectedRoom[] {
  if (walls.length === 0) return []

  // --- 1. Build adjacency graph ---
  // Each node is identified by its snapped key.
  // Each edge stores the destination node key and the original coordinate pair.
  type Edge = { to: string; toCoord: [number, number]; angle: number; used: boolean }
  const adj = new Map<string, Edge[]>()
  const nodeCoord = new Map<string, [number, number]>()

  function addNode(x: number, y: number): string {
    const key = ptKey(x, y)
    if (!nodeCoord.has(key)) {
      nodeCoord.set(key, [snap(x), snap(y)])
      adj.set(key, [])
    }
    return key
  }

  for (const wall of walls) {
    const keyA = addNode(wall.start[0], wall.start[1])
    const keyB = addNode(wall.end[0], wall.end[1])
    if (keyA === keyB) continue // degenerate wall

    const [ax, ay] = nodeCoord.get(keyA)!
    const [bx, by] = nodeCoord.get(keyB)!

    const angleAB = Math.atan2(by - ay, bx - ax)
    const angleBA = Math.atan2(ay - by, ax - bx)

    adj.get(keyA)!.push({ to: keyB, toCoord: [bx, by], angle: angleAB, used: false })
    adj.get(keyB)!.push({ to: keyA, toCoord: [ax, ay], angle: angleBA, used: false })
  }

  // --- 2. Sort edges at each node by angle ---
  for (const edges of adj.values()) {
    edges.sort((a, b) => a.angle - b.angle)
  }

  // --- 3. Traverse minimal faces ---
  // For each directed half-edge that hasn't been used, follow the "next edge" rule:
  // arriving at node B from A, the next edge is the one immediately CW from the
  // reverse direction (i.e., the edge just after angle(B->A) in sorted order, wrapping).
  const faces: [number, number][][] = []

  for (const [startKey, startEdges] of adj) {
    for (const startEdge of startEdges) {
      if (startEdge.used) continue

      const polygon: [number, number][] = []
      let curKey = startKey
      let curEdge = startEdge
      let safe = 0

      while (safe < 10000) {
        safe++
        curEdge.used = true
        polygon.push(nodeCoord.get(curKey)!)

        const nextKey = curEdge.to
        const nextEdges = adj.get(nextKey)!

        // Incoming direction angle: the reverse of how we arrived
        const reverseAngle = Math.atan2(
          nodeCoord.get(curKey)![1] - nodeCoord.get(nextKey)![1],
          nodeCoord.get(curKey)![0] - nodeCoord.get(nextKey)![0],
        )

        // Find the edge just after reverseAngle in CW order.
        // Since edges are sorted ascending by angle, the "next CW" from reverseAngle
        // is the first edge whose angle is strictly less than reverseAngle (going CW = decreasing angle).
        // In practice, we want the edge immediately before reverseAngle in the sorted list (wrapping).
        let idx = -1
        for (let i = 0; i < nextEdges.length; i++) {
          if (nextEdges[i].angle > reverseAngle) {
            idx = i
            break
          }
        }
        // The next CW edge from reverseAngle is at idx-1 (wrap to end if idx=0 or not found)
        if (idx === -1) {
          // All edges have angle <= reverseAngle, pick the last one
          idx = nextEdges.length - 1
        } else if (idx === 0) {
          idx = nextEdges.length - 1
        } else {
          idx = idx - 1
        }

        curEdge = nextEdges[idx]
        curKey = nextKey

        if (curKey === startKey && curEdge === startEdge) break
      }

      if (polygon.length >= 3) {
        faces.push(polygon)
      }
    }
  }

  if (faces.length === 0) return []

  // --- 4. Compute areas and filter ---
  const rooms: DetectedRoom[] = []
  let maxAbsArea = 0
  let maxIdx = -1

  for (let i = 0; i < faces.length; i++) {
    const sa = signedArea(faces[i])
    const absArea = Math.abs(sa)
    if (absArea > maxAbsArea) {
      maxAbsArea = absArea
      maxIdx = i
    }
  }

  for (let i = 0; i < faces.length; i++) {
    if (i === maxIdx) continue // skip outer boundary
    const pts = faces[i]
    const sa = signedArea(pts)
    const absArea = Math.abs(sa)
    if (absArea < 0.01) continue // too small — noise

    // Ensure CCW winding
    const boundary: [number, number][] = sa < 0 ? [...pts].reverse() : pts
    rooms.push({
      boundary,
      area: absArea,
      perimeter: perimeter(boundary),
    })
  }

  return rooms
}

/** Compute centroid of a polygon */
export function polygonCentroid(pts: [number, number][]): [number, number] {
  let cx = 0
  let cy = 0
  for (const [x, y] of pts) {
    cx += x
    cy += y
  }
  return [cx / pts.length, cy / pts.length]
}
