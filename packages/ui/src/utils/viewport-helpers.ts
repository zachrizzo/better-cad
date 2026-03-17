import type { ThreeEvent } from '@react-three/fiber'

export type ViewportMode = '2d' | '3d'

type Point2 = [number, number]

/** Z-depth for 2D tool overlays */
export const PLANE_2D_Z = 0.05

/**
 * Extract [x, y] plan coordinates from a Three.js pointer event.
 * In 3D the drawing plane is XZ (Y is elevation), in 2D it's XY (Z is depth).
 */
export function extractPlanPoint(e: ThreeEvent<PointerEvent>, mode: ViewportMode): Point2 {
  return mode === '3d' ? [e.point.x, e.point.z] : [e.point.x, e.point.y]
}

/**
 * Convert a plan-space point to a world-space [x, y, z] for rendering.
 * @param pt   Plan coordinate [x, y] where y is the "depth" axis in plan view
 * @param mode Which viewport the point will be rendered in
 * @param elevation Active level elevation (used in 3D for Y position)
 * @param zOffset Additional offset along the "up" axis (Y in 3D, Z in 2D)
 */
export function toWorldPosition(
  pt: Point2,
  mode: ViewportMode,
  elevation: number,
  zOffset = 0,
): [number, number, number] {
  return mode === '3d'
    ? [pt[0], elevation + zOffset, pt[1]]
    : [pt[0], pt[1], PLANE_2D_Z + zOffset]
}

/**
 * Props for the invisible interaction plane mesh.
 */
export function interactionPlaneProps(
  mode: ViewportMode,
  elevation: number,
): { position: [number, number, number]; rotation: [number, number, number] } {
  return mode === '3d'
    ? { position: [0, elevation, 0], rotation: [-Math.PI / 2, 0, 0] }
    : { position: [0, 0, PLANE_2D_Z], rotation: [0, 0, 0] }
}

/**
 * Build a closed rectangle outline in world-space for rendering.
 */
export function rectOutlinePoints(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  mode: ViewportMode,
  elevation: number,
  zOffset = 0.01,
): [number, number, number][] {
  const corners: Point2[] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
    [minX, minZ],
  ]
  return corners.map((pt) => toWorldPosition(pt, mode, elevation, zOffset))
}

/**
 * Rotation for a flat preview mesh (e.g. rectangle fill).
 * In 3D the plane must be rotated to lie on XZ; in 2D no rotation needed.
 */
export function previewPlaneRotation(mode: ViewportMode): [number, number, number] {
  return mode === '3d' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]
}
