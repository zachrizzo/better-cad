import type { jsPDF } from 'jspdf'
import {
  PLAN_LINEWEIGHTS_MM,
  getPlanSymbolColor,
  type SymbolDomain,
} from '../plan-symbol-profile'
import { arcPolyline, circlePolyline, type Point2, type SymbolPrimitive } from '../symbol-primitives'

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return [34, 34, 34]
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [34, 34, 34]
  return [r, g, b]
}

function primitivePoints(primitive: SymbolPrimitive): Point2[] {
  if (primitive.kind === 'polyline') {
    return primitive.closed
      ? [...primitive.points, primitive.points[0]]
      : primitive.points
  }
  if (primitive.kind === 'circle') {
    return circlePolyline(primitive.center, primitive.radius, 28)
  }
  if (primitive.kind === 'arc') {
    return arcPolyline(
      primitive.center,
      primitive.radius,
      primitive.startAngle,
      primitive.endAngle,
      18,
    )
  }
  return []
}

export function drawSymbolPrimitivesPdf(
  doc: jsPDF,
  primitives: SymbolPrimitive[],
  domain: SymbolDomain,
  toPageX: (x: number) => number,
  toPageY: (y: number) => number,
  unitToPageScale: number,
  monochrome = true,
): void {
  const [r, g, b] = hexToRgb(getPlanSymbolColor(domain, monochrome))
  doc.setDrawColor(r, g, b)
  doc.setTextColor(r, g, b)

  for (const primitive of primitives) {
    if (primitive.kind === 'text') {
      const px = toPageX(primitive.position[0])
      const py = toPageY(primitive.position[1])
      const fontSize = Math.max(1.2, primitive.size * unitToPageScale * 0.85)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fontSize)
      doc.text(primitive.text, px, py, {
        align: 'center',
        angle: -((primitive.rotation ?? 0) * 180) / Math.PI,
      })
      continue
    }

    const points = primitivePoints(primitive)
    if (points.length < 2) continue

    const isDashed = 'dashed' in primitive && primitive.dashed === true
    doc.setLineWidth(PLAN_LINEWEIGHTS_MM[primitive.lineClass])
    if (isDashed) doc.setLineDashPattern([2, 2], 0)
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]
      const bpt = points[i + 1]
      doc.line(
        toPageX(a[0]),
        toPageY(a[1]),
        toPageX(bpt[0]),
        toPageY(bpt[1]),
      )
    }
    if (isDashed) doc.setLineDashPattern([], 0)
  }
  doc.setDrawColor(0)
  doc.setTextColor(0)
}

