import { useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from '../../hooks/usePlanSnapPoints'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength, formatArea } from '../../utils/units'
import { polygonArea, polygonPerimeter, polygonCentroid, type Point2 } from '../../utils/geometry'
import { useLevelStore } from '../../stores/level-store'

const SNAP_THRESHOLD = 0.3
const CLOSE_THRESHOLD = 0.3
const PLANE_Z = 0.1

/**
 * 2D polygon area measurement tool — rendered inside the Viewport2D Canvas.
 * Multi-click polygon: click to add vertices, close by clicking near the first
 * vertex (when >= 3 vertices), or right-click / double-click to close.
 */
export function AreaMeasurePlane2D() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const measurementSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.measure)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const snapCandidates = usePlanSnapCandidates()
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const resetCounter = useMeasurementStore((s) => s.resetCounter)
  const [vertices, setVertices] = useState<Point2[]>([])
  const [cursorPos, setCursorPos] = useState<Point2 | null>(null)
  const [closed, setClosed] = useState(false)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

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
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])

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
  }, [activeLevelElevation, activeTool, applySnap, closed, closePolygon, lengthUnit, setMeasurementCursor, setToolReadout, vertices])

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
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)
    setCursorPos(point)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])

    if (!closed && vertices.length >= 2) {
      const previewVerts: Point2[] = [...vertices, point]
      const area = polygonArea(previewVerts)
      const perimeter = polygonPerimeter(previewVerts)
      setToolReadout(`Area: ${formatArea(area, lengthUnit)} | Perimeter: ${formatLength(perimeter, lengthUnit)} (click near first to close)`)
    } else if (!closed && vertices.length === 0) {
      setToolReadout('Area measure: pick first point')
    }
  }, [activeLevelElevation, activeTool, applySnap, closed, lengthUnit, setMeasurementCursor, setToolReadout, vertices])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (vertices.length === 0) setToolReadout(null)
  }, [vertices.length, setMeasurementCursor, setToolReadout])

  if (activeTool !== 'measure_area') return null

  const z = PLANE_Z
  const zLine = z + 0.01

  // Compute polygon fill shape when closed
  const fillShape = closed && vertices.length >= 3 ? (() => {
    const shape = new THREE.Shape()
    shape.moveTo(vertices[0][0], vertices[0][1])
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i][0], vertices[i][1])
    }
    shape.closePath()
    return shape
  })() : null

  // Compute centroid for badge position
  const centroid: Point2 | null = vertices.length >= 3
    ? polygonCentroid(vertices)
    : null

  // Compute area/perimeter for badge
  const areaValue = vertices.length >= 3 ? polygonArea(vertices) : 0
  const perimeterValue = vertices.length >= 3 ? polygonPerimeter(vertices) : 0

  // Build line points
  const linePoints: [number, number, number][] = closed
    ? [...vertices.map((v): [number, number, number] => [v[0], v[1], zLine]), [vertices[0][0], vertices[0][1], zLine]]
    : vertices.map((v): [number, number, number] => [v[0], v[1], zLine])

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        position={[0, 0, z]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertex points */}
      {vertices.map((v, i) => (
        <mesh key={i} position={[v[0], v[1], zLine]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>
      ))}

      {/* Polygon outline */}
      {linePoints.length >= 2 && (
        <Line
          points={linePoints}
          color="#00ff88"
          lineWidth={2}
        />
      )}

      {/* Preview dashed line from last vertex to cursor */}
      {!closed && vertices.length > 0 && cursorPos && (
        <Line
          points={[
            [vertices[vertices.length - 1][0], vertices[vertices.length - 1][1], zLine],
            [cursorPos[0], cursorPos[1], zLine],
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Preview dashed line from cursor back to first vertex (when >= 3 points) */}
      {!closed && vertices.length >= 3 && cursorPos && (
        <Line
          points={[
            [cursorPos[0], cursorPos[1], zLine],
            [vertices[0][0], vertices[0][1], zLine],
          ]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.15}
          gapSize={0.1}
        />
      )}

      {/* Semi-transparent polygon fill when closed */}
      {closed && fillShape && (
        <mesh position={[0, 0, z + 0.005]}>
          <shapeGeometry args={[fillShape]} />
          <meshBasicMaterial color="#00ff88" transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Cursor indicator */}
      {cursorPos && !closed && (
        <mesh position={[cursorPos[0], cursorPos[1], zLine]}>
          <circleGeometry args={[0.05, 10]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#22d3ee'} />
        </mesh>
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={[snapMarker[0], snapMarker[1], zLine]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Snap type label */}
      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], snapMarker[1] + 0.2, z + 0.02]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}

      {/* Area badge at centroid */}
      {closed && centroid && (
        <Html position={[centroid[0], centroid[1], z + 0.02]} center>
          <div className="measurement-badge">
            <span>{formatArea(areaValue, lengthUnit)}</span>
            <span className="measurement-badge-deltas">
              Perimeter: {formatLength(perimeterValue, lengthUnit)}
            </span>
          </div>
        </Html>
      )}
    </>
  )
}
