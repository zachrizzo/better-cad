import { useRef, useState, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useSketchStore } from '../../stores/sketch-store'
import { useBimStore } from '../../stores/bim-store'
import { useDocumentStore } from '../../stores/document-store'
import { useKernel } from '../../hooks/useKernel'
import { extrudeSketchProfile } from '../../utils/sketch-extrude'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'

const MIN_RECT_SIDE = 1e-5

export function SketchPlane() {
  const {
    active,
    pendingPoint,
    setPendingPoint,
    addPoint,
    addLine,
    addProfile,
    setPreviewPoint,
  } = useSketchStore()
  const autoExtrudeSketch = useBimStore((s) => s.autoExtrudeSketch)
  const sketchExtrudeMode = useBimStore((s) => s.sketchExtrudeMode)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const addWall = useBimStore((s) => s.addWall)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const { kernel, ready } = useKernel()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const planeRef = useRef<THREE.Mesh>(null)
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!active) {
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [active, setMeasurementCursor, setToolReadout])

  const handlePointerMove = useCallback((e: { point?: THREE.Vector3 }) => {
    if (!active) return
    const point = e.point as THREE.Vector3
    if (!point) return
    const preview: [number, number] = [point.x, point.z]
    setHoverPoint(preview)
    setPreviewPoint(preview)
    setMeasurementCursor([preview[0], 0, preview[1]])

    if (pendingPoint) {
      const dx = preview[0] - pendingPoint.x
      const dz = preview[1] - pendingPoint.y
      setToolReadout(
        `Rect dX:${formatLength(Math.abs(dx), lengthUnit)} dZ:${formatLength(Math.abs(dz), lengthUnit)} Diag:${formatLength(Math.hypot(dx, dz), lengthUnit)}`,
      )
    } else {
      setToolReadout('Sketch: pick first corner')
    }
  }, [active, lengthUnit, pendingPoint, setMeasurementCursor, setPreviewPoint, setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setHoverPoint(null)
    setPreviewPoint(null)
    setMeasurementCursor(null)
    setToolReadout(null)
  }, [setMeasurementCursor, setPreviewPoint, setToolReadout])

  const handleClick = (e: { point?: THREE.Vector3 }) => {
    if (!active) return
    const point = e.point as THREE.Vector3
    if (!point) return

    const x = point.x
    const z = point.z // in XZ plane, Z maps to sketch Y
    const current: [number, number] = [x, z]
    setHoverPoint(current)
    setPreviewPoint(current)
    setMeasurementCursor([x, 0, z])

    if (!pendingPoint) {
      // First corner of rectangle
      setPendingPoint({ id: 'p-corner-a', x, y: z })
      setToolReadout(`Sketch start X:${formatLength(x, lengthUnit)} Z:${formatLength(z, lengthUnit)}`)
    } else {
      // Second corner - build rectangle
      const ax = pendingPoint.x, ay = pendingPoint.y
      const bx = x, by = z

      if (Math.abs(bx - ax) < MIN_RECT_SIDE || Math.abs(by - ay) < MIN_RECT_SIDE) {
        setPendingPoint(null)
        return
      }

      const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      const p0 = `p-${uid}-0`
      const p1 = `p-${uid}-1`
      const p2 = `p-${uid}-2`
      const p3 = `p-${uid}-3`
      const profileId = `sketch-${uid}`
      const profilePoints: [number, number][] = [
        [ax, ay],
        [bx, ay],
        [bx, by],
        [ax, by],
      ]

      addPoint(p0, ax, ay)
      addPoint(p1, bx, ay)
      addPoint(p2, bx, by)
      addPoint(p3, ax, by)

      addLine(`l-${uid}-0`, p0, p1)
      addLine(`l-${uid}-1`, p1, p2)
      addLine(`l-${uid}-2`, p2, p3)
      addLine(`l-${uid}-3`, p3, p0)
      addProfile({ id: profileId, points: profilePoints })
      setToolReadout(
        `Sketch created W:${formatLength(Math.abs(bx - ax), lengthUnit)} D:${formatLength(Math.abs(by - ay), lengthUnit)}`,
      )

      if (autoExtrudeSketch) {
        void extrudeSketchProfile({
          profile: { id: profileId, points: profilePoints },
          mode: sketchExtrudeMode,
          height: defaultWallHeight,
          thickness: defaultWallThickness,
          kernel,
          ready,
          addCadMesh,
          addWall,
        }).catch((err) => {
          console.error('[BetterCAD] Auto-extrude sketch failed:', err)
        })
      }

      setPendingPoint(null)
    }
  }

  if (!active) return null

  const previewCorners = pendingPoint && hoverPoint
    ? {
      ax: pendingPoint.x,
      ay: pendingPoint.y,
      bx: hoverPoint[0],
      by: hoverPoint[1],
    }
    : null
  const previewSize = previewCorners
    ? {
      width: Math.abs(previewCorners.bx - previewCorners.ax),
      depth: Math.abs(previewCorners.by - previewCorners.ay),
    }
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
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {hoverPoint && (
        <mesh position={[hoverPoint[0], 0.05, hoverPoint[1]]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#00d4ff" />
        </mesh>
      )}

      {pendingPoint && (
        <mesh position={[pendingPoint.x, 0.05, pendingPoint.y]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial color="#ffaa00" />
        </mesh>
      )}

      {previewCorners && (
        <>
          <Line
            points={[
              [previewCorners.ax, 0.03, previewCorners.ay],
              [previewCorners.bx, 0.03, previewCorners.ay],
              [previewCorners.bx, 0.03, previewCorners.by],
              [previewCorners.ax, 0.03, previewCorners.by],
              [previewCorners.ax, 0.03, previewCorners.ay],
            ]}
            color="#00d4ff"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.1}
          />
          {previewSize && (
            <Html
              position={[
                (previewCorners.ax + previewCorners.bx) / 2,
                0.16,
                (previewCorners.ay + previewCorners.by) / 2,
              ]}
              center
            >
              <div className="measurement-badge">
                W {formatLength(previewSize.width, lengthUnit)} • D {formatLength(previewSize.depth, lengthUnit)}
              </div>
            </Html>
          )}
        </>
      )}
    </>
  )
}
