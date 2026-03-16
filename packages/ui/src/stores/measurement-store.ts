import { create } from 'zustand'

type Point3 = [number, number, number]

interface MeasurementState {
  cursor: Point3 | null
  toolReadout: string | null
  resetCounter: number
  setCursor: (cursor: Point3 | null) => void
  setToolReadout: (readout: string | null) => void
  requestReset: () => void
  clear: () => void
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  cursor: null,
  toolReadout: null,
  resetCounter: 0,
  setCursor: (cursor) => set({ cursor }),
  setToolReadout: (toolReadout) => set({ toolReadout }),
  requestReset: () => set((s) => ({ resetCounter: s.resetCounter + 1, cursor: null, toolReadout: null })),
  clear: () => set({ cursor: null, toolReadout: null }),
}))

