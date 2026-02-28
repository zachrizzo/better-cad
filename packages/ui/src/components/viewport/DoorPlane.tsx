import { useRef, useState, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import type { WallData } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'

const DOOR_ATTACH_DISTANCE = 0.8
const DOOR_END_CLEARANCE = 0.05

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>

interface DoorCandidate {
  wallId: string
  positionAlongWall: number
  center: Point2
  direction: Point2
  width: number
  height: number
  sillHeight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getDoorCandidate(
  point: Point2,
  walls: Map<string, WallData>,
  defaults: { width: number; height: number; sillHeight: number },
): DoorCandidate | null {
  let nearest: DoorCandidate | null = null
  let nearestDistance = Infinity

  walls.forEach((wall, wallId) => {
    const [sx, sz] = wall.start
    const [ex, ez] = wall.end
    const dx = ex - sx
    const dz = ez - sz
    const length = Math.hypot(dx, dz)
    if (length < 1e-8) return

    const dir: Point2 = [dx / length, dz / length]
    const tRaw = ((point[0] - sx) * dx + (point[1] - sz) * dz) / (length * length)
    const tOnSegment = clamp(tRaw, 0, 1)
    const projection: Point2 = [sx + tOnSegment * dx, sz + tOnSegment * dz]
    const distance = Math.hypot(point[0] - projection[0], point[1] - projection[1])

    if (distance > DOOR_ATTACH_DISTANCE || distance >= nearestDistance) return

    const minT = (defaults.width / 2 + DOOR_END_CLEARANCE) / length
    if (minT >= 0.5) return
    const tDoor = clamp(tRaw, minT, 1 - minT)
    const center: Point2 = [sx + tDoor * dx, sz + tDoor * dz]

    nearest = {
      wallId,
      positionAlongWall: tDoor,
      center,
      direction: dir,
      width: defaults.width,
      height: defaults.height,
      sillHeight: defaults.sillHeight,
    }
    nearestDistance = distance
  })

  return nearest
}

export function DoorPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const walls = useBimStore((s) => s.walls)
  const doors = useBimStore((s) => s.doors)
  const addDoor = useBimStore((s) => s.addDoor)
  const defaultDoorWidth = useBimStore((s) => s.defaultDoorWidth)
  const defaultDoorHeight = useBimStore((s) => s.defaultDoorHeight)
  const defaultDoorSill = useBimStore((s) => s.defaultDoorSill)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const planeRef = useRef<THREE.Mesh>(null)
  const [candidate, setCandidate] = useState<DoorCandidate | null>(null)

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
    }))
  }, [defaultDoorHeight, defaultDoorSill, defaultDoorWidth, walls])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'door') return
    const point: Point2 = [e.point.x, e.point.z]
    updateCandidate(point)
    setMeasurementCursor([point[0], 0, point[1]])
    const nextCandidate = getDoorCandidate(point, walls, {
      width: defaultDoorWidth,
      height: defaultDoorHeight,
      sillHeight: defaultDoorSill,
    })
    if (nextCandidate) {
      setToolReadout(
        `Door W:${formatLength(nextCandidate.width, lengthUnit)} H:${formatLength(nextCandidate.height, lengthUnit)} • ${nextCandidate.wallId}`,
      )
    } else {
      setToolReadout('Door: hover closer to a wall to snap')
    }
  }, [
    activeTool,
    defaultDoorHeight,
    defaultDoorSill,
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
    })
    if (!doorCandidate) {
      console.log('[BetterCAD] Door placement: hover closer to a wall')
      return
    }

    const doorId = `door-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(16)}`
    addDoor({
      id: doorId,
      ...doorCandidate,
    })
    setCandidate(doorCandidate)
    setToolReadout(
      `Door placed W:${formatLength(doorCandidate.width, lengthUnit)} H:${formatLength(doorCandidate.height, lengthUnit)} on ${doorCandidate.wallId}`,
    )
    console.log(
      `[BetterCAD] Door placed on ${doorCandidate.wallId} at t=${doorCandidate.positionAlongWall.toFixed(3)} (opening cut pending kernel support)`,
    )
  }, [
    activeTool,
    addDoor,
    defaultDoorHeight,
    defaultDoorSill,
    defaultDoorWidth,
    lengthUnit,
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
          position={[0, 0, 0]}
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
            position={[candidate.center[0], 0, candidate.center[1]]}
            rotation={[0, Math.atan2(candidate.direction[1], candidate.direction[0]), 0]}
          >
            <mesh position={[0, candidate.sillHeight + candidate.height / 2, 0]}>
              <boxGeometry args={[candidate.width, candidate.height, 0.08]} />
              <meshStandardMaterial color="#14b8a6" opacity={0.45} transparent />
            </mesh>
          </group>
          <Line
            points={[
              [
                candidate.center[0] - candidate.direction[0] * (candidate.width / 2),
                0.08,
                candidate.center[1] - candidate.direction[1] * (candidate.width / 2),
              ],
              [
                candidate.center[0] + candidate.direction[0] * (candidate.width / 2),
                0.08,
                candidate.center[1] + candidate.direction[1] * (candidate.width / 2),
              ],
            ]}
            color="#2dd4bf"
            lineWidth={3}
          />
          <Html position={[candidate.center[0], 0.35, candidate.center[1]]} center>
            <div className="measurement-badge">
              {formatLength(candidate.width, lengthUnit)}
            </div>
          </Html>
        </>
      )}

      {Array.from(doors.values()).map((door) => {
        const hostWall = walls.get(door.wallId)
        const thickness = hostWall ? Math.max(0.05, hostWall.thickness * 0.6) : 0.08
        return (
          <group
            key={door.id}
            position={[door.center[0], 0, door.center[1]]}
            rotation={[0, Math.atan2(door.direction[1], door.direction[0]), 0]}
          >
            <mesh position={[0, door.sillHeight + door.height / 2, 0]}>
              <boxGeometry args={[door.width, door.height, thickness]} />
              <meshStandardMaterial color="#8B4513" opacity={0.65} transparent />
            </mesh>
            <Line
              points={[
                [-door.width / 2, 0.04, 0],
                [door.width / 2, 0.04, 0],
              ]}
              color="#ffaa00"
              lineWidth={2}
            />
          </group>
        )
      })}
    </>
  )
}
