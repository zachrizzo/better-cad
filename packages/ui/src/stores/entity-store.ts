import { create } from 'zustand'
import type {
  BeamElement,
  ColumnElement,
  DimensionElement,
  DoorElement,
  FloorElement,
  PrototypeElement,
  RoofElement,
  RoomElement,
  StairElement,
  TextAnnotationElement,
  WallElement,
  WindowElement,
} from '../services/kernel-bridge'

export interface TransactionEntry {
  id: string
  action: 'create' | 'update' | 'delete' | 'sync'
  elementId: string
  at: number
}

const UNDO_STACK_LIMIT = 100

type Snapshot = PrototypeElement[]

function snapshotFromMap(elements: Map<string, PrototypeElement>): Snapshot {
  return Array.from(elements.values())
}

function mapFromSnapshot(snapshot: Snapshot): Map<string, PrototypeElement> {
  return new Map(snapshot.map((el) => [el.meta.id, el]))
}

interface EntityState {
  projectName: string
  units: string
  elements: Map<string, PrototypeElement>
  transactionLog: TransactionEntry[]

  /** Undo / redo stacks (snapshot-based) */
  undoStack: Snapshot[]
  redoStack: Snapshot[]
  /** Whether the current mutation is from an undo/redo restore (skip pushing to undo stack) */
  _isRestoring: boolean

  setProjectMeta: (name: string, units: string) => void
  clearProject: () => void
  upsertElement: (element: PrototypeElement, action?: TransactionEntry['action']) => void
  removeElement: (elementId: string) => void
  setElements: (elements: PrototypeElement[]) => void

  /** Undo: restore the previous snapshot. Returns the restored elements or null if nothing to undo. */
  undo: () => Snapshot | null
  /** Redo: restore a previously undone snapshot. Returns the restored elements or null if nothing to redo. */
  redo: () => Snapshot | null
  /** Whether undo is available */
  canUndo: () => boolean
  /** Whether redo is available */
  canRedo: () => boolean
}

function appendTransaction(
  state: EntityState,
  entry: Omit<TransactionEntry, 'id' | 'at'>,
): TransactionEntry[] {
  const next = [
    ...state.transactionLog,
    {
      ...entry,
      id: crypto.randomUUID(),
      at: Date.now(),
    },
  ]
  if (next.length <= 500) return next
  return next.slice(next.length - 500)
}

/** Push a snapshot onto the undo stack, respecting the limit. Clears redo stack. */
function pushUndo(state: EntityState): { undoStack: Snapshot[]; redoStack: Snapshot[] } {
  const snapshot = snapshotFromMap(state.elements)
  const undoStack = [...state.undoStack, snapshot]
  if (undoStack.length > UNDO_STACK_LIMIT) {
    undoStack.shift()
  }
  return { undoStack, redoStack: [] }
}

export const useEntityStore = create<EntityState>((set, get) => ({
  projectName: 'Untitled',
  units: 'm',
  elements: new Map(),
  transactionLog: [],
  undoStack: [],
  redoStack: [],
  _isRestoring: false,

  setProjectMeta: (projectName, units) => set({ projectName, units }),

  clearProject: () =>
    set({ elements: new Map(), transactionLog: [], undoStack: [], redoStack: [] }),

  upsertElement: (element, action = 'update') =>
    set((state) => {
      const stackUpdate = state._isRestoring ? {} : pushUndo(state)
      const elements = new Map(state.elements)
      elements.set(element.meta.id, element)
      return {
        ...stackUpdate,
        elements,
        transactionLog: appendTransaction(state, { action, elementId: element.meta.id }),
      }
    }),

  removeElement: (elementId) =>
    set((state) => {
      const stackUpdate = state._isRestoring ? {} : pushUndo(state)
      const elements = new Map(state.elements)
      elements.delete(elementId)
      return {
        ...stackUpdate,
        elements,
        transactionLog: appendTransaction(state, { action: 'delete', elementId }),
      }
    }),

  setElements: (incoming) =>
    set((state) => ({
      elements: new Map(incoming.map((element) => [element.meta.id, element])),
      transactionLog: appendTransaction(state, {
        action: 'sync',
        elementId: `sync-${incoming.length}`,
      }),
    })),

  undo: () => {
    const state = get()
    if (state.undoStack.length === 0) return null

    const undoStack = [...state.undoStack]
    const previousSnapshot = undoStack.pop()!
    const currentSnapshot = snapshotFromMap(state.elements)
    const redoStack = [...state.redoStack, currentSnapshot]

    set({
      _isRestoring: true,
      undoStack,
      redoStack,
      elements: mapFromSnapshot(previousSnapshot),
    })
    set({ _isRestoring: false })

    return previousSnapshot
  },

  redo: () => {
    const state = get()
    if (state.redoStack.length === 0) return null

    const redoStack = [...state.redoStack]
    const nextSnapshot = redoStack.pop()!
    const currentSnapshot = snapshotFromMap(state.elements)
    const undoStack = [...state.undoStack, currentSnapshot]

    set({
      _isRestoring: true,
      undoStack,
      redoStack,
      elements: mapFromSnapshot(nextSnapshot),
    })
    set({ _isRestoring: false })

    return nextSnapshot
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
}))

export function isWallElement(element: PrototypeElement): element is WallElement {
  return element.kind === 'wall'
}

export function isDoorElement(element: PrototypeElement): element is DoorElement {
  return element.kind === 'door'
}

export function isWindowElement(element: PrototypeElement): element is WindowElement {
  return element.kind === 'window'
}

export function isFloorElement(element: PrototypeElement): element is FloorElement {
  return element.kind === 'floor'
}

export function isStairElement(element: PrototypeElement): element is StairElement {
  return element.kind === 'stair'
}

export function isColumnElement(element: PrototypeElement): element is ColumnElement {
  return element.kind === 'column'
}

export function isBeamElement(element: PrototypeElement): element is BeamElement {
  return element.kind === 'beam'
}

export function isRoofElement(element: PrototypeElement): element is RoofElement {
  return element.kind === 'roof'
}

export function isRoomElement(element: PrototypeElement): element is RoomElement {
  return element.kind === 'room'
}

export function isDimensionElement(element: PrototypeElement): element is DimensionElement {
  return element.kind === 'dimension'
}

export function isTextAnnotationElement(element: PrototypeElement): element is TextAnnotationElement {
  return element.kind === 'text_annotation'
}
