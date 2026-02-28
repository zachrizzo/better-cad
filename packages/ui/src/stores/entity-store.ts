import { create } from 'zustand'
import type {
  DoorElement,
  FloorElement,
  PrototypeElement,
  StairElement,
  WallElement,
  WindowElement,
} from '../services/kernel-bridge'

export interface TransactionEntry {
  id: string
  action: 'create' | 'update' | 'delete' | 'sync'
  elementId: string
  at: number
}

interface EntityState {
  projectName: string
  units: string
  elements: Map<string, PrototypeElement>
  transactionLog: TransactionEntry[]
  setProjectMeta: (name: string, units: string) => void
  clearProject: () => void
  upsertElement: (element: PrototypeElement, action?: TransactionEntry['action']) => void
  removeElement: (elementId: string) => void
  setElements: (elements: PrototypeElement[]) => void
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

export const useEntityStore = create<EntityState>((set) => ({
  projectName: 'Untitled',
  units: 'm',
  elements: new Map(),
  transactionLog: [],
  setProjectMeta: (projectName, units) => set({ projectName, units }),
  clearProject: () => set({ elements: new Map(), transactionLog: [] }),
  upsertElement: (element, action = 'update') =>
    set((state) => {
      const elements = new Map(state.elements)
      elements.set(element.meta.id, element)
      return {
        elements,
        transactionLog: appendTransaction(state, { action, elementId: element.meta.id }),
      }
    }),
  removeElement: (elementId) =>
    set((state) => {
      const elements = new Map(state.elements)
      elements.delete(elementId)
      return {
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
