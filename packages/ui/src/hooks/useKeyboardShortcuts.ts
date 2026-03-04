import { useEffect } from 'react'
import { useUIStore } from '../stores/ui-store'
import { useDocumentStore } from '../stores/document-store'
import { useBimStore } from '../stores/bim-store'
import {
  useEntityStore,
  isWallElement,
  isFloorElement,
  isStairElement,
  isDoorElement,
  isWindowElement,
  isColumnElement,
  isBeamElement,
  isRoofElement,
  isFoundationElement,
} from '../stores/entity-store'
import {
  getKernel,
  type KernelBackend,
  type ColumnElement,
  type BeamElement,
  type RoofElement,
  type FoundationElement,
  type WallElement,
  type FloorElement,
  type StairElement,
  type PrototypeElement,
} from '../services/kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from '../services/entity-regeneration'
import { smartDuplicateOffset, isArrayableElement } from '../services/array-tools'

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

// --- Duplicate (Ctrl+D) — uses smart offset from array-tools ----------

async function duplicateSelectedElement(): Promise<void> {
  const selectedId = useUIStore.getState().selectedBodyId
  if (!selectedId) return

  const el = useEntityStore.getState().elements.get(selectedId)
  if (!el) return

  // Only duplicate arrayable element types (not doors/windows/rooms/etc.)
  if (!isArrayableElement(el)) return

  const [dx, dy] = smartDuplicateOffset(el)
  const newId = `${el.kind}-${crypto.randomUUID()}`

  // Build copy with smart offset applied per element kind
  let copy: PrototypeElement | null = null

  if (isWallElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      start: [el.start[0] + dx, el.start[1] + dy] as [number, number],
      end: [el.end[0] + dx, el.end[1] + dy] as [number, number],
    }
  } else if (isFloorElement(el) || isFoundationElement(el)) {
    const f = el as FloorElement | FoundationElement
    copy = {
      ...f,
      meta: { ...f.meta, id: newId, name: `${f.meta.name} copy` },
      boundary: f.boundary.map(
        ([x, y]) => [x + dx, y + dy] as [number, number],
      ),
    }
  } else if (isStairElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      start: [el.start[0] + dx, el.start[1] + dy] as [number, number],
      end: [el.end[0] + dx, el.end[1] + dy] as [number, number],
    }
  } else if (isColumnElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      center: [el.center[0] + dx, el.center[1] + dy] as [number, number],
    }
  } else if (isRoofElement(el)) {
    copy = {
      ...el,
      meta: { ...el.meta, id: newId, name: `${el.meta.name} copy` },
      boundary: el.boundary.map(
        ([x, y]) => [x + dx, y + dy] as [number, number],
      ),
    }
  } else if (isBeamElement(el)) {
    const b = el as BeamElement
    copy = {
      ...b,
      meta: { ...b.meta, id: newId, name: `${b.meta.name} copy` },
      start: [b.start[0] + dx, b.start[1] + dy, b.start[2]] as [number, number, number],
      end: [b.end[0] + dx, b.end[1] + dy, b.end[2]] as [number, number, number],
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

// --- Array dialog trigger (Ctrl+Shift+D) --------------------------------

/** Callback set by App.tsx to open the array dialog */
let _openArrayDialogCb: (() => void) | null = null

export function setOpenArrayDialogCallback(cb: (() => void) | null): void {
  _openArrayDialogCb = cb
}

function openArrayDialogForSelected(): void {
  const selectedId = useUIStore.getState().selectedBodyId
  if (!selectedId) return
  const el = useEntityStore.getState().elements.get(selectedId)
  if (!el || !isArrayableElement(el)) return
  _openArrayDialogCb?.()
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
  } else if (isBeamElement(el)) {
    const b = el as BeamElement
    const cx = (b.start[0] + b.end[0]) / 2
    const cy = (b.start[1] + b.end[1]) / 2
    const [nx, ny] = rotatePoint(b.start[0], b.start[1], cx, cy, angle)
    const [ex, ey] = rotatePoint(b.end[0], b.end[1], cx, cy, angle)
    updated = {
      ...b,
      start: [nx, ny, b.start[2]] as [number, number, number],
      end: [ex, ey, b.end[2]] as [number, number, number],
    }
  } else if (isFoundationElement(el)) {
    const f = el as FoundationElement
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
  onToolSelect?: (tool: ToolType) => void
}

type ToolType = 'select' | 'foundation' | 'parking' | 'wall' | 'door' | 'floor' | 'roof' | 'stair' | 'measure' | 'window' | 'column' | 'beam' | 'room' | 'dimension' | 'text' | 'sketch' | 'section' | 'furniture' | 'plumbing' | 'electrical' | 'cabinet' | 'hvac' | 'fire_safety' | 'accessibility'

export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  const setActiveTool = useUIStore((s) => s.setActiveTool)

  useEffect(() => {
    const selectTool = (tool: ToolType) => {
      if (callbacks?.onToolSelect) {
        callbacks.onToolSelect(tool)
      } else {
        setActiveTool(tool)
      }
    }

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
            if (e.shiftKey) {
              // Ctrl+Shift+D → Array dialog
              openArrayDialogForSelected()
            } else {
              // Ctrl+D → Duplicate with smart offset
              void duplicateSelectedElement()
            }
            return
        }
      }

      switch (e.key) {
        case 'Escape':
          selectTool('select')
          break
        case 'h':
        case 'H':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('foundation')
          }
          break
        case 'p':
        case 'P':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('parking')
          }
          break
        case 'w':
        case 'W':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('wall')
          }
          break
        case 'g':
        case 'G':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('fire_safety')
          }
          break
        case 'm':
        case 'M':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('measure')
          }
          break
        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('door')
          }
          break
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('floor')
          }
          break
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('stair')
          }
          break
        case 'n':
        case 'N':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('window')
          }
          break
        case 'c':
        case 'C':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('column')
          }
          break
        case 'b':
        case 'B':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('beam')
          }
          break
        case 'o':
        case 'O':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('roof')
          }
          break
        case 'a':
        case 'A':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('dimension')
          }
          break
        case 't':
        case 'T':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('text')
          }
          break
        case 'i':
        case 'I':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('furniture')
          }
          break
        case 'u':
        case 'U':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('plumbing')
          }
          break
        case 'e':
        case 'E':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('electrical')
          }
          break
        case 'j':
        case 'J':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('cabinet')
          }
          break
        case 'v':
        case 'V':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('hvac')
          }
          break
        case 'y':
        case 'Y':
          if (!e.ctrlKey && !e.metaKey) {
            selectTool('accessibility')
          }
          break
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            const currentTool = useUIStore.getState().activeTool
            if (currentTool === 'furniture') {
              useBimStore.getState().setDefaultFurnitureRotation(useBimStore.getState().defaultFurnitureRotation + 90)
            } else if (currentTool === 'plumbing') {
              useBimStore.getState().setDefaultPlumbingRotation(useBimStore.getState().defaultPlumbingRotation + 90)
            } else if (currentTool === 'electrical') {
              useBimStore.getState().setDefaultElectricalRotation(useBimStore.getState().defaultElectricalRotation + 90)
            } else if (currentTool === 'hvac') {
              useBimStore.getState().setDefaultHvacRotation(useBimStore.getState().defaultHvacRotation + 90)
            } else if (currentTool === 'fire_safety') {
              useBimStore.getState().setDefaultFireSafetyRotation(useBimStore.getState().defaultFireSafetyRotation + 90)
            } else if (currentTool === 'accessibility') {
              useBimStore.getState().setDefaultAccessibilityRotation(useBimStore.getState().defaultAccessibilityRotation + 90)
            } else {
              void rotateSelectedElement()
            }
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
  }, [setActiveTool, callbacks?.onSave, callbacks?.onLoad, callbacks?.onToolSelect])
}
