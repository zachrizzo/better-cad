import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { RoofElement } from '../../services/kernel-bridge'
import { isRoofElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

const MIN_POLYGON_VERTICES = 3
const CLOSE_DISTANCE = 0.3

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>

function polygonArea(pts: Point2[]): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i][0] * pts[j][1]
    area -= pts[j][0] * pts[i][1]
  }
  return Math.abs(area) / 2
}

function RoofMesh({ boundary, thickness, elevation, color }: {
  boundary: Point2[]
  thickness: number
  elevation: number
  color: string
}) {
  const geometry = useMemo(() => {
    if (boundary.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(boundary[0][0], boundary[0][1])
    for (let i = 1; i < boundary.length; i++) {
      shape.lineTo(boundary[i][0], boundary[i][1])
    }
    shape.closePath()
    const extrudeSettings = { depth: thickness, bevelEnabled: false }
    return new THREE.ExtrudeGeometry(shape, extrudeSettings)
  }, [boundary, thickness])

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshStandardMaterial color={color} transparent opacity={0.85} />
    </mesh>
  )
}

export function RoofPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultRoofThickness = useBimStore((s) => s.defaultRoofThickness)
  const defaultRoofElevation = useBimStore((s) => s.defaultRoofElevation)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [vertices, setVertices] = useState<Point2[]>([])
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)

  const roofCount = useMemo(
    () => Array.from(elements.values()).filter(isRoofElement).length,
    [elements],
  )

  const placedRoofs = useMemo(
    () => Array.from(elements.values()).filter(isRoofElement),
    [elements],
  )

  useEffect(() => {
    if (activeTool !== 'roof') {
      setVertices([])
      setCursorPoint(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const isNearFirstVertex = useCallback((point: Point2): boolean => {
    if (vertices.length < MIN_POLYGON_VERTICES) return false
    const dx = point[0] - vertices[0][0]
    const dy = point[1] - vertices[0][1]
    return Math.sqrt(dx * dx + dy * dy) < CLOSE_DISTANCE
  }, [vertices])

  const updateReadout = useCallback((point: Point2) => {
    if (vertices.length === 0) {
      setToolReadout(
        `Roof T:${formatLength(defaultRoofThickness, lengthUnit)} Elev:${formatLength(defaultRoofElevation, lengthUnit)} -- click to start polygon`,
      )
      return
    }

    const previewPoly = [...vertices, point]
    const area = polygonArea(previewPoly)
    const nearClose = isNearFirstVertex(point)

    setToolReadout(
      `Roof ${vertices.length} pts A:${area.toFixed(2)} m\u00B2 T:${formatLength(defaultRoofThickness, lengthUnit)}${nearClose ? ' -- click/dbl-click to close' : ' -- click to add point, right-click/dbl-click to close'}`,
    )
  }, [defaultRoofThickness, defaultRoofElevation, lengthUnit, setToolReadout, vertices, isNearFirstVertex])

  const finishPolygon = useCallback((pts: Point2[]) => {
    if (pts.length < MIN_POLYGON_VERTICES) {
      setVertices([])
      setToolReadout('Roof needs at least 3 points')
      return
    }

    const area = polygonArea(pts)
    const roofElement: RoofElement = {
      kind: 'roof',
      meta: {
        id: `roof-${crypto.randomUUID()}`,
        name: `Roof ${roofCount + 1}`,
      },
      boundary: pts,
      thickness: defaultRoofThickness,
      elevation: defaultRoofElevation,
    }

    setVertices([])
    setToolReadout(
      `Roof placed ${pts.length} pts A:${area.toFixed(2)} m\u00B2 T:${formatLength(defaultRoofThickness, lengthUnit)}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; roof entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(roofElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create roof entity:', err)
      }
    })()
  }, [defaultRoofThickness, defaultRoofElevation, roofCount, kernel, ready, lengthUnit, setToolReadout])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'roof') return
    const point: Point2 = [e.point.x, e.point.z]
    setCursorPoint(point)
    setMeasurementCursor([point[0], 0, point[1]])
    updateReadout(point)
  }, [activeTool, setMeasurementCursor, updateReadout])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'roof') return

    const point: Point2 = [e.point.x, e.point.z]
    setCursorPoint(point)
    setMeasurementCursor([point[0], 0, point[1]])

    if (vertices.length >= MIN_POLYGON_VERTICES && isNearFirstVertex(point)) {
      finishPolygon(vertices)
      return
    }

    setVertices((prev) => [...prev, point])
  }, [activeTool, vertices, isNearFirstVertex, finishPolygon, setMeasurementCursor])

  const handleDoubleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'roof') return
    if (vertices.length >= MIN_POLYGON_VERTICES) {
      finishPolygon(vertices)
    }
  }, [activeTool, vertices, finishPolygon])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    if (vertices.length >= MIN_POLYGON_VERTICES) {
      finishPolygon(vertices)
    } else {
      setVertices([])
      setToolReadout('Roof placement canceled')
    }
  }, [vertices, finishPolygon, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const previewLoop = useMemo(() => {
    if (vertices.length === 0) return null
    const elevation = defaultRoofElevation
    const pts: [number, number, number][] = vertices.map(
      (v) => [v[0], elevation + 0.02, v[1]],
    )
    if (cursorPoint) {
      pts.push([cursorPoint[0], elevation + 0.02, cursorPoint[1]])
    }
    // Close the loop back to start
    pts.push([vertices[0][0], elevation + 0.02, vertices[0][1]])
    return pts
  }, [vertices, cursorPoint, defaultRoofElevation])

  const previewArea = useMemo(() => {
    if (vertices.length < 2 || !cursorPoint) return null
    const pts = [...vertices, cursorPoint]
    return polygonArea(pts)
  }, [vertices, cursorPoint])

  const previewCenter = useMemo(() => {
    if (vertices.length === 0) return null
    const allPts = cursorPoint ? [...vertices, cursorPoint] : vertices
    let cx = 0
    let cy = 0
    for (const p of allPts) {
      cx += p[0]
      cy += p[1]
    }
    cx /= allPts.length
    cy /= allPts.length
    return [cx, defaultRoofElevation + 0.5, cy] as [number, number, number]
  }, [vertices, cursorPoint, defaultRoofElevation])

  if (activeTool !== 'roof') {
    return (
      <>
        {placedRoofs.map((roof) => (
          <RoofMesh
            key={roof.meta.id}
            boundary={roof.boundary}
            thickness={roof.thickness}
            elevation={roof.elevation}
            color="#92400e"
          />
        ))}
      </>
    )
  }

  return (
    <>
      {placedRoofs.map((roof) => (
        <RoofMesh
          key={roof.meta.id}
          boundary={roof.boundary}
          thickness={roof.thickness}
          elevation={roof.elevation}
          color="#92400e"
        />
      ))}

      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, defaultRoofElevation, 0]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], defaultRoofElevation + 0.04, cursorPoint[1]]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial
            color={isNearFirstVertex(cursorPoint) ? '#f59e0b' : '#b45309'}
          />
        </mesh>
      )}

      {vertices.map((v, i) => (
        <mesh key={i} position={[v[0], defaultRoofElevation + 0.04, v[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={i === 0 ? '#f59e0b' : '#b45309'} />
        </mesh>
      ))}

      {previewLoop && previewLoop.length >= 2 && (
        <Line points={previewLoop} color="#b45309" lineWidth={2} />
      )}

      {previewCenter && previewArea !== null && previewArea > 0.01 && (
        <Html position={previewCenter} center>
          <div className="measurement-badge">
            {previewArea.toFixed(2)} m{'\u00B2'}
          </div>
        </Html>
      )}
    </>
  )
}
