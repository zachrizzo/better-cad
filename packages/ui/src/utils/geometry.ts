export type Point2 = [number, number]

/** Shoelace formula for polygon area */
export function polygonArea(points: Point2[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i][0] * points[j][1]
    area -= points[j][0] * points[i][1]
  }
  return Math.abs(area) / 2
}

/** Polygon perimeter */
export function polygonPerimeter(points: Point2[]): number {
  let perimeter = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    perimeter += Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1])
  }
  return perimeter
}

/** Polygon centroid */
export function polygonCentroid(points: Point2[]): Point2 {
  if (points.length === 0) return [0, 0]
  let cx = 0, cy = 0
  for (const p of points) { cx += p[0]; cy += p[1] }
  return [cx / points.length, cy / points.length]
}
