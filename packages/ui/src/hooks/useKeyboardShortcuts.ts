import { useEffect } from 'react'
import { useUIStore } from '../stores/ui-store'
import { useDocumentStore } from '../stores/document-store'
import { useEntityStore } from '../stores/entity-store'
import { getKernel, type KernelBackend } from '../services/kernel-bridge'
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

export function useKeyboardShortcuts() {
  const setActiveTool = useUIStore((s) => s.setActiveTool)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'Escape':
          setActiveTool('select')
          break
        case 'w':
        case 'W':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('wall')
          }
          break
        case 'g':
        case 'G':
          if (!e.ctrlKey && !e.metaKey) useUIStore.getState().toggleGrid()
          break
        case 'm':
        case 'M':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('measure')
          }
          break
        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('door')
          }
          break
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('floor')
          }
          break
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('stair')
          }
          break
        case 'Delete':
        case 'Backspace': {
          if (e.ctrlKey || e.metaKey) break
          const selectedId = useUIStore.getState().selectedBodyId
          if (!selectedId) break

          useUIStore.getState().selectBody(null)

          if (!useEntityStore.getState().elements.has(selectedId)) {
            useDocumentStore.getState().removeCadMesh(selectedId)
            break
          }

          void (async () => {
            try {
              const kernel = await getKernelSingleton()
              await kernel.deleteElement(selectedId)
              useEntityStore.getState().removeElement(selectedId)
              await syncEntitiesAndRegenerateMeshes(kernel)
            } catch (err) {
              console.error('[BetterCAD] Failed to delete selected element:', err)
            }
          })()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTool])
}
