import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useKernel } from '../../hooks/useKernel'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import type { BeamElement } from '../../services/kernel-bridge'
import { isBeamElement, useEntityStore } from '../../stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

const MIN_BEAM_LENGTH = 0.2

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>

function applyOrthoConstraint(start: Point2, end: Point2): Point2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [end[0], start[1]]
  }
  return [start[0], end[1]]
}

function BeamMesh({ beam }: { beam: BeamElement }) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Kernel coords: [x, y, z] where XY is plan, Z is up
  // Scene coords: [x, z, y] (swap y and z)
  const startScene = useMemo(
    () => new THREE.Vector3(beam.start[0], beam.start[2], beam.start[1]),
    [beam.start],
  )
  const endScene = useMemo(
    () => new THREE.Vector3(beam.end[0], beam.end[2], beam.end[1]),
    [beam.end],
  )

  const midpoint = useMemo(
    () => new THREE.Vector3().addVectors(startScene, endScene).multiplyScalar(0.5),
    [startScene, endScene],
  )

  const length = useMemo(
    () => startScene.distanceTo(endScene),
    [startScene, endScene],
  )

  const quaternion = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(endScene, startScene).normalize()
    const quat = new THREE.Quaternion()
    // Box geometry extends along X by default; rotate X-axis to align with beam direction
    quat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
    return quat
  }, [startScene, endScene])

  if (length < 1e-6) return null

  return (
    <mesh
      ref={meshRef}
      position={midpoint}
      quaternion={quaternion}
    >
      <boxGeometry args={[length, beam.depth, beam.width]} />
      <meshStandardMaterial color="#57534e" />
    </mesh>
  )
}

export function BeamPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const defaultBeamWidth = useBimStore((s) => s.defaultBeamWidth)
  const defaultBeamDepth = useBimStore((s) => s.defaultBeamDepth)
  const defaultBeamElevation = useBimStore((s) => s.defaultBeamElevation)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)

  const planeRef = useRef<THREE.Mesh>(null)
  const [pendingStart, setPendingStart] = useState<Point2 | null>(null)
  const [previewEnd, setPreviewEnd] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)

  const beamElements = useMemo(
    () => Array.from(elements.values()).filter(isBeamElement),
    [elements],
  )

  useEffect(() => {
    if (activeTool !== 'beam') {
      setPendingStart(null)
      setPreviewEnd(null)
      setCursorPoint(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'beam') return
    let point: Point2 = [e.point.x, e.point.z]
    if (pendingStart && e.shiftKey) {
      point = applyOrthoConstraint(pendingStart, point)
    }
    setCursorPoint(point)
    setMeasurementCursor([point[0], 0, point[1]])

    if (pendingStart) {
      const length = Math.hypot(point[0] - pendingStart[0], point[1] - pendingStart[1])
      setToolReadout(
        `Beam L:${formatLength(length, lengthUnit)} W:${formatLength(defaultBeamWidth, lengthUnit)} D:${formatLength(defaultBeamDepth, lengthUnit)} Elev:${formatLength(defaultBeamElevation, lengthUnit)}`,
      )
      setPreviewEnd(point)
    } else {
      setToolReadout(
        `Beam defaults W:${formatLength(defaultBeamWidth, lengthUnit)} D:${formatLength(defaultBeamDepth, lengthUnit)} Elev:${formatLength(defaultBeamElevation, lengthUnit)} - pick start`,
      )
    }
  }, [
    activeTool,
    defaultBeamWidth,
    defaultBeamDepth,
    defaultBeamElevation,
    lengthUnit,
    pendingStart,
    setMeasurementCursor,
    setToolReadout,
  ])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setPendingStart(null)
    setPreviewEnd(null)
    setToolReadout('Beam placement cancelled')
  }, [setToolReadout])

  const handleClick = (e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'beam') return

    let point: Point2 = [e.point.x, e.point.z]
    if (pendingStart && e.shiftKey) {
      point = applyOrthoConstraint(pendingStart, point)
    }
    const [x, z] = point
    setCursorPoint(point)
    setMeasurementCursor([x, 0, z])

    if (!pendingStart) {
      setPendingStart(point)
      setPreviewEnd(point)
      setToolReadout(`Beam start X:${formatLength(x, lengthUnit)} Z:${formatLength(z, lengthUnit)}`)
      return
    }

    const [sx, sz] = pendingStart
    const beamLength = Math.hypot(x - sx, z - sz)
    if (beamLength < MIN_BEAM_LENGTH) {
      setPreviewEnd(point)
      return
    }

    // Kernel coords: [x, y, z] where XY is plan, Z is up
    // Scene XZ plane maps to kernel XY; scene Y (elevation) maps to kernel Z
    const beamId = `beam-${crypto.randomUUID()}`
    const beamElement: BeamElement = {
      kind: 'beam',
      meta: {
        id: beamId,
        name: `Beam ${beamElements.length + 1}`,
      },
      start: [sx, sz, defaultBeamElevation],
      end: [x, z, defaultBeamElevation],
      width: defaultBeamWidth,
      depth: defaultBeamDepth,
    }

    setPendingStart(null)
    setPreviewEnd(null)
    setToolReadout(
      `Beam placed L:${formatLength(beamLength, lengthUnit)} W:${formatLength(defaultBeamWidth, lengthUnit)} D:${formatLength(defaultBeamDepth, lengthUnit)}`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; beam entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(beamElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create beam entity:', err)
      }
    })()
  }

  if (activeTool !== 'beam') {
    // Still render placed beams even when not in beam tool
    return (
      <>
        {beamElements.map((beam) => (
          <BeamMesh key={beam.meta.id} beam={beam} />
        ))}
      </>
    )
  }

  const previewLength = pendingStart && previewEnd
    ? Math.hypot(previewEnd[0] - pendingStart[0], previewEnd[1] - pendingStart[1])
    : null

  return (
    <>
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], 0.05, cursorPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#78716c" />
        </mesh>
      )}

      {pendingStart && previewEnd && (
        <>
          <Line
            points={[
              [pendingStart[0], defaultBeamElevation, pendingStart[1]],
              [previewEnd[0], defaultBeamElevation, previewEnd[1]],
            ]}
            color="#78716c"
            lineWidth={2}
            dashed
            dashSize={0.3}
            gapSize={0.15}
          />
          {/* Preview cross-section as a box */}
          {previewLength !== null && previewLength > 0.01 && (() => {
            const sx = pendingStart[0]
            const sz = pendingStart[1]
            const ex = previewEnd[0]
            const ez = previewEnd[1]
            const mx = (sx + ex) / 2
            const mz = (sz + ez) / 2
            const dir = new THREE.Vector3(ex - sx, 0, ez - sz).normalize()
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
            return (
              <mesh
                position={[mx, defaultBeamElevation, mz]}
                quaternion={quat}
              >
                <boxGeometry args={[previewLength, defaultBeamDepth, defaultBeamWidth]} />
                <meshStandardMaterial color="#78716c" transparent opacity={0.4} />
              </mesh>
            )
          })()}
          {previewLength !== null && (
            <Html
              position={[
                (pendingStart[0] + previewEnd[0]) / 2,
                defaultBeamElevation + 0.3,
                (pendingStart[1] + previewEnd[1]) / 2,
              ]}
              center
            >
              <div className="measurement-badge">{formatLength(previewLength, lengthUnit)}</div>
            </Html>
          )}
        </>
      )}

      {pendingStart && (
        <mesh position={[pendingStart[0], 0.05, pendingStart[1]]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#78716c" />
        </mesh>
      )}

      {beamElements.map((beam) => (
        <BeamMesh key={beam.meta.id} beam={beam} />
      ))}
    </>
  )
}
