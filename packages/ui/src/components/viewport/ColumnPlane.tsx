import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useLevelStore } from '../../stores/level-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import { formatLength } from '../../utils/units'
import type { ColumnElement } from '../../services/kernel-bridge'
import { isColumnElement, isFloorElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { columnFootprint, polygonsOverlapArea, type Point2 as CollisionPoint2 } from '../../utils/plan-collision'

type PlanePointerEvent = ThreeEvent<PointerEvent>

export function ColumnPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const defaultColumnWidth = useBimStore((s) => s.defaultColumnWidth)
  const defaultColumnDepth = useBimStore((s) => s.defaultColumnDepth)
  const defaultColumnHeight = useBimStore((s) => s.defaultColumnHeight)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
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
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [preview, setPreview] = useState<[number, number] | null>(null)
  const [snapMarker, setSnapMarker] = useState<[number, number] | null>(null)
  const snapPoints = usePlanSnapPoints()

  const columns = useMemo(
    () => Array.from(elements.values()).filter(isColumnElement),
    [elements],
  )
  const columnsOnActiveLevel = useMemo(
    () => columns.filter((column) => !column.meta.level_id || column.meta.level_id === activeLevelId),
    [activeLevelId, columns],
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
    if (activeTool !== 'column') {
      setPreview(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: [number, number]) => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'column') return
    const rawPoint: [number, number] = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setPreview(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])
    setToolReadout(
      `Column W:${formatLength(defaultColumnWidth, lengthUnit)} D:${formatLength(defaultColumnDepth, lengthUnit)} H:${formatLength(defaultColumnHeight, lengthUnit)}`,
    )
  }, [activeSurfaceElevation, activeTool, applySnap, defaultColumnWidth, defaultColumnDepth, defaultColumnHeight, lengthUnit, setMeasurementCursor, setToolReadout])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'column') return

    const rawPoint: [number, number] = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    const center: [number, number] = point
    setSnapMarker(snapped)

    const candidate = columnFootprint(center as CollisionPoint2, defaultColumnWidth, defaultColumnDepth)
    const intersectsExistingColumn = columnsOnActiveLevel.some((column) => (
      polygonsOverlapArea(
        candidate,
        columnFootprint(column.center as CollisionPoint2, column.width, column.depth),
      )
    ))
    if (intersectsExistingColumn) {
      setToolReadout('Column blocked: footprint intersects an existing column')
      return
    }

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; column entity was not persisted')
      return
    }

    const columnId = `column-${crypto.randomUUID()}`
    const columnElement: ColumnElement = {
      kind: 'column',
      meta: {
        id: columnId,
        name: `Column ${columns.length + 1}`,
        level_id: activeLevelId,
      },
      center,
      width: defaultColumnWidth,
      depth: defaultColumnDepth,
      height: defaultColumnHeight,
    }

    setToolReadout(
      `Column placed W:${formatLength(defaultColumnWidth, lengthUnit)} D:${formatLength(defaultColumnDepth, lengthUnit)} H:${formatLength(defaultColumnHeight, lengthUnit)}`,
    )

    void (async () => {
      try {
        await kernel.createElement(columnElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create column entity:', err)
      }
    })()
  }, [
    activeTool,
    activeLevelId,
    applySnap,
    columns.length,
    columnsOnActiveLevel,
    defaultColumnWidth,
    defaultColumnDepth,
    defaultColumnHeight,
    kernel,
    lengthUnit,
    ready,
    setToolReadout,
  ])

  const handlePointerLeave = useCallback(() => {
    setPreview(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setToolReadout])

  return (
    <>
      {activeTool === 'column' && (
        <mesh
          ref={planeRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, activeSurfaceElevation, 0]}
          onClick={handleClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {preview && activeTool === 'column' && (
        <>
          <mesh position={[preview[0], activeSurfaceElevation + defaultColumnHeight / 2, preview[1]]}>
            <boxGeometry args={[defaultColumnWidth, defaultColumnHeight, defaultColumnDepth]} />
            <meshStandardMaterial color="#9ca3af" opacity={0.45} transparent />
          </mesh>
          <mesh position={[preview[0], activeSurfaceElevation + 0.05, preview[1]]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color={snapMarker ? '#00ff88' : '#9ca3af'} />
          </mesh>
          <Html position={[preview[0], activeSurfaceElevation + defaultColumnHeight + 0.2, preview[1]]} center>
            <div className="measurement-badge">
              {formatLength(defaultColumnWidth, lengthUnit)} x {formatLength(defaultColumnDepth, lengthUnit)} x {formatLength(defaultColumnHeight, lengthUnit)}
            </div>
          </Html>
        </>
      )}

      {columns.map((col) => {
        const levelData = col.meta.level_id ? levelDataById.get(col.meta.level_id) : undefined
        const slabOffset = col.meta.level_id ? (surfaceOffsetByLevel.get(col.meta.level_id) ?? 0) : 0
        const elevation = (levelData?.elevation ?? 0) + slabOffset
        const visibility = levelData?.visibility ?? 'visible'
        if (visibility === 'hidden') return null
        const opacity = visibility === 'ghosted' ? 0.28 : 1
        return (
          <mesh
            key={col.meta.id}
            position={[col.center[0], elevation + col.height / 2, col.center[1]]}
          >
            <boxGeometry args={[col.width, col.height, col.depth]} />
            <meshStandardMaterial color="#6b7280" transparent={opacity < 0.99} opacity={opacity} depthWrite={opacity >= 0.99} />
          </mesh>
        )
      })}
    </>
  )
}
