import type { DimensionElement } from '../services/kernel-bridge'

const DEFAULT_BASE_OFFSET = 0.5
const DEFAULT_SPACING = 0.3

/**
 * Auto-space a set of parallel dimension strings so they don't overlap.
 * Groups dimensions by `chain_group_id` first; ungrouped dimensions are
 * grouped by parallel direction (within tolerance).
 *
 * Returns new DimensionElement copies with updated offset values.
 */
export function autoSpaceDimensions(
  dimensions: DimensionElement[],
  baseOffset = DEFAULT_BASE_OFFSET,
  spacing = DEFAULT_SPACING,
): DimensionElement[] {
  // Group by chain_group_id
  const groups = new Map<string, DimensionElement[]>()
  const ungrouped: DimensionElement[] = []

  for (const dim of dimensions) {
    const gid = dim.chain_group_id
    if (gid) {
      const group = groups.get(gid) ?? []
      group.push(dim)
      groups.set(gid, group)
    } else {
      ungrouped.push(dim)
    }
  }

  // Group ungrouped dimensions by parallel direction
  const parallelGroups = groupByParallelDirection(ungrouped)
  for (const pg of parallelGroups) {
    const gid = `auto-${pg[0]?.meta.id ?? 'x'}`
    groups.set(gid, pg)
  }

  // Apply spacing within each group
  const results: DimensionElement[] = []
  for (const [, group] of groups) {
    if (group.length <= 1) {
      results.push(...group)
      continue
    }

    // Sort by current offset (or by position along perp)
    const sorted = [...group].sort((a, b) => a.offset - b.offset)

    for (let i = 0; i < sorted.length; i++) {
      results.push({
        ...sorted[i],
        offset: baseOffset + i * spacing,
      })
    }
  }

  return results
}

/**
 * Group dimensions whose p1→p2 directions are parallel (within 5° tolerance).
 */
function groupByParallelDirection(dims: DimensionElement[]): DimensionElement[][] {
  const ANGLE_TOLERANCE = (5 * Math.PI) / 180
  const groups: DimensionElement[][] = []

  for (const dim of dims) {
    const angle = normalizeAngle(
      Math.atan2(dim.p2[1] - dim.p1[1], dim.p2[0] - dim.p1[0]),
    )

    let matched = false
    for (const group of groups) {
      const refAngle = normalizeAngle(
        Math.atan2(group[0].p2[1] - group[0].p1[1], group[0].p2[0] - group[0].p1[0]),
      )
      const diff = Math.abs(angle - refAngle)
      if (diff < ANGLE_TOLERANCE || Math.abs(diff - Math.PI) < ANGLE_TOLERANCE) {
        group.push(dim)
        matched = true
        break
      }
    }
    if (!matched) {
      groups.push([dim])
    }
  }

  return groups
}

function normalizeAngle(a: number): number {
  while (a < 0) a += Math.PI
  while (a >= Math.PI) a -= Math.PI
  return a
}
