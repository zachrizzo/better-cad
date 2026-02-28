import { useEffect } from 'react'
import { useUIStore } from '../stores/ui-store'
import { useDocumentStore } from '../stores/document-store'
import {
  useEntityStore,
  isWallElement,
  isFloorElement,
  isStairElement,
  isDoorElement,
  isWindowElement,
  isColumnElement,
  isRoofElement,
} from '../stores/entity-store'
import {
  getKernel,
  type KernelBackend,
  type ColumnElement,
  type RoofElement,
  type WallElement,
  type FloorElement,
  type StairElement,
  type PrototypeElement,
} from '../services/kernel-bridge'
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

// --- Duplicate (Ctrl+D) ------------------------------------------------

const COPY_OFFSET = 0.5 // 0.5 m offset in both kernel X and Y

async function duplicateSelectedElement(): Promise<void> {
  const selectedId = useUIStore.getState().selectedBodyId
  if (!selectedId) return

  const el = useEntityStore.getState().elements.get(selectedId)
  if (!el) return

  // Only duplicate movable element types (walls, floors, stairs)
  // Doors/windows are wall-hosted and should not be duplicated standalone
  if (isDoorElement(el) || isWindowElement(el)) return

  const newId = `${el.kind}-${crypto.randomUUID()}`
  let copy: PrototypeElement | null = null

  if (isWallElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      start: [el.start[0] + COPY_OFFSET, el.start[1] + COPY_OFFSET] as [number, number],
      end: [el.end[0] + COPY_OFFSET, el.end[1] + COPY_OFFSET] as [number, number],
    }
  } else if (isFloorElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      boundary: el.boundary.map(
        ([x, y]) => [x + COPY_OFFSET, y + COPY_OFFSET] as [number, number],
      ),
    }
  } else if (isStairElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      start: [el.start[0] + COPY_OFFSET, el.start[1] + COPY_OFFSET] as [number, number],
      end: [el.end[0] + COPY_OFFSET, el.end[1] + COPY_OFFSET] as [number, number],
    }
  } else if (isColumnElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      center: [el.center[0] + COPY_OFFSET, el.center[1] + COPY_OFFSET] as [number, number],
    }
  } else if (isRoofElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      boundary: el.boundary.map(
        ([x, y]) => [x + COPY_OFFSET, y + COPY_OFFSET] as [number, number],
      ),
    }
  }

  if (!copy) return

  try {
    const kernel = await getKernelSingleton()
    await kernel.createElement(copy)
    await syncEntitiesAndRegenerateMeshes(kernel)
    // Select the new copy
    useUIStore.getState().selectBody(newId)
  } catch (err) {
    console.error('[BetterCAD] Duplicate failed:', err)
  }
}

// --- Rotate (R key → 90 deg CW) ----------------------------------------

function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number,
): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = px - cx
  const dy = py - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

async function rotateSelectedElement(): Promise<void> {
  const selectedId = useUIStore.getState().selectedBodyId
  if (!selectedId) return

  const el = useEntityStore.getState().elements.get(selectedId)
  if (!el) return

  if (isDoorElement(el) || isWindowElement(el)) return

  const angle = -Math.PI / 2 // 90 degrees clockwise in kernel XY space

  let updated: PrototypeElement | null = null

  if (isWallElement(el)) {
    const w = el as WallElement
    const cx = (w.start[0] + w.end[0]) / 2
    const cy = (w.start[1] + w.end[1]) / 2
    updated = {
      ...w,
      start: rotatePoint(w.start[0], w.start[1], cx, cy, angle),
      end: rotatePoint(w.end[0], w.end[1], cx, cy, angle),
    }
  } else if (isFloorElement(el)) {
    const f = el as FloorElement
    let cx = 0
    let cy = 0
    for (const [x, y] of f.boundary) {
      cx += x
      cy += y
    }
    cx /= f.boundary.length
    cy /= f.boundary.length
    updated = {
      ...f,
      boundary: f.boundary.map(([x, y]) => rotatePoint(x, y, cx, cy, angle)),
    }
  } else if (isStairElement(el)) {
    const s = el as StairElement
    const cx = (s.start[0] + s.end[0]) / 2
    const cy = (s.start[1] + s.end[1]) / 2
    updated = {
      ...s,
      start: rotatePoint(s.start[0], s.start[1], cx, cy, angle),
      end: rotatePoint(s.end[0], s.end[1], cx, cy, angle),
    }
  } else if (isRoofElement(el)) {
    const r = el as RoofElement
    let cx = 0
    let cy = 0
    for (const [x, y] of r.boundary) {
      cx += x
      cy += y
    }
    cx /= r.boundary.length
    cy /= r.boundary.length
    updated = {
      ...r,
      boundary: r.boundary.map(([x, y]) => rotatePoint(x, y, cx, cy, angle)),
    }
  }

  if (!updated) return

  try {
    const kernel = await getKernelSingleton()
    await kernel.updateElement(selectedId, updated)
    useEntityStore.getState().upsertElement(updated, 'update')
    await syncEntitiesAndRegenerateMeshes(kernel)
  } catch (err) {
    console.error('[BetterCAD] Rotate failed:', err)
  }
}

interface ShortcutCallbacks {
  onSave?: () => void
  onLoad?: () => void
}

export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  const setActiveTool = useUIStore((s) => s.setActiveTool)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Handle Ctrl/Cmd shortcuts first
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
          case 'S':
            e.preventDefault()
            callbacks?.onSave?.()
            return
          case 'o':
          case 'O':
            e.preventDefault()
            callbacks?.onLoad?.()
            return
          case 'd':
          case 'D':
            e.preventDefault()
            void duplicateSelectedElement()
            return
        }
      }

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
        case 'n':
        case 'N':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('window')
          }
          break
        case 'c':
        case 'C':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('column')
          }
          break
        case 'b':
        case 'B':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('beam')
          }
          break
        case 'o':
        case 'O':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('roof')
          }
          break
        case 'a':
        case 'A':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('dimension')
          }
          break
        case 't':
        case 'T':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('text')
          }
          break
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            void rotateSelectedElement()
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
  }, [setActiveTool, callbacks?.onSave, callbacks?.onLoad])
}
