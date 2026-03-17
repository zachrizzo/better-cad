import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useBimStore } from '../stores/bim-store'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { formatLength, type LengthUnit } from '../utils/units'
import type { DoorElement, WallElement } from '../services/kernel-bridge'
import { isDoorElement, isFloorElement, isWallElement, useEntityStore } from '../stores/entity-store'
import { useKernel } from './useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { useLevelStore } from '../stores/level-store'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

// ─── Constants ──────────────────────────────────────────────────────────────
const DOOR_ATTACH_DISTANCE = 0.8
const DOOR_END_CLEARANCE = 0.05

// ─── Types ──────────────────────────────────────────────────────────────────
type Point2 = [number, number]
export type Swing = 'left' | 'right'

export interface DoorCandidate {
  wallId: string
  positionAlongWall: number
  center: Point2
  direction: Point2
  width: number
  height: number
  sillHeight: number
  swing: Swing
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizeSwing(swing?: string): Swing {
  return swing === 'left' ? 'left' : 'right'
}

export function getSwingVectors(width: number, swing: Swing) {
  const half = width / 2
  if (swing === 'left') {
    return {
      hingeX: -half,
      closedDir: [1, 0] as Point2,
      openDir: [0, 1] as Point2,
    }
  }
  return {
    hingeX: half,
    closedDir: [-1, 0] as Point2,
    openDir: [0, -1] as Point2,
  }
}

export function getDoorArcPoints(width: number, swing: Swing, y: number): [number, number, number][] {
  const vectors = getSwingVectors(width, swing)
  const points: [number, number, number][] = []
  const segments = 14
  for (let i = 0; i <= segments; i += 1) {
    const theta = (Math.PI / 2) * (i / segments)
    const localX = vectors.hingeX + width * (vectors.closedDir[0] * Math.cos(theta) + vectors.openDir[0] * Math.sin(theta))
    const localZ = width * (vectors.closedDir[1] * Math.cos(theta) + vectors.openDir[1] * Math.sin(theta))
    points.push([localX, y, localZ])
  }
  return points
}

function getDoorCandidate(
  point: Point2,
  walls: WallElement[],
  defaults: { width: number; height: number; sillHeight: number; swing: Swing },
): DoorCandidate | null {
  let nearest: DoorCandidate | null = null
  let nearestDistance = Infinity

  for (const wall of walls) {
    const [sx, sz] = wall.start
    const [ex, ez] = wall.end
    const dx = ex - sx
    const dz = ez - sz
    const length = Math.hypot(dx, dz)
    if (length < 1e-8) continue

    const dir: Point2 = [dx / length, dz / length]
    const tRaw = ((point[0] - sx) * dx + (point[1] - sz) * dz) / (length * length)
    const tOnSegment = clamp(tRaw, 0, 1)
    const projection: Point2 = [sx + tOnSegment * dx, sz + tOnSegment * dz]
    const distance = Math.hypot(point[0] - projection[0], point[1] - projection[1])

    if (distance > DOOR_ATTACH_DISTANCE || distance >= nearestDistance) continue

    const minT = (defaults.width / 2 + DOOR_END_CLEARANCE) / length
    if (minT >= 0.5) continue
    const tDoor = clamp(tRaw, minT, 1 - minT)
    const center: Point2 = [sx + tDoor * dx, sz + tDoor * dz]

    nearest = {
      wallId: wall.meta.id,
      positionAlongWall: tDoor,
      center,
      direction: dir,
      width: defaults.width,
      height: defaults.height,
      sillHeight: defaults.sillHeight,
      swing: defaults.swing,
    }
    nearestDistance = distance
  }

  return nearest
}

// ─── Hook return type ───────────────────────────────────────────────────────

export interface DoorDrawingState {
  isActive: boolean
  candidate: DoorCandidate | null
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  /** All door elements (for rendering placed doors) */
  doors: DoorElement[]
  /** All wall elements (for host-wall lookups) */
  wallElements: WallElement[]
  /** Level-based data for rendering placed doors */
  levelDataById: Map<string, { elevation: number; visibility: string }>
  /** Surface-offset map for per-level slab thickness */
  surfaceOffsetByLevel: Map<string, number>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Shared hook for door placement in both 2D and 3D viewports.
 * Contains ALL door logic — wall detection, position along wall, width preview.
 */
export function useDoorDrawing(mode: ViewportMode): DoorDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultDoorWidth = useBimStore((s) => s.defaultDoorWidth)
  const defaultDoorHeight = useBimStore((s) => s.defaultDoorHeight)
  const defaultDoorSill = useBimStore((s) => s.defaultDoorSill)
  const defaultDoorSwing = useBimStore((s) => s.defaultDoorSwing)
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
  const levelDataById = useMemo(
    () => new Map(levels.map((level) => [level.id, { elevation: level.elevation, visibility: level.visibility }])),
    [levels],
  )
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [candidate, setCandidate] = useState<DoorCandidate | null>(null)

  const wallElements = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )
  const walls = useMemo(
    () => wallElements.filter((wall) => !wall.meta.level_id || wall.meta.level_id === activeLevelId),
    [activeLevelId, wallElements],
  )

  const doors = useMemo(
    () => Array.from(elements.values()).filter(isDoorElement),
    [elements],
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
    if (activeTool !== 'door') {
      setCandidate(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const updateCandidate = useCallback((point: Point2) => {
    setCandidate(getDoorCandidate(point, walls, {
      width: defaultDoorWidth,
      height: defaultDoorHeight,
      sillHeight: defaultDoorSill,
      swing: defaultDoorSwing,
    }))
  }, [defaultDoorHeight, defaultDoorSill, defaultDoorSwing, defaultDoorWidth, walls])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'door') return
    const point = extractPlanPoint(e, mode)
    updateCandidate(point)
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])
    const nextCandidate = getDoorCandidate(point, walls, {
      width: defaultDoorWidth,
      height: defaultDoorHeight,
      sillHeight: defaultDoorSill,
      swing: defaultDoorSwing,
    })
    if (nextCandidate) {
      setToolReadout(
        `Door W:${formatLength(nextCandidate.width, lengthUnit)} H:${formatLength(nextCandidate.height, lengthUnit)} \u2022 swing:${nextCandidate.swing} \u2022 ${nextCandidate.wallId}`,
      )
    } else {
      setToolReadout('Door: hover closer to a wall to snap')
    }
  }, [
    activeSurfaceElevation,
    activeTool,
    defaultDoorHeight,
    defaultDoorSill,
    defaultDoorSwing,
    defaultDoorWidth,
    lengthUnit,
    mode,
    setMeasurementCursor,
    setToolReadout,
    updateCandidate,
    walls,
  ])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'door') return

    const clickPoint = extractPlanPoint(e, mode)
    const doorCandidate = getDoorCandidate(clickPoint, walls, {
      width: defaultDoorWidth,
      height: defaultDoorHeight,
      sillHeight: defaultDoorSill,
      swing: defaultDoorSwing,
    })

    if (!doorCandidate) {
      console.log('[BetterCAD] Door placement: hover closer to a wall')
      return
    }

    setCandidate(doorCandidate)
    setToolReadout(
      `Door placed W:${formatLength(doorCandidate.width, lengthUnit)} H:${formatLength(doorCandidate.height, lengthUnit)} swing:${doorCandidate.swing} on ${doorCandidate.wallId}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; door entity was not persisted')
      return
    }

    const doorId = `door-${crypto.randomUUID()}`
    const doorElement: DoorElement = {
      kind: 'door',
      meta: {
        id: doorId,
        name: `Door ${doors.length + 1}`,
        host_id: doorCandidate.wallId,
        level_id: activeLevelId,
      },
      wall_id: doorCandidate.wallId,
      position_along_wall: doorCandidate.positionAlongWall,
      width: doorCandidate.width,
      height: doorCandidate.height,
      sill_height: doorCandidate.sillHeight,
      swing: doorCandidate.swing,
    }

    void (async () => {
      try {
        await kernel.createElement(doorElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create door entity:', err)
      }
    })()
  }, [
    activeLevelId,
    activeTool,
    defaultDoorHeight,
    defaultDoorSill,
    defaultDoorSwing,
    defaultDoorWidth,
    doors.length,
    kernel,
    lengthUnit,
    mode,
    ready,
    setToolReadout,
    walls,
  ])

  const handlePointerLeave = useCallback(() => {
    setCandidate(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setToolReadout])

  return {
    isActive: activeTool === 'door',
    candidate,
    elevation: activeSurfaceElevation,
    lengthUnit,
    planeRef,
    doors,
    wallElements,
    levelDataById,
    surfaceOffsetByLevel,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  }
}
