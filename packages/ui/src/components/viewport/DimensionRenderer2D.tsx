import { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import type { DimensionElement, PrototypeElement } from '../../services/kernel-bridge'
import { isDimensionElement } from '../../stores/entity-store'
import { formatDimensionText } from '../../utils/units'

// ── Dimension formatting ──────────────────────────────────────────────────

/**
 * Convenience wrapper that maps the legacy 'imperial' | 'metric' flag to the
 * unified `formatDimensionText` from utils/units.ts.  Exported so any
 * existing callers continue to work.
 */
export function formatDimension(meters: number, units: 'imperial' | 'metric'): string {
  if (units === 'imperial') {
    return formatDimensionText(meters, 'ft', { fractional: true })
  }
  // Metric: always show in mm (matches previous behaviour)
  return formatDimensionText(meters, 'mm', { precision: 0 })
}

// ── Single dimension rendering ────────────────────────────────────────────

const COS45 = Math.cos(Math.PI / 4)
const SIN45 = Math.sin(Math.PI / 4)

interface DimensionItemProps {
  dim: DimensionElement
  scale: number
  units: 'imperial' | 'metric'
}

function DimensionItem({ dim, scale, units }: DimensionItemProps) {
  const { p1, p2, offset } = dim

  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null

  // Unit direction along measured line
  const ux = dx / len
  const uy = dy / len

  // Perpendicular normal
  const nx = -uy
  const ny = ux

  // Extension line gap and overshoot (in world units, scaled to ~1mm and ~2mm on paper)
  const gap = 1 / (scale * 1000) // ~1mm gap at paper scale
  const overshoot = 2 / (scale * 1000) // ~2mm overshoot past dimension line

  // Extension line endpoints
  const ext1Start: [number, number, number] = [
    p1[0] + nx * gap,
    p1[1] + ny * gap,
    0.02,
  ]
  const ext1End: [number, number, number] = [
    p1[0] + nx * (offset + overshoot),
    p1[1] + ny * (offset + overshoot),
    0.02,
  ]
  const ext2Start: [number, number, number] = [
    p2[0] + nx * gap,
    p2[1] + ny * gap,
    0.02,
  ]
  const ext2End: [number, number, number] = [
    p2[0] + nx * (offset + overshoot),
    p2[1] + ny * (offset + overshoot),
    0.02,
  ]

  // Dimension line endpoints (at offset distance)
  const dimStart: [number, number, number] = [
    p1[0] + nx * offset,
    p1[1] + ny * offset,
    0.02,
  ]
  const dimEnd: [number, number, number] = [
    p2[0] + nx * offset,
    p2[1] + ny * offset,
    0.02,
  ]

  // Tick marks: 45-degree slash, ~3mm on paper
  const tickLength = 3 / (scale * 1000)
  const halfTick = tickLength / 2

  // Tick at dimension start
  const tick1a: [number, number, number] = [
    dimStart[0] - halfTick * COS45,
    dimStart[1] - halfTick * SIN45,
    0.02,
  ]
  const tick1b: [number, number, number] = [
    dimStart[0] + halfTick * COS45,
    dimStart[1] + halfTick * SIN45,
    0.02,
  ]

  // Tick at dimension end
  const tick2a: [number, number, number] = [
    dimEnd[0] - halfTick * COS45,
    dimEnd[1] - halfTick * SIN45,
    0.02,
  ]
  const tick2b: [number, number, number] = [
    dimEnd[0] + halfTick * COS45,
    dimEnd[1] + halfTick * SIN45,
    0.02,
  ]

  // Text midpoint
  const midX = (dimStart[0] + dimEnd[0]) / 2
  const midY = (dimStart[1] + dimEnd[1]) / 2
  const angle = Math.atan2(dy, dx)

  const displayText = dim.text_override || formatDimension(len, units)
  const fontSize = 2.5 / (scale * 1000)

  return (
    <>
      {/* Extension lines */}
      <Line points={[ext1Start, ext1End]} color="#ff6b6b" lineWidth={0.6} />
      <Line points={[ext2Start, ext2End]} color="#ff6b6b" lineWidth={0.6} />

      {/* Dimension line */}
      <Line points={[dimStart, dimEnd]} color="#ff6b6b" lineWidth={1} />

      {/* Tick marks */}
      <Line points={[tick1a, tick1b]} color="#ff6b6b" lineWidth={1} />
      <Line points={[tick2a, tick2b]} color="#ff6b6b" lineWidth={1} />

      {/* Dimension text */}
      <Text
        position={[midX + nx * fontSize * 0.3, midY + ny * fontSize * 0.3, 0.03]}
        rotation={[0, 0, angle]}
        fontSize={fontSize > 0.01 ? fontSize : 0.12}
        color="#ff6b6b"
        anchorX="center"
        anchorY="bottom"
      >
        {displayText}
      </Text>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────

interface DimensionRenderer2DProps {
  elements: PrototypeElement[]
  scale: number
  units: 'imperial' | 'metric'
}

export function DimensionRenderer2D({ elements, scale, units }: DimensionRenderer2DProps) {
  const dimensions = useMemo(
    () => elements.filter((e): e is DimensionElement => isDimensionElement(e)),
    [elements],
  )

  if (dimensions.length === 0) return null

  return (
    <>
      {dimensions.map((dim) => (
        <DimensionItem key={dim.meta.id} dim={dim} scale={scale} units={units} />
      ))}
    </>
  )
}
