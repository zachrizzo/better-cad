import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../stores/ui-store'
import { useBimStore } from '../stores/bim-store'
import { useMeasurementStore } from '../stores/measurement-store'
import { useSettingsStore } from '../stores/settings-store'
import { useLevelStore } from '../stores/level-store'
import { formatLength, type LengthUnit } from '../utils/units'
import type { WindowElement, WallElement } from '../services/kernel-bridge'
import { isFloorElement, isWindowElement, isWallElement, useEntityStore } from '../stores/entity-store'
import { useKernel } from './useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { extractPlanPoint, type ViewportMode } from '../utils/viewport-helpers'

// ─── Constants ──────────────────────────────────────────────────────────────
const WINDOW_ATTACH_DISTANCE = 0.8
const WINDOW_END_CLEARANCE = 0.05

// ─── Types ──────────────────────────────────────────────────────────────────
type Point2 = [number, number]

export interface WindowCandidate {
  wallId: string
  positionAlongWall: number
  center: Point2
  direction: Point2
  width: number
  height: number
  sillHeight: number
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getWindowCandidate(
  point: Point2,
  walls: WallElement[],
  defaults: { width: number; height: number; sillHeight: number },
): WindowCandidate | null {
  let nearest: WindowCandidate | null = null
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

    if (distance > WINDOW_ATTACH_DISTANCE || distance >= nearestDistance) continue

    const minT = (defaults.width / 2 + WINDOW_END_CLEARANCE) / length
    if (minT >= 0.5) continue
    const tWindow = clamp(tRaw, minT, 1 - minT)
    const center: Point2 = [sx + tWindow * dx, sz + tWindow * dz]

    nearest = {
      wallId: wall.meta.id,
      positionAlongWall: tWindow,
      center,
      direction: dir,
      width: defaults.width,
      height: defaults.height,
      sillHeight: defaults.sillHeight,
    }
    nearestDistance = distance
  }

  return nearest
}

// ─── Hook return type ───────────────────────────────────────────────────────

export interface WindowDrawingState {
  isActive: boolean
  candidate: WindowCandidate | null
  elevation: number
  lengthUnit: LengthUnit
  planeRef: React.RefObject<THREE.Mesh | null>
  /** All window elements (for rendering placed windows) */
  windows: WindowElement[]
  /** All wall elements (for host-wall lookups) */
  wallElements: WallElement[]
  /** Level-based data for rendering placed windows */
  levelDataById: Map<string, { elevation: number; visibility: string }>
  /** Surface-offset map for per-level slab thickness */
  surfaceOffsetByLevel: Map<string, number>
  handlePointerMove: (e: ThreeEvent<PointerEvent>) => void
  handleClick: (e: ThreeEvent<PointerEvent>) => void
  handlePointerLeave: () => void
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Shared hook for window placement in both 2D and 3D viewports.
 * Contains ALL window logic — wall detection, position along wall, preview.
 */
export function useWindowDrawing(mode: ViewportMode): WindowDrawingState {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultWindowWidth = useBimStore((s) => s.defaultWindowWidth)
  const defaultWindowHeight = useBimStore((s) => s.defaultWindowHeight)
  const defaultWindowSill = useBimStore((s) => s.defaultWindowSill)
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
  const [candidate, setCandidate] = useState<WindowCandidate | null>(null)

  const wallElements = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )
  const walls = useMemo(
    () => wallElements.filter((wall) => !wall.meta.level_id || wall.meta.level_id === activeLevelId),
    [activeLevelId, wallElements],
  )

  const windows = useMemo(
    () => Array.from(elements.values()).filter(isWindowElement),
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
    if (activeTool !== 'window') {
      setCandidate(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const updateCandidate = useCallback((point: Point2) => {
    setCandidate(getWindowCandidate(point, walls, {
      width: defaultWindowWidth,
      height: defaultWindowHeight,
      sillHeight: defaultWindowSill,
    }))
  }, [defaultWindowHeight, defaultWindowSill, defaultWindowWidth, walls])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'window') return
    const point = extractPlanPoint(e, mode)
    updateCandidate(point)
    setMeasurementCursor([point[0], activeSurfaceElevation, point[1]])
    const nextCandidate = getWindowCandidate(point, walls, {
      width: defaultWindowWidth,
      height: defaultWindowHeight,
      sillHeight: defaultWindowSill,
    })
    if (nextCandidate) {
      setToolReadout(
        `Window W:${formatLength(nextCandidate.width, lengthUnit)} H:${formatLength(nextCandidate.height, lengthUnit)} Sill:${formatLength(nextCandidate.sillHeight, lengthUnit)} \u2022 ${nextCandidate.wallId}`,
      )
    } else {
      setToolReadout('Window: hover closer to a wall to snap')
    }
  }, [
    activeSurfaceElevation,
    activeTool,
    defaultWindowHeight,
    defaultWindowSill,
    defaultWindowWidth,
    lengthUnit,
    mode,
    setMeasurementCursor,
    setToolReadout,
    updateCandidate,
    walls,
  ])

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'window') return

    const clickPoint = extractPlanPoint(e, mode)
    const windowCandidate = getWindowCandidate(clickPoint, walls, {
      width: defaultWindowWidth,
      height: defaultWindowHeight,
      sillHeight: defaultWindowSill,
    })

    if (!windowCandidate) {
      console.log('[BetterCAD] Window placement: hover closer to a wall')
      return
    }

    setCandidate(windowCandidate)
    setToolReadout(
      `Window placed W:${formatLength(windowCandidate.width, lengthUnit)} H:${formatLength(windowCandidate.height, lengthUnit)} Sill:${formatLength(windowCandidate.sillHeight, lengthUnit)} on ${windowCandidate.wallId}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; window entity was not persisted')
      return
    }

    const windowId = `window-${crypto.randomUUID()}`
    const windowElement: WindowElement = {
      kind: 'window',
      meta: {
        id: windowId,
        name: `Window ${windows.length + 1}`,
        host_id: windowCandidate.wallId,
        level_id: activeLevelId,
      },
      wall_id: windowCandidate.wallId,
      position_along_wall: windowCandidate.positionAlongWall,
      width: windowCandidate.width,
      height: windowCandidate.height,
      sill_height: windowCandidate.sillHeight,
    }

    void (async () => {
      try {
        await kernel.createElement(windowElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create window entity:', err)
      }
    })()
  }, [
    activeLevelId,
    activeTool,
    defaultWindowHeight,
    defaultWindowSill,
    defaultWindowWidth,
    windows.length,
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
    isActive: activeTool === 'window',
    candidate,
    elevation: activeSurfaceElevation,
    lengthUnit,
    planeRef,
    windows,
    wallElements,
    levelDataById,
    surfaceOffsetByLevel,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  }
}
