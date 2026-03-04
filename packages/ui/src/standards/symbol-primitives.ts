import type { AnnotationDensity, PlanSymbolProfileId, SymbolDomain, SymbolLineClass } from './plan-symbol-profile'

export type Point2 = [number, number]

export interface PolylinePrimitive {
  kind: 'polyline'
  points: Point2[]
  closed?: boolean
  lineClass: SymbolLineClass
  dashed?: boolean
}

export interface CirclePrimitive {
  kind: 'circle'
  center: Point2
  radius: number
  lineClass: SymbolLineClass
  dashed?: boolean
}

export interface ArcPrimitive {
  kind: 'arc'
  center: Point2
  radius: number
  startAngle: number
  endAngle: number
  lineClass: SymbolLineClass
  dashed?: boolean
}

export interface TextPrimitive {
  kind: 'text'
  position: Point2
  text: string
  size: number
  rotation?: number
  lineClass: SymbolLineClass
}

export type SymbolPrimitive = PolylinePrimitive | CirclePrimitive | ArcPrimitive | TextPrimitive

export interface SymbolGenerationOptions {
  planSymbolProfile: PlanSymbolProfileId
  annotationDensity: AnnotationDensity
  showLabels: boolean
}

export interface SymbolPrimitiveBundle {
  domain: SymbolDomain
  primitives: SymbolPrimitive[]
}

export function rectPoints(width: number, depth: number): Point2[] {
  const hw = width / 2
  const hd = depth / 2
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
}

export function rotateAndTranslatePoint(point: Point2, center: Point2, rotation: number): Point2 {
  const [px, py] = point
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return [
    center[0] + px * cos - py * sin,
    center[1] + px * sin + py * cos,
  ]
}

export function transformPoints(points: Point2[], center: Point2, rotation: number): Point2[] {
  return points.map((pt) => rotateAndTranslatePoint(pt, center, rotation))
}

export function circlePolyline(
  center: Point2,
  radius: number,
  segments = 24,
): Point2[] {
  const pts: Point2[] = []
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    pts.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ])
  }
  return pts
}

export function arcPolyline(
  center: Point2,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments = 16,
): Point2[] {
  const pts: Point2[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / Math.max(1, segments)
    const angle = startAngle + (endAngle - startAngle) * t
    pts.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ])
  }
  return pts
}
