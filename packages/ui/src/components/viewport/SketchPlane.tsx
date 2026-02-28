import { useRef, useState, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useSketchStore } from '../../stores/sketch-store'
import { useBimStore } from '../../stores/bim-store'
import { useDocumentStore } from '../../stores/document-store'
import { useKernel } from '../../hooks/useKernel'
import { extrudeSketchProfile } from '../../utils/sketch-extrude'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import { constraintStatusColor } from '../../utils/sketch-solver'

const MIN_RECT_SIDE = 1e-5
const SNAP_THRESHOLD = 0.15
const POINT_RENDER_Y = 0.02
const LINE_RENDER_Y = 0.01
const CIRCLE_SEGMENTS = 64

export function SketchPlane() {
  const {
    active,
    drawMode,
    pendingPoint,
    setPendingPoint,
    addPoint,
    addLine,
    addCircle,
    addProfile,
    setPreviewPoint,
    points,
    lines,
    circles,
    selection,
    selectPoint,
    selectLine,
    togglePointSelection,
    toggleLineSelection,
    clearSelection,
    constraints,
    solverStatus,
    lineChainStart,
    setLineChainStart,
  } = useSketchStore()

  const autoExtrudeSketch = useBimStore((s) => s.autoExtrudeSketch)
  const sketchExtrudeMode = useBimStore((s) => s.sketchExtrudeMode)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const addWall = useBimStore((s) => s.addWall)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const planeRef = useRef<THREE.Mesh>(null)
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!active) {
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [active, setMeasurementCursor, setToolReadout])

  // Find nearest existing point for snapping
  const findSnapPoint = useCallback((x: number, z: number): { id: string; x: number; y: number } | null => {
    let closest: { id: string; x: number; y: number; dist: number } | null = null
    for (const [, pt] of points) {
      const dist = Math.hypot(pt.x - x, pt.y - z)
      if (dist < SNAP_THRESHOLD && (!closest || dist < closest.dist)) {
        closest = { id: pt.id, x: pt.x, y: pt.y, dist }
      }
    }
    return closest ? { id: closest.id, x: closest.x, y: closest.y } : null
  }, [points])

  // ---------------------------------------------------------------------------
  // Pointer events
  // ---------------------------------------------------------------------------

  const handlePointerMove = useCallback((e: { point?: THREE.Vector3 }) => {
    if (!active) return
    const point = e.point as THREE.Vector3
    if (!point) return
    const preview: [number, number] = [point.x, point.z]
    setHoverPoint(preview)
    setPreviewPoint(preview)
    setMeasurementCursor([preview[0], 0, preview[1]])

    if (pendingPoint) {
      if (drawMode === 'rectangle') {
        const dx = preview[0] - pendingPoint.x
        const dz = preview[1] - pendingPoint.y
        setToolReadout(
          `Rect dX:${formatLength(Math.abs(dx), lengthUnit)} dZ:${formatLength(Math.abs(dz), lengthUnit)} Diag:${formatLength(Math.hypot(dx, dz), lengthUnit)}`,
        )
      } else if (drawMode === 'line') {
        const dx = preview[0] - pendingPoint.x
        const dz = preview[1] - pendingPoint.y
        setToolReadout(
          `Line len:${formatLength(Math.hypot(dx, dz), lengthUnit)}`,
        )
      } else if (drawMode === 'circle') {
        const r = Math.hypot(preview[0] - pendingPoint.x, preview[1] - pendingPoint.y)
        setToolReadout(`Circle R:${formatLength(r, lengthUnit)}`)
      }
    } else {
      const snap = findSnapPoint(preview[0], preview[1])
      if (snap) {
        setToolReadout(`Sketch: near point ${snap.id.slice(-4)}`)
      } else {
        const modeLabel = drawMode === 'none' ? 'select' : drawMode
        setToolReadout(`Sketch [${modeLabel}]: click to place`)
      }
    }
  }, [active, drawMode, lengthUnit, pendingPoint, findSnapPoint, setMeasurementCursor, setPreviewPoint, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setHoverPoint(null)
    setPreviewPoint(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setPreviewPoint, setToolReadout])

  // ---------------------------------------------------------------------------
  // Click handler - dispatch to draw mode
  // ---------------------------------------------------------------------------

  const handleClick = useCallback((e: { point?: THREE.Vector3; nativeEvent?: { shiftKey?: boolean } }) => {
    if (!active) return
    const point = e.point as THREE.Vector3
    if (!point) return

    const x = point.x
    const z = point.z
    const shift = !!(e.nativeEvent?.shiftKey)

    setHoverPoint([x, z])
    setPreviewPoint([x, z])
    setMeasurementCursor([x, 0, z])

    if (drawMode === 'none') {
      handleSelectClick(x, z, shift)
    } else if (drawMode === 'rectangle') {
      handleRectangleClick(x, z)
    } else if (drawMode === 'line') {
      handleLineClick(x, z)
    } else if (drawMode === 'circle') {
      handleCircleClick(x, z)
    }
  }, [active, drawMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Selection click (draw mode = none)
  // ---------------------------------------------------------------------------

  const handleSelectClick = (x: number, z: number, shift: boolean) => {
    // Try to click an existing point
    const snap = findSnapPoint(x, z)
    if (snap) {
      if (shift) {
        togglePointSelection(snap.id)
      } else {
        selectPoint(snap.id)
      }
      return
    }

    // Try to click a line
    const clickedLine = findNearestLine(x, z)
    if (clickedLine) {
      if (shift) {
        toggleLineSelection(clickedLine)
      } else {
        selectLine(clickedLine)
      }
      return
    }

    clearSelection()
  }

  const findNearestLine = (x: number, z: number): string | null => {
    let bestId: string | null = null
    let bestDist = SNAP_THRESHOLD

    for (const [, line] of lines) {
      const p1 = points.get(line.p1)
      const p2 = points.get(line.p2)
      if (!p1 || !p2) continue
      const dist = pointToSegmentDist(x, z, p1.x, p1.y, p2.x, p2.y)
      if (dist < bestDist) {
        bestDist = dist
        bestId = line.id
      }
    }
    return bestId
  }

  // ---------------------------------------------------------------------------
  // Rectangle drawing
  // ---------------------------------------------------------------------------

  const handleRectangleClick = (x: number, z: number) => {
    if (!pendingPoint) {
      setPendingPoint({ id: 'p-corner-a', x, y: z })
      setToolReadout(`Sketch start X:${formatLength(x, lengthUnit)} Z:${formatLength(z, lengthUnit)}`)
    } else {
      const ax = pendingPoint.x, ay = pendingPoint.y
      const bx = x, by = z

      if (Math.abs(bx - ax) < MIN_RECT_SIDE || Math.abs(by - ay) < MIN_RECT_SIDE) {
        setPendingPoint(null)
        return
      }

      const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      const p0 = `p-${uid}-0`
      const p1 = `p-${uid}-1`
      const p2 = `p-${uid}-2`
      const p3 = `p-${uid}-3`
      const profileId = `sketch-${uid}`
      const profilePoints: [number, number][] = [
        [ax, ay],
        [bx, ay],
        [bx, by],
        [ax, by],
      ]

      addPoint(p0, ax, ay)
      addPoint(p1, bx, ay)
      addPoint(p2, bx, by)
      addPoint(p3, ax, by)

      addLine(`l-${uid}-0`, p0, p1)
      addLine(`l-${uid}-1`, p1, p2)
      addLine(`l-${uid}-2`, p2, p3)
      addLine(`l-${uid}-3`, p3, p0)
      addProfile({ id: profileId, points: profilePoints })
      setToolReadout(
        `Sketch created W:${formatLength(Math.abs(bx - ax), lengthUnit)} D:${formatLength(Math.abs(by - ay), lengthUnit)}`,
      )

      if (autoExtrudeSketch) {
        void extrudeSketchProfile({
          profile: { id: profileId, points: profilePoints },
          mode: sketchExtrudeMode,
          height: defaultWallHeight,
          thickness: defaultWallThickness,
          kernel,
          ready,
          addCadMesh,
          addWall,
        }).catch((err) => {
          console.error('[BetterCAD] Auto-extrude sketch failed:', err)
        })
      }

      setPendingPoint(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Line drawing (chain mode)
  // ---------------------------------------------------------------------------

  const handleLineClick = (x: number, z: number) => {
    const snap = findSnapPoint(x, z)
    const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8)

    if (!lineChainStart) {
      // Start a new line chain
      let startId: string
      if (snap) {
        startId = snap.id
      } else {
        startId = `p-${uid}`
        addPoint(startId, x, z)
      }
      setLineChainStart(startId)
      setPendingPoint({ id: startId, x: snap?.x ?? x, y: snap?.y ?? z })
      setToolReadout('Line: click next point (right-click to end chain)')
    } else {
      // Continue line chain
      let endId: string
      if (snap) {
        endId = snap.id
      } else {
        endId = `p-${uid}`
        addPoint(endId, x, z)
      }
      const lineId = `l-${uid}`
      addLine(lineId, lineChainStart, endId)
      setLineChainStart(endId)
      setPendingPoint({ id: endId, x: snap?.x ?? x, y: snap?.y ?? z })
      setToolReadout('Line added. Click next point or right-click to end chain.')
    }
  }

  // Handle right-click to end line chain
  const handleContextMenu = useCallback((e: { nativeEvent?: Event }) => {
    if (drawMode === 'line' && lineChainStart) {
      e.nativeEvent?.preventDefault?.()
      setLineChainStart(null)
      setPendingPoint(null)
      setToolReadout('Line chain ended.')
    }
  }, [drawMode, lineChainStart, setLineChainStart, setPendingPoint, setToolReadout])

  // ---------------------------------------------------------------------------
  // Circle drawing
  // ---------------------------------------------------------------------------

  const handleCircleClick = (x: number, z: number) => {
    if (!pendingPoint) {
      const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      const centerId = `p-${uid}-c`
      addPoint(centerId, x, z)
      setPendingPoint({ id: centerId, x, y: z })
      setToolReadout('Circle: click to set radius')
    } else {
      const radius = Math.hypot(x - pendingPoint.x, z - pendingPoint.y)
      if (radius < MIN_RECT_SIDE) {
        setPendingPoint(null)
        return
      }
      const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      addCircle(`circ-${uid}`, pendingPoint.id, radius)
      setToolReadout(`Circle R:${formatLength(radius, lengthUnit)}`)
      setPendingPoint(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!active) return null

  const statusColor = constraintStatusColor(solverStatus)

  // Preview for rectangle drawing
  const previewCorners = drawMode === 'rectangle' && pendingPoint && hoverPoint
    ? {
      ax: pendingPoint.x,
      ay: pendingPoint.y,
      bx: hoverPoint[0],
      by: hoverPoint[1],
    }
    : null
  const previewSize = previewCorners
    ? {
      width: Math.abs(previewCorners.bx - previewCorners.ax),
      depth: Math.abs(previewCorners.by - previewCorners.ay),
    }
    : null

  // Preview for line drawing
  const linePreview = drawMode === 'line' && pendingPoint && hoverPoint
    ? {
      x1: pendingPoint.x,
      z1: pendingPoint.y,
      x2: hoverPoint[0],
      z2: hoverPoint[1],
    }
    : null

  // Preview for circle drawing
  const circlePreview = drawMode === 'circle' && pendingPoint && hoverPoint
    ? {
      cx: pendingPoint.x,
      cz: pendingPoint.y,
      radius: Math.hypot(hoverPoint[0] - pendingPoint.x, hoverPoint[1] - pendingPoint.y),
    }
    : null

  return (
    <>
      {/* Invisible plane for picking */}
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Render existing lines */}
      {Array.from(lines.values()).map((line) => {
        const p1 = points.get(line.p1)
        const p2 = points.get(line.p2)
        if (!p1 || !p2) return null
        const isSelected = selection.lineIds.includes(line.id)
        const lineColor = isSelected ? '#ffaa00' : statusColor
        return (
          <Line
            key={line.id}
            points={[[p1.x, LINE_RENDER_Y, p1.y], [p2.x, LINE_RENDER_Y, p2.y]]}
            color={lineColor}
            lineWidth={isSelected ? 3 : 2}
          />
        )
      })}

      {/* Render existing circles */}
      {Array.from(circles.values()).map((circ) => {
        const center = points.get(circ.center)
        if (!center) return null
        const circlePoints: [number, number, number][] = []
        for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
          const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2
          circlePoints.push([
            center.x + circ.radius * Math.cos(angle),
            LINE_RENDER_Y,
            center.y + circ.radius * Math.sin(angle),
          ])
        }
        return (
          <Line
            key={circ.id}
            points={circlePoints}
            color={statusColor}
            lineWidth={2}
          />
        )
      })}

      {/* Render existing points */}
      {Array.from(points.values()).map((pt) => {
        const isSelected = selection.pointIds.includes(pt.id)
        const ptColor = isSelected ? '#ffaa00' : statusColor
        return (
          <mesh key={pt.id} position={[pt.x, POINT_RENDER_Y, pt.y]}>
            <sphereGeometry args={[isSelected ? 0.07 : 0.05, 8, 8]} />
            <meshBasicMaterial color={ptColor} />
          </mesh>
        )
      })}

      {/* Constraint visual indicators */}
      {Array.from(constraints.values()).map((c) => {
        if (c.type === 'Distance' && c.points.length >= 2) {
          const p1 = points.get(c.points[0])
          const p2 = points.get(c.points[1])
          if (!p1 || !p2) return null
          const mx = (p1.x + p2.x) / 2
          const mz = (p1.y + p2.y) / 2
          return (
            <Html key={c.id} position={[mx, 0.15, mz]} center>
              <div className="measurement-badge" style={{ fontSize: 10 }}>
                {formatLength(c.value ?? 0, lengthUnit)}
              </div>
            </Html>
          )
        }
        if (c.type === 'Horizontal' && c.lines.length >= 1) {
          const line = lines.get(c.lines[0])
          if (!line) return null
          const p1 = points.get(line.p1)
          const p2 = points.get(line.p2)
          if (!p1 || !p2) return null
          const mx = (p1.x + p2.x) / 2
          const mz = (p1.y + p2.y) / 2
          return (
            <Html key={c.id} position={[mx, 0.15, mz]} center>
              <div className="measurement-badge" style={{ fontSize: 9, background: 'rgba(0,150,0,0.3)' }}>H</div>
            </Html>
          )
        }
        if (c.type === 'Vertical' && c.lines.length >= 1) {
          const line = lines.get(c.lines[0])
          if (!line) return null
          const p1 = points.get(line.p1)
          const p2 = points.get(line.p2)
          if (!p1 || !p2) return null
          const mx = (p1.x + p2.x) / 2
          const mz = (p1.y + p2.y) / 2
          return (
            <Html key={c.id} position={[mx, 0.15, mz]} center>
              <div className="measurement-badge" style={{ fontSize: 9, background: 'rgba(0,150,0,0.3)' }}>V</div>
            </Html>
          )
        }
        return null
      })}

      {/* Hover cursor */}
      {hoverPoint && (
        <mesh position={[hoverPoint[0], 0.05, hoverPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#00d4ff" />
        </mesh>
      )}

      {/* Pending point marker */}
      {pendingPoint && (
        <mesh position={[pendingPoint.x, 0.05, pendingPoint.y]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {/* Rectangle preview */}
      {previewCorners && (
        <>
          <Line
            points={[
              [previewCorners.ax, 0.03, previewCorners.ay],
              [previewCorners.bx, 0.03, previewCorners.ay],
              [previewCorners.bx, 0.03, previewCorners.by],
              [previewCorners.ax, 0.03, previewCorners.by],
              [previewCorners.ax, 0.03, previewCorners.ay],
            ]}
            color="#00d4ff"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.1}
          />
          {previewSize && (
            <Html
              position={[
                (previewCorners.ax + previewCorners.bx) / 2,
                0.16,
                (previewCorners.ay + previewCorners.by) / 2,
              ]}
              center
            >
              <div className="measurement-badge">
                W {formatLength(previewSize.width, lengthUnit)} • D {formatLength(previewSize.depth, lengthUnit)}
              </div>
            </Html>
          )}
        </>
      )}

      {/* Line preview */}
      {linePreview && (
        <>
          <Line
            points={[
              [linePreview.x1, 0.03, linePreview.z1],
              [linePreview.x2, 0.03, linePreview.z2],
            ]}
            color="#00d4ff"
            lineWidth={2}
            dashed
            dashSize={0.15}
            gapSize={0.1}
          />
          <Html
            position={[
              (linePreview.x1 + linePreview.x2) / 2,
              0.16,
              (linePreview.z1 + linePreview.z2) / 2,
            ]}
            center
          >
            <div className="measurement-badge">
              {formatLength(Math.hypot(linePreview.x2 - linePreview.x1, linePreview.z2 - linePreview.z1), lengthUnit)}
            </div>
          </Html>
        </>
      )}

      {/* Circle preview */}
      {circlePreview && circlePreview.radius > MIN_RECT_SIDE && (
        <>
          <Line
            points={Array.from({ length: CIRCLE_SEGMENTS + 1 }, (_, i) => {
              const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2
              return [
                circlePreview.cx + circlePreview.radius * Math.cos(angle),
                0.03,
                circlePreview.cz + circlePreview.radius * Math.sin(angle),
              ] as [number, number, number]
            })}
            color="#00d4ff"
            lineWidth={2}
            dashed
            dashSize={0.15}
            gapSize={0.1}
          />
          <Html
            position={[circlePreview.cx + circlePreview.radius + 0.2, 0.16, circlePreview.cz]}
            center
          >
            <div className="measurement-badge">
              R {formatLength(circlePreview.radius, lengthUnit)}
            </div>
          </Html>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}
