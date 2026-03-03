import React from 'react'
import { Line, Text } from '@react-three/drei'
import {
  PLAN_VIEW_LINEWIDTH_PX,
  getPlanSymbolColor,
  type SymbolDomain,
} from '../plan-symbol-profile'
import { arcPolyline, circlePolyline, type SymbolPrimitive } from '../symbol-primitives'

function primitivePoints(primitive: SymbolPrimitive): [number, number, number][] {
  if (primitive.kind === 'polyline') {
    const pts = primitive.closed
      ? [...primitive.points, primitive.points[0]]
      : primitive.points
    return pts.map((p) => [p[0], p[1], 0.02] as [number, number, number])
  }
  if (primitive.kind === 'circle') {
    return circlePolyline(primitive.center, primitive.radius, 28).map((p) => [p[0], p[1], 0.02] as [number, number, number])
  }
  if (primitive.kind === 'arc') {
    return arcPolyline(
      primitive.center,
      primitive.radius,
      primitive.startAngle,
      primitive.endAngle,
      18,
    ).map((p) => [p[0], p[1], 0.02] as [number, number, number])
  }
  return []
}

export function renderSymbolPrimitives2D(
  primitives: SymbolPrimitive[],
  domain: SymbolDomain,
  keyPrefix: string,
  monochrome = false,
): React.JSX.Element[] {
  const color = getPlanSymbolColor(domain, monochrome)
  const nodes: React.JSX.Element[] = []

  primitives.forEach((primitive, idx) => {
    if (primitive.kind === 'text') {
      nodes.push(
        <Text
          key={`${keyPrefix}-t-${idx}`}
          position={[primitive.position[0], primitive.position[1], 0.03]}
          rotation={[0, 0, primitive.rotation ?? 0]}
          fontSize={Math.max(0.06, primitive.size)}
          color={color}
          anchorX="center"
          anchorY="middle"
        >
          {primitive.text}
        </Text>,
      )
      return
    }
    const points = primitivePoints(primitive)
    if (points.length < 2) return
    nodes.push(
      <Line
        key={`${keyPrefix}-l-${idx}`}
        points={points}
        color={color}
        lineWidth={PLAN_VIEW_LINEWIDTH_PX[primitive.lineClass]}
      />,
    )
  })
  return nodes
}

