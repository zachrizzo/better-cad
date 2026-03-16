import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from '../../hooks/usePlanSnapPoints'
import { useActiveDrawingSurface } from '../../hooks/useActiveDrawingSurface'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { formatLength, formatArea } from '../../utils/units'
import { polygonArea, polygonPerimeter, polygonCentroid, type Point2 } from '../../utils/geometry'

const SNAP_THRESHOLD = 0.3
const CLOSE_THRESHOLD = 0.3

/**
 * 3D polygon area measurement tool.
 * Multi-click polygon: click to add vertices, close by clicking near the first
 * vertex (when >= 3 vertices), or right-click / double-click to close.
 */
export function AreaMeasurePlane() {
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

  const [vertices, setVertices] = useState<[number, number, number][]>([])
  const [cursorPos, setCursorPos] = useState<[number, number, number] | null>(null)
  const [closed, setClosed] = useState(false)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(measurementSnapModeSettings, snapEnabled),
    [measurementSnapModeSettings, snapEnabled],
  )

  // Clean up when tool changes
  useEffect(() => {
    if (activeTool !== 'measure_area') {
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

  const applySnap = useCallback((point: [number, number, number]): [number, number, number] => {
    const { point: snappedPoint, snapped } = snapPlanCandidate(
      [point[0], point[2]], snapCandidates, enabledSnapModes, SNAP_THRESHOLD,
    )
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return [snappedPoint[0], activeSurfaceElevation, snappedPoint[1]]
  }, [activeSurfaceElevation, enabledSnapModes, snapCandidates])

  const closePolygon = useCallback((verts: [number, number, number][]) => {
    if (verts.length < 3) return
    setClosed(true)
    const pts2d: Point2[] = verts.map((v) => [v[0], v[2]])
    const area = polygonArea(pts2d)
    const perimeter = polygonPerimeter(pts2d)
    setToolReadout(`Area: ${formatArea(area, lengthUnit)} | Perimeter: ${formatLength(perimeter, lengthUnit)}`)
  }, [lengthUnit, setToolReadout])

  const handleClick = useCallback((e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure_area') return
    const hitPoint = e.point as THREE.Vector3
    if (!hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)

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
      const dist = Math.hypot(point[0] - first[0], point[2] - first[2])
      if (dist < CLOSE_THRESHOLD) {
        closePolygon(vertices)
        return
      }
    }

    const newVerts = [...vertices, point]
    setVertices(newVerts)

    const pts2d: Point2[] = newVerts.map((v) => [v[0], v[2]])
    if (newVerts.length >= 3) {
      const area = polygonArea(pts2d)
      const perimeter = polygonPerimeter(pts2d)
      setToolReadout(`Area: ${formatArea(area, lengthUnit)} | Perimeter: ${formatLength(perimeter, lengthUnit)} (click near first to close)`)
    } else {
      setToolReadout(`Area measure: ${newVerts.length} point${newVerts.length > 1 ? 's' : ''} placed`)
    }
  }, [activeTool, applySnap, closed, closePolygon, lengthUnit, setMeasurementCursor, setToolReadout, vertices])

  const handleDoubleClick = useCallback((e: { point?: THREE.Vector3 }) => {
    if (activeTool !== 'measure_area' || closed) return
    e.point // consume
    if (vertices.length >= 3) {
      closePolygon(vertices)
    }
  }, [activeTool, closed, closePolygon, vertices])

  const handleContextMenu = useCallback((e: React.MouseEvent | Event) => {
    if (activeTool !== 'measure_area' || closed) return
    e.preventDefault()
    if (vertices.length >= 3) {
      closePolygon(vertices)
    }
  }, [activeTool, closed, closePolygon, vertices])

  const handlePointerMove = useCallback((e: { point?: THREE.Vector3 }) => {
    const hitPoint = e.point as THREE.Vector3
    if (activeTool !== 'measure_area' || !hitPoint) return
    const point = applySnap([hitPoint.x, hitPoint.y, hitPoint.z])
    setMeasurementCursor(point)
    setCursorPos(point)

    if (!closed && vertices.length >= 2) {
      // Show live preview area including cursor position
      const previewVerts: Point2[] = [...vertices.map((v): Point2 => [v[0], v[2]]), [point[0], point[2]]]
      const area = polygonArea(previewVerts)
      const perimeter = polygonPerimeter(previewVerts)
      setToolReadout(`Area: ${formatArea(area, lengthUnit)} | Perimeter: ${formatLength(perimeter, lengthUnit)} (click near first to close)`)
    } else if (!closed && vertices.length === 0) {
      setToolReadout('Area measure: pick first point')
    }
  }, [activeTool, applySnap, closed, lengthUnit, setMeasurementCursor, setToolReadout, vertices])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPos(null)
    setMeasurementCursor(null)
    if (vertices.length === 0) setToolReadout(null)
  }, [vertices.length, setMeasurementCursor, setToolReadout])

  if (activeTool !== 'measure_area') return null

  // Compute polygon fill shape when closed
  const fillShape = useMemo(() => {
    if (!closed || vertices.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(vertices[0][0], vertices[0][2])
    for (let i = 1; i < vertices.length; i++) {
      shape.lineTo(vertices[i][0], vertices[i][2])
    }
    shape.closePath()
    return shape
  }, [closed, vertices])

  // Compute 2D centroid for the badge position
  const centroid3D: [number, number, number] | null = useMemo(() => {
    if (vertices.length < 3) return null
    const pts2d: Point2[] = vertices.map((v) => [v[0], v[2]])
    const [cx, cy] = polygonCentroid(pts2d)
    return [cx, activeSurfaceElevation + 0.3, cy]
  }, [vertices, activeSurfaceElevation])

  // Compute area/perimeter for the badge
  const areaValue = useMemo(() => {
    if (vertices.length < 3) return 0
    return polygonArea(vertices.map((v): Point2 => [v[0], v[2]]))
  }, [vertices])

  const perimeterValue = useMemo(() => {
    if (vertices.length < 3) return 0
    return polygonPerimeter(vertices.map((v): Point2 => [v[0], v[2]]))
  }, [vertices])

  // Build the line points array
  const linePoints: [number, number, number][] = closed
    ? [...vertices, vertices[0]]
    : vertices

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, activeSurfaceElevation, 0]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu as unknown as React.EventHandler<React.MouseEvent>}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertex points */}
      {vertices.map((v, i) => (
        <mesh key={i} position={v}>
          <sphereGeometry args={[0.08, 16, 16]} />
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
          points={[vertices[vertices.length - 1], cursorPos]}
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
          points={[cursorPos, vertices[0]]}
          color="#00ff88"
          lineWidth={1}
          dashed
          dashSize={0.15}
          gapSize={0.1}
        />
      )}

      {/* Semi-transparent polygon fill when closed */}
      {closed && fillShape && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, activeSurfaceElevation + 0.01, 0]}>
          <shapeGeometry args={[fillShape]} />
          <meshBasicMaterial color="#00ff88" transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Cursor indicator */}
      {cursorPos && !closed && (
        <mesh position={cursorPos}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#22d3ee'} />
        </mesh>
      )}

      {/* Snap type label */}
      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], activeSurfaceElevation + 0.15, snapMarker[1]]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}

      {/* Area badge at centroid */}
      {closed && centroid3D && (
        <Html position={centroid3D} center>
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
