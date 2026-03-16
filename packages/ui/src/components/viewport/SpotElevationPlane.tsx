import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
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
import { useEntityStore, isSpotElevationElement } from '../../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import type { SpotElevationElement } from '../../services/kernel-bridge'

type Point2 = [number, number]

const SNAP_DISTANCE = 0.3

/**
 * 3D spot elevation placement tool. Single-click to place elevation markers.
 */
export function SpotElevationPlane() {
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

  const planSnapCandidates = usePlanSnapCandidates()
  const enabledSnapModes = useMemo(
    () => getEnabledMeasurementSnapModes(dimensionSnapModeSettings, snapEnabled),
    [dimensionSnapModeSettings, snapEnabled],
  )

  const planeRef = useRef<THREE.Mesh>(null)
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

  const snapToNearest = useCallback((raw: Point2): { point: Point2; snapped: Point2 | null } => {
    const { point, snapped } = snapPlanCandidate(raw, planSnapCandidates, enabledSnapModes, SNAP_DISTANCE)
    setSnappedCandidate(snapped)
    return { point, snapped: snapped?.point ?? null }
  }, [enabledSnapModes, planSnapCandidates])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'spot_elevation') return
    const raw: Point2 = [e.point.x, e.point.z]
    const { point, snapped } = snapToNearest(raw)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    setToolReadout(`Spot Elev: ${formatLength(activeLevelElevation, lengthUnit)}`)
  }, [activeTool, snapToNearest, activeLevelElevation, lengthUnit, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'spot_elevation') return

    const raw: Point2 = [e.point.x, e.point.z]
    const { point } = snapToNearest(raw)

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
  }

  if (activeTool !== 'spot_elevation') return null

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
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], planeY + 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#ff9900'} />
        </mesh>
      )}

      {snapMarker && (
        <mesh position={[snapMarker[0], planeY + 0.05, snapMarker[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.14, 20]} />
          <meshBasicMaterial color="#00ff88" side={THREE.DoubleSide} />
        </mesh>
      )}

      {snapMarker && snappedCandidate && (
        <Html position={[snapMarker[0], planeY + 0.2, snapMarker[1]]} center>
          <div className="snap-type-label">{MEASUREMENT_SNAP_MODE_LABELS[snappedCandidate.modes[0]]}</div>
        </Html>
      )}
    </>
  )
}

/**
 * Renders all persisted spot elevation elements in the 3D scene.
 */
export function SpotElevationOverlay3D() {
  const elements = useEntityStore((s) => s.elements)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const levels = useLevelStore((s) => s.levels)

  const spotElevations = useMemo(
    () => Array.from(elements.values()).filter(isSpotElevationElement),
    [elements],
  )

  const levelElevations = useMemo(() => {
    const map = new Map<string, number>()
    for (const lvl of levels) map.set(lvl.id, lvl.elevation)
    return map
  }, [levels])

  if (spotElevations.length === 0) return null

  return (
    <>
      {spotElevations.map((spot) => {
        const elev = spot.meta.level_id ? (levelElevations.get(spot.meta.level_id) ?? 0) : 0
        return (
          <group key={spot.meta.id} position={[spot.position[0], elev + 0.02, spot.position[1]]}>
            {/* Crosshair */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.08, 0.12, 20]} />
              <meshBasicMaterial color="#ff9900" side={THREE.DoubleSide} />
            </mesh>
            {/* Elevation label */}
            <Html position={[0, 0.15, 0]} center>
              <div className="measurement-badge" style={{ background: '#ff9900', padding: '2px 6px', borderRadius: 3, fontSize: 11, color: '#fff' }}>
                {formatLength(spot.elevation, lengthUnit)}
              </div>
            </Html>
          </group>
        )
      })}
    </>
  )
}
