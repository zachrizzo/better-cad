export type Point2 = [number, number]

export interface RectFromCorners {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  width: number
  depth: number
  area: number
  boundary: Point2[]
  center: Point2
}

export function rectFromCorners(a: Point2, b: Point2): RectFromCorners {
  const minX = Math.min(a[0], b[0])
  const maxX = Math.max(a[0], b[0])
  const minZ = Math.min(a[1], b[1])
  const maxZ = Math.max(a[1], b[1])
  const width = maxX - minX
  const depth = maxZ - minZ
  const area = width * depth
  const boundary: Point2[] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ]
  const center: Point2 = [(minX + maxX) / 2, (minZ + maxZ) / 2]
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    area,
    boundary,
    center,
  }
}

export function rectLoop3D(rect: RectFromCorners, y = 0.02): [number, number, number][] {
  return [
    [rect.minX, y, rect.minZ],
    [rect.maxX, y, rect.minZ],
    [rect.maxX, y, rect.maxZ],
    [rect.minX, y, rect.maxZ],
    [rect.minX, y, rect.minZ],
  ]
}
