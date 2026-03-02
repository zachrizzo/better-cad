import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import { formatLength } from '../../utils/units'
import type { StairElement } from '../../services/kernel-bridge'
import { isStairElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import { useActiveDrawingSurface } from '../../hooks/useActiveDrawingSurface'

const MIN_STAIR_RUN = 0.4
const MIN_SPIRAL_RADIUS = 0.3

type Point2 = [number, number]
type Polyline3 = [number, number, number][]
type PlanePointerEvent = ThreeEvent<PointerEvent>

type StraightPreview = {
  mode: 'straight'
  run: number
  center: Point2
  centerLine: Polyline3
  leftLine: Polyline3
  rightLine: Polyline3
  riserLines: Polyline3[]
}

type SpiralPreview = {
  mode: 'spiral'
  run: number
  label: Point2
  radiusLine: Polyline3
  outerLine: Polyline3
  innerLine: Polyline3
  startBoundary: Polyline3
  endBoundary: Polyline3
  riserLines: Polyline3[]
}

type StairPreview = StraightPreview | SpiralPreview

function applyOrthoConstraint(start: Point2, end: Point2): Point2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [end[0], start[1]]
  }
  return [start[0], end[1]]
}

function normalizeSpiralTurns(turns: number): number {
  const clamped = Math.max(-5, Math.min(5, turns))
  if (Math.abs(clamped) < 0.1) return clamped < 0 ? -0.1 : 0.1
  return clamped
}

function spiralRunLength(outerRadius: number, width: number, turns: number): number {
  const centerRadius = Math.max(0.05, outerRadius - width * 0.5)
  return Math.abs(turns) * Math.PI * 2 * centerRadius
}

function arcPoints(center: Point2, radius: number, startAngle: number, endAngle: number, segments: number): Point2[] {
  const points: Point2[] = []
  const sweep = endAngle - startAngle
  for (let i = 0; i <= segments; i += 1) {
    const t = i / Math.max(1, segments)
    const angle = startAngle + sweep * t
    points.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ])
  }
  return points
}

export function StairPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const defaultStairWidth = useBimStore((s) => s.defaultStairWidth)
  const defaultStairRisers = useBimStore((s) => s.defaultStairRisers)
  const defaultStairHeight = useBimStore((s) => s.defaultStairHeight)
  const defaultStairType = useBimStore((s) => s.defaultStairType)
  const defaultSpiralTurns = useBimStore((s) => s.defaultSpiralTurns)
  const defaultStairSideWallThickness = useBimStore((s) => s.defaultStairSideWallThickness)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const { activeSurfaceElevation } = useActiveDrawingSurface()
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [startPoint, setStartPoint] = useState<Point2 | null>(null)
  const [previewEnd, setPreviewEnd] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const snapPoints = usePlanSnapPoints()

  const stairCount = useMemo(
    () => Array.from(elements.values()).filter(isStairElement).length,
    [elements],
  )

  useEffect(() => {
    if (activeTool !== 'stair') {
      setStartPoint(null)
      setPreviewEnd(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: Point2): { point: Point2; snapped: Point2 | null } => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const readoutForStraight = useCallback((start: Point2, end: Point2) => {
    const run = Math.hypot(end[0] - start[0], end[1] - start[1])
    const risePerRiser = defaultStairHeight / Math.max(1, defaultStairRisers)
    setToolReadout(
      `Stair straight run:${formatLength(run, lengthUnit)} rise:${formatLength(defaultStairHeight, lengthUnit)} (${formatLength(risePerRiser, lengthUnit)} per riser) W:${formatLength(defaultStairWidth, lengthUnit)} R:${defaultStairRisers}`,
    )
  }, [defaultStairHeight, defaultStairRisers, defaultStairWidth, lengthUnit, setToolReadout])

  const readoutForSpiral = useCallback((center: Point2, edgePoint: Point2) => {
    const radius = Math.hypot(edgePoint[0] - center[0], edgePoint[1] - center[1])
    const turns = normalizeSpiralTurns(defaultSpiralTurns)
    const run = spiralRunLength(radius, defaultStairWidth, turns)
    const risePerRiser = defaultStairHeight / Math.max(1, defaultStairRisers)
    setToolReadout(
      `Stair spiral run:${formatLength(run, lengthUnit)} radius:${formatLength(radius, lengthUnit)} turns:${turns.toFixed(2)} rise:${formatLength(defaultStairHeight, lengthUnit)} (${formatLength(risePerRiser, lengthUnit)} per riser)`,
    )
  }, [defaultSpiralTurns, defaultStairHeight, defaultStairRisers, defaultStairWidth, lengthUnit, setToolReadout])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'stair') return

    const rawPoint: Point2 = [e.point.x, e.point.z]
    const constrainedPoint = (
      defaultStairType === 'straight' && startPoint && e.shiftKey
        ? applyOrthoConstraint(startPoint, rawPoint)
        : rawPoint
    )
    const { point, snapped } = applySnap(constrainedPoint)

    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])

    if (!startPoint) {
      setToolReadout(
        `Stair defaults ${defaultStairType} W:${formatLength(defaultStairWidth, lengthUnit)} R:${defaultStairRisers} H:${formatLength(defaultStairHeight, lengthUnit)} • pick ${defaultStairType === 'spiral' ? 'center' : 'start'}`,
      )
      return
    }

    setPreviewEnd(point)
    if (defaultStairType === 'spiral') {
      readoutForSpiral(startPoint, point)
      return
    }
    readoutForStraight(startPoint, point)
  }, [
    activeSurfaceElevation,
    activeTool,
    applySnap,
    defaultStairHeight,
    defaultStairRisers,
    defaultStairType,
    defaultStairWidth,
    lengthUnit,
    readoutForSpiral,
    readoutForStraight,
    setMeasurementCursor,
    setToolReadout,
    startPoint,
  ])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'stair') return

    const rawPoint: Point2 = [e.point.x, e.point.z]
    const constrainedPoint = (
      defaultStairType === 'straight' && startPoint && e.shiftKey
        ? applyOrthoConstraint(startPoint, rawPoint)
        : rawPoint
    )
    const { point, snapped } = applySnap(constrainedPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])

    if (!startPoint) {
      setStartPoint(point)
      setPreviewEnd(point)
      setToolReadout(
        `Stair ${defaultStairType === 'spiral' ? 'center' : 'start'} X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[1], lengthUnit)}`,
      )
      return
    }

    if (defaultStairType === 'straight') {
      const run = Math.hypot(point[0] - startPoint[0], point[1] - startPoint[1])
      if (run < MIN_STAIR_RUN) {
        setToolReadout(`Stair run too short • minimum is ${formatLength(MIN_STAIR_RUN, lengthUnit)}`)
        return
      }
    } else {
      const radius = Math.hypot(point[0] - startPoint[0], point[1] - startPoint[1])
      if (radius < MIN_SPIRAL_RADIUS) {
        setToolReadout(`Spiral radius too small • minimum is ${formatLength(MIN_SPIRAL_RADIUS, lengthUnit)}`)
        return
      }
    }

    const turns = normalizeSpiralTurns(defaultSpiralTurns)
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
      stair_type: defaultStairType,
      spiral_turns: turns,
      side_wall_thickness: defaultStairSideWallThickness,
    }

    setStartPoint(null)
    setPreviewEnd(null)
    if (defaultStairType === 'spiral') {
      readoutForSpiral(stairElement.start, stairElement.end)
    } else {
      readoutForStraight(stairElement.start, stairElement.end)
    }

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
    activeSurfaceElevation,
    activeLevelId,
    activeTool,
    applySnap,
    defaultSpiralTurns,
    defaultStairHeight,
    defaultStairRisers,
    defaultStairSideWallThickness,
    defaultStairType,
    defaultStairWidth,
    kernel,
    lengthUnit,
    readoutForSpiral,
    readoutForStraight,
    ready,
    setMeasurementCursor,
    setToolReadout,
    stairCount,
    startPoint,
  ])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setStartPoint(null)
    setPreviewEnd(null)
    setSnapMarker(null)
    setToolReadout('Stair placement canceled')
  }, [setToolReadout])

  if (activeTool !== 'stair') return null

  const preview: StairPreview | null = startPoint && previewEnd
    ? (() => {
      if (defaultStairType === 'spiral') {
        const dx = previewEnd[0] - startPoint[0]
        const dz = previewEnd[1] - startPoint[1]
        const outerRadius = Math.hypot(dx, dz)
        if (outerRadius < 1e-6) return null

        const innerRadius = Math.max(0.05, outerRadius - defaultStairWidth)
        const turns = normalizeSpiralTurns(defaultSpiralTurns)
        const startAngle = Math.atan2(dz, dx)
        const endAngle = startAngle + turns * Math.PI * 2
        const sweep = endAngle - startAngle
        const segmentCount = Math.max(24, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 96))
        const outerArc = arcPoints(startPoint, outerRadius, startAngle, endAngle, segmentCount)
        const innerArc = arcPoints(startPoint, innerRadius, startAngle, endAngle, segmentCount)
        const risers = Math.max(1, defaultStairRisers)
        const riserLines: Polyline3[] = []
        for (let i = 0; i <= risers; i += 1) {
          const t = i / risers
          const angle = startAngle + sweep * t
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          riserLines.push([
            [startPoint[0] + cos * innerRadius, 0.03, startPoint[1] + sin * innerRadius],
            [startPoint[0] + cos * outerRadius, 0.03, startPoint[1] + sin * outerRadius],
          ])
        }

        const run = spiralRunLength(outerRadius, defaultStairWidth, turns)
        const midAngle = startAngle + sweep * 0.5
        const labelRadius = innerRadius + (outerRadius - innerRadius) * 0.5

        return {
          mode: 'spiral',
          run,
          label: [
            startPoint[0] + Math.cos(midAngle) * labelRadius,
            startPoint[1] + Math.sin(midAngle) * labelRadius,
          ],
          radiusLine: [
            [startPoint[0], 0.05, startPoint[1]],
            [previewEnd[0], 0.05, previewEnd[1]],
          ],
          outerLine: outerArc.map(([x, z]) => [x, 0.03, z]),
          innerLine: innerArc.map(([x, z]) => [x, 0.03, z]),
          startBoundary: [
            [innerArc[0][0], 0.03, innerArc[0][1]],
            [outerArc[0][0], 0.03, outerArc[0][1]],
          ],
          endBoundary: [
            [innerArc[innerArc.length - 1][0], 0.03, innerArc[innerArc.length - 1][1]],
            [outerArc[outerArc.length - 1][0], 0.03, outerArc[outerArc.length - 1][1]],
          ],
          riserLines,
        } satisfies SpiralPreview
      }

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

      const riserLines: Polyline3[] = []
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
        mode: 'straight',
        run: len,
        center: [(startPoint[0] + previewEnd[0]) / 2, (startPoint[1] + previewEnd[1]) / 2],
        centerLine: [
          [startPoint[0], 0.05, startPoint[1]],
          [previewEnd[0], 0.05, previewEnd[1]],
        ],
        leftLine: [
          [leftStart[0], 0.03, leftStart[1]],
          [leftEnd[0], 0.03, leftEnd[1]],
        ],
        rightLine: [
          [rightStart[0], 0.03, rightStart[1]],
          [rightEnd[0], 0.03, rightEnd[1]],
        ],
        riserLines,
      } satisfies StraightPreview
    })()
    : null

  const planeY = activeSurfaceElevation
  const offsetLine = (line: Polyline3): Polyline3 =>
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
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#38bdf8'} />
        </mesh>
      )}

      {startPoint && (
        <mesh position={[startPoint[0], planeY + 0.05, startPoint[1]]}>
          <sphereGeometry args={[0.08, 14, 14]} />
          <meshBasicMaterial color="#0ea5e9" />
        </mesh>
      )}

      {preview?.mode === 'straight' && (
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

      {preview?.mode === 'spiral' && (
        <>
          <Line
            points={offsetLine(preview.radiusLine)}
            color="#0ea5e9"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.12}
          />
          <Line points={offsetLine(preview.outerLine)} color="#38bdf8" lineWidth={1.6} />
          <Line points={offsetLine(preview.innerLine)} color="#38bdf8" lineWidth={1.6} />
          <Line points={offsetLine(preview.startBoundary)} color="#38bdf8" lineWidth={1.4} />
          <Line points={offsetLine(preview.endBoundary)} color="#38bdf8" lineWidth={1.4} />
          {preview.riserLines.map((line, idx) => (
            <Line key={idx} points={offsetLine(line)} color="#7dd3fc" lineWidth={1} />
          ))}
          <Html position={[preview.label[0], planeY + 0.35, preview.label[1]]} center>
            <div className="measurement-badge">
              {formatLength(preview.run, lengthUnit)} • {defaultStairRisers} risers • {normalizeSpiralTurns(defaultSpiralTurns).toFixed(2)} turns
            </div>
          </Html>
        </>
      )}
    </>
  )
}
