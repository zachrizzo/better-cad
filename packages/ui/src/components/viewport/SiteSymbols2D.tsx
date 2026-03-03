import React, { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import type {
  SiteDetailElement,
  SiteDetailType,
  PrototypeElement,
} from '../../services/kernel-bridge'
import { isSiteDetailElement, useEntityStore } from '../../stores/entity-store'
import { useLevelStore } from '../../stores/level-store'

// ── Colors ──────────────────────────────────────────────────────────────────

const SITE_COLOR = '#16a34a' // green
const SITE_COLOR_SECONDARY = '#4ade80'
const PROPERTY_LINE_COLOR = '#dc2626' // red for property lines
const SETBACK_COLOR = '#f59e0b' // amber for setbacks
const CONTOUR_COLOR = '#78716c' // stone for contour lines

// ── Helpers ─────────────────────────────────────────────────────────────────

function circlePoints(cx: number, cy: number, r: number, segments = 24): [number, number, number][] {
  const pts: [number, number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 0.02])
  }
  return pts
}

// ── Individual symbol renderers ─────────────────────────────────────────────

function renderPropertyLine(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  const lines: React.JSX.Element[] = []

  // Thick solid line connecting points
  const linePoints: [number, number, number][] = el.points.map(
    (p) => [p[0], p[1], 0.01] as [number, number, number],
  )
  lines.push(
    <Line
      key="prop-line"
      points={linePoints}
      color={PROPERTY_LINE_COLOR}
      lineWidth={2.5}
    />,
  )

  // Bearing/distance labels at midpoints
  for (let i = 0; i < el.points.length - 1; i++) {
    const [x1, y1] = el.points[i]
    const [x2, y2] = el.points[i + 1]
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    const dist = Math.hypot(x2 - x1, y2 - y1)
    const angle = Math.atan2(y2 - y1, x2 - x1)

    lines.push(
      <Text
        key={`prop-label-${i}`}
        position={[mx, my + 0.15, 0.03]}
        rotation={[0, 0, angle]}
        fontSize={0.12}
        color={PROPERTY_LINE_COLOR}
        anchorX="center"
        anchorY="bottom"
      >
        {`${dist.toFixed(2)}m`}
      </Text>,
    )
  }

  return <group key={`property-${el.meta.id}`}>{lines}</group>
}

function renderSetback(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  const linePoints: [number, number, number][] = el.points.map(
    (p) => [p[0], p[1], 0.01] as [number, number, number],
  )
  return (
    <group key={`setback-${el.meta.id}`}>
      <Line
        points={linePoints}
        color={SETBACK_COLOR}
        lineWidth={1.5}
        dashed
        dashSize={0.2}
        gapSize={0.15}
      />
    </group>
  )
}

function renderTree(el: SiteDetailElement, _scale: number) {
  const [cx, cy] = el.points[0] || [0, 0]
  const r = el.radius ?? 1.5

  return (
    <group key={`tree-${el.meta.id}`}>
      {/* Circle */}
      <Line points={circlePoints(cx, cy, r)} color={SITE_COLOR} lineWidth={1.5} />
      {/* X inside */}
      <Line
        points={[
          [cx - r * 0.6, cy - r * 0.6, 0.02],
          [cx + r * 0.6, cy + r * 0.6, 0.02],
        ]}
        color={SITE_COLOR}
        lineWidth={1}
      />
      <Line
        points={[
          [cx + r * 0.6, cy - r * 0.6, 0.02],
          [cx - r * 0.6, cy + r * 0.6, 0.02],
        ]}
        color={SITE_COLOR}
        lineWidth={1}
      />
    </group>
  )
}

function renderParkingSpace(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  const [x1, y1] = el.points[0]
  const [x2, y2] = el.points[1]

  // Standard parking space: 2.5m x 5m rectangle with diagonal
  const w = 2.5
  const d = 5.0
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2

  const rot = (dx: number, dy: number): [number, number, number] => [
    cx + dx * cos - dy * sin,
    cy + dx * sin + dy * cos,
    0.02,
  ]

  const hw = w / 2
  const hd = d / 2

  return (
    <group key={`parking-${el.meta.id}`}>
      <Line
        points={[rot(-hw, -hd), rot(hw, -hd), rot(hw, hd), rot(-hw, hd), rot(-hw, -hd)]}
        color={SITE_COLOR_SECONDARY}
        lineWidth={1}
      />
      <Line points={[rot(-hw, -hd), rot(hw, hd)]} color={SITE_COLOR_SECONDARY} lineWidth={0.8} />
    </group>
  )
}

function renderSidewalk(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  const linePoints: [number, number, number][] = el.points.map(
    (p) => [p[0], p[1], 0.01] as [number, number, number],
  )

  // Hatched area - approximate with lines along path
  const hatchLines: React.JSX.Element[] = []
  for (let i = 0; i < el.points.length - 1; i++) {
    const [x1, y1] = el.points[i]
    const [x2, y2] = el.points[i + 1]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len < 0.1) continue
    const nx = -dy / len * 0.5
    const ny = dx / len * 0.5

    // Perpendicular hatch lines along the segment
    const hatchCount = Math.max(2, Math.floor(len / 0.5))
    for (let j = 0; j <= hatchCount; j++) {
      const t = j / hatchCount
      const px = x1 + dx * t
      const py = y1 + dy * t
      hatchLines.push(
        <Line
          key={`sw-hatch-${i}-${j}`}
          points={[
            [px + nx, py + ny, 0.015],
            [px - nx, py - ny, 0.015],
          ]}
          color={SITE_COLOR_SECONDARY}
          lineWidth={0.5}
        />,
      )
    }
  }

  return (
    <group key={`sidewalk-${el.meta.id}`}>
      <Line points={linePoints} color={SITE_COLOR} lineWidth={1.5} />
      {hatchLines}
    </group>
  )
}

function renderDriveway(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  // Light-fill rectangle drawn from points
  const linePoints: [number, number, number][] = el.points.map(
    (p) => [p[0], p[1], 0.01] as [number, number, number],
  )
  // Close the polygon if 4+ points
  if (el.points.length >= 3) {
    linePoints.push([el.points[0][0], el.points[0][1], 0.01])
  }

  return (
    <group key={`driveway-${el.meta.id}`}>
      <Line
        points={linePoints}
        color={SITE_COLOR_SECONDARY}
        lineWidth={1.2}
      />
    </group>
  )
}

function renderCompass(el: SiteDetailElement, _scale: number) {
  const [cx, cy] = el.points[0] || [0, 0]
  const size = 1.0

  // North arrow: triangle pointing up with N label
  return (
    <group key={`compass-${el.meta.id}`}>
      {/* Triangle pointing north */}
      <Line
        points={[
          [cx, cy + size, 0.02],
          [cx - size * 0.3, cy - size * 0.3, 0.02],
          [cx + size * 0.3, cy - size * 0.3, 0.02],
          [cx, cy + size, 0.02],
        ]}
        color={SITE_COLOR}
        lineWidth={2}
      />
      {/* N label */}
      <Text
        position={[cx, cy + size + 0.2, 0.03]}
        fontSize={0.25}
        color={SITE_COLOR}
        anchorX="center"
        anchorY="bottom"
      >
        N
      </Text>
      {/* Center line */}
      <Line
        points={[
          [cx, cy - size * 0.5, 0.02],
          [cx, cy + size, 0.02],
        ]}
        color={SITE_COLOR}
        lineWidth={1}
      />
    </group>
  )
}

function renderContourLine(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  const linePoints: [number, number, number][] = el.points.map(
    (p) => [p[0], p[1], 0.01] as [number, number, number],
  )

  // Elevation label at midpoint
  const midIdx = Math.floor(el.points.length / 2)
  const [mx, my] = el.points[midIdx]

  return (
    <group key={`contour-${el.meta.id}`}>
      <Line
        points={linePoints}
        color={CONTOUR_COLOR}
        lineWidth={0.8}
      />
      {el.elevation !== undefined && (
        <Text
          position={[mx, my + 0.1, 0.03]}
          fontSize={0.1}
          color={CONTOUR_COLOR}
          anchorX="center"
          anchorY="bottom"
        >
          {`${el.elevation.toFixed(1)}m`}
        </Text>
      )}
    </group>
  )
}

function renderFence(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  const linePoints: [number, number, number][] = el.points.map(
    (p) => [p[0], p[1], 0.01] as [number, number, number],
  )

  // X marks at intervals along the fence
  const xMarks: React.JSX.Element[] = []
  for (let i = 0; i < el.points.length - 1; i++) {
    const [x1, y1] = el.points[i]
    const [x2, y2] = el.points[i + 1]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (len < 0.3) continue

    const xCount = Math.max(1, Math.floor(len / 0.5))
    const markSize = 0.08
    for (let j = 1; j < xCount; j++) {
      const t = j / xCount
      const px = x1 + dx * t
      const py = y1 + dy * t
      xMarks.push(
        <Line
          key={`fence-x-${i}-${j}-a`}
          points={[
            [px - markSize, py - markSize, 0.02],
            [px + markSize, py + markSize, 0.02],
          ]}
          color={SITE_COLOR}
          lineWidth={0.8}
        />,
      )
      xMarks.push(
        <Line
          key={`fence-x-${i}-${j}-b`}
          points={[
            [px + markSize, py - markSize, 0.02],
            [px - markSize, py + markSize, 0.02],
          ]}
          color={SITE_COLOR}
          lineWidth={0.8}
        />,
      )
    }
  }

  return (
    <group key={`fence-${el.meta.id}`}>
      <Line points={linePoints} color={SITE_COLOR} lineWidth={1.5} />
      {xMarks}
    </group>
  )
}

function renderRetaining(el: SiteDetailElement, _scale: number) {
  if (el.points.length < 2) return null
  const linePoints: [number, number, number][] = el.points.map(
    (p) => [p[0], p[1], 0.01] as [number, number, number],
  )

  return (
    <group key={`retaining-${el.meta.id}`}>
      <Line
        points={linePoints}
        color={SITE_COLOR}
        lineWidth={2}
      />
    </group>
  )
}

function renderSiteElement(el: SiteDetailElement, scale: number): React.JSX.Element | null {
  switch (el.detail_type as SiteDetailType) {
    case 'property_line':
      return renderPropertyLine(el, scale)
    case 'setback':
      return renderSetback(el, scale)
    case 'tree':
      return renderTree(el, scale)
    case 'parking_space':
      return renderParkingSpace(el, scale)
    case 'sidewalk':
      return renderSidewalk(el, scale)
    case 'driveway':
      return renderDriveway(el, scale)
    case 'compass':
      return renderCompass(el, scale)
    case 'contour_line':
      return renderContourLine(el, scale)
    case 'fence':
      return renderFence(el, scale)
    case 'retaining':
      return renderRetaining(el, scale)
    default:
      return null
  }
}

// ── Main component ──────────────────────────────────────────────────────────

interface SiteSymbols2DProps {
  elements?: PrototypeElement[]
  scale?: number
}

export function SiteSymbols2D({ elements: externalElements, scale = 1 }: SiteSymbols2DProps) {
  const storeElements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)

  const allElements = useMemo(() => {
    if (externalElements) return externalElements
    return Array.from(storeElements.values()).filter(
      (e) => !e.meta.level_id || e.meta.level_id === activeLevelId,
    )
  }, [externalElements, storeElements, activeLevelId])

  const siteElements = useMemo(
    () => allElements.filter((e): e is SiteDetailElement => isSiteDetailElement(e)),
    [allElements],
  )

  return (
    <>
      {siteElements.map((el) => renderSiteElement(el, scale))}
    </>
  )
}
