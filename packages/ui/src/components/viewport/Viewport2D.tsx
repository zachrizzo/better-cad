import { Canvas, useThree } from '@react-three/fiber'
import { MapControls, Line, Text } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  isBeamElement,
  isColumnElement,
  isDimensionElement,
  isFloorElement,
  isFoundationElement,
  isRoofElement,
  isRoomElement,
  isStairElement,
  isTextAnnotationElement,
  isWallElement,
  useEntityStore,
} from '../../stores/entity-store'
import type { BeamElement, ColumnElement, DimensionElement, FloorElement, FoundationElement, PrototypeElement, RoofElement, RoomElement, StairElement, TextAnnotationElement, WallElement } from '../../services/kernel-bridge'
import { useLevelStore } from '../../stores/level-store'
import { useMeasurementStore } from '../../stores/measurement-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useUIStore } from '../../stores/ui-store'
import { intersectPointerWithPlan } from '../../utils/intersect-pointer-with-plan'
import { formatLength } from '../../utils/units'
import { buildVisibleWallOutlineLines } from '../../utils/wall-outline'
import { polygonCentroid } from '../../services/room-detection'
import { MeasurePlane2D } from './MeasurePlane2D'
import { PathMeasurePlane2D } from './PathMeasurePlane2D'
import { AreaMeasurePlane2D } from './AreaMeasurePlane2D'
import { AngleMeasurePlane2D } from './AngleMeasurePlane2D'
import { SpotElevationPlane2D } from './SpotElevationPlane2D'
import { DimensionPlane2D } from './DimensionPlane2D'
import { resolveRoomName } from '../../services/room-utils'
import { MepSymbols2D } from './MepSymbols2D'
import { SwitchingDiagram2D } from './SwitchingDiagram2D'
import { FurnitureSymbols2D } from './FurnitureSymbols2D'
import { SiteSymbols2D } from './SiteSymbols2D'
import { DoorWindowSymbols2D } from './DoorWindowSymbols2D'
import { HvacSymbols2D } from './HvacSymbols2D'
import { FireSafetySymbols2D } from './FireSafetySymbols2D'
import { AccessibilitySymbols2D } from './AccessibilitySymbols2D'
import { CabinetSymbols2D } from './CabinetSymbols2D'
import { FloorPlane2D } from './FloorPlane2D'

interface PlanLine {
  start: [number, number]
  end: [number, number]
}

function normalizeSpiralTurns(turns: number | undefined): number {
  const raw = turns ?? 1
  const clamped = Math.max(-5, Math.min(5, raw))
  if (Math.abs(clamped) < 0.1) return clamped < 0 ? -0.1 : 0.1
  return clamped
}

function arcPoints2D(center: [number, number], radius: number, startAngle: number, endAngle: number, segments: number): [number, number][] {
  const points: [number, number][] = []
  const sweep = endAngle - startAngle
  for (let i = 0; i <= segments; i += 1) {
    const t = i / Math.max(1, segments)
    const angle = startAngle + sweep * t
    points.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius])
  }
  return points
}

function isOnActiveLevel(element: PrototypeElement, activeLevelId: string): boolean {
  return !element.meta.level_id || element.meta.level_id === activeLevelId
}

function PlanLines() {
  const elements = useEntityStore((s) => s.elements)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const selectBody = useUIStore((s) => s.selectBody)
  const activeTool = useUIStore((s) => s.activeTool)
  const annotationDensity = useUIStore((s) => s.annotationDensity)
  const showMepText = useUIStore((s) => s.showMepText)
  const showFurnitureLabels = useUIStore((s) => s.showFurnitureLabels)
  const planSymbolProfile = useUIStore((s) => s.planSymbolProfile)
  const canSelect = activeTool === 'select'

  const walls = useMemo(
    () => Array.from(elements.values()).filter((e): e is WallElement => isWallElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const floors = useMemo(
    () => Array.from(elements.values()).filter((e): e is FloorElement => isFloorElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const foundationEls = useMemo(
    () => Array.from(elements.values()).filter((e): e is FoundationElement => isFoundationElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const stairs = useMemo(
    () => Array.from(elements.values()).filter((e): e is StairElement => isStairElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const columns = useMemo(
    () => Array.from(elements.values()).filter((e): e is ColumnElement => isColumnElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const beams = useMemo(
    () => Array.from(elements.values()).filter((e): e is BeamElement => isBeamElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const roofs = useMemo(
    () => Array.from(elements.values()).filter((e): e is RoofElement => isRoofElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const rooms = useMemo(
    () => Array.from(elements.values()).filter((e): e is RoomElement => isRoomElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const dimensions = useMemo(
    () => Array.from(elements.values()).filter((e): e is DimensionElement => isDimensionElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const textAnnotations = useMemo(
    () => Array.from(elements.values()).filter((e): e is TextAnnotationElement => isTextAnnotationElement(e) && isOnActiveLevel(e, activeLevelId)),
    [elements, activeLevelId],
  )

  const roomOverlays = useMemo(() => {
    return rooms.map((room) => {
      if (room.boundary.length < 3) return null
      const shape = new THREE.Shape()
      shape.moveTo(room.boundary[0][0], room.boundary[0][1])
      for (let i = 1; i < room.boundary.length; i++) {
        shape.lineTo(room.boundary[i][0], room.boundary[i][1])
      }
      shape.closePath()
      const centroid = polygonCentroid(room.boundary)
      const area = Math.abs(
        room.boundary.reduce((sum, pt, i) => {
          const next = room.boundary[(i + 1) % room.boundary.length]
          return sum + pt[0] * next[1] - next[0] * pt[1]
        }, 0) / 2,
      )
      return {
        id: room.meta.id,
        shape,
        centroid,
        name: resolveRoomName(room),
        color: room.color || '#8b5cf6',
        area,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rooms])

  const showElementTags = annotationDensity !== 'minimal'

  const roofLoops = useMemo(() => {
    return roofs
      .map((roof: RoofElement) => {
        if (roof.boundary.length < 3) return null
        const pts = roof.boundary.map((pt) => [pt[0], pt[1], 0] as [number, number, number])
        pts.push([roof.boundary[0][0], roof.boundary[0][1], 0])
        return { id: roof.meta.id, points: pts }
      })
      .filter((loop): loop is { id: string; points: [number, number, number][] } => loop !== null)
  }, [roofs])

  const wallById = useMemo(() => {
    const map = new Map<string, WallElement>()
    walls.forEach((wall) => map.set(wall.meta.id, wall))
    return map
  }, [walls])

  const wallLines = useMemo(() => {
    return buildVisibleWallOutlineLines(walls)
  }, [walls])

  const floorLoops = useMemo(() => {
    const fromFloors = floors
      .map((floor: FloorElement) => {
        if (floor.boundary.length < 3) return null
        const pts = floor.boundary.map((pt) => [pt[0], pt[1], 0] as [number, number, number])
        pts.push([floor.boundary[0][0], floor.boundary[0][1], 0])
        return { id: floor.meta.id, points: pts, typeId: floor.meta.type_id ?? null }
      })
      .filter((loop): loop is { id: string; points: [number, number, number][]; typeId: string | null } => loop !== null)
    const fromFoundations = foundationEls
      .map((f: FoundationElement) => {
        if (f.boundary.length < 3) return null
        const pts = f.boundary.map((pt) => [pt[0], pt[1], 0] as [number, number, number])
        pts.push([f.boundary[0][0], f.boundary[0][1], 0])
        return { id: f.meta.id, points: pts, typeId: 'foundation' as string | null }
      })
      .filter((loop): loop is { id: string; points: [number, number, number][]; typeId: string | null } => loop !== null)
    return [...fromFloors, ...fromFoundations]
  }, [floors, foundationEls])

  const stairPreview = useMemo(() => {
    const edgeLines: PlanLine[] = []
    const riserLines: PlanLine[] = []

    stairs.forEach((stair: StairElement) => {
      if ((stair.stair_type ?? 'straight') === 'spiral') {
        const center: [number, number] = [stair.start[0], stair.start[1]]
        const radiusVector: [number, number] = [stair.end[0] - center[0], stair.end[1] - center[1]]
        const outerRadius = Math.hypot(radiusVector[0], radiusVector[1])
        if (outerRadius < 1e-8) return

        const innerRadius = Math.max(0.05, outerRadius - stair.width)
        const startAngle = Math.atan2(radiusVector[1], radiusVector[0])
        const turns = normalizeSpiralTurns(stair.spiral_turns)
        const endAngle = startAngle + turns * Math.PI * 2
        const sweep = endAngle - startAngle
        const arcSegments = Math.max(24, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 96))
        const outerArc = arcPoints2D(center, outerRadius, startAngle, endAngle, arcSegments)
        const innerArc = arcPoints2D(center, innerRadius, startAngle, endAngle, arcSegments)

        for (let i = 0; i < outerArc.length - 1; i += 1) {
          edgeLines.push({ start: outerArc[i], end: outerArc[i + 1] })
        }
        for (let i = 0; i < innerArc.length - 1; i += 1) {
          edgeLines.push({ start: innerArc[i], end: innerArc[i + 1] })
        }
        edgeLines.push({ start: innerArc[0], end: outerArc[0] })
        edgeLines.push({ start: innerArc[innerArc.length - 1], end: outerArc[outerArc.length - 1] })

        const risers = Math.max(1, stair.risers)
        for (let i = 0; i <= risers; i += 1) {
          const t = i / risers
          const angle = startAngle + sweep * t
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          riserLines.push({
            start: [center[0] + cos * innerRadius, center[1] + sin * innerRadius],
            end: [center[0] + cos * outerRadius, center[1] + sin * outerRadius],
          })
        }
        return
      }

      const dx = stair.end[0] - stair.start[0]
      const dz = stair.end[1] - stair.start[1]
      const len = Math.hypot(dx, dz)
      if (len < 1e-8) return

      const dir: [number, number] = [dx / len, dz / len]
      const normal: [number, number] = [
        -dir[1] * (stair.width / 2),
        dir[0] * (stair.width / 2),
      ]

      const leftStart: [number, number] = [stair.start[0] + normal[0], stair.start[1] + normal[1]]
      const leftEnd: [number, number] = [stair.end[0] + normal[0], stair.end[1] + normal[1]]
      const rightStart: [number, number] = [stair.start[0] - normal[0], stair.start[1] - normal[1]]
      const rightEnd: [number, number] = [stair.end[0] - normal[0], stair.end[1] - normal[1]]

      edgeLines.push({ start: leftStart, end: leftEnd })
      edgeLines.push({ start: rightStart, end: rightEnd })
      edgeLines.push({ start: leftStart, end: rightStart })
      edgeLines.push({ start: leftEnd, end: rightEnd })

      const risers = Math.max(1, stair.risers)
      for (let i = 0; i <= risers; i += 1) {
        const t = i / risers
        const cx = stair.start[0] + dx * t
        const cz = stair.start[1] + dz * t
        riserLines.push({
          start: [cx + normal[0], cz + normal[1]],
          end: [cx - normal[0], cz - normal[1]],
        })
      }
    })

    return { edgeLines, riserLines }
  }, [stairs])

  const columnOverlay = useMemo(() => {
    const edges: PlanLine[] = []
    const crosses: PlanLine[] = []

    columns.forEach((col: ColumnElement) => {
      const hw = col.width / 2
      const hd = col.depth / 2
      const cx = col.center[0]
      const cy = col.center[1]

      // Rectangle edges
      edges.push({ start: [cx - hw, cy - hd], end: [cx + hw, cy - hd] })
      edges.push({ start: [cx + hw, cy - hd], end: [cx + hw, cy + hd] })
      edges.push({ start: [cx + hw, cy + hd], end: [cx - hw, cy + hd] })
      edges.push({ start: [cx - hw, cy + hd], end: [cx - hw, cy - hd] })

      // X cross-hatch
      crosses.push({ start: [cx - hw, cy - hd], end: [cx + hw, cy + hd] })
      crosses.push({ start: [cx + hw, cy - hd], end: [cx - hw, cy + hd] })
    })

    return { edges, crosses }
  }, [columns])

  return (
    <>
      {/* Room overlays (filled shapes with labels) */}
      {roomOverlays.map((room) => (
        <group key={`room-${room.id}`}>
          <mesh
            position={[0, 0, -0.01]}
            onClick={(e) => {
              if (!canSelect) return
              e.stopPropagation()
              selectBody(room.id)
            }}
          >
            <shapeGeometry args={[room.shape]} />
            <meshBasicMaterial color={room.color} transparent opacity={0.18} side={THREE.DoubleSide} />
          </mesh>
          <Line
            points={[
              ...room.shape.getPoints().map((p) => [p.x, p.y, 0] as [number, number, number]),
              [room.shape.getPoints()[0].x, room.shape.getPoints()[0].y, 0] as [number, number, number],
            ]}
            color={room.color}
            lineWidth={1.5}
          />
          <Text
            position={[room.centroid[0], room.centroid[1], 0.01]}
            fontSize={0.3}
            color={room.color}
            anchorX="center"
            anchorY="middle"
          >
            {`${room.name}\n${room.area.toFixed(1)} m\u00B2`}
          </Text>
        </group>
      ))}
      {wallLines.map((line, i) => (
        <Line
          key={`wall-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#c0c0d0"
          lineWidth={1.5}
        />
      ))}
      {floorLoops.map((loop) => {
        const isFoundation = loop.typeId === 'foundation'
        const isParking = loop.typeId === 'parking_lot'
        const color = isFoundation ? '#f59e0b' : isParking ? '#64748b' : '#4ade80'
        const isDashed = isFoundation || isParking
        return (
          <Line
            key={loop.id}
            points={loop.points}
            color={color}
            lineWidth={isFoundation ? 2 : 1.6}
            dashed={isDashed}
            dashSize={isDashed ? 0.18 : undefined}
            gapSize={isDashed ? 0.1 : undefined}
          />
        )
      })}
      {stairPreview.edgeLines.map((line, i) => (
        <Line
          key={`stair-edge-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#38bdf8"
          lineWidth={1.2}
        />
      ))}
      {stairPreview.riserLines.map((line, i) => (
        <Line
          key={`stair-riser-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#7dd3fc"
          lineWidth={0.9}
        />
      ))}
      {columnOverlay.edges.map((line, i) => (
        <Line
          key={`col-edge-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#9ca3af"
          lineWidth={2}
        />
      ))}
      {columnOverlay.crosses.map((line, i) => (
        <Line
          key={`col-cross-${i}`}
          points={[
            [line.start[0], line.start[1], 0],
            [line.end[0], line.end[1], 0],
          ]}
          color="#6b7280"
          lineWidth={1}
        />
      ))}
      {beams.map((beam: BeamElement) => (
        <Line
          key={`beam-${beam.meta.id}`}
          points={[
            [beam.start[0], beam.start[1], 0],
            [beam.end[0], beam.end[1], 0],
          ]}
          color="#78716c"
          lineWidth={1.5}
          dashed
          dashSize={0.15}
          gapSize={0.1}
        />
      ))}
      {roofLoops.map((loop) => (
        <Line
          key={`roof-${loop.id}`}
          points={loop.points}
          color="#b45309"
          lineWidth={1.6}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      ))}

      {/* Dimension lines */}
      {dimensions.map((dim) => (
        <DimensionLine2D key={dim.meta.id} dim={dim} lengthUnit={lengthUnit} />
      ))}

      {/* Text annotations */}
      {textAnnotations.map((ann) => (
        <Text
          key={ann.meta.id}
          position={[ann.position[0], ann.position[1], 0.01]}
          rotation={[0, 0, ann.rotation]}
          fontSize={ann.font_size}
          color="#38bdf8"
          anchorX="left"
          anchorY="bottom"
        >
          {ann.text}
        </Text>
      ))}

      {/* Element tags */}
      {showElementTags && walls.map((wall, i) => {
        const mx = (wall.start[0] + wall.end[0]) / 2
        const my = (wall.start[1] + wall.end[1]) / 2
        return (
          <Text
            key={`tag-wall-${wall.meta.id}`}
            position={[mx, my + 0.25, 0.02]}
            fontSize={0.12}
            color="#9ca3af"
            anchorX="center"
            anchorY="bottom"
          >
            {`W${String(i + 1).padStart(2, '0')}`}
          </Text>
        )
      })}

      {/* MEP symbols (electrical + plumbing) */}
      <MepSymbols2D
        annotationDensity={annotationDensity}
        showText={showMepText}
        symbolProfile={planSymbolProfile}
      />
      {/* Switching diagram lines (switch -> fixture connections) */}
      <SwitchingDiagram2D />
      {/* Furniture symbols */}
      <FurnitureSymbols2D
        annotationDensity={annotationDensity}
        showLabels={showFurnitureLabels}
        symbolProfile={planSymbolProfile}
      />
      {/* Cabinet symbols */}
      <CabinetSymbols2D
        annotationDensity={annotationDensity}
        showLabels={showFurnitureLabels}
        symbolProfile={planSymbolProfile}
      />
      {/* Door & window symbols (replaces manual overlay) */}
      <DoorWindowSymbols2D
        annotationDensity={annotationDensity}
        showLabels={showMepText}
        symbolProfile={planSymbolProfile}
      />
      {/* HVAC symbols */}
      <HvacSymbols2D
        annotationDensity={annotationDensity}
        showLabels={showMepText}
        symbolProfile={planSymbolProfile}
      />
      {/* Fire safety symbols */}
      <FireSafetySymbols2D
        annotationDensity={annotationDensity}
        showLabels={showMepText}
        symbolProfile={planSymbolProfile}
      />
      {/* Accessibility symbols */}
      <AccessibilitySymbols2D
        annotationDensity={annotationDensity}
        showLabels={showMepText}
        symbolProfile={planSymbolProfile}
      />
      {/* Site plan symbols */}
      <SiteSymbols2D />
    </>
  )
}

function DimensionLine2D({ dim, lengthUnit }: { dim: DimensionElement; lengthUnit: string }) {
  const { p1, p2, offset } = dim

  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null

  const nx = -dy / len
  const ny = dx / len

  const off1: [number, number, number] = [p1[0] + nx * offset, p1[1] + ny * offset, 0.01]
  const off2: [number, number, number] = [p2[0] + nx * offset, p2[1] + ny * offset, 0.01]

  const w1Start: [number, number, number] = [p1[0], p1[1], 0.01]
  const w1End: [number, number, number] = [p1[0] + nx * (offset + 0.1), p1[1] + ny * (offset + 0.1), 0.01]
  const w2Start: [number, number, number] = [p2[0], p2[1], 0.01]
  const w2End: [number, number, number] = [p2[0] + nx * (offset + 0.1), p2[1] + ny * (offset + 0.1), 0.01]

  const tickLen = 0.08
  const tdx = dx / len * tickLen
  const tdy = dy / len * tickLen

  const tick1a: [number, number, number] = [off1[0] + tdx + nx * tickLen, off1[1] + tdy + ny * tickLen, 0.01]
  const tick1b: [number, number, number] = [off1[0] + tdx - nx * tickLen, off1[1] + tdy - ny * tickLen, 0.01]
  const tick2a: [number, number, number] = [off2[0] - tdx + nx * tickLen, off2[1] - tdy + ny * tickLen, 0.01]
  const tick2b: [number, number, number] = [off2[0] - tdx - nx * tickLen, off2[1] - tdy - ny * tickLen, 0.01]

  const midX = (off1[0] + off2[0]) / 2
  const midY = (off1[1] + off2[1]) / 2
  const angle = Math.atan2(dy, dx)
  const displayText = dim.text_override || formatLength(len, lengthUnit as Parameters<typeof formatLength>[1])

  return (
    <>
      <Line points={[w1Start, w1End]} color="#ff6b6b" lineWidth={0.6} />
      <Line points={[w2Start, w2End]} color="#ff6b6b" lineWidth={0.6} />
      <Line points={[off1, off2]} color="#ff6b6b" lineWidth={1} />
      <Line points={[tick1a, off1, tick1b]} color="#ff6b6b" lineWidth={0.8} />
      <Line points={[tick2a, off2, tick2b]} color="#ff6b6b" lineWidth={0.8} />
      <Text
        position={[midX + nx * 0.05, midY + ny * 0.05, 0.02]}
        rotation={[0, 0, angle]}
        fontSize={0.12}
        color="#ff6b6b"
        anchorX="center"
        anchorY="bottom"
      >
        {displayText}
      </Text>
    </>
  )
}

interface Viewport2DProps {
  background: string
}

function Viewport2DScreenshotSync() {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    ;(window as any).__bettercad_capture_2d_screenshot = (): string => {
      gl.render(scene, camera)
      const dataUrl = gl.domElement.toDataURL('image/png')
      return dataUrl.replace(/^data:image\/png;base64,/, '')
    }
    return () => {
      delete (window as any).__bettercad_capture_2d_screenshot
    }
  }, [gl, scene, camera])

  return null
}

function Viewport2DInteractionLayer() {
  const { gl, camera } = useThree()
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const activeLevelElevation = useMemo(() => {
    const level = levels.find((candidate) => candidate.id === activeLevelId)
    return level?.elevation ?? 0
  }, [levels, activeLevelId])

  useEffect(() => {
    const canvas = gl.domElement

    const clearCursor = () => {
      setMeasurementCursor(null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        clearCursor()
        return
      }

      const ndc = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: 1 - ((event.clientY - rect.top) / rect.height) * 2,
      }
      const point = intersectPointerWithPlan(camera, ndc)

      if (!point) {
        clearCursor()
        return
      }

      setMeasurementCursor([point[0], activeLevelElevation, point[1]])
    }

    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', clearCursor)
    canvas.addEventListener('pointercancel', clearCursor)
    return () => {
      clearCursor()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', clearCursor)
      canvas.removeEventListener('pointercancel', clearCursor)
    }
  }, [activeLevelElevation, camera, gl, setMeasurementCursor])

  return null
}

export function Viewport2D({ background }: Viewport2DProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const selectBody = useUIStore((s) => s.selectBody)

  return (
    <Canvas
      orthographic
      camera={{
        position: [0, 0, 50],
        zoom: 40,
        near: 0.1,
        far: 1000,
        up: [0, 1, 0],
      }}
      onPointerMissed={() => {
        if (activeTool === 'select') {
          selectBody(null)
        }
      }}
    >
      <color attach="background" args={[background]} />
      <PlanLines />
      <MapControls enableRotate={false} screenSpacePanning makeDefault />
      <Viewport2DInteractionLayer />
      <Viewport2DScreenshotSync />
      <MeasurePlane2D />
      <PathMeasurePlane2D />
      <AreaMeasurePlane2D />
      <AngleMeasurePlane2D />
      <SpotElevationPlane2D />
      <DimensionPlane2D />
      <FloorPlane2D />
    </Canvas>
  )
}
