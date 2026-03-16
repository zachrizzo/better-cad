import { useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import { snapPlanCandidate, usePlanSnapCandidates, type PlanSnapCandidate } from '../../hooks/usePlanSnapPoints'
import { getEnabledMeasurementSnapModes, MEASUREMENT_SNAP_MODE_LABELS } from '../../utils/measurement-snap-settings'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import type { SpotElevationElement } from '../../services/kernel-bridge'

type Point2 = [number, number]

const SNAP_THRESHOLD = 0.3
const PLANE_Z = 0.1

/**
 * 2D spot elevation placement tool.
 */
export function SpotElevationPlane2D() {
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

  const snapCandidates = usePlanSnapCandidates()
  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(dimensionSnapModeSettings, snapEnabled),
    [dimensionSnapModeSettings, snapEnabled],
  )

  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const [snappedCandidate, setSnappedCandidate] = useState<PlanSnapCandidate | null>(null)

  useEffect(() => {
    if (activeTool !== 'spot_elevation') {
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((raw: Point2): Point2 => {
    const { point, snapped } = snapPlanCandidate(raw, snapCandidates, enabledSnapModes, SNAP_THRESHOLD)
    setSnapMarker(snapped?.point ?? null)
    setSnappedCandidate(snapped)
    return point
  }, [enabledSnapModes, snapCandidates])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'spot_elevation') return
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)
    setCursorPoint(point)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    setToolReadout(`Spot Elev: ${formatLength(activeLevelElevation, lengthUnit)}`)
  }, [activeTool, applySnap, activeLevelElevation, lengthUnit, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setSnapMarker(null)
    setCursorPoint(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'spot_elevation') return
    const raw: Point2 = [e.point.x, e.point.y]
    const point = applySnap(raw)

    const elId = `spot-elev-${crypto.randomUUID()}`
    const spotEl: SpotElevationElement = {
      kind: 'spot_elevation',
      meta: { id: elId, name: `Spot ${formatLength(activeLevelElevation, lengthUnit)}`, level_id: activeLevelId },
      position: point,
      elevation: activeLevelElevation,
      symbol_style: 'circle',
    }

    setToolReadout(`Placed: ${formatLength(activeLevelElevation, lengthUnit)}`)

    if (!ready || !kernel) return
    void (async () => {
      try {
        await kernel.createElement(spotEl)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create spot elevation:', err)
      }
    })()
  }, [activeTool, applySnap, activeLevelElevation, activeLevelId, lengthUnit, kernel, ready, setToolReadout])

  if (activeTool !== 'spot_elevation') return null

  const z = PLANE_Z

  return (
    <>
      <mesh
        position={[0, 0, z]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], cursorPoint[1], z + 0.01]}>
          <circleGeometry args={[0.06, 12]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#ff9900'} />
        </mesh>
      )}

      {snapMarker && (
        <mesh position={[snapMarker[0], snapMarker[1], z + 0.01]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], snapMarker[1] + 0.2, z + 0.02]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}
    </>
  )
}
