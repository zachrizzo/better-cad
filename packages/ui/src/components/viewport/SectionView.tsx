import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { SavedView } from '../../stores/view-store'

/**
 * SectionView applies a clipping plane to the renderer based on the active
 * section cut definition. The clipping plane is perpendicular to the ground
 * plane (XZ in Three.js / XY in kernel coords) and passes through the cut line.
 *
 * This component must be rendered inside a <Canvas>.
 */
interface SectionViewProps {
  view: SavedView
}

export function SectionView({ view }: SectionViewProps) {
  const { gl } = useThree()

  const clippingPlane = useMemo(() => {
    if (view.type !== 'section' || !view.cutLineStart || !view.cutLineEnd) return null

    // Cut line is defined in kernel XY which maps to Three.js XZ
    const sx = view.cutLineStart[0]
    const sz = view.cutLineStart[1]
    const ex = view.cutLineEnd[0]
    const ez = view.cutLineEnd[1]

    // Direction along the cut line (on XZ plane)
    const dx = ex - sx
    const dz = ez - sz
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 1e-8) return null

    // Normal perpendicular to the cut line on XZ plane (pointing toward the viewing side)
    // The viewing direction is to the "right" of the cut line direction
    const nx = -dz / len
    const nz = dx / len

    // Plane normal in 3D (Y is up in Three.js)
    const normal = new THREE.Vector3(nx, 0, nz)

    // Plane passes through the midpoint of the cut line
    const midX = (sx + ex) / 2
    const midZ = (sz + ez) / 2
    const point = new THREE.Vector3(midX, 0, midZ)

    // constant = -normal.dot(point)
    const constant = -normal.dot(point)

    return new THREE.Plane(normal, constant)
  }, [view])

  useEffect(() => {
    if (!clippingPlane) {
      gl.clippingPlanes = []
      return
    }

    gl.clippingPlanes = [clippingPlane]
    gl.localClippingEnabled = true

    return () => {
      gl.clippingPlanes = []
    }
  }, [gl, clippingPlane])

  return null
}

/**
 * SectionCutLine renders a visual representation of the section cut line
 * in the 3D viewport as a dashed line for reference.
 */
interface SectionCutLineProps {
  view: SavedView
}

export function SectionCutLine({ view }: SectionCutLineProps) {
  if (view.type !== 'section' || !view.cutLineStart || !view.cutLineEnd) return null

  const sx = view.cutLineStart[0]
  const sz = view.cutLineStart[1]
  const ex = view.cutLineEnd[0]
  const ez = view.cutLineEnd[1]

  // Extend the line a bit beyond for visibility
  const dx = ex - sx
  const dz = ez - sz
  const len = Math.sqrt(dx * dx + dz * dz)
  const ext = len * 0.3
  const ndx = dx / len
  const ndz = dz / len

  const points = useMemo(
    () =>
      [
        [sx - ndx * ext, 0.05, sz - ndz * ext],
        [ex + ndx * ext, 0.05, ez + ndz * ext],
      ] as [number, number, number][],
    [sx, sz, ex, ez, ndx, ndz, ext],
  )

  return (
    <Line
      points={points}
      color="#f59e0b"
      lineWidth={2}
      dashed
      dashSize={0.3}
      gapSize={0.15}
    />
  )
}
