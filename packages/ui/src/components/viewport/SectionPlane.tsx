import { useState, useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useUIStore } from '../../stores/ui-store'
import { useViewStore } from '../../stores/view-store'
import { snapPlanPoint, usePlanSnapPoints } from '../../hooks/usePlanSnapPoints'
import type { SavedView } from '../../stores/view-store'

/**
 * SectionPlane is the interactive tool for placing a section cut line.
 * Two clicks on the ground plane define the cut line. After placement,
 * a SavedView is created and activated.
 */
export function SectionPlane() {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const addView = useViewStore((s) => s.addView)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const snapPoints = usePlanSnapPoints()
  const { camera, raycaster, pointer } = useThree()

  const [firstPoint, setFirstPoint] = useState<[number, number] | null>(null)
  const [cursorPoint, setCursorPoint] = useState<[number, number] | null>(null)
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))

  const applySnap = useCallback((rawPoint: [number, number]): [number, number] => {
    return snapPlanPoint(rawPoint, snapPoints, snapEnabled, 0.3).point
  }, [snapEnabled, snapPoints])

  const getGroundIntersection = useCallback((): [number, number] | null => {
    raycaster.setFromCamera(pointer, camera)
    const target = new THREE.Vector3()
    const hit = raycaster.ray.intersectPlane(groundPlane.current, target)
    if (!hit) return null
    return applySnap([target.x, target.z])
  }, [applySnap, camera, raycaster, pointer])

  const handlePointerMove = useCallback(() => {
    if (activeTool !== 'section') return
    const pt = getGroundIntersection()
    if (pt) setCursorPoint(pt)
  }, [activeTool, getGroundIntersection])

  const handleClick = useCallback(() => {
    if (activeTool !== 'section') return
    const pt = getGroundIntersection()
    if (!pt) return

    if (!firstPoint) {
      setFirstPoint(pt)
      return
    }

    // Second click: create the section view
    const dx = pt[0] - firstPoint[0]
    const dz = pt[1] - firstPoint[1]
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 0.01) return // Too short

    // Compute viewing camera: orthographic looking perpendicular to cut line
    // Normal to line on XZ plane
    const nx = -dz / len
    const nz = dx / len
    const midX = (firstPoint[0] + pt[0]) / 2
    const midZ = (firstPoint[1] + pt[1]) / 2

    // Camera positioned along the normal, looking at the mid point
    const camDist = 20
    const cameraPosition: [number, number, number] = [
      midX + nx * camDist,
      5,
      midZ + nz * camDist,
    ]
    const cameraTarget: [number, number, number] = [midX, 5, midZ]

    const viewCount = useViewStore.getState().views.size
    const view: SavedView = {
      id: `section-${crypto.randomUUID()}`,
      name: `Section ${viewCount + 1}`,
      type: 'section',
      cutLineStart: firstPoint,
      cutLineEnd: pt,
      cameraPosition,
      cameraTarget,
    }

    addView(view)
    setActiveView(view.id)
    setFirstPoint(null)
    setCursorPoint(null)
    setActiveTool('select')
  }, [activeTool, firstPoint, getGroundIntersection, addView, setActiveView, setActiveTool])

  // Preview line while placing
  const previewLine = useMemo(() => {
    if (!firstPoint || !cursorPoint) return null
    return {
      start: [firstPoint[0], 0.05, firstPoint[1]] as [number, number, number],
      end: [cursorPoint[0], 0.05, cursorPoint[1]] as [number, number, number],
    }
  }, [firstPoint, cursorPoint])

  if (activeTool !== 'section') return null

  return (
    <>
      {/* Invisible ground plane for raycasting */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        visible={false}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* First point marker */}
      {firstPoint && (
        <mesh position={[firstPoint[0], 0.06, firstPoint[1]]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      )}

      {/* Preview cut line */}
      {previewLine && (
        <Line
          points={[previewLine.start, previewLine.end]}
          color="#f59e0b"
          lineWidth={2}
          dashed
          dashSize={0.3}
          gapSize={0.15}
        />
      )}

      {/* Direction arrow (perpendicular to line, shows viewing direction) */}
      {previewLine && firstPoint && cursorPoint && (() => {
        const dx = cursorPoint[0] - firstPoint[0]
        const dz = cursorPoint[1] - firstPoint[1]
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.01) return null
        const nx = -dz / len
        const nz = dx / len
        const midX = (firstPoint[0] + cursorPoint[0]) / 2
        const midZ = (firstPoint[1] + cursorPoint[1]) / 2
        const arrowLen = Math.min(len * 0.3, 1.5)
        return (
          <Line
            points={[
              [midX, 0.06, midZ],
              [midX + nx * arrowLen, 0.06, midZ + nz * arrowLen],
            ]}
            color="#f59e0b"
            lineWidth={3}
          />
        )
      })()}
    </>
  )
}
