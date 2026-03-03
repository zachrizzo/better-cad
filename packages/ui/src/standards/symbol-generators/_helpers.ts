import {
  rectPoints,
  transformPoints,
  rotateAndTranslatePoint,
  circlePolyline,
  type Point2,
  type SymbolPrimitive,
} from '../symbol-primitives'

export type LineClass = 'cut' | 'primary' | 'secondary' | 'annotation'

export function localToWorld(center: Point2, rotation: number, local: Point2): Point2 {
  return rotateAndTranslatePoint(local, center, rotation)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function addRect(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
  width: number,
  depth: number,
  lineClass: LineClass,
  offset: Point2 = [0, 0],
): void {
  const [ox, oy] = offset
  const points = rectPoints(width, depth).map(([px, py]) => [px + ox, py + oy] as Point2)
  primitives.push({
    kind: 'polyline',
    points: transformPoints(points, center, rotation),
    closed: true,
    lineClass,
  })
}

export function addLine(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
  start: Point2,
  end: Point2,
  lineClass: LineClass,
): void {
  primitives.push({
    kind: 'polyline',
    points: transformPoints([start, end], center, rotation),
    lineClass,
  })
}

export function addCircle(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
  localCenter: Point2,
  radius: number,
  lineClass: LineClass,
): void {
  primitives.push({
    kind: 'circle',
    center: localToWorld(center, rotation, localCenter),
    radius,
    lineClass,
  })
}

export function addArc(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
  localCenter: Point2,
  radius: number,
  startAngle: number,
  endAngle: number,
  lineClass: LineClass,
): void {
  primitives.push({
    kind: 'arc',
    center: localToWorld(center, rotation, localCenter),
    radius,
    startAngle: startAngle + rotation,
    endAngle: endAngle + rotation,
    lineClass,
  })
}

export function addText(
  primitives: SymbolPrimitive[],
  position: Point2,
  rotation: number,
  text: string,
  size: number,
): void {
  primitives.push({
    kind: 'text',
    position,
    text,
    size,
    rotation,
    lineClass: 'annotation',
  })
}

export function addPolyline(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
  localPoints: Point2[],
  lineClass: LineClass,
  closed?: boolean,
): void {
  primitives.push({
    kind: 'polyline',
    points: transformPoints(localPoints, center, rotation),
    closed,
    lineClass,
  })
}

export function addEllipse(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
  localCenter: Point2,
  rx: number,
  ry: number,
  lineClass: LineClass,
  segments = 24,
): void {
  const pts: Point2[] = []
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    pts.push([
      localCenter[0] + Math.cos(angle) * rx,
      localCenter[1] + Math.sin(angle) * ry,
    ])
  }
  primitives.push({
    kind: 'polyline',
    points: transformPoints(pts, center, rotation),
    closed: true,
    lineClass,
  })
}

// Re-export primitives helpers for convenience
export { rectPoints, transformPoints, rotateAndTranslatePoint, circlePolyline }
export type { Point2, SymbolPrimitive }
