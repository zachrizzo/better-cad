import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import { snapPlanCandidate, usePlanSnapCandidates } from '../../hooks/usePlanSnapPoints'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import type { DimensionElement } from '../../services/kernel-bridge'
import { getEnabledMeasurementSnapModes } from '../../utils/measurement-snap-settings'

type Point2 = [number, number]

const SNAP_DISTANCE = 0.2
const DEFAULT_OFFSET = 0.5
const PLANE_Z = 0.1

/**
 * 2D dimension tool — rendered inside the Viewport2D Canvas.
 * Two-click workflow: places a persistent dimension element.
 * Created dimensions auto-render via the existing DimensionLine2D component.
 */
export function DimensionPlane2D() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const dimensionSnapModeSettings = useSettingsStore((s) => s.measurementSnapSettings.dimension)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const planeRef = useRef<THREE.Mesh>(null)
  const [p1, setP1] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)

  const planSnapCandidates = usePlanSnapCandidates()
  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(dimensionSnapModeSettings, snapEnabled),
    [dimensionSnapModeSettings, snapEnabled],
  )

  const snapToNearest = useCallback((raw: Point2): { point: Point2; snapped: Point2 | null } => {
    const { point, snapped } = snapPlanCandidate(raw, planSnapCandidates, enabledSnapModes, SNAP_DISTANCE)
    return { point, snapped: snapped?.point ?? null }
  }, [enabledSnapModes, planSnapCandidates])

  useEffect(() => {
    if (activeTool !== 'dimension') {
      setP1(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'dimension') return
    // In 2D orthographic: e.point.x = plan X, e.point.y = plan Y (kernel Y)
    const raw: Point2 = [e.point.x, e.point.y]
    const { point, snapped } = snapToNearest(raw)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])

    if (p1) {
      const dist = Math.hypot(point[0] - p1[0], point[1] - p1[1])
      setToolReadout(`Dimension: ${formatLength(dist, lengthUnit)}${snapped ? ' SNAP' : ''}`)
    } else {
      setToolReadout('Dimension: pick first point')
    }
  }, [activeLevelElevation, activeTool, p1, snapToNearest, lengthUnit, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'dimension') return

    const raw: Point2 = [e.point.x, e.point.y]
    const { point } = snapToNearest(raw)

    if (!p1) {
      setP1(point)
      setToolReadout('Dimension: pick second point')
      return
    }

    const dist = Math.hypot(point[0] - p1[0], point[1] - p1[1])
    if (dist < 0.05) return

    const dimId = `dim-${crypto.randomUUID()}`
    const dimElement: DimensionElement = {
      kind: 'dimension',
      meta: {
        id: dimId,
        name: `Dim ${formatLength(dist, lengthUnit)}`,
        level_id: activeLevelId,
      },
      p1: p1,
      p2: point,
      offset: DEFAULT_OFFSET,
    }

    setP1(null)
    setCursorPoint(null)
    setToolReadout(`Dimension placed: ${formatLength(dist, lengthUnit)}`)

    if (!ready || !kernel) return
    void (async () => {
      try {
        await kernel.createElement(dimElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create dimension:', err)
      }
    })()
  }, [activeLevelId, activeTool, kernel, lengthUnit, p1, ready, setToolReadout, snapToNearest])

  if (activeTool !== 'dimension') return null

  const z = PLANE_Z

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        ref={planeRef}
        position={[0, 0, z]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Cursor indicator */}
      {cursorPoint && (
        <mesh position={[cursorPoint[0], cursorPoint[1], z + 0.01]}>
          <circleGeometry args={[0.06, 12]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#ff6b6b'} />
        </mesh>
      )}

      {/* First point */}
      {p1 && (
        <mesh position={[p1[0], p1[1], z + 0.01]}>
          <circleGeometry args={[0.1, 16]} />
          <meshBasicMaterial color="#ff6b6b" />
        </mesh>
      )}

      {/* Preview line */}
      {p1 && cursorPoint && (
        <Line
          points={[
            [p1[0], p1[1], z + 0.01],
            [cursorPoint[0], cursorPoint[1], z + 0.01],
          ]}
          color="#ff6b6b"
          lineWidth={1.5}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}

      {/* Snap ring */}
      {snapMarker && (
        <mesh position={[snapMarker[0], snapMarker[1], z + 0.01]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}
