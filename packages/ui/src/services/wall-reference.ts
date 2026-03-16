import type { WallElement } from './kernel-bridge'

export type WallFace = 'centerline' | 'stud_inner' | 'stud_outer' | 'finish_inner' | 'finish_outer'

export const WALL_FACE_LABELS: Record<WallFace, string> = {
  centerline: 'Centerline',
  stud_inner: 'Stud (Inner)',
  stud_outer: 'Stud (Outer)',
  finish_inner: 'Finish (Inner)',
  finish_outer: 'Finish (Outer)',
}

/**
 * Compute the perpendicular offset from the wall centerline to the given face.
 * Positive = toward the normal (inner side), negative = away.
 */
export function wallFaceOffset(
  wall: WallElement,
  face: WallFace,
  finishThickness = 0.013,
): number {
  const halfThick = wall.thickness / 2
  switch (face) {
    case 'centerline':
      return 0
    case 'stud_inner':
      return halfThick
    case 'stud_outer':
      return -halfThick
    case 'finish_inner':
      return halfThick + finishThickness
    case 'finish_outer':
      return -(halfThick + finishThickness)
  }
}

/**
 * Compute the wall's perpendicular normal (unit vector pointing to the "inner" side).
 * The inner side is the left-hand side when looking from start to end.
 */
export function wallNormal(wall: WallElement): [number, number] {
  const dx = wall.end[0] - wall.start[0]
  const dy = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return [0, 1]
  return [-dy / len, dx / len]
}

/**
 * Return a point on the specified face of the wall at parameter t (0 = start, 1 = end).
 */
export function pointOnWallFace(
  wall: WallElement,
  t: number,
  face: WallFace,
  finishThickness = 0.013,
): [number, number] {
  const offset = wallFaceOffset(wall, face, finishThickness)
  const [nx, ny] = wallNormal(wall)
  const cx = wall.start[0] + (wall.end[0] - wall.start[0]) * t
  const cy = wall.start[1] + (wall.end[1] - wall.start[1]) * t
  return [cx + nx * offset, cy + ny * offset]
}
