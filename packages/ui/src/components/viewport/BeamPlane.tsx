import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useLevelStore } from '../../stores/level-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import { formatLength } from '../../utils/units'
import type { BeamElement, ColumnElement, WallElement } from '../../services/kernel-bridge'
import { isBeamElement, isColumnElement, isFloorElement, isWallElement, useEntityStore } from '../../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

const MIN_BEAM_LENGTH = 0.2
const COLUMN_SNAP_MARGIN = 0.22
const WALL_SNAP_MARGIN = 0.28
const BEAM_SUPPORT_MARGIN = 0.26

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>
type SupportKind = 'column' | 'wall' | 'beam'
type SnapKind = SupportKind | 'plan'

interface BeamAnchor {
  point: Point2
  elevation: number
  supportKind: SupportKind | null
  supportId: string | null
}

interface BeamSnapResult {
  anchor: BeamAnchor
  marker: { point: Point2; kind: SnapKind } | null
}

interface ResolvedBeamSegment {
  startElevation: number
  endElevation: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function projectPointOntoSegment(
  point: Point2,
  segStart: Point2,
  segEnd: Point2,
): { projection: Point2; distance: number; t: number } {
  const dx = segEnd[0] - segStart[0]
  const dz = segEnd[1] - segStart[1]
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-12) {
    return { projection: segStart, distance: Math.hypot(point[0] - segStart[0], point[1] - segStart[1]), t: 0 }
  }
  const t = clamp(((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dz) / lenSq, 0, 1)
  const projection: Point2 = [segStart[0] + t * dx, segStart[1] + t * dz]
  const distance = Math.hypot(point[0] - projection[0], point[1] - projection[1])
  return { projection, distance, t }
}

function formatSupport(anchor: BeamAnchor): string {
  if (anchor.supportKind === 'column') return 'pillar'
  if (anchor.supportKind === 'wall') return 'wall'
  if (anchor.supportKind === 'beam') return 'beam'
  return 'free'
}

function applyOrthoConstraint(start: Point2, end: Point2): Point2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [end[0], start[1]]
  }
  return [start[0], end[1]]
}

function BeamMesh({
  beam,
  elevationOffset = 0,
  visibility = 'visible',
}: {
  beam: BeamElement
  elevationOffset?: number
  visibility?: 'visible' | 'ghosted' | 'hidden'
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  if (visibility === 'hidden') return null
  const opacity = visibility === 'ghosted' ? 0.28 : 1

  // Kernel coords: [x, y, z] where XY is plan, Z is up
  // Scene coords: [x, z, y] (swap y and z)
  const startScene = useMemo(
    () => new THREE.Vector3(beam.start[0], beam.start[2] + elevationOffset, beam.start[1]),
    [beam.start, elevationOffset],
  )
  const endScene = useMemo(
    () => new THREE.Vector3(beam.end[0], beam.end[2] + elevationOffset, beam.end[1]),
    [beam.end, elevationOffset],
  )

  const midpoint = useMemo(
    () => new THREE.Vector3().addVectors(startScene, endScene).multiplyScalar(0.5),
    [startScene, endScene],
  )

  const length = useMemo(
    () => startScene.distanceTo(endScene),
    [startScene, endScene],
  )

  const quaternion = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(endScene, startScene).normalize()
    const quat = new THREE.Quaternion()
    // Box geometry extends along X by default; rotate X-axis to align with beam direction
    quat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
    return quat
  }, [startScene, endScene])

  if (length < 1e-6) return null

  return (
    <mesh
      ref={meshRef}
      position={midpoint}
      quaternion={quaternion}
    >
      <boxGeometry args={[length, beam.depth, beam.width]} />
      <meshStandardMaterial color="#57534e" transparent={opacity < 0.99} opacity={opacity} depthWrite={opacity >= 0.99} />
    </mesh>
  )
}

export function BeamPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const level = levels.find((l) => l.id === activeLevelId)
    return level?.elevation ?? 0
  }, [levels, activeLevelId])
  const levelDataById = useMemo(
    () => new Map(levels.map((level) => [level.id, { elevation: level.elevation, visibility: level.visibility }])),
    [levels],
  )
  const defaultBeamWidth = useBimStore((s) => s.defaultBeamWidth)
  const defaultBeamDepth = useBimStore((s) => s.defaultBeamDepth)
  const defaultBeamElevation = useBimStore((s) => s.defaultBeamElevation)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)

  const planeRef = useRef<THREE.Mesh>(null)
  const [pendingStart, setPendingStart] = useState<BeamAnchor | null>(null)
  const [previewEnd, setPreviewEnd] = useState<BeamAnchor | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<{ point: Point2; kind: SnapKind } | null>(null)
  const snapPoints = usePlanSnapPoints()

  const beamElements = useMemo(
    () => Array.from(elements.values()).filter(isBeamElement),
    [elements],
  )
  const renderedBeams = useMemo(
    () => beamElements.flatMap((beam) => {
      const levelData = beam.meta.level_id ? levelDataById.get(beam.meta.level_id) : undefined
      const visibility = levelData?.visibility ?? 'visible'
      if (visibility === 'hidden') return []
      return [{
        beam,
        elevationOffset: levelData?.elevation ?? 0,
        visibility,
      }]
    }),
    [beamElements, levelDataById],
  )
  const beamSupportElements = useMemo(
    () => Array.from(elements.values()).filter((el): el is BeamElement => (
      isBeamElement(el) && (!el.meta.level_id || el.meta.level_id === activeLevelId)
    )),
    [activeLevelId, elements],
  )
  const columnElements = useMemo(
    () => Array.from(elements.values()).filter((el): el is ColumnElement => (
      isColumnElement(el) && (!el.meta.level_id || el.meta.level_id === activeLevelId)
    )),
    [activeLevelId, elements],
  )
  const wallElements = useMemo(
    () => Array.from(elements.values()).filter((el): el is WallElement => (
      isWallElement(el) && (!el.meta.level_id || el.meta.level_id === activeLevelId)
    )),
    [activeLevelId, elements],
  )
  const surfaceOffsetByLevel = useMemo(() => {
    const offsets = new Map<string, number>()
    for (const element of elements.values()) {
      if (!isFloorElement(element)) continue
      const levelId = element.meta.level_id
      if (!levelId) continue
      offsets.set(levelId, Math.max(offsets.get(levelId) ?? 0, element.thickness))
    }
    return offsets
  }, [elements])
  const activeLevelSurfaceOffset = surfaceOffsetByLevel.get(activeLevelId) ?? 0
  const activeSurfaceElevation = activeLevelElevation + activeLevelSurfaceOffset

  useEffect(() => {
    if (activeTool !== 'beam') {
      setPendingStart(null)
      setPreviewEnd(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const resolveColumnSnap = useCallback((rawPoint: Point2): BeamAnchor | null => {
    let nearest: { column: ColumnElement; footprintDistance: number; centerDistance: number } | null = null

    for (const column of columnElements) {
      const dx = rawPoint[0] - column.center[0]
      const dz = rawPoint[1] - column.center[1]
      const overX = Math.max(Math.abs(dx) - column.width / 2, 0)
      const overZ = Math.max(Math.abs(dz) - column.depth / 2, 0)
      const distanceToFootprint = Math.hypot(overX, overZ)
      if (distanceToFootprint > COLUMN_SNAP_MARGIN) continue

      const distanceToCenter = Math.hypot(dx, dz)
      if (
        !nearest ||
        distanceToFootprint < nearest.footprintDistance ||
        (distanceToFootprint === nearest.footprintDistance && distanceToCenter < nearest.centerDistance)
      ) {
        nearest = {
          column,
          footprintDistance: distanceToFootprint,
          centerDistance: distanceToCenter,
        }
      }
    }

    if (!nearest) return null

    return {
      point: [nearest.column.center[0], nearest.column.center[1]],
      elevation: activeLevelSurfaceOffset + nearest.column.height + defaultBeamDepth / 2,
      supportKind: 'column',
      supportId: nearest.column.meta.id,
    }
  }, [activeLevelSurfaceOffset, columnElements, defaultBeamDepth])

  const resolveWallSnap = useCallback((rawPoint: Point2): BeamAnchor | null => {
    let nearest: { wall: WallElement; projection: Point2; distance: number } | null = null

    for (const wall of wallElements) {
      const { projection, distance } = projectPointOntoSegment(rawPoint, wall.start, wall.end)
      if (distance > WALL_SNAP_MARGIN) continue
      if (!nearest || distance < nearest.distance) {
        nearest = { wall, projection, distance }
      }
    }

    if (!nearest) return null

    return {
      point: nearest.projection,
      elevation: activeLevelSurfaceOffset + nearest.wall.height + defaultBeamDepth / 2,
      supportKind: 'wall',
      supportId: nearest.wall.meta.id,
    }
  }, [activeLevelSurfaceOffset, defaultBeamDepth, wallElements])

  const resolveBeamSupportSnap = useCallback((rawPoint: Point2): BeamAnchor | null => {
    let nearest: { point: Point2; elevation: number; beamId: string; distance: number } | null = null

    for (const beam of beamSupportElements) {
      const points: Array<{ point: Point2; elevation: number }> = [
        { point: [beam.start[0], beam.start[1]], elevation: beam.start[2] },
        { point: [beam.end[0], beam.end[1]], elevation: beam.end[2] },
      ]
      for (const candidate of points) {
        const distance = Math.hypot(rawPoint[0] - candidate.point[0], rawPoint[1] - candidate.point[1])
        if (distance > BEAM_SUPPORT_MARGIN) continue
        if (!nearest || distance < nearest.distance) {
          nearest = {
            point: candidate.point,
            elevation: candidate.elevation,
            beamId: beam.meta.id,
            distance,
          }
        }
      }
    }

    if (!nearest) return null

    return {
      point: nearest.point,
      elevation: nearest.elevation,
      supportKind: 'beam',
      supportId: nearest.beamId,
    }
  }, [beamSupportElements])

  const resolveSupportSnap = useCallback((rawPoint: Point2): BeamAnchor | null => {
    const column = resolveColumnSnap(rawPoint)
    if (column) return column
    const wall = resolveWallSnap(rawPoint)
    if (wall) return wall
    return resolveBeamSupportSnap(rawPoint)
  }, [resolveBeamSupportSnap, resolveColumnSnap, resolveWallSnap])

  const applySnap = useCallback((rawPoint: Point2): BeamSnapResult => {
    if (snapEnabled) {
      const supportAnchor = resolveSupportSnap(rawPoint)
      if (supportAnchor) {
        const kind: SnapKind = supportAnchor.supportKind ?? 'plan'
        return {
          anchor: supportAnchor,
          marker: { point: supportAnchor.point, kind },
        }
      }
    }

    const { point, snapped } = snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
    return {
      anchor: {
        point,
        elevation: defaultBeamElevation + activeLevelSurfaceOffset,
        supportKind: null,
        supportId: null,
      },
      marker: snapped
        ? {
          point: snapped,
          kind: 'plan',
        }
        : null,
    }
  }, [activeLevelSurfaceOffset, defaultBeamElevation, resolveSupportSnap, snapEnabled, snapPoints])

  const resolveBeamSegment = useCallback((start: BeamAnchor, end: BeamAnchor): ResolvedBeamSegment => {
    if (start.supportId && !end.supportId) {
      return { startElevation: start.elevation, endElevation: start.elevation }
    }
    if (!start.supportId && end.supportId) {
      return { startElevation: end.elevation, endElevation: end.elevation }
    }
    if (!start.supportId && !end.supportId) {
      const elev = defaultBeamElevation + activeLevelSurfaceOffset
      return { startElevation: elev, endElevation: elev }
    }
    return { startElevation: start.elevation, endElevation: end.elevation }
  }, [activeLevelSurfaceOffset, defaultBeamElevation])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'beam') return
    let point: Point2 = [e.point.x, e.point.z]
    if (pendingStart && e.shiftKey) {
      point = applyOrthoConstraint(pendingStart.point, point)
    }
    const snappedResult = applySnap(point)
    const endAnchor = snappedResult.anchor
    point = endAnchor.point
    setCursorPoint(point)
    setSnapMarker(snappedResult.marker)
    const cursorElevation = pendingStart
      ? resolveBeamSegment(pendingStart, endAnchor).endElevation
      : endAnchor.elevation
    setMeasurementCursor([point[0], activeLevelElevation + cursorElevation, point[1]])

    if (pendingStart) {
      const segment = resolveBeamSegment(pendingStart, endAnchor)
      const length = Math.hypot(
        point[0] - pendingStart.point[0],
        point[1] - pendingStart.point[1],
        segment.endElevation - segment.startElevation,
      )
      const supportTag = pendingStart.supportId || endAnchor.supportId
        ? ` • ${formatSupport(pendingStart)} → ${formatSupport(endAnchor)}`
        : ''
      setToolReadout(
        `Beam L:${formatLength(length, lengthUnit)} W:${formatLength(defaultBeamWidth, lengthUnit)} D:${formatLength(defaultBeamDepth, lengthUnit)} Elev:${formatLength(segment.endElevation, lengthUnit)}${supportTag}`,
      )
      setPreviewEnd(endAnchor)
    } else {
      const startHint = endAnchor.supportId
        ? ` - snapped to ${formatSupport(endAnchor)}`
        : ' - snap to support to start'
      setToolReadout(
        `Beam defaults W:${formatLength(defaultBeamWidth, lengthUnit)} D:${formatLength(defaultBeamDepth, lengthUnit)} Elev:${formatLength(defaultBeamElevation, lengthUnit)}${startHint}`,
      )
    }
  }, [
    activeLevelElevation,
    activeTool,
    applySnap,
    defaultBeamWidth,
    defaultBeamDepth,
    defaultBeamElevation,
    lengthUnit,
    pendingStart,
    resolveBeamSegment,
    setMeasurementCursor,
    setToolReadout,
  ])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setPendingStart(null)
    setPreviewEnd(null)
    setCursorPoint(null)
    setSnapMarker(null)
    setToolReadout('Beam placement cancelled')
  }, [setToolReadout])

  const handleClick = (e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'beam') return

    let point: Point2 = [e.point.x, e.point.z]
    if (pendingStart && e.shiftKey) {
      point = applyOrthoConstraint(pendingStart.point, point)
    }
    const snappedResult = applySnap(point)
    const endAnchor = snappedResult.anchor
    point = endAnchor.point
    const [x, z] = point
    setCursorPoint(point)
    setSnapMarker(snappedResult.marker)
    const cursorElevation = pendingStart
      ? resolveBeamSegment(pendingStart, endAnchor).endElevation
      : endAnchor.elevation
    setMeasurementCursor([x, activeLevelElevation + cursorElevation, z])

    if (!pendingStart) {
      if (!endAnchor.supportId) {
        setToolReadout('Beam start must snap to support (pillar, wall, or beam end)')
        return
      }
      setPendingStart(endAnchor)
      setPreviewEnd(endAnchor)
      setToolReadout(
        `Beam start (${formatSupport(endAnchor)}) X:${formatLength(x, lengthUnit)} Z:${formatLength(z, lengthUnit)} Elev:${formatLength(endAnchor.elevation, lengthUnit)}`,
      )
      return
    }

    if (!endAnchor.supportId) {
      setPreviewEnd(endAnchor)
      setToolReadout('Beam end must snap to support (pillar, wall, or beam end)')
      return
    }

    const [sx, sz] = pendingStart.point
    const segment = resolveBeamSegment(pendingStart, endAnchor)
    const beamPlanLength = Math.hypot(x - sx, z - sz)
    if (beamPlanLength < MIN_BEAM_LENGTH) {
      setPreviewEnd(endAnchor)
      return
    }
    const beamLength = Math.hypot(x - sx, z - sz, segment.endElevation - segment.startElevation)

    // Kernel coords: [x, y, z] where XY is plan, Z is up
    // Scene XZ plane maps to kernel XY; scene Y (elevation) maps to kernel Z
    const beamId = `beam-${crypto.randomUUID()}`
    const beamElement: BeamElement = {
      kind: 'beam',
      meta: {
        id: beamId,
        name: `Beam ${beamElements.length + 1}`,
        level_id: activeLevelId,
      },
      start: [sx, sz, segment.startElevation],
      end: [x, z, segment.endElevation],
      width: defaultBeamWidth,
      depth: defaultBeamDepth,
    }

    setPendingStart(null)
    setPreviewEnd(null)
    setSnapMarker(null)
    const supportTag = ` • anchored ${formatSupport(pendingStart)} → ${formatSupport(endAnchor)}`
    setToolReadout(
      `Beam placed L:${formatLength(beamLength, lengthUnit)} W:${formatLength(defaultBeamWidth, lengthUnit)} D:${formatLength(defaultBeamDepth, lengthUnit)}${supportTag}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; beam entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(beamElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create beam entity:', err)
      }
    })()
  }

  const cursorColor = snapMarker
    ? (
      snapMarker.kind === 'column'
        ? '#22c55e'
        : snapMarker.kind === 'wall'
          ? '#f59e0b'
          : snapMarker.kind === 'beam'
            ? '#38bdf8'
            : '#00ff88'
    )
    : '#78716c'

  const startColor = pendingStart
    ? (
      pendingStart.supportKind === 'column'
        ? '#22c55e'
        : pendingStart.supportKind === 'wall'
          ? '#f59e0b'
          : pendingStart.supportKind === 'beam'
            ? '#38bdf8'
            : '#78716c'
    )
    : '#78716c'

  if (activeTool !== 'beam') {
    // Still render placed beams even when not in beam tool
    return (
      <>
        {renderedBeams.map(({ beam, elevationOffset, visibility }) => (
          <BeamMesh key={beam.meta.id} beam={beam} elevationOffset={elevationOffset} visibility={visibility} />
        ))}
      </>
    )
  }

  const previewSegment = pendingStart && previewEnd
    ? resolveBeamSegment(pendingStart, previewEnd)
    : null

  const previewLength = pendingStart && previewEnd && previewSegment
    ? Math.hypot(
      previewEnd.point[0] - pendingStart.point[0],
      previewEnd.point[1] - pendingStart.point[1],
      previewSegment.endElevation - previewSegment.startElevation,
    )
    : null

  return (
    <>
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, activeSurfaceElevation, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], activeSurfaceElevation + 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={cursorColor} />
        </mesh>
      )}

      {pendingStart && previewEnd && (
        <>
          <Line
            points={[
              [pendingStart.point[0], activeSurfaceElevation + 0.05, pendingStart.point[1]],
              [previewEnd.point[0], activeSurfaceElevation + 0.05, previewEnd.point[1]],
            ]}
            color="#78716c"
            lineWidth={2}
            dashed
            dashSize={0.3}
            gapSize={0.15}
          />
          {/* Preview cross-section as a box */}
          {previewLength !== null && previewLength > 0.01 && (() => {
            const sx = pendingStart.point[0]
            const sy = activeLevelElevation + (previewSegment?.startElevation ?? pendingStart.elevation)
            const sz = pendingStart.point[1]
            const ex = previewEnd.point[0]
            const ey = activeLevelElevation + (previewSegment?.endElevation ?? previewEnd.elevation)
            const ez = previewEnd.point[1]
            const mx = (sx + ex) / 2
            const my = (sy + ey) / 2
            const mz = (sz + ez) / 2
            const dir = new THREE.Vector3(ex - sx, ey - sy, ez - sz).normalize()
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
            return (
              <mesh
                position={[mx, my, mz]}
                quaternion={quat}
              >
                <boxGeometry args={[previewLength, defaultBeamDepth, defaultBeamWidth]} />
                <meshStandardMaterial color="#78716c" transparent opacity={0.4} />
              </mesh>
            )
          })()}
          {previewLength !== null && (
            <Html
              position={[
                (pendingStart.point[0] + previewEnd.point[0]) / 2,
                activeLevelElevation + ((previewSegment?.startElevation ?? pendingStart.elevation) + (previewSegment?.endElevation ?? previewEnd.elevation)) / 2 + 0.3,
                (pendingStart.point[1] + previewEnd.point[1]) / 2,
              ]}
              center
            >
              <div className="measurement-badge">{formatLength(previewLength, lengthUnit)}</div>
            </Html>
          )}
        </>
      )}

      {pendingStart && (
        <mesh position={[pendingStart.point[0], activeSurfaceElevation + 0.05, pendingStart.point[1]]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color={startColor} />
        </mesh>
      )}

      {renderedBeams.map(({ beam, elevationOffset, visibility }) => (
        <BeamMesh key={beam.meta.id} beam={beam} elevationOffset={elevationOffset} visibility={visibility} />
      ))}
    </>
  )
}
