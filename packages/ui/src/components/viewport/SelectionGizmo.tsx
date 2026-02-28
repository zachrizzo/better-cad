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
} from '../../stores/entity-store'
import type {
  PrototypeElement,
  WallElement,
  FloorElement,
  StairElement,
} from '../../services/kernel-bridge'
import { getKernel, type KernelBackend } from '../../services/kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

// --- helpers -----------------------------------------------------------

/** Get the scene-space (XZ) center of a movable element, or null if not movable. */
function getElementCenter(el: PrototypeElement): [number, number] | null {
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
    const mx = (el.start[0] + el.end[0]) / 2
    const my = (el.start[1] + el.end[1]) / 2
    return [mx, my]
  }
  return null
}

/** Get element vertical extent for gizmo arrow length scaling */
function getElementHeight(el: PrototypeElement): number {
  if (isWallElement(el)) return el.height
  if (isFloorElement(el)) return el.thickness
  if (isStairElement(el)) return el.total_height
  return 1
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
    axis: 'x' | 'z' | 'xz'
    startMouse: THREE.Vector2
    startCenter: [number, number]
  } | null>(null)

  const height = getElementHeight(element)
  const yPos = height / 2

  // Scene-space position: kernel x -> scene x, kernel y -> scene z
  const scenePos = useMemo(
    () => new THREE.Vector3(center[0], yPos, center[1]),
    [center, yPos],
  )

  // Raycasting plane for drag (Y = yPos horizontal plane)
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

  // Native pointer events for drag tracking on the canvas
  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging) return
      const hit = getPlaneIntersection(event)
      if (!hit || !groupRef.current) return

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
    [dragging, getPlaneIntersection, gl.domElement, commitMove],
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

  return (
    <group ref={groupRef} position={[scenePos.x, 0.02, scenePos.z]}>
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
    </group>
  )
}
