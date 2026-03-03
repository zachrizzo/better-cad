import React, { useMemo } from 'react'
import type { SectionViewData, ElevationViewData } from '../../services/kernel-bridge'
import { generateSvgPatternDefs, getHatchForElementKind } from '../../utils/hatch-patterns'
import type { GeneratedElevation } from '../../services/elevation-generator'

// ── SVG Pattern Defs Component ──────────────────────────────────────────

/** Renders all hatch pattern <defs> into the SVG. Content is generated from
 *  static HATCH_PATTERNS data only (no user input) so XSS is not a concern. */
function HatchPatternDefs() {
  const defs = useMemo(() => generateSvgPatternDefs(), [])
  // We use a <g> wrapper so React handles the outer element; the inner HTML
  // is entirely static pattern definitions.
  return <g dangerouslySetInnerHTML={{ __html: defs }} />
}

// ── Section viewport ──────────────────────────────────────────────────────

interface SectionViewport2DProps {
  data: SectionViewData
  width?: number
  height?: number
  /** Optional floor-to-floor heights for dimension annotations on the right side. */
  floorHeights?: { label: string; elevation: number }[]
}

export function SectionViewport2D({
  data,
  width = 800,
  height = 400,
  floorHeights,
}: SectionViewport2DProps) {
  const padding = 40
  const scaleX = data.view_width > 0 ? (width - padding * 2) / data.view_width : 1
  const scaleY = data.view_height > 0 ? (height - padding * 2) / data.view_height : 1
  const scale = Math.min(scaleX, scaleY) * 0.85

  const toSvg = (pt: [number, number]): [number, number] => [
    pt[0] * scale + padding,
    height - (pt[1] * scale + padding),
  ]

  // Ground line at elevation 0
  const groundY = height - padding

  // Determine max cut X for dimension placement
  const maxCutX = useMemo(() => {
    let mx = 0
    for (const line of data.cut_lines) {
      mx = Math.max(mx, line.end[0], line.start[0])
    }
    for (const poly of data.hatch_polygons) {
      for (const pt of poly.points) {
        mx = Math.max(mx, pt[0])
      }
    }
    return mx
  }, [data])

  // Right-side dimension X in SVG coords
  const dimX = maxCutX * scale + padding + 30

  return (
    <svg width={width} height={height} style={{ background: '#f5f5f5' }}>
      {/* Inject all hatch pattern definitions */}
      <HatchPatternDefs />

      {/* Ground line (dashed) */}
      <line
        x1={0}
        y1={groundY}
        x2={width}
        y2={groundY}
        stroke="#4a5568"
        strokeWidth={1.5}
        strokeDasharray="8,4"
      />
      <text
        x={8}
        y={groundY - 4}
        fill="#4a5568"
        fontSize={10}
        fontFamily="sans-serif"
      >
        GL 0.00
      </text>

      {/* Hatch polygons with material patterns */}
      {data.hatch_polygons.map((poly, i) => {
        const pts = poly.points.map((p) => toSvg(p as [number, number]))
        const d =
          pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'

        // Determine hatch pattern based on element kind from cut_lines
        const matchingCut = data.cut_lines.find((cl) => cl.element_id === poly.element_id)
        const elementKind = matchingCut?.element_kind ?? 'wall'
        const patternId = getHatchForElementKind(elementKind)

        return (
          <React.Fragment key={`hatch-${i}`}>
            {/* Background fill */}
            <path d={d} fill="#e2e8f0" stroke="none" />
            {/* Hatch pattern overlay */}
            <path d={d} fill={`url(#${patternId})`} stroke="#333" strokeWidth={1.2} />
          </React.Fragment>
        )
      })}

      {/* Cut lines (heavier weight for section cuts) */}
      {data.cut_lines.map((line, i) => {
        const [x1, y1] = toSvg(line.start as [number, number])
        const [x2, y2] = toSvg(line.end as [number, number])
        return (
          <line
            key={`cut-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#000"
            strokeWidth={2}
          />
        )
      })}

      {/* Floor-to-floor height dimensions on the right side */}
      {floorHeights && floorHeights.length > 0 && (
        <g>
          {floorHeights.map((floor, i) => {
            const [, sy] = toSvg([0, floor.elevation])
            return (
              <React.Fragment key={`floor-dim-${i}`}>
                {/* Horizontal tick line */}
                <line
                  x1={dimX - 5}
                  y1={sy}
                  x2={dimX + 5}
                  y2={sy}
                  stroke="#e53e3e"
                  strokeWidth={1}
                />
                {/* Floor level label */}
                <text
                  x={dimX + 8}
                  y={sy + 4}
                  fill="#e53e3e"
                  fontSize={9}
                  fontFamily="sans-serif"
                >
                  {floor.label} ({floor.elevation.toFixed(2)} m)
                </text>
                {/* Vertical dimension line to next floor */}
                {i < floorHeights.length - 1 && (() => {
                  const [, nextSy] = toSvg([0, floorHeights[i + 1].elevation])
                  const midY = (sy + nextSy) / 2
                  const floorDiff = floorHeights[i + 1].elevation - floor.elevation
                  return (
                    <React.Fragment>
                      <line
                        x1={dimX}
                        y1={sy}
                        x2={dimX}
                        y2={nextSy}
                        stroke="#e53e3e"
                        strokeWidth={0.8}
                      />
                      <text
                        x={dimX + 4}
                        y={midY + 3}
                        fill="#e53e3e"
                        fontSize={8}
                        fontFamily="sans-serif"
                      >
                        {floorDiff.toFixed(2)} m
                      </text>
                    </React.Fragment>
                  )
                })()}
              </React.Fragment>
            )
          })}
        </g>
      )}

      {/* Title */}
      <text
        x={width / 2}
        y={16}
        textAnchor="middle"
        fill="#2d3748"
        fontSize={12}
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        Section View
      </text>
    </svg>
  )
}

// ── Elevation viewport (enhanced) ───────────────────────────────────────

interface ElevationViewport2DProps {
  data: ElevationViewData
  /** Auto-generated elevation data (from elevation-generator service) */
  generated?: GeneratedElevation
  width?: number
  height?: number
  direction?: string
}

export function ElevationViewport2D({
  data,
  generated,
  width = 800,
  height = 400,
  direction,
}: ElevationViewport2DProps) {
  const padding = 40

  // Compute view bounds from both raw data and generated data
  const bounds = useMemo(() => {
    let vw = data.view_width
    let vh = data.view_height

    if (generated) {
      for (const ol of generated.outlines) {
        vw = Math.max(vw, Math.abs(ol.x2 - ol.x1) + 2)
        vh = Math.max(vh, Math.abs(ol.y2 - ol.y1) + 2)
      }
    }

    return { vw: vw || 1, vh: vh || 1 }
  }, [data, generated])

  const scaleX = (width - padding * 2) / bounds.vw
  const scaleY = (height - padding * 2) / bounds.vh
  const scale = Math.min(scaleX, scaleY) * 0.85

  // Compute offset so content is centered
  const offsetX = useMemo(() => {
    if (!generated || generated.outlines.length === 0) return 0
    let minX = Infinity
    for (const ol of generated.outlines) {
      minX = Math.min(minX, ol.x1, ol.x2)
    }
    return isFinite(minX) ? -minX : 0
  }, [generated])

  const toSvg = (pt: [number, number]): [number, number] => [
    (pt[0] + offsetX) * scale + padding,
    height - (pt[1] * scale + padding),
  ]

  // Ground line Y in SVG coords
  const groundY = height - padding

  const dirLabel = direction ?? generated?.direction ?? ''

  return (
    <svg width={width} height={height} style={{ background: '#f5f5f5' }}>
      {/* Hatch pattern definitions */}
      <HatchPatternDefs />

      {/* Ground line */}
      <line
        x1={0}
        y1={groundY}
        x2={width}
        y2={groundY}
        stroke="#4a5568"
        strokeWidth={1.5}
        strokeDasharray="8,4"
      />

      {/* Grade mark triangle */}
      <polygon
        points={`${padding - 5},${groundY} ${padding + 5},${groundY} ${padding},${groundY - 8}`}
        fill="#4a5568"
      />
      <text
        x={padding + 10}
        y={groundY + 14}
        fill="#4a5568"
        fontSize={9}
        fontFamily="sans-serif"
      >
        Grade 0.00
      </text>

      {/* Generated elevation fills */}
      {generated?.fills.map((fill, i) => {
        const pts = fill.points.map((p) => toSvg(p))
        const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'
        return (
          <React.Fragment key={`gen-fill-${i}`}>
            <path d={d} fill="#e2e8f0" stroke="none" />
            <path d={d} fill={`url(#${fill.pattern})`} stroke="none" opacity={0.4} />
          </React.Fragment>
        )
      })}

      {/* Raw elevation lines from kernel */}
      {data.lines.map((line, i) => {
        const [x1, y1] = toSvg(line.start as [number, number])
        const [x2, y2] = toSvg(line.end as [number, number])
        return (
          <line
            key={`elev-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#333"
            strokeWidth={1}
          />
        )
      })}

      {/* Generated elevation outlines */}
      {generated?.outlines.map((ol, i) => {
        const [x1, y1] = toSvg([ol.x1, ol.y1])
        const [x2, y2] = toSvg([ol.x2, ol.y2])
        return (
          <line
            key={`gen-ol-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#1a202c"
            strokeWidth={ol.lineweight}
          />
        )
      })}

      {/* Generated labels */}
      {generated?.labels.map((lbl, i) => {
        const [sx, sy] = toSvg([lbl.x, lbl.y])
        return (
          <text
            key={`gen-lbl-${i}`}
            x={sx}
            y={sy}
            fill="#2d3748"
            fontSize={Math.max(8, lbl.size * scale)}
            fontFamily="sans-serif"
            textAnchor="middle"
          >
            {lbl.text}
          </text>
        )
      })}

      {/* Generated dimension lines */}
      {generated?.dimensions.map((dim, i) => {
        const [sx1, sy1] = toSvg(dim.p1)
        const [sx2, sy2] = toSvg(dim.p2)
        const midY = (sy1 + sy2) / 2
        const offsetPx = dim.offset * scale
        return (
          <g key={`gen-dim-${i}`}>
            {/* Vertical or horizontal dimension line */}
            <line
              x1={sx1 + offsetPx}
              y1={sy1}
              x2={sx2 + offsetPx}
              y2={sy2}
              stroke="#e53e3e"
              strokeWidth={0.8}
            />
            {/* Top tick */}
            <line
              x1={sx2 + offsetPx - 4}
              y1={sy2}
              x2={sx2 + offsetPx + 4}
              y2={sy2}
              stroke="#e53e3e"
              strokeWidth={0.8}
            />
            {/* Bottom tick */}
            <line
              x1={sx1 + offsetPx - 4}
              y1={sy1}
              x2={sx1 + offsetPx + 4}
              y2={sy1}
              stroke="#e53e3e"
              strokeWidth={0.8}
            />
            {/* Dimension text */}
            <text
              x={sx1 + offsetPx + 6}
              y={midY + 3}
              fill="#e53e3e"
              fontSize={9}
              fontFamily="sans-serif"
            >
              {dim.text}
            </text>
          </g>
        )
      })}

      {/* Title */}
      <text
        x={width / 2}
        y={16}
        textAnchor="middle"
        fill="#2d3748"
        fontSize={12}
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        {dirLabel ? `${dirLabel.charAt(0).toUpperCase() + dirLabel.slice(1)} Elevation` : 'Elevation View'}
      </text>
    </svg>
  )
}
