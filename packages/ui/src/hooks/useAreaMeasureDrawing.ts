import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from './usePlanSnapPoints'
import { useActiveDrawingSurface } from './useActiveDrawingSurface'
import { getEnabledMeasurementSnapModes } from '../utils/measurement-snap-settings'
import { formatLength, formatArea, type LengthUnit } from '../utils/units'
import { polygonArea, polygonPerimeter, polygonCentroid, type Point2 } from '../utils/geometry'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

const SNAP_THRESHOLD = 0.3
const CLOSE_THRESHOLD = 0.3

export interface AreaMeasureDrawingState {
  isActive: boolean
  vertices: Point2[]
  cursorPos: Point2 | null
  closed: boolean
  snapMarker: Point2 | null
  snappedCandidate: PlanSnapCandidate | null
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  fillShape: THREE.Shape | null
  centroid: Point2 | null
  areaValue: number
  perimeterValue: number
  linePoints: Point2[]
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handleDoubleClick: (e: ThreeEvent<PointerEvent>) => void
  handleContextMenu: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

/**
 * Shared hook for the polygon area measurement tool.
 * Contains ALL logic -- the component is just a renderer.
 */
export function useAreaMeasureDrawing(mode: ViewportMode): AreaMeasureDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const measurementSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.measure)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const snapCandidates = usePlanSnapCandidates()
  const { activeSurfaceElevation } = useActiveDrawingSurface()
  const resetCounter = useMeasurementStore((s) => s.resetCounter)
  const planeRef = useRef<THREE.Mesh>(null)

  const [vertices, setVertices] = useState<Point2[]>([])
  const [cursorPos, setCursorPos] = useState<Point2 | null>(null)
  const [closed, setClosed] = useState(false)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  const elevation = activeSurfaceElevation

  // Clean up when tool changes
  useEffect(() => {
    if (activeTool !== 'measure_area') {
      setVertices([])
      setCursorPos(null)
      setClosed(false)
      setSnapMarker(null)
      setSnappedCandidate(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  // Reset on external reset (e.g. Escape key)
  useEffect(() => {
    setVertices([])
    setCursorPos(null)
    setClosed(false)
    setSnapMarker(null)
    setSnappedCandidate(null)
  }, [resetCounter])

  const applySnap = useCallback((raw: Point2): Point2 => {
    const { point, snapped } = snapPlanCandidate(raw, snapCandidates, enabledSnapModes, SNAP_THRESHOLD)
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return point
  }, [enabledSnapModes, snapCandidates])

  const closePolygon = useCallback((verts: Point2[]) => {
    if (verts.length < 3) return
    setClosed(true)
    const area = polygonArea(verts)
    const perimeter = polygonPerimeter(verts)
    setToolReadout(`Area: ${formatArea(area, lengthUnit)} | Perimeter: ${formatLength(perimeter, lengthUnit)}`)
  }, [lengthUnit, setToolReadout])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure_area') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setMeasurementCursor([point[0], elevation, point[1]])

    // If polygon is already closed, reset and start fresh
    if (closed) {
      setVertices([point])
      setClosed(false)
      setCursorPos(null)
      setToolReadout('Area measure: pick points (click near first to close)')
      return
    }

    // Check if we should close (clicking near first vertex with >= 3 vertices)
    if (vertices.length >= 3) {
      const first = vertices[0]
      const dist = Math.hypot(point[0] - first[0], point[1] - first[1])
      if (dist < CLOSE_THRESHOLD) {
        closePolygon(vertices)
        return
      }
    }

    const newVerts = [...vertices, point]
    setVertices(newVerts)

    if (newVerts.length >= 3) {
      const area = polygonArea(newVerts)
      const perimeter = polygonPerimeter(newVerts)
      setToolReadout(`Area: ${formatArea(area, lengthUnit)} | Perimeter: ${formatLength(perimeter, lengthUnit)} (click near first to close)`)
    } else {
      setToolReadout(`Area measure: ${newVerts.length} point${newVerts.length > 1 ? 's' : ''} placed`)
    }
  }, [activeTool, applySnap, closed, closePolygon, elevation, lengthUnit, mode, setMeasurementCursor, setToolReadout, vertices])

  const handleDoubleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure_area' || closed) return
    if (vertices.length >= 3) {
      closePolygon(vertices)
    }
  }, [activeTool, closed, closePolygon, vertices])

  const handleContextMenu = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'measure_area' || closed) return
    if (vertices.length >= 3) {
      closePolygon(vertices)
    }
  }, [activeTool, closed, closePolygon, vertices])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'measure_area') return
    const rawPoint = extractPlanPoint(e, mode)
    const point = applySnap(rawPoint)
    setCursorPos(point)
    setMeasurementCursor([point[0], elevation, point[1]])

    if (!closed && vertices.length >= 2) {
      const previewVerts: Point2[] = [...vertices, point]
      const area = polygonArea(previewVerts)
      const perimeter = polygonPerimeter(previewVerts)
      setToolReadout(`Area: ${formatArea(area, lengthUnit)} | Perimeter: ${formatLength(perimeter, lengthUnit)} (click near first to close)`)
    } else if (!closed && vertices.length === 0) {
      setToolReadout('Area measure: pick first point')
    }
  }, [activeTool, applySnap, closed, elevation, lengthUnit, mode, setMeasurementCursor, setToolReadout, vertices])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (vertices.length === 0) setToolReadout(null)
  }, [vertices.length, setMeasurementCursor, setToolReadout])

  // Compute polygon fill shape when closed (in plan-space XY)
  const fillShape = useMemo(() => {
    if (!closed || vertices.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(vertices[0][0], vertices[0][1])
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i][0], vertices[i][1])
    }
    shape.closePath()
    return shape
  }, [closed, vertices])

  // Compute centroid for the badge position
  const centroid: Point2 | null = useMemo(() => {
    if (vertices.length < 3) return null
    return polygonCentroid(vertices)
  }, [vertices])

  // Compute area/perimeter for badge
  const areaValue = useMemo(() => {
    if (vertices.length < 3) return 0
    return polygonArea(vertices)
  }, [vertices])

  const perimeterValue = useMemo(() => {
    if (vertices.length < 3) return 0
    return polygonPerimeter(vertices)
  }, [vertices])

  // Build line points (plan-space)
  const linePoints: Point2[] = closed
    ? [...vertices, vertices[0]]
    : vertices

  return {
    isActive: activeTool === 'measure_area',
    vertices,
    cursorPos,
    closed,
    snapMarker,
    snappedCandidate,
    elevation,
    lengthUnit,
    planeRef,
    fillShape,
    centroid,
    areaValue,
    perimeterValue,
    linePoints,
    handlePointerMove,
    handleClick,
    handleDoubleClick,
    handleContextMenu,
    handlePointerLeave,
  }
}
