import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useDoorDrawing, normalizeSwing, getSwingVectors, getDoorArcPoints } from '../../hooks/useDoorDrawing'
import { formatLength } from '../../utils/units'
import {
  type ViewportMode,
  interactionPlaneProps,
  toWorldPosition,
} from '../../utils/viewport-helpers'

interface DoorToolProps {
  mode: ViewportMode
}

type Point2 = [number, number]

/**
 * Unified door placement tool.
 * Works in both 2D and 3D — all logic lives in useDoorDrawing.
 */
export function DoorTool({ mode }: DoorToolProps) {
  const {
    isActive,
    candidate,
    elevation,
    lengthUnit,
    planeRef,
    doors,
    wallElements,
    levelDataById,
    surfaceOffsetByLevel,
    handlePointerMove,
    handleClick,
    handlePointerLeave,
  } = useDoorDrawing(mode)

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

      {/* Door preview (candidate) */}
      {candidate && isActive && (
        <>
          {mode === '3d' ? (
            <DoorPreview3D candidate={candidate} elevation={elevation} lengthUnit={lengthUnit} />
          ) : (
            <DoorPreview2D candidate={candidate} elevation={elevation} lengthUnit={lengthUnit} />
          )}
        </>
      )}

      {/* Placed doors */}
      {doors.map((door) => {
        const hostWall = wallElements.find((wall) => wall.meta.id === door.wall_id)
        const swing = normalizeSwing(door.swing)

        const doorLevelId = door.meta.level_id ?? hostWall?.meta.level_id
        const levelData = doorLevelId ? levelDataById.get(doorLevelId) : undefined
        const slabOffset = doorLevelId ? (surfaceOffsetByLevel.get(doorLevelId) ?? 0) : 0
        const doorElevation = (levelData?.elevation ?? 0) + slabOffset
        const doorVisibility = levelData?.visibility ?? 'visible'
        if (doorVisibility === 'hidden') return null

        const [sx, sz] = hostWall ? hostWall.start : [0, 0]
        const [ex, ez] = hostWall ? hostWall.end : [1, 0]
        const dx = ex - sx
        const dz = ez - sz
        const len = Math.max(1e-8, Math.hypot(dx, dz))
        const dir: Point2 = [dx / len, dz / len]
        const center: Point2 = [sx + dir[0] * len * door.position_along_wall, sz + dir[1] * len * door.position_along_wall]

        if (mode === '3d') {
          const thickness = hostWall ? Math.max(0.05, hostWall.thickness * 0.6) : 0.08
          const doorOpacity = doorVisibility === 'ghosted' ? 0.25 : 0.65
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
        }

        // 2D placed doors: plan-view rendering with swing arc
        const vectors = getSwingVectors(door.width, swing)
        const angle = Math.atan2(dir[1], dir[0])
        const doorPos = toWorldPosition(center, mode, elevation, 0.02)
        const doorOpacity2D = doorVisibility === 'ghosted' ? 0.25 : 0.7
        return (
          <group
            key={door.meta.id}
            position={doorPos}
            rotation={[0, 0, -angle]}
          >
            {/* Wall opening line */}
            <Line
              points={[
                [-door.width / 2, 0, 0],
                [door.width / 2, 0, 0],
              ]}
              color="#ffaa00"
              lineWidth={2}
            />
            {/* Swing line */}
            <Line
              points={[
                [vectors.hingeX, 0, 0],
                [vectors.hingeX + door.width * vectors.openDir[0], -door.width * vectors.openDir[1], 0],
              ]}
              color="#ffd166"
              lineWidth={1.5}
              opacity={doorOpacity2D}
            />
            {/* Swing arc in 2D (rotated for plan view) */}
            <Line
              points={getDoorArcPoints(door.width, swing, 0).map(
                ([lx, _y, lz]) => [lx, -lz, 0] as [number, number, number],
              )}
              color="#ffaa00"
              lineWidth={1}
              dashed
              dashSize={0.08}
              gapSize={0.05}
              opacity={doorOpacity2D}
            />
          </group>
        )
      })}
    </>
  )
}

// ─── 3D Door Preview ────────────────────────────────────────────────────────

function DoorPreview3D({ candidate, elevation, lengthUnit }: {
  candidate: NonNullable<ReturnType<typeof useDoorDrawing>['candidate']>
  elevation: number
  lengthUnit: ReturnType<typeof useDoorDrawing>['lengthUnit']
}) {
  const vectors = getSwingVectors(candidate.width, candidate.swing)
  return (
    <>
      <group
        position={[candidate.center[0], elevation, candidate.center[1]]}
        rotation={[0, Math.atan2(candidate.direction[1], candidate.direction[0]), 0]}
      >
        <mesh position={[0, candidate.sillHeight + candidate.height / 2, 0]}>
          <boxGeometry args={[candidate.width, candidate.height, 0.08]} />
          <meshStandardMaterial color="#14b8a6" opacity={0.45} transparent />
        </mesh>
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
      </group>
      <Html position={[candidate.center[0], elevation + 0.35, candidate.center[1]]} center>
        <div className="measurement-badge">
          {formatLength(candidate.width, lengthUnit)} &bull; {candidate.swing}
        </div>
      </Html>
    </>
  )
}

// ─── 2D Door Preview ────────────────────────────────────────────────────────

function DoorPreview2D({ candidate, elevation, lengthUnit }: {
  candidate: NonNullable<ReturnType<typeof useDoorDrawing>['candidate']>
  elevation: number
  lengthUnit: ReturnType<typeof useDoorDrawing>['lengthUnit']
}) {
  const vectors = getSwingVectors(candidate.width, candidate.swing)
  const angle = Math.atan2(candidate.direction[1], candidate.direction[0])
  const pos = toWorldPosition(candidate.center, '2d', elevation, 0.03)

  return (
    <>
      <group position={pos} rotation={[0, 0, -angle]}>
        {/* Wall opening line */}
        <Line
          points={[
            [-candidate.width / 2, 0, 0],
            [candidate.width / 2, 0, 0],
          ]}
          color="#2dd4bf"
          lineWidth={2.5}
        />
        {/* Swing line (remap 3D Y/Z to 2D X/Y) */}
        <Line
          points={[
            [vectors.hingeX, 0, 0],
            [vectors.hingeX + candidate.width * vectors.openDir[0], -candidate.width * vectors.openDir[1], 0],
          ]}
          color="#5eead4"
          lineWidth={2}
        />
        {/* Swing arc */}
        <Line
          points={getDoorArcPoints(candidate.width, candidate.swing, 0).map(
            ([lx, _y, lz]) => [lx, -lz, 0] as [number, number, number],
          )}
          color="#2dd4bf"
          lineWidth={1.5}
          dashed
          dashSize={0.09}
          gapSize={0.06}
        />
      </group>
      <Html position={[pos[0], pos[1] + 0.35, pos[2]]} center>
        <div className="measurement-badge">
          {formatLength(candidate.width, lengthUnit)} &bull; {candidate.swing}
        </div>
      </Html>
    </>
  )
}
