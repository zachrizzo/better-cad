import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { DoorElement, WallElement } from '../../services/kernel-bridge'
import { isDoorElement, isWallElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'

const DOOR_ATTACH_DISTANCE = 0.8
const DOOR_END_CLEARANCE = 0.05

type Point2 = [number, number]
type Swing = 'left' | 'right'
type PlanePointerEvent = ThreeEvent<PointerEvent>

interface DoorCandidate {
  wallId: string
  positionAlongWall: number
  center: Point2
  direction: Point2
  width: number
  height: number
  sillHeight: number
  swing: Swing
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeSwing(swing?: string): Swing {
  return swing === 'left' ? 'left' : 'right'
}

function getSwingVectors(width: number, swing: Swing) {
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

function getDoorArcPoints(width: number, swing: Swing, y: number): [number, number, number][] {
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

export function DoorPlane() {
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
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [candidate, setCandidate] = useState<DoorCandidate | null>(null)

  const walls = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )

  const doors = useMemo(
    () => Array.from(elements.values()).filter(isDoorElement),
    [elements],
  )

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

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'door') return
    const point: Point2 = [e.point.x, e.point.z]
    updateCandidate(point)
    setMeasurementCursor([point[0], 0, point[1]])
    const nextCandidate = getDoorCandidate(point, walls, {
      width: defaultDoorWidth,
      height: defaultDoorHeight,
      sillHeight: defaultDoorSill,
      swing: defaultDoorSwing,
    })
    if (nextCandidate) {
      setToolReadout(
        `Door W:${formatLength(nextCandidate.width, lengthUnit)} H:${formatLength(nextCandidate.height, lengthUnit)} • swing:${nextCandidate.swing} • ${nextCandidate.wallId}`,
      )
    } else {
      setToolReadout('Door: hover closer to a wall to snap')
    }
  }, [
    activeTool,
    defaultDoorHeight,
    defaultDoorSill,
    defaultDoorSwing,
    defaultDoorWidth,
    lengthUnit,
    setMeasurementCursor,
    setToolReadout,
    updateCandidate,
    walls,
  ])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'door') return

    const clickPoint: Point2 = [e.point.x, e.point.z]
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
    activeTool,
    defaultDoorHeight,
    defaultDoorSill,
    defaultDoorSwing,
    defaultDoorWidth,
    doors.length,
    kernel,
    lengthUnit,
    ready,
    setToolReadout,
    walls,
  ])

  const handlePointerLeave = useCallback(() => {
    setCandidate(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setToolReadout])

  return (
    <>
      {activeTool === 'door' && (
        <mesh
          ref={planeRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, activeLevelElevation, 0]}
          onClick={handleClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {candidate && activeTool === 'door' && (
        <>
          <group
            position={[candidate.center[0], activeLevelElevation, candidate.center[1]]}
            rotation={[0, Math.atan2(candidate.direction[1], candidate.direction[0]), 0]}
          >
            <mesh position={[0, candidate.sillHeight + candidate.height / 2, 0]}>
              <boxGeometry args={[candidate.width, candidate.height, 0.08]} />
              <meshStandardMaterial color="#14b8a6" opacity={0.45} transparent />
            </mesh>
            {(() => {
              const vectors = getSwingVectors(candidate.width, candidate.swing)
              return (
                <>
                  <Line
                    points={[
                      [-candidate.width / 2, 0.06, 0],
                      [candidate.width / 2, 0.06, 0],
                    ]}
                    color="#2dd4bf"
                    lineWidth={2.5}
                  />
                  <Line
                    points={[
                      [vectors.hingeX, 0.05, 0],
                      [vectors.hingeX + candidate.width * vectors.openDir[0], 0.05, candidate.width * vectors.openDir[1]],
                    ]}
                    color="#5eead4"
                    lineWidth={2}
                  />
                  <Line
                    points={getDoorArcPoints(candidate.width, candidate.swing, 0.055)}
                    color="#2dd4bf"
                    lineWidth={1.5}
                    dashed
                    dashSize={0.09}
                    gapSize={0.06}
                  />
                </>
              )
            })()}
          </group>
          <Html position={[candidate.center[0], activeLevelElevation + 0.35, candidate.center[1]]} center>
            <div className="measurement-badge">
              {formatLength(candidate.width, lengthUnit)} • {candidate.swing}
            </div>
          </Html>
        </>
      )}

      {doors.map((door) => {
        const hostWall = walls.find((wall) => wall.meta.id === door.wall_id)
        const thickness = hostWall ? Math.max(0.05, hostWall.thickness * 0.6) : 0.08
        const swing = normalizeSwing(door.swing)

        // Level-based visibility and elevation
        const doorLevelId = door.meta.level_id
        const levelState = useLevelStore.getState()
        const doorLevel = doorLevelId ? levelState.levels.find((l) => l.id === doorLevelId) : undefined
        const doorElevation = doorLevel?.elevation ?? 0
        const doorVisibility = doorLevel?.visibility ?? 'visible'
        if (doorVisibility === 'hidden') return null
        const doorOpacity = doorVisibility === 'ghosted' ? 0.25 : 0.65

        const [sx, sz] = hostWall ? hostWall.start : [0, 0]
        const [ex, ez] = hostWall ? hostWall.end : [1, 0]
        const dx = ex - sx
        const dz = ez - sz
        const len = Math.max(1e-8, Math.hypot(dx, dz))
        const dir: Point2 = [dx / len, dz / len]
        const center: Point2 = [sx + dir[0] * len * door.position_along_wall, sz + dir[1] * len * door.position_along_wall]
        const vectors = getSwingVectors(door.width, swing)

        return (
          <group
            key={door.meta.id}
            position={[center[0], doorElevation, center[1]]}
            rotation={[0, Math.atan2(dir[1], dir[0]), 0]}
          >
            <mesh position={[0, door.sill_height + door.height / 2, 0]}>
              <boxGeometry args={[door.width, door.height, thickness]} />
              <meshStandardMaterial color="#8B4513" opacity={doorOpacity} transparent depthWrite={doorVisibility !== 'ghosted'} />
            </mesh>
            <Line
              points={[
                [-door.width / 2, 0.04, 0],
                [door.width / 2, 0.04, 0],
              ]}
              color="#ffaa00"
              lineWidth={2}
            />
            <Line
              points={[
                [vectors.hingeX, 0.04, 0],
                [vectors.hingeX + door.width * vectors.openDir[0], 0.04, door.width * vectors.openDir[1]],
              ]}
              color="#ffd166"
              lineWidth={1.5}
            />
            <Line
              points={getDoorArcPoints(door.width, swing, 0.042)}
              color="#ffaa00"
              lineWidth={1}
              dashed
              dashSize={0.08}
              gapSize={0.05}
            />
          </group>
        )
      })}
    </>
  )
}
