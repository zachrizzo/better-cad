import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from '../../hooks/usePlanSnapPoints'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import type { DimensionElement } from '../../services/kernel-bridge'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'

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

  const dimensionSubMode = useUIStore((s) => s.dimensionSubMode)

  const planeRef = useRef<THREE.Mesh>(null)
  const [p1, setP1] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  // Chain / baseline / ordinate state
  const [chainGroupId] = useState(() => `chain-${crypto.randomUUID()}`)
  const [baselineOrigin, setBaselineOrigin] = useState<Point2 | null>(null)
  const [baselineCount, setBaselineCount] = useState(0)
  const [ordinateDatum, setOrdinateDatum] = useState<Point2 | null>(null)

  const planSnapCandidates = usePlanSnapCandidates()
  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(dimensionSnapModeSettings, snapEnabled),
    [dimensionSnapModeSettings, snapEnabled],
  )

  const snapToNearest = useCallback((raw: Point2): { point: Point2; snapped: Point2 | null } => {
    const { point, snapped } = snapPlanCandidate(raw, planSnapCandidates, enabledSnapModes, SNAP_DISTANCE)
    setSnappedCandidate(snapped)
    return { point, snapped: snapped?.point ?? null }
  }, [enabledSnapModes, planSnapCandidates])

  useEffect(() => {
    if (activeTool !== 'dimension') {
      setP1(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
      setBaselineOrigin(null)
      setBaselineCount(0)
      setOrdinateDatum(null)
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

    // --- Ordinate mode ---
    if (dimensionSubMode === 'ordinate') {
      if (!ordinateDatum) {
        setOrdinateDatum(point)
        setP1(point)
        setToolReadout('Ordinate: datum set, pick points (right-click to end)')
        return
      }
      // Each click creates a dimension from datum to this point
      const dx = Math.abs(point[0] - ordinateDatum[0])
      const dy = Math.abs(point[1] - ordinateDatum[1])
      const axis: 'x' | 'y' = dx > dy ? 'x' : 'y'
      const dist = axis === 'x' ? dx : dy
      if (dist < 0.01) return

      const dimId = `dim-${crypto.randomUUID()}`
      const dimElement: DimensionElement = {
        kind: 'dimension',
        meta: {
          id: dimId,
          name: `Ord ${formatLength(dist, lengthUnit)}`,
          level_id: activeLevelId,
        },
        p1: ordinateDatum,
        p2: point,
        offset: DEFAULT_OFFSET,
        dimension_mode: 'ordinate',
        ordinate_axis: axis,
        ordinate_datum: ordinateDatum,
      }

      setToolReadout(`Ordinate placed: ${formatLength(dist, lengthUnit)} (${axis.toUpperCase()})`)

      if (!ready || !kernel) return
      void (async () => {
        try {
          await kernel.createElement(dimElement)
          await syncEntitiesAndRegenerateMeshes(kernel)
        } catch (err) {
          console.error('[BetterCAD] Failed to create ordinate dimension:', err)
        }
      })()
      return
    }

    // --- Baseline mode: first click sets origin ---
    if (dimensionSubMode === 'baseline' && !baselineOrigin) {
      setBaselineOrigin(point)
      setP1(point)
      setToolReadout('Baseline: origin set, pick points (right-click to end)')
      return
    }

    // --- Normal first-point pick for aligned/horizontal/vertical/chain ---
    if (!p1) {
      setP1(point)
      setToolReadout('Dimension: pick second point')
      return
    }

    // --- Second point: compute effective p2 based on sub-mode ---
    let effectiveP2 = point
    if (dimensionSubMode === 'horizontal') effectiveP2 = [point[0], p1[1]]
    if (dimensionSubMode === 'vertical') effectiveP2 = [p1[0], point[1]]

    const dist = Math.hypot(effectiveP2[0] - p1[0], effectiveP2[1] - p1[1])
    if (dist < 0.05) return

    // Baseline mode: measure from baselineOrigin with increasing offset
    const isBaseline = dimensionSubMode === 'baseline' && baselineOrigin
    const dimP1 = isBaseline ? baselineOrigin : p1
    const dimP2 = effectiveP2
    const dimDist = isBaseline
      ? Math.hypot(dimP2[0] - dimP1[0], dimP2[1] - dimP1[1])
      : dist
    const dimOffset = isBaseline
      ? DEFAULT_OFFSET + baselineCount * 0.3
      : DEFAULT_OFFSET

    const dimId = `dim-${crypto.randomUUID()}`
    const dimElement: DimensionElement = {
      kind: 'dimension',
      meta: {
        id: dimId,
        name: `Dim ${formatLength(dimDist, lengthUnit)}`,
        level_id: activeLevelId,
      },
      p1: dimP1,
      p2: dimP2,
      offset: dimOffset,
      dimension_mode: dimensionSubMode as DimensionElement['dimension_mode'],
      ...(dimensionSubMode === 'chain' ? { chain_group_id: chainGroupId } : {}),
      ...(isBaseline ? { chain_group_id: chainGroupId, baseline_origin: baselineOrigin } : {}),
    }

    // After placing, update state based on mode
    if (dimensionSubMode === 'chain') {
      // Continue the chain: next segment starts from current point
      setP1(effectiveP2)
      setCursorPoint(null)
      setToolReadout(`Chain dim placed: ${formatLength(dist, lengthUnit)} — pick next point (right-click to end)`)
    } else if (isBaseline) {
      // Keep baselineOrigin, increment count, reset p1 for next pick
      setBaselineCount((c) => c + 1)
      setP1(baselineOrigin)
      setCursorPoint(null)
      setToolReadout(`Baseline dim placed: ${formatLength(dimDist, lengthUnit)} — pick next point (right-click to end)`)
    } else {
      setP1(null)
      setCursorPoint(null)
      setToolReadout(`Dimension placed: ${formatLength(dist, lengthUnit)}`)
    }

    if (!ready || !kernel) return
    void (async () => {
      try {
        await kernel.createElement(dimElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create dimension:', err)
      }
    })()
  }, [activeLevelId, activeTool, baselineCount, baselineOrigin, chainGroupId, dimensionSubMode, kernel, lengthUnit, ordinateDatum, p1, ready, setToolReadout, snapToNearest])

  const handleContextMenu = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (dimensionSubMode === 'chain' || dimensionSubMode === 'baseline' || dimensionSubMode === 'ordinate') {
      setP1(null)
      setCursorPoint(null)
      setBaselineOrigin(null)
      setBaselineCount(0)
      setOrdinateDatum(null)
      setToolReadout('Dimension: pick first point')
    }
  }, [dimensionSubMode, setToolReadout])

  if (activeTool !== 'dimension') return null

  const z = PLANE_Z

  return (
    <>
      {/* Invisible interaction plane */}
      <mesh
        ref={planeRef}
        position={[0, 0, z]}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
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

      {/* Snap type label */}
      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], snapMarker[1] + 0.2, z + 0.02]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}
    </>
  )
}
