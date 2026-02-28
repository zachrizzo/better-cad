import { create } from 'zustand'
import { temporal } from 'zundo'

interface HistoryState {
  boxParams: { width: number; height: number; depth: number }
  setBoxParams: (params: { width: number; height: number; depth: number }) => void
}

export const useHistoryStore = create<HistoryState>()(
  temporal(
    (set) => ({
      boxParams: { width: 1, height: 1, depth: 1 },
      setBoxParams: (params) => set({ boxParams: params }),
    }),
    {
      limit: 50,
      partialize: (state) => ({ boxParams: state.boxParams }),
    },
  ),
)

export const useHistoryTemporal = () => useHistoryStore.temporal
