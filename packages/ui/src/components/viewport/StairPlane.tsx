import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { StairElement } from '../../services/kernel-bridge'
import { isStairElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'

const MIN_STAIR_RUN = 0.4

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>

function applyOrthoConstraint(start: Point2, end: Point2): Point2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [end[0], start[1]]
  }
  return [start[0], end[1]]
}

export function StairPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultStairWidth = useBimStore((s) => s.defaultStairWidth)
  const defaultStairRisers = useBimStore((s) => s.defaultStairRisers)
  const defaultStairHeight = useBimStore((s) => s.defaultStairHeight)
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
  const [startPoint, setStartPoint] = useState<Point2 | null>(null)
  const [previewEnd, setPreviewEnd] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)

  const stairCount = useMemo(
    () => Array.from(elements.values()).filter(isStairElement).length,
    [elements],
  )

  useEffect(() => {
    if (activeTool !== 'stair') {
      setStartPoint(null)
      setPreviewEnd(null)
      setCursorPoint(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const readoutFor = useCallback((start: Point2, end: Point2) => {
    const run = Math.hypot(end[0] - start[0], end[1] - start[1])
    const risePerRiser = defaultStairHeight / Math.max(1, defaultStairRisers)
    setToolReadout(
      `Stair run:${formatLength(run, lengthUnit)} rise:${formatLength(defaultStairHeight, lengthUnit)} (${formatLength(risePerRiser, lengthUnit)} per riser) W:${formatLength(defaultStairWidth, lengthUnit)} R:${defaultStairRisers}`,
    )
  }, [defaultStairHeight, defaultStairRisers, defaultStairWidth, lengthUnit, setToolReadout])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'stair') return

    const rawPoint: Point2 = [e.point.x, e.point.z]
    const point = startPoint && e.shiftKey ? applyOrthoConstraint(startPoint, rawPoint) : rawPoint

    setCursorPoint(point)
    setMeasurementCursor([point[0], 0, point[1]])

    if (!startPoint) {
      setToolReadout(
        `Stair defaults W:${formatLength(defaultStairWidth, lengthUnit)} R:${defaultStairRisers} H:${formatLength(defaultStairHeight, lengthUnit)} • pick start`,
      )
      return
    }

    setPreviewEnd(point)
    readoutFor(startPoint, point)
  }, [
    activeTool,
    defaultStairHeight,
    defaultStairRisers,
    defaultStairWidth,
    lengthUnit,
    readoutFor,
    setMeasurementCursor,
    setToolReadout,
    startPoint,
  ])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'stair') return

    const rawPoint: Point2 = [e.point.x, e.point.z]
    const point = startPoint && e.shiftKey ? applyOrthoConstraint(startPoint, rawPoint) : rawPoint
    setCursorPoint(point)
    setMeasurementCursor([point[0], 0, point[1]])

    if (!startPoint) {
      setStartPoint(point)
      setPreviewEnd(point)
      setToolReadout(`Stair start X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[1], lengthUnit)}`)
      return
    }

    const run = Math.hypot(point[0] - startPoint[0], point[1] - startPoint[1])
    if (run < MIN_STAIR_RUN) {
      setToolReadout(`Stair run too short • minimum is ${formatLength(MIN_STAIR_RUN, lengthUnit)}`)
      return
    }

    const stairElement: StairElement = {
      kind: 'stair',
      meta: {
        id: `stair-${crypto.randomUUID()}`,
        name: `Stair ${stairCount + 1}`,
        level_id: activeLevelId,
      },
      start: startPoint,
      end: point,
      width: defaultStairWidth,
      risers: defaultStairRisers,
      total_height: defaultStairHeight,
    }

    setStartPoint(null)
    setPreviewEnd(null)
    readoutFor(stairElement.start, stairElement.end)

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; stair entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(stairElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create stair entity:', err)
      }
    })()
  }, [
    activeTool,
    defaultStairHeight,
    defaultStairRisers,
    defaultStairWidth,
    kernel,
    lengthUnit,
    readoutFor,
    ready,
    setMeasurementCursor,
    setToolReadout,
    stairCount,
    startPoint,
  ])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setStartPoint(null)
    setPreviewEnd(null)
    setToolReadout('Stair placement canceled')
  }, [setToolReadout])

  if (activeTool !== 'stair') return null

  const preview = startPoint && previewEnd
    ? (() => {
      const dx = previewEnd[0] - startPoint[0]
      const dz = previewEnd[1] - startPoint[1]
      const len = Math.hypot(dx, dz)
      if (len < 1e-6) return null

      const dir: Point2 = [dx / len, dz / len]
      const normal: Point2 = [
        -dir[1] * (defaultStairWidth / 2),
        dir[0] * (defaultStairWidth / 2),
      ]
      const leftStart: Point2 = [startPoint[0] + normal[0], startPoint[1] + normal[1]]
      const rightStart: Point2 = [startPoint[0] - normal[0], startPoint[1] - normal[1]]
      const leftEnd: Point2 = [previewEnd[0] + normal[0], previewEnd[1] + normal[1]]
      const rightEnd: Point2 = [previewEnd[0] - normal[0], previewEnd[1] - normal[1]]

      const riserLines: [number, number, number][][] = []
      for (let i = 0; i <= defaultStairRisers; i += 1) {
        const t = i / Math.max(1, defaultStairRisers)
        const cx = startPoint[0] + dx * t
        const cz = startPoint[1] + dz * t
        riserLines.push([
          [cx + normal[0], 0.03, cz + normal[1]],
          [cx - normal[0], 0.03, cz - normal[1]],
        ])
      }

      return {
        run: len,
        center: [(startPoint[0] + previewEnd[0]) / 2, (startPoint[1] + previewEnd[1]) / 2] as Point2,
        centerLine: [
          [startPoint[0], 0.05, startPoint[1]],
          [previewEnd[0], 0.05, previewEnd[1]],
        ] as [number, number, number][],
        leftLine: [
          [leftStart[0], 0.03, leftStart[1]],
          [leftEnd[0], 0.03, leftEnd[1]],
        ] as [number, number, number][],
        rightLine: [
          [rightStart[0], 0.03, rightStart[1]],
          [rightEnd[0], 0.03, rightEnd[1]],
        ] as [number, number, number][],
        riserLines,
      }
    })()
    : null

  const planeY = activeLevelElevation
  const offsetLine = (line: [number, number, number][]): [number, number, number][] =>
    line.map(([x, y, z]) => [x, planeY + y, z])

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
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}

      {startPoint && (
        <mesh position={[startPoint[0], planeY + 0.05, startPoint[1]]}>
          <sphereGeometry args={[0.08, 14, 14]} />
          <meshBasicMaterial color="#0ea5e9" />
        </mesh>
      )}

      {preview && (
        <>
          <Line
            points={offsetLine(preview.centerLine)}
            color="#0ea5e9"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.12}
          />
          <Line points={offsetLine(preview.leftLine)} color="#38bdf8" lineWidth={1.6} />
          <Line points={offsetLine(preview.rightLine)} color="#38bdf8" lineWidth={1.6} />
          {preview.riserLines.map((line, idx) => (
            <Line key={idx} points={offsetLine(line)} color="#7dd3fc" lineWidth={1} />
          ))}
          <Html position={[preview.center[0], planeY + 0.35, preview.center[1]]} center>
            <div className="measurement-badge">
              {formatLength(preview.run, lengthUnit)} • {defaultStairRisers} risers
            </div>
          </Html>
        </>
      )}
    </>
  )
}
