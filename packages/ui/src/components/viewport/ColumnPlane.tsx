import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { ColumnElement } from '../../services/kernel-bridge'
import { isColumnElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

type PlanePointerEvent = ThreeEvent<PointerEvent>

export function ColumnPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultColumnWidth = useBimStore((s) => s.defaultColumnWidth)
  const defaultColumnDepth = useBimStore((s) => s.defaultColumnDepth)
  const defaultColumnHeight = useBimStore((s) => s.defaultColumnHeight)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [preview, setPreview] = useState<[number, number] | null>(null)

  const columns = useMemo(
    () => Array.from(elements.values()).filter(isColumnElement),
    [elements],
  )

  useEffect(() => {
    if (activeTool !== 'column') {
      setPreview(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'column') return
    const point: [number, number] = [e.point.x, e.point.z]
    setPreview(point)
    setMeasurementCursor([point[0], 0, point[1]])
    setToolReadout(
      `Column W:${formatLength(defaultColumnWidth, lengthUnit)} D:${formatLength(defaultColumnDepth, lengthUnit)} H:${formatLength(defaultColumnHeight, lengthUnit)}`,
    )
  }, [activeTool, defaultColumnWidth, defaultColumnDepth, defaultColumnHeight, lengthUnit, setMeasurementCursor, setToolReadout])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'column') return

    const center: [number, number] = [e.point.x, e.point.z]

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; column entity was not persisted')
      return
    }

    const columnId = `column-${crypto.randomUUID()}`
    const columnElement: ColumnElement = {
      kind: 'column',
      meta: {
        id: columnId,
        name: `Column ${columns.length + 1}`,
      },
      center,
      width: defaultColumnWidth,
      depth: defaultColumnDepth,
      height: defaultColumnHeight,
    }

    setToolReadout(
      `Column placed W:${formatLength(defaultColumnWidth, lengthUnit)} D:${formatLength(defaultColumnDepth, lengthUnit)} H:${formatLength(defaultColumnHeight, lengthUnit)}`,
    )

    void (async () => {
      try {
        await kernel.createElement(columnElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create column entity:', err)
      }
    })()
  }, [activeTool, columns.length, defaultColumnWidth, defaultColumnDepth, defaultColumnHeight, kernel, lengthUnit, ready, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setPreview(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setToolReadout])

  return (
    <>
      {activeTool === 'column' && (
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

      {preview && activeTool === 'column' && (
        <>
          <mesh position={[preview[0], defaultColumnHeight / 2, preview[1]]}>
            <boxGeometry args={[defaultColumnWidth, defaultColumnHeight, defaultColumnDepth]} />
            <meshStandardMaterial color="#9ca3af" opacity={0.45} transparent />
          </mesh>
          <Html position={[preview[0], defaultColumnHeight + 0.2, preview[1]]} center>
            <div className="measurement-badge">
              {formatLength(defaultColumnWidth, lengthUnit)} x {formatLength(defaultColumnDepth, lengthUnit)} x {formatLength(defaultColumnHeight, lengthUnit)}
            </div>
          </Html>
        </>
      )}

      {columns.map((col) => (
        <mesh
          key={col.meta.id}
          position={[col.center[0], col.height / 2, col.center[1]]}
        >
          <boxGeometry args={[col.width, col.height, col.depth]} />
          <meshStandardMaterial color="#6b7280" />
        </mesh>
      ))}
    </>
  )
}
