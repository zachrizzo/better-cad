import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { isTextAnnotationElement, useEntityStore } from '../../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { useLevelStore } from '../../stores/level-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import type { TextAnnotationElement } from '../../services/kernel-bridge'

type Point2 = [number, number]

export function TextAnnotationPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const lvl = levels.find((l) => l.id === activeLevelId)
    return lvl?.elevation ?? 0
  }, [levels, activeLevelId])

  const planeRef = useRef<THREE.Mesh>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [pendingPosition, setPendingPosition] = useState<Point2 | null>(null)
  const [inputText, setInputText] = useState('')
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const snapPoints = usePlanSnapPoints()

  useEffect(() => {
    if (activeTool !== 'text') {
      setPendingPosition(null)
      setCursorPoint(null)
      setInputText('')
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: Point2): { point: Point2; snapped: Point2 | null } => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'text') return
    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    if (!pendingPosition) {
      setToolReadout('Text: click to place annotation')
    }
  }, [activeLevelElevation, activeTool, applySnap, pendingPosition, setMeasurementCursor, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (activeTool !== 'text') return
    if (pendingPosition) return

    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setPendingPosition(point)
    setSnapMarker(snapped)
    setToolReadout('Text: type annotation and press Enter')
  }

  const submitText = useCallback(() => {
    if (!pendingPosition || !inputText.trim()) {
      setPendingPosition(null)
      setInputText('')
      return
    }

    const textId = `text-${crypto.randomUUID()}`
    const textElement: TextAnnotationElement = {
      kind: 'text_annotation',
      meta: {
        id: textId,
        name: inputText.trim().substring(0, 20),
        level_id: activeLevelId,
      },
      position: pendingPosition,
      text: inputText.trim(),
      font_size: 0.2,
      rotation: 0,
    }

    setPendingPosition(null)
    setInputText('')
    setToolReadout('Text annotation placed')

    if (!ready || !kernel) return
    void (async () => {
      try {
        await kernel.createElement(textElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create text annotation:', err)
      }
    })()
  }, [pendingPosition, inputText, activeLevelId, ready, kernel, setToolReadout])

  if (activeTool !== 'text') return null

  const planeY = activeLevelElevation

  return (
    <>
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, planeY, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && !pendingPosition && (
        <mesh position={[cursorPoint[0], planeY + 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#38bdf8'} />
        </mesh>
      )}

      {pendingPosition && (
        <>
          <mesh position={[pendingPosition[0], planeY + 0.05, pendingPosition[1]]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
          <Html
            position={[pendingPosition[0], planeY + 0.3, pendingPosition[1]]}
            center
          >
            <input
              autoFocus
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitText()
                } else if (e.key === 'Escape') {
                  setPendingPosition(null)
                  setInputText('')
                }
              }}
              placeholder="Type annotation..."
              style={{
                background: '#1a1a2e',
                color: '#fff',
                border: '1px solid #38bdf8',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '13px',
                width: '160px',
                outline: 'none',
              }}
            />
          </Html>
        </>
      )}
    </>
  )
}

/** Renders all persisted text annotations in the 3D scene */
export function TextAnnotationOverlay3D() {
  const elements = useEntityStore((s) => s.elements)
  const levels = useLevelStore((s) => s.levels)

  const annotations = useMemo(
    () => Array.from(elements.values()).filter(isTextAnnotationElement),
    [elements],
  )

  const levelElevations = useMemo(() => {
    const map = new Map<string, number>()
    for (const lvl of levels) map.set(lvl.id, lvl.elevation)
    return map
  }, [levels])

  return (
    <>
      {annotations.map((ann) => {
        const elev = ann.meta.level_id ? (levelElevations.get(ann.meta.level_id) ?? 0) : 0
        return (
          <Text
            key={ann.meta.id}
            position={[ann.position[0], elev + 0.02, ann.position[1]]}
            rotation={[-Math.PI / 2, 0, -ann.rotation]}
            fontSize={ann.font_size}
            color="#38bdf8"
            anchorX="left"
            anchorY="bottom"
          >
            {ann.text}
          </Text>
        )
      })}
    </>
  )
}
