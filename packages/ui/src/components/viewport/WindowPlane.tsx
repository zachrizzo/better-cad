import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { WindowElement, WallElement } from '../../services/kernel-bridge'
import { isWindowElement, isWallElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

const WINDOW_ATTACH_DISTANCE = 0.8
const WINDOW_END_CLEARANCE = 0.05

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>

interface WindowCandidate {
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

export function WindowPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultWindowWidth = useBimStore((s) => s.defaultWindowWidth)
  const defaultWindowHeight = useBimStore((s) => s.defaultWindowHeight)
  const defaultWindowSill = useBimStore((s) => s.defaultWindowSill)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [candidate, setCandidate] = useState<WindowCandidate | null>(null)

  const walls = useMemo(
    () => Array.from(elements.values()).filter(isWallElement),
    [elements],
  )

  const windows = useMemo(
    () => Array.from(elements.values()).filter(isWindowElement),
    [elements],
  )

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

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'window') return
    const point: Point2 = [e.point.x, e.point.z]
    updateCandidate(point)
    setMeasurementCursor([point[0], 0, point[1]])
    const nextCandidate = getWindowCandidate(point, walls, {
      width: defaultWindowWidth,
      height: defaultWindowHeight,
      sillHeight: defaultWindowSill,
    })
    if (nextCandidate) {
      setToolReadout(
        `Window W:${formatLength(nextCandidate.width, lengthUnit)} H:${formatLength(nextCandidate.height, lengthUnit)} Sill:${formatLength(nextCandidate.sillHeight, lengthUnit)} • ${nextCandidate.wallId}`,
      )
    } else {
      setToolReadout('Window: hover closer to a wall to snap')
    }
  }, [
    activeTool,
    defaultWindowHeight,
    defaultWindowSill,
    defaultWindowWidth,
    lengthUnit,
    setMeasurementCursor,
    setToolReadout,
    updateCandidate,
    walls,
  ])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'window') return

    const clickPoint: Point2 = [e.point.x, e.point.z]
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
    activeTool,
    defaultWindowHeight,
    defaultWindowSill,
    defaultWindowWidth,
    windows.length,
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
      {activeTool === 'window' && (
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

      {candidate && activeTool === 'window' && (
        <>
          <group
            position={[candidate.center[0], 0, candidate.center[1]]}
            rotation={[0, Math.atan2(candidate.direction[1], candidate.direction[0]), 0]}
          >
            <mesh position={[0, candidate.sillHeight + candidate.height / 2, 0]}>
              <boxGeometry args={[candidate.width, candidate.height, 0.06]} />
              <meshStandardMaterial color="#3b82f6" opacity={0.45} transparent />
            </mesh>
            <Line
              points={[
                [-candidate.width / 2, candidate.sillHeight + candidate.height / 2, 0],
                [candidate.width / 2, candidate.sillHeight + candidate.height / 2, 0],
              ]}
              color="#60a5fa"
              lineWidth={2.5}
            />
            <Line
              points={[
                [-candidate.width / 2, candidate.sillHeight, 0],
                [candidate.width / 2, candidate.sillHeight, 0],
              ]}
              color="#60a5fa"
              lineWidth={2.5}
            />
          </group>
          <Html position={[candidate.center[0], candidate.sillHeight + candidate.height + 0.2, candidate.center[1]]} center>
            <div className="measurement-badge">
              {formatLength(candidate.width, lengthUnit)} x {formatLength(candidate.height, lengthUnit)} @ {formatLength(candidate.sillHeight, lengthUnit)}
            </div>
          </Html>
        </>
      )}

      {windows.map((win) => {
        const hostWall = walls.find((wall) => wall.meta.id === win.wall_id)
        const thickness = hostWall ? Math.max(0.04, hostWall.thickness * 0.5) : 0.06

        const [sx, sz] = hostWall ? hostWall.start : [0, 0]
        const [ex, ez] = hostWall ? hostWall.end : [1, 0]
        const dx = ex - sx
        const dz = ez - sz
        const len = Math.max(1e-8, Math.hypot(dx, dz))
        const dir: Point2 = [dx / len, dz / len]
        const center: Point2 = [sx + dir[0] * len * win.position_along_wall, sz + dir[1] * len * win.position_along_wall]

        return (
          <group
            key={win.meta.id}
            position={[center[0], 0, center[1]]}
            rotation={[0, Math.atan2(dir[1], dir[0]), 0]}
          >
            <mesh position={[0, win.sill_height + win.height / 2, 0]}>
              <boxGeometry args={[win.width, win.height, thickness]} />
              <meshStandardMaterial color="#93c5fd" opacity={0.5} transparent />
            </mesh>
            <Line
              points={[
                [-win.width / 2, win.sill_height + win.height / 2, 0],
                [win.width / 2, win.sill_height + win.height / 2, 0],
              ]}
              color="#60a5fa"
              lineWidth={2}
            />
            <Line
              points={[
                [-win.width / 2, win.sill_height, 0],
                [win.width / 2, win.sill_height, 0],
              ]}
              color="#60a5fa"
              lineWidth={2}
            />
          </group>
        )
      })}
    </>
  )
}
