import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'
import {
  useEntityStore,
  isWallElement,
  isFloorElement,
  isStairElement,
  isColumnElement,
  isBeamElement,
  isRoofElement,
  isFoundationElement,
  isDoorElement,
  isWindowElement,
  isFurnitureElement,
  isPlumbingElement,
  isElectricalElement,
  isHvacElement,
  isFireSafetyElement,
  isAccessibilityElement,
  isCabinetElement,
} from '../../stores/entity-store'
import type {
  PrototypeElement,
  WallElement,
  FloorElement,
  StairElement,
  ColumnElement,
  BeamElement,
  RoofElement,
  FoundationElement,
  FurnitureElement,
  PlumbingElement,
  ElectricalElement,
  HvacElement,
  FireSafetyElement,
  AccessibilityElement,
  CabinetElement,
} from '../../services/kernel-bridge'
import { getKernel, type KernelBackend } from '../../services/kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

// --- helpers -----------------------------------------------------------

/** Rotate a 2D point around a center by a given angle (radians). */
function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number,
): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = px - cx
  const dy = py - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

/** Get the scene-space (XZ) center of a movable element, or null if not movable. */
function getElementCenter(el: PrototypeElement): [number, number] | null {
  // Door/Window: wall-hosted, they move with their wall — not independently movable
  if (isDoorElement(el) || isWindowElement(el)) return null

  if (isWallElement(el)) {
    const mx = (el.start[0] + el.end[0]) / 2
    const my = (el.start[1] + el.end[1]) / 2
    return [mx, my] // kernel XY -> scene XZ
  }
  if (isFloorElement(el)) {
    if (el.boundary.length === 0) return null
    let sx = 0
    let sy = 0
    for (const [x, y] of el.boundary) {
      sx += x
      sy += y
    }
    return [sx / el.boundary.length, sy / el.boundary.length]
  }
  if (isStairElement(el)) {
    if ((el.stair_type ?? 'straight') === 'spiral') {
      return [el.start[0], el.start[1]]
    }
    const mx = (el.start[0] + el.end[0]) / 2
    const my = (el.start[1] + el.end[1]) / 2
    return [mx, my]
  }
  if (isColumnElement(el)) {
    return [el.center[0], el.center[1]]
  }
  if (isBeamElement(el)) {
    return [(el.start[0] + el.end[0]) / 2, (el.start[1] + el.end[1]) / 2]
  }
  if (isRoofElement(el)) {
    if (el.boundary.length === 0) return null
    let sx = 0
    let sy = 0
    for (const [x, y] of el.boundary) {
      sx += x
      sy += y
    }
    return [sx / el.boundary.length, sy / el.boundary.length]
  }
  if (isFoundationElement(el)) {
    const f = el as FoundationElement
    if (f.boundary.length === 0) return null
    let sx = 0
    let sy = 0
    for (const [x, y] of f.boundary) {
      sx += x
      sy += y
    }
    return [sx / f.boundary.length, sy / f.boundary.length]
  }
  // Parametric placement elements — all have position: [x, y]
  if (isFurnitureElement(el)) return [el.position[0], el.position[1]]
  if (isPlumbingElement(el)) return [el.position[0], el.position[1]]
  if (isElectricalElement(el)) return [el.position[0], el.position[1]]
  if (isHvacElement(el)) return [el.position[0], el.position[1]]
  if (isFireSafetyElement(el)) return [el.position[0], el.position[1]]
  if (isAccessibilityElement(el)) return [el.position[0], el.position[1]]
  if (isCabinetElement(el)) return [el.position[0], el.position[1]]
  return null
}

/** Get element vertical extent for gizmo arrow length scaling */
function getElementHeight(el: PrototypeElement): number {
  if (isWallElement(el)) return el.height
  if (isFloorElement(el)) return el.thickness
  if (isStairElement(el)) return el.total_height
  if (isColumnElement(el)) return el.height
  if (isBeamElement(el)) return el.depth
  if (isRoofElement(el)) return el.thickness
  if (isFoundationElement(el)) return (el as FoundationElement).thickness
  if (isFurnitureElement(el)) return 0.75
  if (isPlumbingElement(el)) return 0.85
  if (isElectricalElement(el)) return 0.3
  if (isHvacElement(el)) return 0.25
  if (isFireSafetyElement(el)) return 0.5
  if (isAccessibilityElement(el)) return 0.5
  if (isCabinetElement(el)) return (el as CabinetElement).height
  return 1
}

/** Whether this element type supports rotation (columns are symmetric, so no rotation needed) */
function supportsRotation(el: PrototypeElement): boolean {
  return (
    isWallElement(el) ||
    isFloorElement(el) ||
    isStairElement(el) ||
    isBeamElement(el) ||
    isRoofElement(el) ||
    isFoundationElement(el) ||
    isFurnitureElement(el) ||
    isPlumbingElement(el) ||
    isHvacElement(el) ||
    isAccessibilityElement(el) ||
    isCabinetElement(el)
  )
}

// --- kernel singleton for async ops ------------------------------------

let _kernelP: Promise<KernelBackend> | null = null
function cachedKernel(): Promise<KernelBackend> {
  if (!_kernelP) _kernelP = getKernel()
  return _kernelP
}

// --- constants ---------------------------------------------------------

const ARROW_LENGTH = 1.2
const ARROW_HEAD = 0.15
const ARROW_THICKNESS = 3
const CENTER_BOX_SIZE = 0.18
const ROTATION_RING_RADIUS = 1.5
const ROTATION_RING_TUBE = 0.03

// --- component ---------------------------------------------------------

export function SelectionGizmo() {
  const selectedBodyId = useUIStore((s) => s.selectedBodyId)
  const activeTool = useUIStore((s) => s.activeTool)
  const elements = useEntityStore((s) => s.elements)

  const element = selectedBodyId ? elements.get(selectedBodyId) ?? null : null
  const center = element ? getElementCenter(element) : null

  if (activeTool !== 'select' || !center || !element) return null

  return <GizmoInner element={element} center={center} />
}

// Split into inner component so hooks are always called at top level inside it
function GizmoInner({
  element,
  center,
}: {
  element: PrototypeElement
  center: [number, number]
}) {
  const { camera, gl } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  // Drag state
  const [dragging, setDragging] = useState<{
    axis: 'x' | 'z' | 'xz' | 'rotate'
    startMouse: THREE.Vector2
    startCenter: [number, number]
  } | null>(null)

  // Rotation tracking
  const rotateStartAngle = useRef<number>(0)

  const height = getElementHeight(element)
  const yPos = height / 2

  // Scene-space position: kernel x -> scene x, kernel y -> scene z
  const scenePos = useMemo(
    () => new THREE.Vector3(center[0], yPos, center[1]),
    [center, yPos],
  )

  // Raycasting plane for drag (Y = 0 horizontal plane)
  const dragPlane = useMemo(() => {
    const plane = new THREE.Plane()
    plane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
    )
    return plane
  }, [])

  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const getPlaneIntersection = useCallback(
    (event: PointerEvent): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const target = new THREE.Vector3()
      const hit = raycaster.ray.intersectPlane(dragPlane, target)
      return hit ? target : null
    },
    [camera, dragPlane, gl.domElement, raycaster],
  )

  // ---- drag handlers --------------------------------------------------

  const dragOrigin = useRef<THREE.Vector3 | null>(null)

  const handlePointerDown = useCallback(
    (axis: 'x' | 'z' | 'xz') => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      ;(e.nativeEvent as PointerEvent).stopPropagation?.()

      const hit = getPlaneIntersection(e.nativeEvent)
      if (!hit) return

      dragOrigin.current = hit.clone()
      setDragging({
        axis,
        startMouse: new THREE.Vector2(hit.x, hit.z),
        startCenter: [center[0], center[1]],
      })

      // Capture pointer for smooth dragging
      gl.domElement.setPointerCapture(e.nativeEvent.pointerId)
    },
    [center, getPlaneIntersection, gl.domElement],
  )

  const handleRotatePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      ;(e.nativeEvent as PointerEvent).stopPropagation?.()

      const hit = getPlaneIntersection(e.nativeEvent)
      if (!hit) return

      // Compute the starting angle from gizmo center to the hit point
      const dx = hit.x - center[0]
      const dz = hit.z - center[1]
      rotateStartAngle.current = Math.atan2(dz, dx)

      dragOrigin.current = hit.clone()
      setDragging({
        axis: 'rotate',
        startMouse: new THREE.Vector2(hit.x, hit.z),
        startCenter: [center[0], center[1]],
      })

      gl.domElement.setPointerCapture(e.nativeEvent.pointerId)
    },
    [center, getPlaneIntersection, gl.domElement],
  )

  const commitMove = useCallback(
    async (deltaX: number, deltaZ: number) => {
      // deltaX/deltaZ are in scene space; scene.x = kernel.x, scene.z = kernel.y
      const kernelDx = deltaX
      const kernelDy = deltaZ

      try {
        const kernel = await cachedKernel()
        const store = useEntityStore.getState()
        const el = store.elements.get(element.meta.id)
        if (!el) return

        let updated: PrototypeElement | null = null

        if (isWallElement(el)) {
          const w = el as WallElement
          updated = {
            ...w,
            start: [w.start[0] + kernelDx, w.start[1] + kernelDy] as [number, number],
            end: [w.end[0] + kernelDx, w.end[1] + kernelDy] as [number, number],
          }
        } else if (isFloorElement(el)) {
          const f = el as FloorElement
          updated = {
            ...f,
            boundary: f.boundary.map(
              ([x, y]) => [x + kernelDx, y + kernelDy] as [number, number],
            ),
          }
        } else if (isStairElement(el)) {
          const s = el as StairElement
          updated = {
            ...s,
            start: [s.start[0] + kernelDx, s.start[1] + kernelDy] as [number, number],
            end: [s.end[0] + kernelDx, s.end[1] + kernelDy] as [number, number],
          }
        } else if (isColumnElement(el)) {
          const c = el as ColumnElement
          updated = {
            ...c,
            center: [c.center[0] + kernelDx, c.center[1] + kernelDy] as [number, number],
          }
        } else if (isBeamElement(el)) {
          const b = el as BeamElement
          updated = {
            ...b,
            start: [b.start[0] + kernelDx, b.start[1] + kernelDy, b.start[2]] as [number, number, number],
            end: [b.end[0] + kernelDx, b.end[1] + kernelDy, b.end[2]] as [number, number, number],
          }
        } else if (isRoofElement(el)) {
          const r = el as RoofElement
          updated = {
            ...r,
            boundary: r.boundary.map(
              ([x, y]) => [x + kernelDx, y + kernelDy] as [number, number],
            ),
          }
        } else if (isFoundationElement(el)) {
          const f = el as FoundationElement
          updated = {
            ...f,
            boundary: f.boundary.map(
              ([x, y]) => [x + kernelDx, y + kernelDy] as [number, number],
            ),
          }
        } else if (
          isFurnitureElement(el) ||
          isPlumbingElement(el) ||
          isElectricalElement(el) ||
          isHvacElement(el) ||
          isFireSafetyElement(el) ||
          isAccessibilityElement(el) ||
          isCabinetElement(el)
        ) {
          // All placement elements have position: [x, y]
          const pos = (el as FurnitureElement | PlumbingElement | ElectricalElement | HvacElement | FireSafetyElement | AccessibilityElement | CabinetElement).position
          updated = {
            ...el,
            position: [pos[0] + kernelDx, pos[1] + kernelDy] as [number, number],
          }
        }

        if (!updated) return

        await kernel.updateElement(element.meta.id, updated)
        store.upsertElement(updated, 'update')
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Move failed:', err)
      }
    },
    [element.meta.id],
  )

  const commitRotation = useCallback(
    async (angle: number) => {
      try {
        const kernel = await cachedKernel()
        const store = useEntityStore.getState()
        const el = store.elements.get(element.meta.id)
        if (!el) return

        // Get the kernel-space center to rotate around
        const c = getElementCenter(el)
        if (!c) return
        const [cx, cy] = c

        let updated: PrototypeElement | null = null

        if (isWallElement(el)) {
          const w = el as WallElement
          updated = {
            ...w,
            start: rotatePoint(w.start[0], w.start[1], cx, cy, angle),
            end: rotatePoint(w.end[0], w.end[1], cx, cy, angle),
          }
        } else if (isFloorElement(el)) {
          const f = el as FloorElement
          updated = {
            ...f,
            boundary: f.boundary.map(([x, y]) => rotatePoint(x, y, cx, cy, angle)),
          }
        } else if (isStairElement(el)) {
          const s = el as StairElement
          updated = {
            ...s,
            start: rotatePoint(s.start[0], s.start[1], cx, cy, angle),
            end: rotatePoint(s.end[0], s.end[1], cx, cy, angle),
          }
        } else if (isBeamElement(el)) {
          const b = el as BeamElement
          const [nx, ny] = rotatePoint(b.start[0], b.start[1], cx, cy, angle)
          const [ex, ey] = rotatePoint(b.end[0], b.end[1], cx, cy, angle)
          updated = {
            ...b,
            start: [nx, ny, b.start[2]] as [number, number, number],
            end: [ex, ey, b.end[2]] as [number, number, number],
          }
        } else if (isRoofElement(el)) {
          const r = el as RoofElement
          updated = {
            ...r,
            boundary: r.boundary.map(([x, y]) => rotatePoint(x, y, cx, cy, angle)),
          }
        } else if (isFoundationElement(el)) {
          const f = el as FoundationElement
          updated = {
            ...f,
            boundary: f.boundary.map(([x, y]) => rotatePoint(x, y, cx, cy, angle)),
          }
        } else if (
          isFurnitureElement(el) ||
          isPlumbingElement(el) ||
          isElectricalElement(el) ||
          isHvacElement(el) ||
          isFireSafetyElement(el) ||
          isAccessibilityElement(el) ||
          isCabinetElement(el)
        ) {
          // For placement elements, rotation is a single number (additive)
          const currentRot = (el as FurnitureElement | PlumbingElement | ElectricalElement | HvacElement | FireSafetyElement | AccessibilityElement | CabinetElement).rotation
          updated = {
            ...el,
            rotation: currentRot + angle,
          }
        }

        if (!updated) return

        await kernel.updateElement(element.meta.id, updated)
        store.upsertElement(updated, 'update')
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Rotate failed:', err)
      }
    },
    [element.meta.id],
  )

  // Native pointer events for drag tracking on the canvas
  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging) return
      const hit = getPlaneIntersection(event)
      if (!hit || !groupRef.current) return

      if (dragging.axis === 'rotate') {
        // Visual feedback: rotate the gizmo group
        const dx = hit.x - center[0]
        const dz = hit.z - center[1]
        const currentAngle = Math.atan2(dz, dx)
        const deltaAngle = currentAngle - rotateStartAngle.current
        groupRef.current.rotation.set(0, -deltaAngle, 0)
        return
      }

      let dx = hit.x - (dragOrigin.current?.x ?? hit.x)
      let dz = hit.z - (dragOrigin.current?.z ?? hit.z)

      if (dragging.axis === 'x') dz = 0
      if (dragging.axis === 'z') dx = 0

      // Live visual feedback: move the gizmo group
      groupRef.current.position.set(
        center[0] + dx,
        scenePos.y,
        center[1] + dz,
      )
    },
    [dragging, center, scenePos.y, getPlaneIntersection],
  )

  const handleCanvasPointerUp = useCallback(
    (event: PointerEvent) => {
      if (!dragging) return
      gl.domElement.releasePointerCapture(event.pointerId)

      if (dragging.axis === 'rotate') {
        const hit = getPlaneIntersection(event)
        if (hit) {
          const dx = hit.x - center[0]
          const dz = hit.z - center[1]
          const currentAngle = Math.atan2(dz, dx)
          const deltaAngle = currentAngle - rotateStartAngle.current
          // In scene space, rotation around Y axis. Convert to kernel XY rotation.
          // Scene X = kernel X, Scene Z = kernel Y.
          // A scene-space angle delta around Y maps to the same angle delta in kernel XY.
          if (Math.abs(deltaAngle) > 0.005) {
            void commitRotation(deltaAngle)
          }
        }
        // Reset visual rotation
        if (groupRef.current) {
          groupRef.current.rotation.set(0, 0, 0)
        }
        setDragging(null)
        dragOrigin.current = null
        return
      }

      const hit = getPlaneIntersection(event)
      if (hit && dragOrigin.current) {
        let dx = hit.x - dragOrigin.current.x
        let dz = hit.z - dragOrigin.current.z
        if (dragging.axis === 'x') dz = 0
        if (dragging.axis === 'z') dx = 0

        if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
          void commitMove(dx, dz)
        }
      }

      setDragging(null)
      dragOrigin.current = null
    },
    [dragging, center, getPlaneIntersection, gl.domElement, commitMove, commitRotation],
  )

  // Attach native events on canvas while dragging
  useEffect(() => {
    if (!dragging) return
    const canvas = gl.domElement
    canvas.addEventListener('pointermove', handleCanvasPointerMove)
    canvas.addEventListener('pointerup', handleCanvasPointerUp)
    return () => {
      canvas.removeEventListener('pointermove', handleCanvasPointerMove)
      canvas.removeEventListener('pointerup', handleCanvasPointerUp)
    }
  }, [dragging, gl.domElement, handleCanvasPointerMove, handleCanvasPointerUp])

  // Arrow geometries
  const xColor = dragging?.axis === 'x' ? '#ff6666' : '#ff3333'
  const zColor = dragging?.axis === 'z' ? '#6666ff' : '#3333ff'
  const centerColor = dragging?.axis === 'xz' ? '#ffff66' : '#ffcc00'
  const rotateColor = dragging?.axis === 'rotate' ? '#ffdd44' : '#ffaa00'
  const showRotation = supportsRotation(element)

  return (
    <group ref={groupRef} position={[scenePos.x, 0.02, scenePos.z]}>
      {/* Ground circle indicator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 0.92, 48]} />
        <meshBasicMaterial color="#888888" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* X axis arrow (red) */}
      <group>
        <Line
          points={[
            [0, 0, 0],
            [ARROW_LENGTH, 0, 0],
          ]}
          color={xColor}
          lineWidth={ARROW_THICKNESS}
        />
        {/* Arrowhead */}
        <mesh
          position={[ARROW_LENGTH, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          onPointerDown={handlePointerDown('x')}
        >
          <coneGeometry args={[ARROW_HEAD, ARROW_HEAD * 2, 8]} />
          <meshStandardMaterial color={xColor} />
        </mesh>
        {/* Invisible wider hit area for X arrow shaft */}
        <mesh
          position={[ARROW_LENGTH / 2, 0, 0]}
          onPointerDown={handlePointerDown('x')}
        >
          <boxGeometry args={[ARROW_LENGTH, 0.15, 0.15]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>

      {/* Z axis arrow (blue) — scene Z = kernel Y */}
      <group>
        <Line
          points={[
            [0, 0, 0],
            [0, 0, ARROW_LENGTH],
          ]}
          color={zColor}
          lineWidth={ARROW_THICKNESS}
        />
        <mesh
          position={[0, 0, ARROW_LENGTH]}
          rotation={[Math.PI / 2, 0, 0]}
          onPointerDown={handlePointerDown('z')}
        >
          <coneGeometry args={[ARROW_HEAD, ARROW_HEAD * 2, 8]} />
          <meshStandardMaterial color={zColor} />
        </mesh>
        <mesh
          position={[0, 0, ARROW_LENGTH / 2]}
          onPointerDown={handlePointerDown('z')}
        >
          <boxGeometry args={[0.15, 0.15, ARROW_LENGTH]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>

      {/* Center box (yellow) — free XZ drag */}
      <mesh onPointerDown={handlePointerDown('xz')}>
        <boxGeometry args={[CENTER_BOX_SIZE, CENTER_BOX_SIZE, CENTER_BOX_SIZE]} />
        <meshStandardMaterial color={centerColor} />
      </mesh>

      {/* XZ quadrant indicator */}
      <mesh
        position={[CENTER_BOX_SIZE * 1.5, 0, CENTER_BOX_SIZE * 1.5]}
        onPointerDown={handlePointerDown('xz')}
      >
        <planeGeometry args={[CENTER_BOX_SIZE * 2, CENTER_BOX_SIZE * 2]} />
        <meshBasicMaterial
          color={centerColor}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Rotation ring (orange torus) — only for rotatable elements */}
      {showRotation && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={handleRotatePointerDown}>
          <torusGeometry args={[ROTATION_RING_RADIUS, ROTATION_RING_TUBE, 8, 48]} />
          <meshBasicMaterial color={rotateColor} transparent opacity={0.6} />
        </mesh>
      )}
      {/* Invisible wider hit area for rotation ring */}
      {showRotation && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={handleRotatePointerDown}>
          <torusGeometry args={[ROTATION_RING_RADIUS, ROTATION_RING_TUBE * 4, 8, 48]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
    </group>
  )
}
