import { create } from 'zustand'

type Point3 = [number, number, number]

interface MeasurementState {
  cursor: Point3 | null
  toolReadout: string | null
  setCursor: (cursor: Point3 | null) => void
  setToolReadout: (readout: string | null) => void
  clear: () => void
}

export const useMeasurementStore = create<MeasurementState>((set) => ({
  cursor: null,
  toolReadout: null,
  setCursor: (cursor) => set({ cursor }),
  setToolReadout: (toolReadout) => set({ toolReadout }),
  clear: () => set({ cursor: null, toolReadout: null }),
}))

