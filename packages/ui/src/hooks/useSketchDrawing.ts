import { useRef, useState, useCallback, useEffect } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useSketchStore } from '../stores/sketch-store'
import { useBimStore } from '../stores/bim-store'
import { useDocumentStore } from '../stores/document-store'
import { useKernel } from './useKernel'
import { extrudeSketchProfile } from '../utils/sketch-extrude'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { formatLength, type LengthUnit } from '../utils/units'
import { constraintStatusColor } from '../utils/sketch-solver'
import type { ConstraintStatus } from '../utils/sketch-solver'
import type { SketchPoint, SketchLine, SketchCircle, SketchConstraint, SketchDrawMode, SketchSelection } from '../stores/sketch-store'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

const MIN_RECT_SIDE = 1e-5
const SNAP_THRESHOLD = 0.15
const CIRCLE_SEGMENTS = 64

type Point2 = [number, number]

export interface SketchDrawingState {
  isActive: boolean
  hoverPoint: Point2 | null
  drawMode: SketchDrawMode
  pendingPoint: SketchPoint | null
  points: Map<string, SketchPoint>
  lines: Map<string, SketchLine>
  circles: Map<string, SketchCircle>
  constraints: Map<string, SketchConstraint>
  selection: SketchSelection
  solverStatus: ConstraintStatus
  lineChainStart: string | null
  statusColor: string
  lengthUnit: LengthUnit
  previewCorners: { ax: number; ay: number; bx: number; by: number } | null
  previewSize: { width: number; depth: number } | null
  linePreview: { x1: number; z1: number; x2: number; z2: number } | null
  circlePreview: { cx: number; cz: number; radius: number } | null
  planeRef: React.RefObject<THREE.Mesh | null>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handleContextMenu: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for the sketch drawing tool.
 * Contains ALL logic -- the component is just a renderer.
 * Supports both 2D and 3D viewports via the `mode` parameter.
 */
export function useSketchDrawing(mode: ViewportMode): SketchDrawingState {
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
  const [hoverPoint, setHoverPoint] = useState<Point2 | null>(null)

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

  // Find nearest line for selection
  const findNearestLine = useCallback((x: number, z: number): string | null => {
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
  }, [lines, points])

  // ---------------------------------------------------------------------------
  // Selection click (draw mode = none)
  // ---------------------------------------------------------------------------

  const handleSelectClick = useCallback((x: number, z: number, shift: boolean) => {
    const snap = findSnapPoint(x, z)
    if (snap) {
      if (shift) {
        togglePointSelection(snap.id)
      } else {
        selectPoint(snap.id)
      }
      return
    }

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
  }, [clearSelection, findNearestLine, findSnapPoint, selectLine, selectPoint, toggleLineSelection, togglePointSelection])

  // ---------------------------------------------------------------------------
  // Rectangle drawing
  // ---------------------------------------------------------------------------

  const handleRectangleClick = useCallback((x: number, z: number) => {
    if (!pendingPoint) {
      setPendingPoint({ id: 'p-corner-a', x, y: z })
      setToolReadout(`Sketch start X:${formatLength(x, lengthUnit)} ${mode === '3d' ? 'Z' : 'Y'}:${formatLength(z, lengthUnit)}`)
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
      const profilePoints: Point2[] = [
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
  }, [addCadMesh, addLine, addPoint, addProfile, addWall, autoExtrudeSketch, defaultWallHeight, defaultWallThickness, kernel, lengthUnit, mode, pendingPoint, ready, setPendingPoint, setToolReadout, sketchExtrudeMode])

  // ---------------------------------------------------------------------------
  // Line drawing (chain mode)
  // ---------------------------------------------------------------------------

  const handleLineClick = useCallback((x: number, z: number) => {
    const snap = findSnapPoint(x, z)
    const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8)

    if (!lineChainStart) {
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
  }, [addLine, addPoint, findSnapPoint, lineChainStart, setLineChainStart, setPendingPoint, setToolReadout])

  // ---------------------------------------------------------------------------
  // Circle drawing
  // ---------------------------------------------------------------------------

  const handleCircleClick = useCallback((x: number, z: number) => {
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
  }, [addCircle, addPoint, lengthUnit, pendingPoint, setPendingPoint, setToolReadout])

  // ---------------------------------------------------------------------------
  // Pointer events
  // ---------------------------------------------------------------------------

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!active) return
    const preview = extractPlanPoint(e, mode)
    setHoverPoint(preview)
    setPreviewPoint(preview)
    setMeasurementCursor(mode === '3d' ? [preview[0], 0, preview[1]] : [preview[0], 0, preview[1]])

    if (pendingPoint) {
      if (drawMode === 'rectangle') {
        const dx = preview[0] - pendingPoint.x
        const dz = preview[1] - pendingPoint.y
        setToolReadout(
          `Rect dX:${formatLength(Math.abs(dx), lengthUnit)} d${mode === '3d' ? 'Z' : 'Y'}:${formatLength(Math.abs(dz), lengthUnit)} Diag:${formatLength(Math.hypot(dx, dz), lengthUnit)}`,
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
  }, [active, drawMode, findSnapPoint, lengthUnit, mode, pendingPoint, setMeasurementCursor, setPreviewPoint, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setHoverPoint(null)
    setPreviewPoint(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setPreviewPoint, setToolReadout])

  // ---------------------------------------------------------------------------
  // Click handler - dispatch to draw mode
  // ---------------------------------------------------------------------------

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!active) return
    const pt = extractPlanPoint(e, mode)
    const x = pt[0]
    const z = pt[1]
    const shift = !!(e.nativeEvent?.shiftKey)

    setHoverPoint([x, z])
    setPreviewPoint([x, z])
    setMeasurementCursor(mode === '3d' ? [x, 0, z] : [x, 0, z])

    if (drawMode === 'none') {
      handleSelectClick(x, z, shift)
    } else if (drawMode === 'rectangle') {
      handleRectangleClick(x, z)
    } else if (drawMode === 'line') {
      handleLineClick(x, z)
    } else if (drawMode === 'circle') {
      handleCircleClick(x, z)
    }
  }, [active, drawMode, handleCircleClick, handleLineClick, handleRectangleClick, handleSelectClick, mode, setMeasurementCursor, setPreviewPoint])

  // Handle right-click to end line chain
  const handleContextMenu = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (drawMode === 'line' && lineChainStart) {
      e.nativeEvent?.preventDefault?.()
      setLineChainStart(null)
      setPendingPoint(null)
      setToolReadout('Line chain ended.')
    }
  }, [drawMode, lineChainStart, setLineChainStart, setPendingPoint, setToolReadout])

  // ---------------------------------------------------------------------------
  // Computed preview state
  // ---------------------------------------------------------------------------

  const statusColor = constraintStatusColor(solverStatus)

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

  const linePreview = drawMode === 'line' && pendingPoint && hoverPoint
    ? {
      x1: pendingPoint.x,
      z1: pendingPoint.y,
      x2: hoverPoint[0],
      z2: hoverPoint[1],
    }
    : null

  const circlePreview = drawMode === 'circle' && pendingPoint && hoverPoint
    ? {
      cx: pendingPoint.x,
      cz: pendingPoint.y,
      radius: Math.hypot(hoverPoint[0] - pendingPoint.x, hoverPoint[1] - pendingPoint.y),
    }
    : null

  return {
    isActive: active,
    hoverPoint,
    drawMode,
    pendingPoint,
    points,
    lines,
    circles,
    constraints,
    selection,
    solverStatus,
    lineChainStart,
    statusColor,
    lengthUnit,
    previewCorners,
    previewSize,
    linePreview,
    circlePreview,
    planeRef,
    handlePointerMove,
    handleClick,
    handleContextMenu,
    handlePointerLeave,
  }
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

export { CIRCLE_SEGMENTS }
