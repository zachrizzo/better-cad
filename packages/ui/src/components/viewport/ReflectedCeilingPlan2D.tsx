/**
 * Reflected Ceiling Plan (RCP) viewport.
 *
 * Renders an SVG view looking UP at the ceiling:
 * - Walls shown as dashed lines (below the ceiling plane)
 * - Ceiling-mounted electrical fixtures (light_fixture, ceiling_fan)
 * - Ceiling height annotations at room centers
 * - Door openings shown as dashed arcs
 */

import React, { useMemo } from 'react'
import type {
  DoorElement,
  ElectricalElement,
  PrototypeElement,
  RoomElement,
  WallElement,
  WindowElement,
} from '../../services/kernel-bridge'
import { resolveRoomName } from '../../services/room-utils'
import { buildVisibleWallOutlineLines } from '../../utils/wall-outline'

// ── Props ───────────────────────────────────────────────────────────────────

interface ReflectedCeilingPlan2DProps {
  elements: PrototypeElement[]
  width?: number
  height?: number
  /** Default ceiling height used when room data does not specify one. */
  defaultCeilingHeight?: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWall(el: PrototypeElement): el is WallElement {
  return el.kind === 'wall'
}
function isDoor(el: PrototypeElement): el is DoorElement {
  return el.kind === 'door'
}
function isWindow(el: PrototypeElement): el is WindowElement {
  return el.kind === 'window'
}
function isRoom(el: PrototypeElement): el is RoomElement {
  return el.kind === 'room'
}
function isElectrical(el: PrototypeElement): el is ElectricalElement {
  return el.kind === 'electrical'
}

/** Check if an electrical element is ceiling-mounted. */
function isCeilingMounted(el: ElectricalElement): boolean {
  return el.symbol_type === 'light_fixture' || el.symbol_type === 'ceiling_fan'
}

/** Compute centroid of a polygon. */
function centroid(pts: [number, number][]): [number, number] {
  if (pts.length === 0) return [0, 0]
  let cx = 0
  let cy = 0
  for (const [x, y] of pts) {
    cx += x
    cy += y
  }
  return [cx / pts.length, cy / pts.length]
}

/** Generate arc points for a door swing in the RCP. */
function doorArcSvg(
  hinge: [number, number],
  radius: number,
  startAngle: number,
  sweepAngle: number,
  segments: number = 12,
): string {
  const pts: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = startAngle + sweepAngle * t
    pts.push([
      hinge[0] + Math.cos(angle) * radius,
      hinge[1] + Math.sin(angle) * radius,
    ])
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')
}

// ── Component ───────────────────────────────────────────────────────────────

export function ReflectedCeilingPlan2D({
  elements,
  width = 800,
  height = 600,
  defaultCeilingHeight = 2.7,
}: ReflectedCeilingPlan2DProps) {
  // Filter elements by kind
  const walls = useMemo(() => elements.filter(isWall), [elements])
  const doors = useMemo(() => elements.filter(isDoor), [elements])
  const rooms = useMemo(() => elements.filter(isRoom), [elements])
  const ceilingFixtures = useMemo(
    () => elements.filter(isElectrical).filter(isCeilingMounted),
    [elements],
  )

  // Build wall lookup
  const wallById = useMemo(() => {
    const m = new Map<string, WallElement>()
    walls.forEach((w) => m.set(w.meta.id, w))
    return m
  }, [walls])

  // Compute plan bounds (union of all wall endpoints)
  const bounds = useMemo(() => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const w of walls) {
      minX = Math.min(minX, w.start[0], w.end[0])
      maxX = Math.max(maxX, w.start[0], w.end[0])
      minY = Math.min(minY, w.start[1], w.end[1])
      maxY = Math.max(maxY, w.start[1], w.end[1])
    }
    for (const r of rooms) {
      for (const pt of r.boundary) {
        minX = Math.min(minX, pt[0])
        maxX = Math.max(maxX, pt[0])
        minY = Math.min(minY, pt[1])
        maxY = Math.max(maxY, pt[1])
      }
    }
    for (const f of ceilingFixtures) {
      minX = Math.min(minX, f.position[0])
      maxX = Math.max(maxX, f.position[0])
      minY = Math.min(minY, f.position[1])
      maxY = Math.max(maxY, f.position[1])
    }

    if (!isFinite(minX)) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 }
    }

    // Add margin
    const mx = (maxX - minX) * 0.1 || 1
    const my = (maxY - minY) * 0.1 || 1
    return { minX: minX - mx, maxX: maxX + mx, minY: minY - my, maxY: maxY + my }
  }, [walls, rooms, ceilingFixtures])

  const viewW = bounds.maxX - bounds.minX
  const viewH = bounds.maxY - bounds.minY

  const padding = 30
  const scaleX = viewW > 0 ? (width - padding * 2) / viewW : 1
  const scaleY = viewH > 0 ? (height - padding * 2) / viewH : 1
  const scale = Math.min(scaleX, scaleY)

  /** Transform world XY to SVG coords. */
  const toSvg = (x: number, y: number): [number, number] => [
    (x - bounds.minX) * scale + padding,
    height - ((y - bounds.minY) * scale + padding),
  ]

  // ── Wall outlines (dashed – walls are below ceiling) ─────────────────────
  const wallSegments = useMemo(() => {
    const outlineLines = buildVisibleWallOutlineLines(walls)
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (const line of outlineLines) {
      const s = toSvg(line.start[0], line.start[1])
      const e = toSvg(line.end[0], line.end[1])
      segs.push({ x1: s[0], y1: s[1], x2: e[0], y2: e[1] })
    }
    return segs
  }, [walls, scale, bounds])

  // ── Door dashed arcs ──────────────────────────────────────────────────────
  const doorArcs = useMemo(() => {
    const arcs: { d: string }[] = []
    for (const door of doors) {
      const wall = wallById.get(door.wall_id)
      if (!wall) continue
      const dx = wall.end[0] - wall.start[0]
      const dy = wall.end[1] - wall.start[1]
      const len = Math.max(1e-8, Math.hypot(dx, dy))
      const dir: [number, number] = [dx / len, dy / len]
      const center: [number, number] = [
        wall.start[0] + dx * door.position_along_wall,
        wall.start[1] + dy * door.position_along_wall,
      ]
      const half = door.width / 2
      const normal: [number, number] = [-dir[1], dir[0]]
      const swing = door.swing === 'left' ? 'left' : 'right'
      const hinge: [number, number] = swing === 'left'
        ? [center[0] - dir[0] * half, center[1] - dir[1] * half]
        : [center[0] + dir[0] * half, center[1] + dir[1] * half]
      const closedDir: [number, number] = swing === 'left' ? dir : [-dir[0], -dir[1]]
      const openDir: [number, number] = swing === 'left' ? normal : [-normal[0], -normal[1]]

      // Generate arc in world coords then transform
      const pts: [number, number][] = []
      const segments = 14
      for (let i = 0; i <= segments; i++) {
        const theta = (Math.PI / 2) * (i / segments)
        const wx = hinge[0] + door.width * (closedDir[0] * Math.cos(theta) + openDir[0] * Math.sin(theta))
        const wy = hinge[1] + door.width * (closedDir[1] * Math.cos(theta) + openDir[1] * Math.sin(theta))
        pts.push(toSvg(wx, wy))
      }
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
      arcs.push({ d })
    }
    return arcs
  }, [doors, wallById, scale, bounds])

  // ── Ceiling fixture symbols ───────────────────────────────────────────────
  const fixtureSymbols = useMemo(() => {
    return ceilingFixtures.map((el) => {
      const [sx, sy] = toSvg(el.position[0], el.position[1])
      return {
        id: el.meta.id,
        x: sx,
        y: sy,
        type: el.symbol_type,
      }
    })
  }, [ceilingFixtures, scale, bounds])

  // ── Room labels with ceiling height ──────────────────────────────────────
  const roomLabels = useMemo(() => {
    return rooms.map((room) => {
      const c = centroid(room.boundary)
      const [sx, sy] = toSvg(c[0], c[1])
      return {
        id: room.meta.id,
        x: sx,
        y: sy,
        name: resolveRoomName(room),
      }
    })
  }, [rooms, scale, bounds])

  const fixtureRadius = Math.max(6, 0.05 * scale)

  return (
    <svg width={width} height={height} style={{ background: '#fafafa' }}>
      {/* Title */}
      <text
        x={width / 2}
        y={18}
        textAnchor="middle"
        fill="#2d3748"
        fontSize={12}
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        Reflected Ceiling Plan
      </text>

      {/* Wall outlines (dashed, medium weight) */}
      {wallSegments.map((seg, i) => (
        <line
          key={`rcp-wall-${i}`}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke="#718096"
          strokeWidth={1.2}
          strokeDasharray="6,3"
        />
      ))}

      {/* Door arcs (dashed) */}
      {doorArcs.map((arc, i) => (
        <path
          key={`rcp-door-arc-${i}`}
          d={arc.d}
          fill="none"
          stroke="#d69e2e"
          strokeWidth={1}
          strokeDasharray="4,3"
        />
      ))}

      {/* Ceiling grid lines (light background grid) */}
      {(() => {
        const gridSpacing = 1.2 // meters in world space
        const gridLines: React.ReactElement[] = []
        const startX = Math.ceil(bounds.minX / gridSpacing) * gridSpacing
        const startY = Math.ceil(bounds.minY / gridSpacing) * gridSpacing

        for (let x = startX; x <= bounds.maxX; x += gridSpacing) {
          const [sx1, sy1] = toSvg(x, bounds.minY)
          const [sx2, sy2] = toSvg(x, bounds.maxY)
          gridLines.push(
            <line
              key={`rcp-grid-v-${x}`}
              x1={sx1}
              y1={sy1}
              x2={sx2}
              y2={sy2}
              stroke="#e2e8f0"
              strokeWidth={0.3}
            />,
          )
        }
        for (let y = startY; y <= bounds.maxY; y += gridSpacing) {
          const [sx1, sy1] = toSvg(bounds.minX, y)
          const [sx2, sy2] = toSvg(bounds.maxX, y)
          gridLines.push(
            <line
              key={`rcp-grid-h-${y}`}
              x1={sx1}
              y1={sy1}
              x2={sx2}
              y2={sy2}
              stroke="#e2e8f0"
              strokeWidth={0.3}
            />,
          )
        }
        return gridLines
      })()}

      {/* Ceiling light fixture symbols (solid lines – on ceiling plane) */}
      {fixtureSymbols.map((f) => {
        const r = fixtureRadius
        if (f.type === 'ceiling_fan') {
          // Circle with CF text
          return (
            <g key={`rcp-fix-${f.id}`}>
              <circle cx={f.x} cy={f.y} r={r} fill="none" stroke="#e53e3e" strokeWidth={1.5} />
              <text
                x={f.x}
                y={f.y + 3}
                textAnchor="middle"
                fill="#e53e3e"
                fontSize={r * 0.9}
                fontFamily="sans-serif"
              >
                CF
              </text>
            </g>
          )
        }
        // Light fixture: circle with crosshairs
        return (
          <g key={`rcp-fix-${f.id}`}>
            <circle cx={f.x} cy={f.y} r={r} fill="none" stroke="#e53e3e" strokeWidth={1.5} />
            <line x1={f.x - r} y1={f.y} x2={f.x + r} y2={f.y} stroke="#e53e3e" strokeWidth={0.8} />
            <line x1={f.x} y1={f.y - r} x2={f.x} y2={f.y + r} stroke="#e53e3e" strokeWidth={0.8} />
            {/* Diagonal crosshairs */}
            <line
              x1={f.x - r * 0.707}
              y1={f.y - r * 0.707}
              x2={f.x + r * 0.707}
              y2={f.y + r * 0.707}
              stroke="#e53e3e"
              strokeWidth={0.6}
            />
            <line
              x1={f.x + r * 0.707}
              y1={f.y - r * 0.707}
              x2={f.x - r * 0.707}
              y2={f.y + r * 0.707}
              stroke="#e53e3e"
              strokeWidth={0.6}
            />
          </g>
        )
      })}

      {/* Room labels with ceiling height annotation */}
      {roomLabels.map((rl) => (
        <g key={`rcp-room-${rl.id}`}>
          <text
            x={rl.x}
            y={rl.y - 6}
            textAnchor="middle"
            fill="#6b46c1"
            fontSize={11}
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {rl.name}
          </text>
          <text
            x={rl.x}
            y={rl.y + 8}
            textAnchor="middle"
            fill="#805ad5"
            fontSize={9}
            fontFamily="sans-serif"
          >
            CLG {defaultCeilingHeight.toFixed(2)} m
          </text>
        </g>
      ))}
    </svg>
  )
}
