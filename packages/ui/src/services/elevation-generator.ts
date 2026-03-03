/**
 * Auto-elevation generator.
 *
 * Given a set of PrototypeElements and a cardinal direction, this service
 * projects the building geometry onto a 2D elevation plane and returns
 * outlines, fills, labels, and dimension annotations suitable for SVG
 * rendering via ElevationViewport2D.
 */

import type {
  DoorElement,
  PrototypeElement,
  RoofElement,
  WallElement,
  WindowElement,
} from './kernel-bridge'

// ── Public types ────────────────────────────────────────────────────────────

export type ElevationDirection = 'north' | 'south' | 'east' | 'west'

export interface ElevationConfig {
  direction: ElevationDirection
  elements: PrototypeElement[]
}

export interface ElevationOutline {
  x1: number
  y1: number
  x2: number
  y2: number
  lineweight: number
}

export interface ElevationFill {
  points: [number, number][]
  pattern: string
}

export interface ElevationLabel {
  x: number
  y: number
  text: string
  size: number
}

export interface ElevationDimension {
  p1: [number, number]
  p2: [number, number]
  offset: number
  text: string
}

export interface GeneratedElevation {
  direction: string
  outlines: ElevationOutline[]
  fills: ElevationFill[]
  labels: ElevationLabel[]
  dimensions: ElevationDimension[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWall(el: PrototypeElement): el is WallElement {
  return el.kind === 'wall'
}
function isDoor(el: PrototypeElement): el is DoorElement {
  return el.kind === 'door'
}
function isWindow(el: PrototypeElement): el is WindowElement {
  return el.kind === 'window'
}
function isRoof(el: PrototypeElement): el is RoofElement {
  return el.kind === 'roof'
}

/**
 * Project a world-space point onto the elevation view plane.
 *
 * The returned [u, v] correspond to:
 *   u = horizontal axis in the elevation image
 *   v = vertical axis (always the world Y / height axis in the kernel, mapped
 *       from the z coordinate for 3D, but since elements store plan-view
 *       coordinates, "v" corresponds to height/elevation).
 *
 * Conventions:
 *   north: camera at +Y looking toward -Y  => u = x, v = height
 *   south: camera at -Y looking toward +Y  => u = -x (mirrored), v = height
 *   east:  camera at +X looking toward -X  => u = -y (mirrored), v = height
 *   west:  camera at -X looking toward +X  => u = y, v = height
 *
 * For plan-view (XY) coordinates, we project onto the axis perpendicular to
 * the viewing direction.
 */
function projectU(direction: ElevationDirection, x: number, y: number): number {
  switch (direction) {
    case 'north':
      return x
    case 'south':
      return -x
    case 'east':
      return -y
    case 'west':
      return y
  }
}

/**
 * Determine the "depth" of a point along the viewing direction.
 * Used to decide which walls are visible (front-most) when sorting.
 *
 * north: looking from +Y toward -Y, depth = y (larger y = closer to camera)
 * south: looking from -Y toward +Y, depth = -y
 * east:  looking from +X toward -X, depth = x
 * west:  looking from -X toward +X, depth = -x
 */
export function elevationDepth(direction: ElevationDirection, x: number, y: number): number {
  switch (direction) {
    case 'north':
      return y
    case 'south':
      return -y
    case 'east':
      return x
    case 'west':
      return -x
  }
}

/**
 * Check whether a wall segment is facing toward the camera so it should be
 * drawn as a visible rectangle in the elevation.
 *
 * A wall aligned roughly perpendicular to the view direction is visible as a
 * rectangle; a wall parallel to the view direction appears as a thin edge.
 *
 * We return `true` if the wall is more perpendicular than parallel
 * (dot product of wall direction with the view-plane axis > threshold).
 */
function wallFacesCamera(
  direction: ElevationDirection,
  wall: WallElement,
): boolean {
  const dx = wall.end[0] - wall.start[0]
  const dy = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-8) return false

  // The "facing" axis is the U axis of the projection
  // For north/south the U axis is X, for east/west the U axis is Y
  const isHorizontalView = direction === 'north' || direction === 'south'
  const wallDirAlongU = isHorizontalView ? Math.abs(dx / len) : Math.abs(dy / len)

  return wallDirAlongU > 0.3 // > ~17 degrees from perpendicular
}

/**
 * Get the base elevation for a wall. If the wall has a level, we could look
 * it up, but since elements don't carry their level elevation directly in
 * the data we receive here, we default to 0.
 */
function getBaseElevation(_wall: WallElement): number {
  return 0
}

// ── Main generator ──────────────────────────────────────────────────────────

export function generateElevationFromElements(
  config: ElevationConfig,
): GeneratedElevation {
  const { direction, elements } = config

  const outlines: ElevationOutline[] = []
  const fills: ElevationFill[] = []
  const labels: ElevationLabel[] = []
  const dimensions: ElevationDimension[] = []

  const walls = elements.filter(isWall)
  const doors = elements.filter(isDoor)
  const windows = elements.filter(isWindow)
  const roofs = elements.filter(isRoof)

  // Build wall lookup
  const wallById = new Map<string, WallElement>()
  walls.forEach((w) => wallById.set(w.meta.id, w))

  // Track overall extent for dimension placement
  let minU = Infinity
  let maxU = -Infinity
  let maxHeight = 0

  // ── Walls ─────────────────────────────────────────────────────────────────
  for (const wall of walls) {
    if (!wallFacesCamera(direction, wall)) continue

    const u1 = projectU(direction, wall.start[0], wall.start[1])
    const u2 = projectU(direction, wall.end[0], wall.end[1])
    const uMin = Math.min(u1, u2)
    const uMax = Math.max(u1, u2)
    const baseElev = getBaseElevation(wall)
    const topElev = baseElev + wall.height

    minU = Math.min(minU, uMin)
    maxU = Math.max(maxU, uMax)
    maxHeight = Math.max(maxHeight, topElev)

    // Wall rectangle outline (4 edges)
    outlines.push({ x1: uMin, y1: baseElev, x2: uMax, y2: baseElev, lineweight: 2 }) // bottom
    outlines.push({ x1: uMin, y1: topElev, x2: uMax, y2: topElev, lineweight: 2 }) // top
    outlines.push({ x1: uMin, y1: baseElev, x2: uMin, y2: topElev, lineweight: 2 }) // left
    outlines.push({ x1: uMax, y1: baseElev, x2: uMax, y2: topElev, lineweight: 2 }) // right

    // Fill the wall face
    fills.push({
      points: [
        [uMin, baseElev],
        [uMax, baseElev],
        [uMax, topElev],
        [uMin, topElev],
      ],
      pattern: 'hatch-concrete',
    })
  }

  // ── Doors ─────────────────────────────────────────────────────────────────
  for (const door of doors) {
    const wall = wallById.get(door.wall_id)
    if (!wall) continue
    if (!wallFacesCamera(direction, wall)) continue

    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const cx = wall.start[0] + dx * door.position_along_wall
    const cy = wall.start[1] + dy * door.position_along_wall

    const uCenter = projectU(direction, cx, cy)
    const halfW = door.width / 2
    const baseElev = getBaseElevation(wall) + door.sill_height
    const topElev = baseElev + door.height

    // Door opening rectangle
    outlines.push({ x1: uCenter - halfW, y1: baseElev, x2: uCenter + halfW, y2: baseElev, lineweight: 1 })
    outlines.push({ x1: uCenter - halfW, y1: topElev, x2: uCenter + halfW, y2: topElev, lineweight: 1 })
    outlines.push({ x1: uCenter - halfW, y1: baseElev, x2: uCenter - halfW, y2: topElev, lineweight: 1 })
    outlines.push({ x1: uCenter + halfW, y1: baseElev, x2: uCenter + halfW, y2: topElev, lineweight: 1 })

    // Door panel line (diagonal to indicate swing)
    outlines.push({ x1: uCenter - halfW, y1: baseElev, x2: uCenter + halfW, y2: topElev, lineweight: 0.5 })

    labels.push({
      x: uCenter,
      y: topElev + 0.15,
      text: door.meta.name || 'Door',
      size: 0.12,
    })
  }

  // ── Windows ───────────────────────────────────────────────────────────────
  for (const win of windows) {
    const wall = wallById.get(win.wall_id)
    if (!wall) continue
    if (!wallFacesCamera(direction, wall)) continue

    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const cx = wall.start[0] + dx * win.position_along_wall
    const cy = wall.start[1] + dy * win.position_along_wall

    const uCenter = projectU(direction, cx, cy)
    const halfW = win.width / 2
    const baseElev = getBaseElevation(wall) + win.sill_height
    const topElev = baseElev + win.height

    // Window opening rectangle
    outlines.push({ x1: uCenter - halfW, y1: baseElev, x2: uCenter + halfW, y2: baseElev, lineweight: 1 })
    outlines.push({ x1: uCenter - halfW, y1: topElev, x2: uCenter + halfW, y2: topElev, lineweight: 1 })
    outlines.push({ x1: uCenter - halfW, y1: baseElev, x2: uCenter - halfW, y2: topElev, lineweight: 1 })
    outlines.push({ x1: uCenter + halfW, y1: baseElev, x2: uCenter + halfW, y2: topElev, lineweight: 1 })

    // Mullion cross (window glazing indicator)
    const midV = (baseElev + topElev) / 2
    outlines.push({ x1: uCenter - halfW, y1: midV, x2: uCenter + halfW, y2: midV, lineweight: 0.5 })
    outlines.push({ x1: uCenter, y1: baseElev, x2: uCenter, y2: topElev, lineweight: 0.5 })

    // Glass fill
    fills.push({
      points: [
        [uCenter - halfW, baseElev],
        [uCenter + halfW, baseElev],
        [uCenter + halfW, topElev],
        [uCenter - halfW, topElev],
      ],
      pattern: 'hatch-glass',
    })
  }

  // ── Roofs ─────────────────────────────────────────────────────────────────
  for (const roof of roofs) {
    if (roof.boundary.length < 3) continue

    const elevation = roof.elevation ?? maxHeight
    const roofTop = elevation + roof.thickness

    // Project boundary to get the horizontal extent visible in this elevation
    const projectedUs = roof.boundary.map((pt) => projectU(direction, pt[0], pt[1]))
    const roofMinU = Math.min(...projectedUs)
    const roofMaxU = Math.max(...projectedUs)

    minU = Math.min(minU, roofMinU)
    maxU = Math.max(maxU, roofMaxU)
    maxHeight = Math.max(maxHeight, roofTop)

    if (roof.roof_type === 'flat') {
      // Flat roof: single horizontal band
      outlines.push({ x1: roofMinU, y1: elevation, x2: roofMaxU, y2: elevation, lineweight: 2 })
      outlines.push({ x1: roofMinU, y1: roofTop, x2: roofMaxU, y2: roofTop, lineweight: 2 })
      outlines.push({ x1: roofMinU, y1: elevation, x2: roofMinU, y2: roofTop, lineweight: 1 })
      outlines.push({ x1: roofMaxU, y1: elevation, x2: roofMaxU, y2: roofTop, lineweight: 1 })
    } else if (roof.roof_type === 'gable' || roof.roof_type === 'shed') {
      // Simplified gable: triangle on top
      const midU = (roofMinU + roofMaxU) / 2
      const pitchRad = (roof.pitch_degrees * Math.PI) / 180
      const halfSpan = (roofMaxU - roofMinU) / 2
      const ridgeHeight = elevation + Math.tan(pitchRad) * halfSpan

      maxHeight = Math.max(maxHeight, ridgeHeight)

      if (roof.roof_type === 'gable') {
        // Left slope
        outlines.push({ x1: roofMinU, y1: elevation, x2: midU, y2: ridgeHeight, lineweight: 2 })
        // Right slope
        outlines.push({ x1: midU, y1: ridgeHeight, x2: roofMaxU, y2: elevation, lineweight: 2 })
      } else {
        // Shed: single slope from left to right
        outlines.push({ x1: roofMinU, y1: elevation, x2: roofMaxU, y2: ridgeHeight, lineweight: 2 })
        outlines.push({ x1: roofMaxU, y1: ridgeHeight, x2: roofMaxU, y2: elevation, lineweight: 1 })
      }

      // Eave lines
      outlines.push({ x1: roofMinU, y1: elevation, x2: roofMaxU, y2: elevation, lineweight: 1.5 })
    } else {
      // Hip or other: approximate as flat with eave line
      outlines.push({ x1: roofMinU, y1: elevation, x2: roofMaxU, y2: elevation, lineweight: 2 })
      outlines.push({ x1: roofMinU, y1: roofTop, x2: roofMaxU, y2: roofTop, lineweight: 2 })
    }
  }

  // ── Dimension annotations ─────────────────────────────────────────────────
  if (isFinite(minU) && isFinite(maxU) && maxHeight > 0) {
    // Overall building height dimension on the right side
    const dimOffset = 0.5
    dimensions.push({
      p1: [maxU + dimOffset, 0],
      p2: [maxU + dimOffset, maxHeight],
      offset: 0.3,
      text: `${maxHeight.toFixed(2)} m`,
    })

    // Ground line label
    labels.push({
      x: minU - 0.3,
      y: 0,
      text: '0.00',
      size: 0.1,
    })
  }

  return {
    direction,
    outlines,
    fills,
    labels,
    dimensions,
  }
}
