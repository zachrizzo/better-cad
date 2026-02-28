import { useEffect, useCallback } from 'react'
import { useEntityStore } from '../stores/entity-store'
import { getKernel, type KernelBackend, type PrototypeElement } from '../services/kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'

let kernelSingleton: KernelBackend | null = null
let kernelPromise: Promise<KernelBackend> | null = null

async function getKernelSingleton(): Promise<KernelBackend> {
  if (kernelSingleton) return kernelSingleton
  if (!kernelPromise) {
    kernelPromise = getKernel().then((kernel) => {
      kernelSingleton = kernel
      return kernel
    })
  }
  return kernelPromise
}

async function rebuildKernelFromSnapshot(snapshot: PrototypeElement[]): Promise<void> {
  const kernel = await getKernelSingleton()
  const { projectName, units } = useEntityStore.getState()
  await kernel.resetProject(projectName, units)

  // Recreate a default level if needed
  const hasLevel = snapshot.some((el) => el.kind === 'level')
  if (!hasLevel) {
    await kernel.createElement({
      kind: 'level',
      meta: { id: `level-${crypto.randomUUID()}`, name: 'Level 1' },
      elevation: 0,
    })
  }

  for (const element of snapshot) {
    await kernel.createElement(element)
  }

  await syncEntitiesAndRegenerateMeshes(kernel)
}

let isProcessing = false

export function useUndo() {
  const performUndo = useCallback(async () => {
    if (isProcessing) return
    isProcessing = true
    try {
      const snapshot = useEntityStore.getState().undo()
      if (snapshot) {
        await rebuildKernelFromSnapshot(snapshot)
      }
    } catch (err) {
      console.error('[BetterCAD] Undo failed:', err)
    } finally {
      isProcessing = false
    }
  }, [])

  const performRedo = useCallback(async () => {
    if (isProcessing) return
    isProcessing = true
    try {
      const snapshot = useEntityStore.getState().redo()
      if (snapshot) {
        await rebuildKernelFromSnapshot(snapshot)
      }
    } catch (err) {
      console.error('[BetterCAD] Redo failed:', err)
    } finally {
      isProcessing = false
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        void performUndo()
      } else if (
        (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) ||
        (e.key === 'y' && (e.metaKey || e.ctrlKey))
      ) {
        e.preventDefault()
        void performRedo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [performUndo, performRedo])

  return { performUndo, performRedo }
}
