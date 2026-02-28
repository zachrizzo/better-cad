import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { FloorElement } from '../../services/kernel-bridge'
import { isFloorElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'

const MIN_FLOOR_DIMENSION = 0.2

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>

export function FloorPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultFloorThickness = useBimStore((s) => s.defaultFloorThickness)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [startCorner, setStartCorner] = useState<Point2 | null>(null)
  const [previewCorner, setPreviewCorner] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)

  const floorCount = useMemo(
    () => Array.from(elements.values()).filter(isFloorElement).length,
    [elements],
  )

  useEffect(() => {
    if (activeTool !== 'floor') {
      setStartCorner(null)
      setPreviewCorner(null)
      setCursorPoint(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const updateReadout = useCallback((point: Point2) => {
    if (!startCorner) {
      setToolReadout(
        `Floor thickness ${formatLength(defaultFloorThickness, lengthUnit)} • pick first corner`,
      )
      return
    }

    const width = Math.abs(point[0] - startCorner[0])
    const depth = Math.abs(point[1] - startCorner[1])
    const area = width * depth
    setToolReadout(
      `Floor W:${formatLength(width, lengthUnit)} D:${formatLength(depth, lengthUnit)} A:${area.toFixed(2)} m² T:${formatLength(defaultFloorThickness, lengthUnit)}`,
    )
  }, [defaultFloorThickness, lengthUnit, setToolReadout, startCorner])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'floor') return
    const point: Point2 = [e.point.x, e.point.z]
    setCursorPoint(point)
    setMeasurementCursor([point[0], 0, point[1]])
    if (startCorner) {
      setPreviewCorner(point)
    }
    updateReadout(point)
  }, [activeTool, setMeasurementCursor, startCorner, updateReadout])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'floor') return

    const point: Point2 = [e.point.x, e.point.z]
    setCursorPoint(point)
    setMeasurementCursor([point[0], 0, point[1]])

    if (!startCorner) {
      setStartCorner(point)
      setPreviewCorner(point)
      setToolReadout(
        `Floor start X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[1], lengthUnit)}`,
      )
      return
    }

    const minX = Math.min(startCorner[0], point[0])
    const maxX = Math.max(startCorner[0], point[0])
    const minZ = Math.min(startCorner[1], point[1])
    const maxZ = Math.max(startCorner[1], point[1])
    const width = maxX - minX
    const depth = maxZ - minZ

    if (width < MIN_FLOOR_DIMENSION || depth < MIN_FLOOR_DIMENSION) {
      setToolReadout(`Floor too small • minimum side is ${formatLength(MIN_FLOOR_DIMENSION, lengthUnit)}`)
      return
    }

    const floorElement: FloorElement = {
      kind: 'floor',
      meta: {
        id: `floor-${crypto.randomUUID()}`,
        name: `Floor ${floorCount + 1}`,
        level_id: activeLevelId,
      },
      boundary: [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
      ],
      thickness: defaultFloorThickness,
    }

    setStartCorner(null)
    setPreviewCorner(null)
    setToolReadout(
      `Floor placed W:${formatLength(width, lengthUnit)} D:${formatLength(depth, lengthUnit)} T:${formatLength(defaultFloorThickness, lengthUnit)}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; floor entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(floorElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create floor entity:', err)
      }
    })()
  }, [
    activeTool,
    defaultFloorThickness,
    floorCount,
    kernel,
    lengthUnit,
    ready,
    setMeasurementCursor,
    setToolReadout,
    startCorner,
  ])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setStartCorner(null)
    setPreviewCorner(null)
    setToolReadout('Floor placement canceled')
  }, [setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  if (activeTool !== 'floor') return null

  const previewData = startCorner && previewCorner
    ? (() => {
      const minX = Math.min(startCorner[0], previewCorner[0])
      const maxX = Math.max(startCorner[0], previewCorner[0])
      const minZ = Math.min(startCorner[1], previewCorner[1])
      const maxZ = Math.max(startCorner[1], previewCorner[1])
      const width = maxX - minX
      const depth = maxZ - minZ
      if (width < 1e-6 || depth < 1e-6) return null
      return {
        width,
        depth,
        center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as Point2,
        loop: [
          [minX, 0.02, minZ],
          [maxX, 0.02, minZ],
          [maxX, 0.02, maxZ],
          [minX, 0.02, maxZ],
          [minX, 0.02, minZ],
        ] as [number, number, number][],
      }
    })()
    : null

  const planeY = activeLevelElevation

  return (
    <>
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, planeY, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], planeY + 0.04, cursorPoint[1]]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
      )}

      {previewData && (
        <>
          <mesh position={[previewData.center[0], planeY + 0.01, previewData.center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[previewData.width, previewData.depth]} />
            <meshBasicMaterial color="#34d399" transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>
          <Line
            points={previewData.loop.map(([x, y, z]) => [x, planeY + y, z] as [number, number, number])}
            color="#10b981"
            lineWidth={2}
          />
          <Html position={[previewData.center[0], planeY + 0.3, previewData.center[1]]} center>
            <div className="measurement-badge">
              {formatLength(previewData.width, lengthUnit)} x {formatLength(previewData.depth, lengthUnit)}
            </div>
          </Html>
        </>
      )}
    </>
  )
}
