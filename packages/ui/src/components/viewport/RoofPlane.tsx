import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useLevelStore } from '../../stores/level-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import { formatLength } from '../../utils/units'
import type { RoofElement } from '../../services/kernel-bridge'
import { isBeamElement, isColumnElement, isFloorElement, isRoofElement, isStairElement, isWallElement, useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { polygonsOverlapArea, type Point2 as CollisionPoint2 } from '../../utils/plan-collision'
import { rectFromCorners, rectLoop3D } from '../../utils/rect-from-corners'

const MIN_ROOF_DIMENSION = 0.2
const MAX_ROOF_PITCH_DEGREES = 75
const AUTO_ROOF_CLEARANCE = 0.01

type Point2 = [number, number]
type PlanePointerEvent = ThreeEvent<PointerEvent>
type RoofType = RoofElement['roof_type']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeRoofType(type: RoofElement['roof_type'] | undefined): RoofType {
  if (type === 'shed' || type === 'gable' || type === 'hip') return type
  return 'flat'
}

function normalizeAngleDegrees(angle: number): number {
  let normalized = angle % 360
  if (normalized < 0) normalized += 360
  return normalized
}

function subdivideTopTriangles(geometry: THREE.BufferGeometry, topZ: number): void {
  const posAttr = geometry.getAttribute('position')
  if (!(posAttr instanceof THREE.BufferAttribute) || posAttr.itemSize !== 3) return

  const source = posAttr.array as Float32Array
  if (source.length < 9) return

  const topEps = Math.max(Math.abs(topZ), 1) * 1e-4
  const out: number[] = []

  for (let i = 0; i + 8 < source.length; i += 9) {
    const x0 = source[i]
    const y0 = source[i + 1]
    const z0 = source[i + 2]
    const x1 = source[i + 3]
    const y1 = source[i + 4]
    const z1 = source[i + 5]
    const x2 = source[i + 6]
    const y2 = source[i + 7]
    const z2 = source[i + 8]

    const isTop = Math.abs(z0 - topZ) <= topEps && Math.abs(z1 - topZ) <= topEps && Math.abs(z2 - topZ) <= topEps
    if (!isTop) {
      out.push(x0, y0, z0, x1, y1, z1, x2, y2, z2)
      continue
    }

    const cx = (x0 + x1 + x2) / 3
    const cy = (y0 + y1 + y2) / 3
    const cz = topZ

    out.push(
      x0, y0, z0, x1, y1, z1, cx, cy, cz,
      x1, y1, z1, x2, y2, z2, cx, cy, cz,
      x2, y2, z2, x0, y0, z0, cx, cy, cz,
    )
  }

  if (out.length !== source.length) {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3))
    if (geometry.getAttribute('normal')) geometry.deleteAttribute('normal')
  }
}

function RoofMesh({ boundary, thickness, elevation, roofType, pitchDegrees, ridgeAngleDegrees, color, opacity = 0.85 }: {
  boundary: Point2[]
  thickness: number
  elevation: number
  roofType: RoofType
  pitchDegrees: number
  ridgeAngleDegrees: number
  color: string
  opacity?: number
}) {
  const geometry = useMemo(() => {
    if (boundary.length < 3) return null

    // RoofElement boundary is stored in world plan coords (X,Z).
    // ExtrudeGeometry works in XY, and we rotate geometry into scene later.
    // Local y is negated so world z stays aligned after rotation.
    const localBoundary: Point2[] = boundary.map(([x, z]) => [x, -z])

    const shape = new THREE.Shape()
    shape.moveTo(localBoundary[0][0], localBoundary[0][1])
    for (let i = 1; i < localBoundary.length; i++) {
      shape.lineTo(localBoundary[i][0], localBoundary[i][1])
    }
    shape.closePath()

    const extrudeSettings = { depth: thickness, bevelEnabled: false, steps: 1 }
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings).toNonIndexed()

    const normalizedRoofType = normalizeRoofType(roofType)
    const normalizedPitch = clamp(pitchDegrees, 0, MAX_ROOF_PITCH_DEGREES)
    if (normalizedRoofType === 'flat' || normalizedPitch <= 0.001) {
      geom.computeVertexNormals()
      return geom
    }

    // Add interior top triangles so gable/hip roofs can form a visible ridge.
    subdivideTopTriangles(geom, thickness)

    const ridgeWorldAngle = THREE.MathUtils.degToRad(normalizeAngleDegrees(ridgeAngleDegrees))
    const ridgeWorldX = Math.cos(ridgeWorldAngle)
    const ridgeWorldZ = Math.sin(ridgeWorldAngle)
    // Transform world ridge direction (x,z) -> local (x,y) using yLocal = -zWorld.
    const ridgeDirX = ridgeWorldX
    const ridgeDirY = -ridgeWorldZ
    const slopeDirX = -ridgeDirY
    const slopeDirY = ridgeDirX

    let minAlong = Number.POSITIVE_INFINITY
    let maxAlong = Number.NEGATIVE_INFINITY
    let minPerp = Number.POSITIVE_INFINITY
    let maxPerp = Number.NEGATIVE_INFINITY

    for (const [x, y] of localBoundary) {
      const along = x * slopeDirX + y * slopeDirY
      const perp = x * ridgeDirX + y * ridgeDirY
      minAlong = Math.min(minAlong, along)
      maxAlong = Math.max(maxAlong, along)
      minPerp = Math.min(minPerp, perp)
      maxPerp = Math.max(maxPerp, perp)
    }

    const alongSpan = Math.max(0, maxAlong - minAlong)
    const perpSpan = Math.max(0, maxPerp - minPerp)
    if (alongSpan < 1e-6) {
      geom.computeVertexNormals()
      return geom
    }

    const tanPitch = Math.tan(THREE.MathUtils.degToRad(normalizedPitch))
    const linearRise = tanPitch * alongSpan
    const hipRise = tanPitch * Math.max(1e-6, Math.min(alongSpan, perpSpan))
    const thicknessSafe = Math.max(1e-6, thickness)

    const pos = geom.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const along = x * slopeDirX + y * slopeDirY
      const t = alongSpan > 1e-6 ? clamp((along - minAlong) / alongSpan, 0, 1) : 0.5

      let displacement = 0
      if (normalizedRoofType === 'shed') {
        displacement = t * linearRise
      } else if (normalizedRoofType === 'gable') {
        displacement = (1 - Math.abs(2 * t - 1)) * linearRise
      } else if (normalizedRoofType === 'hip') {
        const perp = x * ridgeDirX + y * ridgeDirY
        const u = perpSpan > 1e-6 ? clamp((perp - minPerp) / perpSpan, 0, 1) : 0.5
        const edgeFactor = clamp(Math.min(t, 1 - t, u, 1 - u) / 0.5, 0, 1)
        displacement = edgeFactor * hipRise
      }

      // Keep roof underside level: apply slope only toward the top surface.
      const topFactor = clamp(z / thicknessSafe, 0, 1)
      pos.setZ(i, z + displacement * topFactor)
    }

    pos.needsUpdate = true
    geom.computeVertexNormals()
    return geom
  }, [boundary, thickness, roofType, pitchDegrees, ridgeAngleDegrees])

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={opacity >= 0.99} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function RoofPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const defaultRoofThickness = useBimStore((s) => s.defaultRoofThickness)
  const defaultRoofElevation = useBimStore((s) => s.defaultRoofElevation)
  const defaultRoofAutoElevation = useBimStore((s) => s.defaultRoofAutoElevation)
  const defaultRoofType = useBimStore((s) => s.defaultRoofType)
  const defaultRoofPitchDegrees = useBimStore((s) => s.defaultRoofPitchDegrees)
  const defaultRoofRidgeAngleDegrees = useBimStore((s) => s.defaultRoofRidgeAngleDegrees)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevelElevation = useMemo(() => {
    const level = levels.find((l) => l.id === activeLevelId)
    return level?.elevation ?? 0
  }, [levels, activeLevelId])
  const levelDataById = useMemo(
    () => new Map(levels.map((level) => [level.id, { elevation: level.elevation, visibility: level.visibility }])),
    [levels],
  )
  const { kernel, ready } = useKernel()

  const planeRef = useRef<THREE.Mesh>(null)
  const [startCorner, setStartCorner] = useState<Point2 | null>(null)
  const [previewCorner, setPreviewCorner] = useState<Point2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point2 | null>(null)
  const [snapMarker, setSnapMarker] = useState<Point2 | null>(null)
  const snapPoints = usePlanSnapPoints()

  const roofCount = useMemo(
    () => Array.from(elements.values()).filter(isRoofElement).length,
    [elements],
  )

  const placedRoofs = useMemo(
    () => Array.from(elements.values()).filter(isRoofElement),
    [elements],
  )
  const roofsOnActiveLevel = useMemo(
    () => placedRoofs.filter((roof) => !roof.meta.level_id || roof.meta.level_id === activeLevelId),
    [activeLevelId, placedRoofs],
  )

  const supportTopByLevel = useMemo(() => {
    const levelMaxSlabOffset = new Map<string, number>()
    for (const element of elements.values()) {
      if (!isFloorElement(element)) continue
      const levelId = element.meta.level_id
      if (!levelId) continue
      levelMaxSlabOffset.set(levelId, Math.max(levelMaxSlabOffset.get(levelId) ?? 0, element.thickness))
    }

    const supportTop = new Map<string, number>()
    for (const level of levels) {
      supportTop.set(level.id, levelMaxSlabOffset.get(level.id) ?? 0)
    }

    for (const element of elements.values()) {
      const levelId = element.meta.level_id
      if (!levelId) continue

      const slabOffset = levelMaxSlabOffset.get(levelId) ?? 0
      const current = supportTop.get(levelId) ?? slabOffset
      let candidate = current

      if (isWallElement(element)) {
        candidate = slabOffset + element.height
      } else if (isColumnElement(element)) {
        candidate = slabOffset + element.height
      } else if (isStairElement(element)) {
        candidate = slabOffset + element.total_height
      } else if (isBeamElement(element)) {
        candidate = Math.max(element.start[2], element.end[2]) + element.depth / 2
      } else {
        continue
      }

      supportTop.set(levelId, Math.max(current, candidate))
    }

    return supportTop
  }, [elements, levels])

  const activeSupportTop = supportTopByLevel.get(activeLevelId) ?? 0
  const effectiveDefaultRoofOffset = defaultRoofAutoElevation
    ? Math.max(defaultRoofElevation, activeSupportTop + AUTO_ROOF_CLEARANCE)
    : defaultRoofElevation

  const placedRoofVisuals = useMemo(
    () => placedRoofs.flatMap((roof) => {
      const levelData = roof.meta.level_id ? levelDataById.get(roof.meta.level_id) : undefined
      const visibility = levelData?.visibility ?? 'visible'
      if (visibility === 'hidden') return []

      const levelSupportTop = roof.meta.level_id ? (supportTopByLevel.get(roof.meta.level_id) ?? 0) : 0
      const autoElevation = roof.auto_elevation !== false
      const roofOffsetRaw = Number.isFinite(roof.elevation) ? roof.elevation : 0
      const roofOffset = autoElevation ? Math.max(roofOffsetRaw, levelSupportTop + AUTO_ROOF_CLEARANCE) : roofOffsetRaw

      return [{
        roof,
        elevation: (levelData?.elevation ?? 0) + roofOffset,
        roofType: normalizeRoofType(roof.roof_type),
        pitchDegrees: Number.isFinite(roof.pitch_degrees) ? roof.pitch_degrees : defaultRoofPitchDegrees,
        ridgeAngleDegrees: Number.isFinite(roof.ridge_angle_degrees) ? roof.ridge_angle_degrees : 0,
        opacity: visibility === 'ghosted' ? 0.28 : 0.85,
      }]
    }),
    [defaultRoofPitchDegrees, levelDataById, placedRoofs, supportTopByLevel],
  )

  const roofDrawElevation = activeLevelElevation + effectiveDefaultRoofOffset

  useEffect(() => {
    if (activeTool !== 'roof') {
      setStartCorner(null)
      setPreviewCorner(null)
      setCursorPoint(null)
      setSnapMarker(null)
      setMeasurementCursor(null)
      setToolReadout(null)
    }
  }, [activeTool, setMeasurementCursor, setToolReadout])

  const applySnap = useCallback((rawPoint: Point2): { point: Point2; snapped: Point2 | null } => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3)
  }, [snapEnabled, snapPoints])

  const updateReadout = useCallback((point: Point2) => {
    const roofType = normalizeRoofType(defaultRoofType)
    const roofPitch = clamp(defaultRoofPitchDegrees, 0, MAX_ROOF_PITCH_DEGREES).toFixed(1)
    const roofElevationLabel = defaultRoofAutoElevation
      ? `${formatLength(effectiveDefaultRoofOffset, lengthUnit)} (auto)`
      : formatLength(defaultRoofElevation, lengthUnit)

    if (!startCorner) {
      setToolReadout(
        `Roof ${roofType} T:${formatLength(defaultRoofThickness, lengthUnit)} Pitch:${roofPitch}° Elev:${roofElevationLabel} • pick first corner`,
      )
      return
    }

    const rect = rectFromCorners(startCorner, point)
    setToolReadout(
      `Roof ${roofType} W:${formatLength(rect.width, lengthUnit)} D:${formatLength(rect.depth, lengthUnit)} A:${rect.area.toFixed(2)} m² T:${formatLength(defaultRoofThickness, lengthUnit)}`,
    )
  }, [
    defaultRoofAutoElevation,
    defaultRoofElevation,
    defaultRoofPitchDegrees,
    defaultRoofThickness,
    defaultRoofType,
    effectiveDefaultRoofOffset,
    lengthUnit,
    setToolReadout,
    startCorner,
  ])

  const handlePointerMove = useCallback((e: PlanePointerEvent) => {
    if (activeTool !== 'roof') return
    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], roofDrawElevation, point[1]])
    if (startCorner) {
      setPreviewCorner(point)
    }
    updateReadout(point)
  }, [activeTool, applySnap, roofDrawElevation, setMeasurementCursor, startCorner, updateReadout])

  const handleClick = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    if (activeTool !== 'roof') return

    const rawPoint: Point2 = [e.point.x, e.point.z]
    const { point, snapped } = applySnap(rawPoint)
    setCursorPoint(point)
    setSnapMarker(snapped)
    setMeasurementCursor([point[0], roofDrawElevation, point[1]])

    if (!startCorner) {
      setStartCorner(point)
      setPreviewCorner(point)
      setToolReadout(`Roof start X:${formatLength(point[0], lengthUnit)} Z:${formatLength(point[1], lengthUnit)}`)
      return
    }

    const rect = rectFromCorners(startCorner, point)
    if (rect.width < MIN_ROOF_DIMENSION || rect.depth < MIN_ROOF_DIMENSION) {
      setToolReadout(`Roof too small • minimum side is ${formatLength(MIN_ROOF_DIMENSION, lengthUnit)}`)
      return
    }

    const intersectsExistingRoof = roofsOnActiveLevel.some((roof) => (
      polygonsOverlapArea(rect.boundary as CollisionPoint2[], roof.boundary as CollisionPoint2[])
    ))
    if (intersectsExistingRoof) {
      setToolReadout('Roof blocked: footprint intersects an existing roof on this level')
      return
    }

    const roofElement: RoofElement = {
      kind: 'roof',
      meta: {
        id: `roof-${crypto.randomUUID()}`,
        name: `Roof ${roofCount + 1}`,
        level_id: activeLevelId,
      },
      boundary: rect.boundary,
      thickness: defaultRoofThickness,
      elevation: effectiveDefaultRoofOffset,
      auto_elevation: defaultRoofAutoElevation,
      roof_type: normalizeRoofType(defaultRoofType),
      pitch_degrees: clamp(defaultRoofPitchDegrees, 0, MAX_ROOF_PITCH_DEGREES),
      ridge_angle_degrees: normalizeAngleDegrees(defaultRoofRidgeAngleDegrees),
    }

    setStartCorner(null)
    setPreviewCorner(null)
    setToolReadout(
      `Roof placed W:${formatLength(rect.width, lengthUnit)} D:${formatLength(rect.depth, lengthUnit)} A:${rect.area.toFixed(2)} m² ${roofElement.roof_type} Pitch:${roofElement.pitch_degrees.toFixed(1)}°`,
    )

    if (!ready || !kernel) {
      console.warn('[BetterCAD] Kernel not ready; roof entity was not persisted')
      return
    }

    void (async () => {
      try {
        await kernel.createElement(roofElement)
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to create roof entity:', err)
      }
    })()
  }, [
    activeLevelId,
    activeTool,
    applySnap,
    defaultRoofAutoElevation,
    defaultRoofPitchDegrees,
    defaultRoofRidgeAngleDegrees,
    defaultRoofThickness,
    defaultRoofType,
    effectiveDefaultRoofOffset,
    kernel,
    lengthUnit,
    ready,
    roofCount,
    roofDrawElevation,
    roofsOnActiveLevel,
    setMeasurementCursor,
    setToolReadout,
    startCorner,
  ])

  const handleCancel = useCallback((e: PlanePointerEvent) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    setStartCorner(null)
    setPreviewCorner(null)
    setSnapMarker(null)
    setToolReadout('Roof placement canceled')
  }, [setToolReadout])

  const handlePointerLeave = useCallback(() => {
    setCursorPoint(null)
    setSnapMarker(null)
    setMeasurementCursor(null)
  }, [setMeasurementCursor])

  const previewData = startCorner && previewCorner
    ? (() => {
      const rect = rectFromCorners(startCorner, previewCorner)
      if (rect.width < 1e-6 || rect.depth < 1e-6) return null
      return { ...rect, loop: rectLoop3D(rect, 0.02) }
    })()
    : null

  if (activeTool !== 'roof') {
    return (
      <>
        {placedRoofVisuals.map(({ roof, elevation, roofType, pitchDegrees, ridgeAngleDegrees, opacity }) => (
          <RoofMesh
            key={roof.meta.id}
            boundary={roof.boundary}
            thickness={roof.thickness}
            elevation={elevation}
            roofType={roofType}
            pitchDegrees={pitchDegrees}
            ridgeAngleDegrees={ridgeAngleDegrees}
            color="#92400e"
            opacity={opacity}
          />
        ))}
      </>
    )
  }

  return (
    <>
      {placedRoofVisuals.map(({ roof, elevation, roofType, pitchDegrees, ridgeAngleDegrees, opacity }) => (
        <RoofMesh
          key={roof.meta.id}
          boundary={roof.boundary}
          thickness={roof.thickness}
          elevation={elevation}
          roofType={roofType}
          pitchDegrees={pitchDegrees}
          ridgeAngleDegrees={ridgeAngleDegrees}
          color="#92400e"
          opacity={opacity}
        />
      ))}

      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, roofDrawElevation, 0]}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleCancel}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {cursorPoint && (
        <mesh position={[cursorPoint[0], roofDrawElevation + 0.04, cursorPoint[1]]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color={snapMarker ? '#00ff88' : '#b45309'} />
        </mesh>
      )}

      {previewData && (
        <>
          <mesh position={[previewData.center[0], roofDrawElevation + 0.01, previewData.center[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[previewData.width, previewData.depth]} />
            <meshBasicMaterial color="#b45309" transparent opacity={0.15} side={THREE.DoubleSide} />
          </mesh>
          <Line
            points={previewData.loop.map(([x, y, z]) => [x, roofDrawElevation + y, z] as [number, number, number])}
            color="#b45309"
            lineWidth={2}
          />
          <Html position={[previewData.center[0], roofDrawElevation + 0.3, previewData.center[1]]} center>
            <div className="measurement-badge">
              {formatLength(previewData.width, lengthUnit)} x {formatLength(previewData.depth, lengthUnit)}
            </div>
          </Html>
        </>
      )}
    </>
  )
}
