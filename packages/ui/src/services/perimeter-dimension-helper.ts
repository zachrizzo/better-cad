import type { KernelBackend, DimensionElement, PrototypeElement, WallElement } from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'

export interface PerimeterDimensionOptions {
  levelId?: string
  intermediateOffset: number
  overallOffset: number
}

/**
 * Auto-generate building perimeter dimension strings.
 * Creates intermediate segment dimensions at each wall break
 * plus overall dimensions for each side.
 */
export async function generatePerimeterDimensions(
  kernel: KernelBackend,
  elements: PrototypeElement[],
  options: PerimeterDimensionOptions,
): Promise<string[]> {
  const { levelId, intermediateOffset, overallOffset } = options

  const walls = elements.filter(
    (e): e is WallElement => e.kind === 'wall' && (!levelId || e.meta.level_id === levelId),
  )

  if (walls.length === 0) return []

  // Collect all wall endpoints
  const points: [number, number][] = []
  for (const w of walls) {
    points.push(w.start, w.end)
  }

  // Compute axis-aligned bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const createdIds: string[] = []
  const chainGroupId = `perim-${crypto.randomUUID()}`

  // Helper to collect wall endpoints along a side and create intermediate + overall dims
  const createSideDimensions = async (
    axis: 'x' | 'y',
    fixedValue: number,
    minVal: number,
    maxVal: number,
    offsetSign: number,
  ) => {
    // Collect unique points along this side
    const sidePoints: number[] = []
    const tolerance = 0.1

    for (const w of walls) {
      for (const pt of [w.start, w.end]) {
        const fixedAxis = axis === 'x' ? pt[1] : pt[0]
        const varAxis = axis === 'x' ? pt[0] : pt[1]
        if (Math.abs(fixedAxis - fixedValue) < tolerance) {
          if (!sidePoints.some((p) => Math.abs(p - varAxis) < tolerance)) {
            sidePoints.push(varAxis)
          }
        }
      }
    }

    sidePoints.sort((a, b) => a - b)

    if (sidePoints.length < 2) return

    // Intermediate segments
    for (let i = 0; i < sidePoints.length - 1; i++) {
      const p1: [number, number] = axis === 'x'
        ? [sidePoints[i], fixedValue]
        : [fixedValue, sidePoints[i]]
      const p2: [number, number] = axis === 'x'
        ? [sidePoints[i + 1], fixedValue]
        : [fixedValue, sidePoints[i + 1]]

      const dimId = `dim-perim-seg-${crypto.randomUUID()}`
      const dim: DimensionElement = {
        kind: 'dimension',
        meta: { id: dimId, name: 'Perim Segment', level_id: levelId },
        p1,
        p2,
        offset: intermediateOffset * offsetSign,
        chain_group_id: chainGroupId,
      }
      try {
        await kernel.createElement(dim)
        createdIds.push(dimId)
      } catch (err) {
        console.error('[BetterCAD] Failed to create perimeter segment dimension:', err)
      }
    }

    // Overall dimension
    const p1: [number, number] = axis === 'x'
      ? [sidePoints[0], fixedValue]
      : [fixedValue, sidePoints[0]]
    const p2: [number, number] = axis === 'x'
      ? [sidePoints[sidePoints.length - 1], fixedValue]
      : [fixedValue, sidePoints[sidePoints.length - 1]]

    const dimId = `dim-perim-ovr-${crypto.randomUUID()}`
    const dim: DimensionElement = {
      kind: 'dimension',
      meta: { id: dimId, name: 'Perim Overall', level_id: levelId },
      p1,
      p2,
      offset: overallOffset * offsetSign,
      chain_group_id: chainGroupId,
    }
    try {
      await kernel.createElement(dim)
      createdIds.push(dimId)
    } catch (err) {
      console.error('[BetterCAD] Failed to create perimeter overall dimension:', err)
    }
  }

  // Bottom side (minY, offset down)
  await createSideDimensions('x', minY, minX, maxX, -1)
  // Top side (maxY, offset up)
  await createSideDimensions('x', maxY, minX, maxX, 1)
  // Left side (minX, offset left)
  await createSideDimensions('y', minX, minY, maxY, -1)
  // Right side (maxX, offset right)
  await createSideDimensions('y', maxX, minY, maxY, 1)

  if (createdIds.length > 0) {
    await syncEntitiesAndRegenerateMeshes(kernel)
  }

  return createdIds
}
