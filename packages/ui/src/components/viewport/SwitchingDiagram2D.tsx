import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import type { ElectricalElement, PrototypeElement } from '../../services/kernel-bridge'
import { isElectricalElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'

// ── Types ───────────────────────────────────────────────────────────────────

const SWITCH_TYPES = new Set(['switch', 'three_way_switch', 'dimmer_switch'])
const DIAGRAM_COLOR = '#ef4444'
const DIAGRAM_DASH_SIZE = 0.1
const DIAGRAM_GAP_SIZE = 0.08

// ── Helpers ─────────────────────────────────────────────────────────────────

interface SwitchConnection {
  switchEl: ElectricalElement
  fixtureEl: ElectricalElement
}

function computeControlPoint(
  sx: number,
  sy: number,
  fx: number,
  fy: number,
): [number, number] {
  // Midpoint with perpendicular offset for a nice curve
  const mx = (sx + fx) / 2
  const my = (sy + fy) / 2
  const dx = fx - sx
  const dy = fy - sy
  const len = Math.hypot(dx, dy)
  if (len < 1e-8) return [mx, my]

  // Perpendicular offset = 20% of distance
  const offset = len * 0.2
  const nx = -dy / len
  const ny = dx / len
  return [mx + nx * offset, my + ny * offset]
}

function quadraticBezierPoints(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  ex: number,
  ey: number,
  segments = 20,
): [number, number, number][] {
  const pts: [number, number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    const px = u * u * sx + 2 * u * t * cx + t * t * ex
    const py = u * u * sy + 2 * u * t * cy + t * t * ey
    pts.push([px, py, 0.015])
  }
  return pts
}

// ── Component ───────────────────────────────────────────────────────────────

interface SwitchingDiagram2DProps {
  elements?: PrototypeElement[]
}

export function SwitchingDiagram2D({ elements: externalElements }: SwitchingDiagram2DProps) {
  const storeElements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)

  const allElements = useMemo(() => {
    if (externalElements) return externalElements
    return Array.from(storeElements.values()).filter(
      (e) => !e.meta.level_id || e.meta.level_id === activeLevelId,
    )
  }, [externalElements, storeElements, activeLevelId])

  const connections = useMemo(() => {
    const electricalElements = allElements.filter(
      (e): e is ElectricalElement => isElectricalElement(e),
    )
    const elemById = new Map(electricalElements.map((e) => [e.meta.id, e]))

    const result: SwitchConnection[] = []
    for (const el of electricalElements) {
      if (SWITCH_TYPES.has(el.symbol_type) && el.connected_to) {
        const fixture = elemById.get(el.connected_to)
        if (fixture) {
          result.push({ switchEl: el, fixtureEl: fixture })
        }
      }
    }
    return result
  }, [allElements])

  return (
    <>
      {connections.map((conn, i) => {
        const [sx, sy] = conn.switchEl.position
        const [fx, fy] = conn.fixtureEl.position
        const [cx, cy] = computeControlPoint(sx, sy, fx, fy)
        const curvePoints = quadraticBezierPoints(sx, sy, cx, cy, fx, fy)

        return (
          <Line
            key={`switching-${conn.switchEl.meta.id}-${conn.fixtureEl.meta.id}-${i}`}
            points={curvePoints}
            color={DIAGRAM_COLOR}
            lineWidth={1}
            dashed
            dashSize={DIAGRAM_DASH_SIZE}
            gapSize={DIAGRAM_GAP_SIZE}
          />
        )
      })}
    </>
  )
}
