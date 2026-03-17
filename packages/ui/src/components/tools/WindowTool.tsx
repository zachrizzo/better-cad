import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useWindowDrawing } from '../../hooks/useWindowDrawing'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface WindowToolProps {
  mode: ViewportMode
}

type Point2 = [number, number]

/**
 * Unified window placement tool.
 * Works in both 2D and 3D — all logic lives in useWindowDrawing.
 */
export function WindowTool({ mode }: WindowToolProps) {
  const {
    isActive,
    candidate,
    elevation,
    lengthUnit,
    planeRef,
    windows,
    wallElements,
    levelDataById,
    surfaceOffsetByLevel,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  } = useWindowDrawing(mode)

  const plane = interactionPlaneProps(mode, elevation)

  return (
    <>
      {/* Invisible interaction plane */}
      {isActive && (
        <mesh
          ref={planeRef}
          position={plane.position}
          rotation={plane.rotation}
          onClick={handleClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Window preview (candidate) */}
      {candidate && isActive && (
        <>
          {mode === '3d' ? (
            <WindowPreview3D candidate={candidate} elevation={elevation} lengthUnit={lengthUnit} />
          ) : (
            <WindowPreview2D candidate={candidate} elevation={elevation} lengthUnit={lengthUnit} />
          )}
        </>
      )}

      {/* Placed windows */}
      {windows.map((win) => {
        const hostWall = wallElements.find((wall) => wall.meta.id === win.wall_id)
        const windowLevelId = win.meta.level_id ?? hostWall?.meta.level_id
        const levelData = windowLevelId ? levelDataById.get(windowLevelId) : undefined
        const visibility = levelData?.visibility ?? 'visible'
        if (visibility === 'hidden') return null
        const slabOffset = windowLevelId ? (surfaceOffsetByLevel.get(windowLevelId) ?? 0) : 0
        const levelElevation = (levelData?.elevation ?? 0) + slabOffset

        const [sx, sz] = hostWall ? hostWall.start : [0, 0]
        const [ex, ez] = hostWall ? hostWall.end : [1, 0]
        const dx = ex - sx
        const dz = ez - sz
        const len = Math.max(1e-8, Math.hypot(dx, dz))
        const dir: Point2 = [dx / len, dz / len]
        const center: Point2 = [sx + dir[0] * len * win.position_along_wall, sz + dir[1] * len * win.position_along_wall]

        if (mode === '3d') {
          const thickness = hostWall ? Math.max(0.04, hostWall.thickness * 0.5) : 0.06
          const windowOpacity = visibility === 'ghosted' ? 0.28 : 0.5
          return (
            <group
              key={win.meta.id}
              position={[center[0], levelElevation, center[1]]}
              rotation={[0, Math.atan2(dir[1], dir[0]), 0]}
            >
              <mesh position={[0, win.sill_height + win.height / 2, 0]}>
                <boxGeometry args={[win.width, win.height, thickness]} />
                <meshStandardMaterial color="#93c5fd" opacity={windowOpacity} transparent depthWrite={windowOpacity >= 0.99} />
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
        }

        // 2D placed windows: plan-view (rectangle with cross)
        const angle = Math.atan2(dir[1], dir[0])
        const winPos = toWorldPosition(center, mode, elevation, 0.02)
        const winOpacity2D = visibility === 'ghosted' ? 0.3 : 0.7
        const halfW = win.width / 2
        return (
          <group
            key={win.meta.id}
            position={winPos}
            rotation={[0, 0, -angle]}
          >
            {/* Outer rectangle representing opening */}
            <Line
              points={[
                [-halfW, -0.04, 0],
                [halfW, -0.04, 0],
                [halfW, 0.04, 0],
                [-halfW, 0.04, 0],
                [-halfW, -0.04, 0],
              ]}
              color="#60a5fa"
              lineWidth={2}
              opacity={winOpacity2D}
            />
            {/* Center line (glass indicator) */}
            <Line
              points={[
                [-halfW, 0, 0],
                [halfW, 0, 0],
              ]}
              color="#93c5fd"
              lineWidth={1.5}
              opacity={winOpacity2D}
            />
          </group>
        )
      })}
    </>
  )
}

// ─── 3D Window Preview ──────────────────────────────────────────────────────

function WindowPreview3D({ candidate, elevation, lengthUnit }: {
  candidate: NonNullable<ReturnType<typeof useWindowDrawing>['candidate']>
  elevation: number
  lengthUnit: ReturnType<typeof useWindowDrawing>['lengthUnit']
}) {
  return (
    <>
      <group
        position={[candidate.center[0], elevation, candidate.center[1]]}
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
      <Html position={[candidate.center[0], elevation + candidate.sillHeight + candidate.height + 0.2, candidate.center[1]]} center>
        <div className="measurement-badge">
          {formatLength(candidate.width, lengthUnit)} x {formatLength(candidate.height, lengthUnit)} @ {formatLength(candidate.sillHeight, lengthUnit)}
        </div>
      </Html>
    </>
  )
}

// ─── 2D Window Preview ──────────────────────────────────────────────────────

function WindowPreview2D({ candidate, elevation, lengthUnit }: {
  candidate: NonNullable<ReturnType<typeof useWindowDrawing>['candidate']>
  elevation: number
  lengthUnit: ReturnType<typeof useWindowDrawing>['lengthUnit']
}) {
  const angle = Math.atan2(candidate.direction[1], candidate.direction[0])
  const pos = toWorldPosition(candidate.center, '2d', elevation, 0.03)
  const halfW = candidate.width / 2

  return (
    <>
      <group position={pos} rotation={[0, 0, -angle]}>
        {/* Outer rectangle */}
        <Line
          points={[
            [-halfW, -0.04, 0],
            [halfW, -0.04, 0],
            [halfW, 0.04, 0],
            [-halfW, 0.04, 0],
            [-halfW, -0.04, 0],
          ]}
          color="#3b82f6"
          lineWidth={2.5}
        />
        {/* Center line (glass) */}
        <Line
          points={[
            [-halfW, 0, 0],
            [halfW, 0, 0],
          ]}
          color="#60a5fa"
          lineWidth={2}
        />
      </group>
      <Html position={[pos[0], pos[1] + 0.3, pos[2]]} center>
        <div className="measurement-badge">
          {formatLength(candidate.width, lengthUnit)} x {formatLength(candidate.height, lengthUnit)} @ {formatLength(candidate.sillHeight, lengthUnit)}
        </div>
      </Html>
    </>
  )
}
