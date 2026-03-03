import { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import type {
  PrototypeElement,
  TagElement,
  RoomElement,
} from '../../services/kernel-bridge'
import { resolveRoomName } from '../../services/room-utils'
import { isTagElement } from '../../stores/entity-store'
import { computePolygonArea } from '../../services/tag-generator'

// ── Room tag ──────────────────────────────────────────────────────────────

function RoomTag({
  tag,
  allElements,
  scale,
}: {
  tag: TagElement
  allElements: PrototypeElement[]
  scale: number
}) {
  const room = allElements.find(
    (e): e is RoomElement => e.kind === 'room' && e.meta.id === tag.target_element_id,
  )

  const radius = 4 / (scale * 1000) // ~4mm at paper scale
  const fontSize = 2.5 / (scale * 1000)
  const effectiveFontSize = fontSize > 0.01 ? fontSize : 0.12
  const effectiveRadius = radius > 0.01 ? radius : 0.2

  const roomName = room ? resolveRoomName(room, tag.meta.name || 'Room') : (tag.meta.name || 'Room')
  const area = room && room.boundary.length >= 3
    ? computePolygonArea(room.boundary)
    : 0
  const areaStr = area > 0 ? `${area.toFixed(1)} m\u00B2` : ''

  // Circle points
  const circlePoints = useMemo(() => {
    const pts: [number, number, number][] = []
    const segments = 32
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push([
        tag.position[0] + Math.cos(angle) * effectiveRadius * 1.3,
        tag.position[1] + Math.sin(angle) * effectiveRadius * 1.3,
        0.03,
      ])
    }
    return pts
  }, [tag.position, effectiveRadius])

  return (
    <>
      {/* Circle background */}
      <mesh position={[tag.position[0], tag.position[1], 0.025]}>
        <circleGeometry args={[effectiveRadius * 1.3, 32]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* Circle outline */}
      <Line points={circlePoints} color="#8b5cf6" lineWidth={1.5} />

      {/* Room name */}
      <Text
        position={[tag.position[0], tag.position[1] + effectiveFontSize * 0.4, 0.04]}
        fontSize={effectiveFontSize}
        color="#8b5cf6"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {roomName}
      </Text>

      {/* Area text */}
      {areaStr && (
        <Text
          position={[tag.position[0], tag.position[1] - effectiveFontSize * 0.6, 0.04]}
          fontSize={effectiveFontSize * 0.8}
          color="#8b5cf6"
          anchorX="center"
          anchorY="middle"
        >
          {areaStr}
        </Text>
      )}
    </>
  )
}

// ── Element tag (door/window/wall/column/beam) ────────────────────────────

function ElementTag({
  tag,
  scale,
}: {
  tag: TagElement
  scale: number
}) {
  const radius = 4 / (scale * 1000)
  const fontSize = 2.5 / (scale * 1000)
  const effectiveFontSize = fontSize > 0.01 ? fontSize : 0.12
  const effectiveRadius = radius > 0.01 ? radius : 0.15

  const colorMap: Record<string, string> = {
    door: '#f59e0b',
    window: '#60a5fa',
    wall: '#9ca3af',
    column: '#78716c',
    beam: '#78716c',
  }
  const color = colorMap[tag.tag_type] ?? '#9ca3af'

  const circlePoints = useMemo(() => {
    const pts: [number, number, number][] = []
    const segments = 24
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push([
        tag.position[0] + Math.cos(angle) * effectiveRadius,
        tag.position[1] + Math.sin(angle) * effectiveRadius,
        0.03,
      ])
    }
    return pts
  }, [tag.position, effectiveRadius])

  return (
    <>
      {/* Circle background */}
      <mesh position={[tag.position[0], tag.position[1], 0.025]}>
        <circleGeometry args={[effectiveRadius, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>

      {/* Circle outline */}
      <Line points={circlePoints} color={color} lineWidth={1.2} />

      {/* Tag text */}
      <Text
        position={[tag.position[0], tag.position[1], 0.04]}
        fontSize={effectiveFontSize}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {tag.meta.name}
      </Text>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────

interface TagRenderer2DProps {
  elements: PrototypeElement[]
  allElements: PrototypeElement[]
  scale: number
}

export function TagRenderer2D({ elements, allElements, scale }: TagRenderer2DProps) {
  const tags = useMemo(
    () => elements.filter((e): e is TagElement => isTagElement(e)),
    [elements],
  )

  if (tags.length === 0) return null

  return (
    <>
      {tags.map((tag) =>
        tag.tag_type === 'room' ? (
          <RoomTag key={tag.meta.id} tag={tag} allElements={allElements} scale={scale} />
        ) : (
          <ElementTag key={tag.meta.id} tag={tag} scale={scale} />
        ),
      )}
    </>
  )
}
