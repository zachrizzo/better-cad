/**
 * Arc wall drawing hook — 3-point arc mode.
 *
 * Click 1: start point
 * Click 2: midpoint on the arc (defines curvature)
 * Click 3: end point → creates the curved wall
 *
 * The three points define a unique circle; from that circle we derive the
 * ArcDef (center, radius, start_angle, end_angle) stored on the WallElement.
 */

import { useState, useCallback } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useBimStore } from '../stores/bim-store'
import { useKernel } from './useKernel'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { useLevelStore } from '../stores/level-store'
import { formatLength, type LengthUnit } from '../utils/units'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'
import { snapPlanPoint, usePlanSnapPoints } from './usePlanSnapPoints'
import type { ArcDef } from '../services/kernel-bridge'

type Point2 = [number, number]

const MIN_WALL_LENGTH = 0.2

/**
 * Compute circumscribed circle from 3 non-collinear points.
 * Returns null if the points are collinear.
 */
function circumscribedCircle(
  p1: Point2,
  p2: Point2,
  p3: Point2,
): { center: Point2; radius: number } | null {
  const ax = p1[0], ay = p1[1]
  const bx = p2[0], by = p2[1]
  const cx = p3[0], cy = p3[1]

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-10) return null // collinear

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d

  const radius = Math.hypot(ax - ux, ay - uy)
  return { center: [ux, uy], radius }
}

/**
 * Build an ArcDef from start, midpoint, end using circumscribed circle.
 * The arc goes from start through mid to end.
 */
function buildArcDef(start: Point2, mid: Point2, end: Point2): ArcDef | null {
  const circle = circumscribedCircle(start, mid, end)
  if (!circle) return null

  const [cx, cy] = circle.center
  const startAngle = Math.atan2(start[1] - cy, start[0] - cx)
  const midAngle = Math.atan2(mid[1] - cy, mid[0] - cx)
  let endAngle = Math.atan2(end[1] - cy, end[0] - cx)

  // Determine sweep direction: start → mid → end should be consistent.
  // Normalize mid and end relative to start.
  const normMid = ((midAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
  const normEnd = ((endAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)

  // If mid is not between start and end in CCW direction, go CW instead.
  if (normMid > normEnd) {
    // CW sweep: subtract 2*PI from endAngle
    endAngle = startAngle + normEnd - 2 * Math.PI
  } else {
    endAngle = startAngle + normEnd
  }

  return {
    center: circle.center,
    radius: circle.radius,
    start_angle: startAngle,
    end_angle: endAngle,
  }
}

export function useArcWallDrawing(mode: ViewportMode) {
  const { kernel } = useKernel()
  const snapCandidates = usePlanSnapPoints()

  const [startPt, setStartPt] = useState<Point2 | null>(null)
  const [midPt, setMidPt] = useState<Point2 | null>(null)
  const [previewPt, setPreviewPt] = useState<Point2 | null>(null)
  const isDrawing = startPt !== null

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) {
        // Right-click cancels
        setStartPt(null)
        setMidPt(null)
        setPreviewPt(null)
        return
      }

      const raw = extractPlanPoint(e, mode)
      const pt = snapPlanPoint(raw, snapCandidates, true, 0.35).point

      if (!startPt) {
        setStartPt(pt)
        return
      }

      if (!midPt) {
        if (Math.hypot(pt[0] - startPt[0], pt[1] - startPt[1]) < MIN_WALL_LENGTH * 0.5) return
        setMidPt(pt)
        return
      }

      // Third click: create the arc wall
      const arcDef = buildArcDef(startPt, midPt, pt)
      if (!arcDef) return

      const wallHeight = useBimStore.getState().defaultWallHeight ?? 3.0
      const wallThickness = useBimStore.getState().defaultWallThickness ?? 0.2
      const activeLevelId = useLevelStore.getState().activeLevelId

      const element = {
        kind: 'wall' as const,
        meta: { id: '', name: 'Arc Wall', level_id: activeLevelId || undefined },
        start: startPt,
        end: pt as [number, number],
        height: wallHeight,
        thickness: wallThickness,
        arc: arcDef,
        arc_segments: 24,
      }

      if (!kernel) return
      kernel.createElement(element as any).then(() => {
        syncEntitiesAndRegenerateMeshes(kernel)
      })

      // Reset for next arc or chain
      setStartPt(null)
      setMidPt(null)
      setPreviewPt(null)
    },
    [startPt, midPt, mode, kernel, snapCandidates],
  )

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const raw = extractPlanPoint(e, mode)
      const pt = snapPlanPoint(raw, snapCandidates, true, 0.35).point
      setPreviewPt(pt)

      // Update cursor readout
      const lengthUnit = useSettingsStore.getState().lengthUnit as LengthUnit
      if (startPt && midPt) {
        const arcDef = buildArcDef(startPt, midPt, pt)
        if (arcDef) {
          const arcLen = arcDef.radius * Math.abs(arcDef.end_angle - arcDef.start_angle)
          useMeasurementStore.getState().setToolReadout(`Arc R=${formatLength(arcDef.radius, lengthUnit)} L=${formatLength(arcLen, lengthUnit)}`)
        }
      } else if (startPt) {
        const dist = Math.hypot(pt[0] - startPt[0], pt[1] - startPt[1])
        useMeasurementStore.getState().setToolReadout(`${formatLength(dist, lengthUnit)}`)
      }

      // Cursor position is managed by the viewport, not set here
    },
    [startPt, midPt, mode, snapCandidates],
  )

  // Compute preview arc points for rendering
  let previewArcPoints: Point2[] | null = null
  if (startPt && previewPt) {
    if (midPt) {
      const arcDef = buildArcDef(startPt, midPt, previewPt)
      if (arcDef) {
        const segs = 48
        previewArcPoints = []
        for (let i = 0; i <= segs; i++) {
          const t = i / segs
          const a = arcDef.start_angle + t * (arcDef.end_angle - arcDef.start_angle)
          previewArcPoints.push([
            arcDef.center[0] + arcDef.radius * Math.cos(a),
            arcDef.center[1] + arcDef.radius * Math.sin(a),
          ])
        }
      }
    } else {
      // Before midpoint is set, show straight preview line
      previewArcPoints = [startPt, previewPt]
    }
  }

  return {
    isDrawing,
    startPt,
    midPt,
    previewPt,
    previewArcPoints,
    onPointerDown,
    onPointerMove,
  }
}
