import { useEffect, useRef } from 'react'
import { useEntityStore } from '../stores/entity-store'
import { useSettingsStore } from '../stores/settings-store'
import { recomputeAssociativeDimensions } from '../services/dimension-associativity'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import type { KernelBackend } from '../services/kernel-bridge'

/**
 * Reactive hook that recomputes associative dimension endpoints
 * whenever host geometry changes. Mount once in App.tsx.
 */
export function useAssociativeDimensions(kernel: KernelBackend | null) {
  const elements = useEntityStore((s) => s.elements)
  const wallFace = useSettingsStore((s) => s.wallReferenceMode)
  const finishThickness = useSettingsStore((s) => s.wallFinishThickness)
  const isUpdating = useRef(false)

  useEffect(() => {
    if (!kernel || isUpdating.current) return

    const dirty = recomputeAssociativeDimensions(elements, wallFace, finishThickness)
    if (dirty.length === 0) return

    isUpdating.current = true
    void (async () => {
      try {
        for (const dim of dirty) {
          await kernel.updateElement(dim.meta.id, dim)
        }
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        console.error('[BetterCAD] Failed to recompute associative dimensions:', err)
      } finally {
        isUpdating.current = false
      }
    })()
  }, [elements, kernel, wallFace, finishThickness])
}
