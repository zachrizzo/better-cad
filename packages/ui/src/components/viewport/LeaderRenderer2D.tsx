import { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import * as THREE from 'three'
import type {
  PrototypeElement,
  LeaderAnnotationElement,
  KeynoteElement,
} from '../../services/kernel-bridge'
import { isLeaderAnnotationElement, isKeynoteElement } from '../../stores/entity-store'

// ── Leader Annotation ─────────────────────────────────────────────────────

function LeaderItem({
  leader,
  scale,
}: {
  leader: LeaderAnnotationElement
  scale: number
}) {
  const { start, end, text } = leader
  const fontSize = 2.5 / (scale * 1000)
  const effectiveFontSize = fontSize > 0.01 ? fontSize : 0.12

  // Arrow direction
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const len = Math.hypot(dx, dy)

  // Arrow tip (filled triangle at start)
  const arrowLen = 3 / (scale * 1000) // ~3mm at paper scale
  const effectiveArrowLen = arrowLen > 0.01 ? arrowLen : 0.08
  const arrowWidth = effectiveArrowLen * 0.4

  const arrowPoints = useMemo(() => {
    if (len < 1e-6) return null
    const ux = dx / len
    const uy = dy / len
    const nx = -uy
    const ny = ux

    // Triangle: tip at start, base toward end
    return [
      [start[0], start[1], 0.03] as [number, number, number],
      [start[0] + ux * effectiveArrowLen + nx * arrowWidth, start[1] + uy * effectiveArrowLen + ny * arrowWidth, 0.03] as [number, number, number],
      [start[0] + ux * effectiveArrowLen - nx * arrowWidth, start[1] + uy * effectiveArrowLen - ny * arrowWidth, 0.03] as [number, number, number],
      [start[0], start[1], 0.03] as [number, number, number], // close triangle
    ]
  }, [start, dx, dy, len, effectiveArrowLen, arrowWidth])

  // Horizontal landing line at text end
  const textDirection = dx >= 0 ? 1 : -1
  const landingLen = effectiveFontSize * 2
  const landingEnd: [number, number, number] = [
    end[0] + textDirection * landingLen,
    end[1],
    0.03,
  ]

  // Text anchor based on direction
  const textAnchorX = textDirection >= 0 ? 'left' : 'right'

  return (
    <>
      {/* Leader line */}
      <Line
        points={[
          [start[0], start[1], 0.03],
          [end[0], end[1], 0.03],
        ]}
        color="#10b981"
        lineWidth={1}
      />

      {/* Arrow tip (filled triangle outline) */}
      {arrowPoints && (
        <Line points={arrowPoints} color="#10b981" lineWidth={1.5} />
      )}

      {/* Arrow fill (mesh triangle) */}
      {arrowPoints && len > 1e-6 && (
        <mesh position={[0, 0, 0.028]}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([
                arrowPoints[0][0], arrowPoints[0][1], 0.028,
                arrowPoints[1][0], arrowPoints[1][1], 0.028,
                arrowPoints[2][0], arrowPoints[2][1], 0.028,
              ]), 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Horizontal landing line */}
      <Line
        points={[[end[0], end[1], 0.03], landingEnd]}
        color="#10b981"
        lineWidth={1}
      />

      {/* Text */}
      <Text
        position={[
          landingEnd[0] + textDirection * effectiveFontSize * 0.3,
          landingEnd[1] + effectiveFontSize * 0.2,
          0.04,
        ]}
        fontSize={effectiveFontSize}
        color="#10b981"
        anchorX={textAnchorX}
        anchorY="bottom"
      >
        {text}
      </Text>
    </>
  )
}

// ── Keynote ───────────────────────────────────────────────────────────────

function KeynoteItem({
  keynote,
  scale,
}: {
  keynote: KeynoteElement
  scale: number
}) {
  const radius = 3 / (scale * 1000) // ~3mm circle at paper scale
  const effectiveRadius = radius > 0.01 ? radius : 0.12
  const fontSize = 2.5 / (scale * 1000)
  const effectiveFontSize = fontSize > 0.01 ? fontSize : 0.1

  const circlePoints = useMemo(() => {
    const pts: [number, number, number][] = []
    const segments = 24
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push([
        keynote.position[0] + Math.cos(angle) * effectiveRadius,
        keynote.position[1] + Math.sin(angle) * effectiveRadius,
        0.03,
      ])
    }
    return pts
  }, [keynote.position, effectiveRadius])

  return (
    <>
      {/* Circle background */}
      <mesh position={[keynote.position[0], keynote.position[1], 0.025]}>
        <circleGeometry args={[effectiveRadius, 24]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* Circle outline */}
      <Line points={circlePoints} color="#6366f1" lineWidth={1.5} />

      {/* Keynote ID inside circle */}
      <Text
        position={[keynote.position[0], keynote.position[1], 0.04]}
        fontSize={effectiveFontSize}
        color="#6366f1"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {keynote.keynote_id}
      </Text>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────

interface LeaderRenderer2DProps {
  elements: PrototypeElement[]
  scale: number
}

export function LeaderRenderer2D({ elements, scale }: LeaderRenderer2DProps) {
  const leaders = useMemo(
    () => elements.filter((e): e is LeaderAnnotationElement => isLeaderAnnotationElement(e)),
    [elements],
  )

  const keynotes = useMemo(
    () => elements.filter((e): e is KeynoteElement => isKeynoteElement(e)),
    [elements],
  )

  if (leaders.length === 0 && keynotes.length === 0) return null

  return (
    <>
      {leaders.map((leader) => (
        <LeaderItem key={leader.meta.id} leader={leader} scale={scale} />
      ))}
      {keynotes.map((keynote) => (
        <KeynoteItem key={keynote.meta.id} keynote={keynote} scale={scale} />
      ))}
    </>
  )
}
