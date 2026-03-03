import type { KernelBackend, DimensionElement, LeaderAnnotationElement, KeynoteElement } from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'

/**
 * Create a dimension between two points.
 */
export async function createDimension(
  kernel: KernelBackend,
  p1: [number, number],
  p2: [number, number],
  offset?: number,
  textOverride?: string,
): Promise<string> {
  const dimElement: DimensionElement = {
    kind: 'dimension',
    meta: { id: crypto.randomUUID(), name: 'Dimension' },
    p1,
    p2,
    offset: offset ?? 0.5,
  }
  if (textOverride !== undefined) {
    dimElement.text_override = textOverride
  }
  const id = await kernel.createElement(dimElement)
  await syncEntitiesAndRegenerateMeshes(kernel)
  return id
}

/**
 * Create a string/chain dimension: multiple sequential dimensions along a set of points.
 * Requires 3+ points defining sequential dimension segments.
 * Returns an array of dimension element IDs.
 */
export async function createStringDimension(
  kernel: KernelBackend,
  points: [number, number][],
  offset?: number,
): Promise<string[]> {
  if (points.length < 3) {
    throw new Error('String dimension requires at least 3 points')
  }

  const ids: string[] = []
  const effectiveOffset = offset ?? 0.5

  for (let i = 0; i < points.length - 1; i++) {
    const dimElement: DimensionElement = {
      kind: 'dimension',
      meta: { id: crypto.randomUUID(), name: `Chain Dim ${i + 1}` },
      p1: points[i],
      p2: points[i + 1],
      offset: effectiveOffset,
    }
    const id = await kernel.createElement(dimElement)
    ids.push(id)
  }

  await syncEntitiesAndRegenerateMeshes(kernel)
  return ids
}

/**
 * Create a leader annotation with an arrow tip and text.
 */
export async function createLeaderAnnotation(
  kernel: KernelBackend,
  start: [number, number],
  end: [number, number],
  text: string,
): Promise<string> {
  const element: LeaderAnnotationElement = {
    kind: 'leader_annotation',
    meta: { id: crypto.randomUUID(), name: 'Leader' },
    start,
    end,
    text,
    arrow_type: 'filled',
  }
  const id = await kernel.createElement(element)
  await syncEntitiesAndRegenerateMeshes(kernel)
  return id
}

/**
 * Create a keynote at a position with an ID and description.
 */
export async function createKeynote(
  kernel: KernelBackend,
  position: [number, number],
  keynoteId: string,
  text: string,
): Promise<string> {
  const element: KeynoteElement = {
    kind: 'keynote',
    meta: { id: crypto.randomUUID(), name: `Keynote ${keynoteId}` },
    position,
    keynote_id: keynoteId,
    text,
  }
  const id = await kernel.createElement(element)
  await syncEntitiesAndRegenerateMeshes(kernel)
  return id
}
