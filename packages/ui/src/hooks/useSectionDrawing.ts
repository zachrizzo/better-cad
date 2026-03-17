import { useRef, useState, useCallback, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useViewStore } from '../stores/view-store'
import type { SavedView } from '../stores/view-store'
import { snapPlanPoint, usePlanSnapPoints } from './usePlanSnapPoints'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'
import { useLevelStore } from '../stores/level-store'

type Point2 = [number, number]

export interface SectionDrawingState {
  isActive: boolean
  firstPoint: Point2 | null
  cursorPoint: Point2 | null
  previewLine: { start: [number, number, number]; end: [number, number, number] } | null
  elevation: number
  planeRef: React.RefObject<THREE.Mesh | null>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for the section tool.
 * Contains ALL logic -- the component is just a renderer.
 * Supports both 2D and 3D viewports via the `mode` parameter.
 */
export function useSectionDrawing(mode: ViewportMode): SectionDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const addView = useViewStore((s) => s.addView)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const snapPoints = usePlanSnapPoints()

  const levels = useLevelStore((s) => s.levels)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const elevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const [firstPoint, setFirstPoint] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const planeRef = useRef<THREE.Mesh>(null)

  const applySnap = useCallback((rawPoint: Point2): Point2 => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3).point
  }, [snapEnabled, snapPoints])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'section') return
    const rawPt = extractPlanPoint(e, mode)
    const pt = applySnap(rawPt)
    setCursorPoint(pt)
  }, [activeTool, applySnap, mode])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'section') return
    const rawPt = extractPlanPoint(e, mode)
    const pt = applySnap(rawPt)

    if (!firstPoint) {
      setFirstPoint(pt)
      return
    }

    // Second click: create the section view
    const dx = pt[0] - firstPoint[0]
    const dz = pt[1] - firstPoint[1]
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 0.01) return // Too short

    // Compute viewing camera: orthographic looking perpendicular to cut line
    const nx = -dz / len
    const nz = dx / len
    const midX = (firstPoint[0] + pt[0]) / 2
    const midZ = (firstPoint[1] + pt[1]) / 2

    const camDist = 20
    const cameraPosition: [number, number, number] = [
      midX + nx * camDist,
      5,
      midZ + nz * camDist,
    ]
    const cameraTarget: [number, number, number] = [midX, 5, midZ]

    const viewCount = useViewStore.getState().views.size
    const view: SavedView = {
      id: `section-${crypto.randomUUID()}`,
      name: `Section ${viewCount + 1}`,
      type: 'section',
      cutLineStart: firstPoint,
      cutLineEnd: pt,
      cameraPosition,
      cameraTarget,
    }

    addView(view)
    setActiveView(view.id)
    setFirstPoint(null)
    setCursorPoint(null)
    setActiveTool('select')
  }, [activeTool, addView, applySnap, firstPoint, mode, setActiveTool, setActiveView])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
  }, [])

  // Preview line while placing
  const previewLine = useMemo(() => {
    if (!firstPoint || !cursorPoint) return null
    const yOffset = 0.05
    return mode === '3d'
      ? {
        start: [firstPoint[0], elevation + yOffset, firstPoint[1]] as [number, number, number],
        end: [cursorPoint[0], elevation + yOffset, cursorPoint[1]] as [number, number, number],
      }
      : {
        start: [firstPoint[0], firstPoint[1], 0.05 + yOffset] as [number, number, number],
        end: [cursorPoint[0], cursorPoint[1], 0.05 + yOffset] as [number, number, number],
      }
  }, [cursorPoint, elevation, firstPoint, mode])

  return {
    isActive: activeTool === 'section',
    firstPoint,
    cursorPoint,
    previewLine,
    elevation,
    planeRef,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  }
}
