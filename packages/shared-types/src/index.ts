/**
 * Shared type definitions for BetterCAD packages.
 */

/** Unique identifier for a geometric body in the kernel. */
export type BodyId = string

/** Tessellated triangle mesh ready for rendering. */
export interface TessellatedMesh {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

/** Axis-aligned bounding box. */
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

/** A 2D point used in floor-plan sketching. */
export interface Point2D {
  x: number
  y: number
}

/** A 3D point. */
export interface Point3D {
  x: number
  y: number
  z: number
}
