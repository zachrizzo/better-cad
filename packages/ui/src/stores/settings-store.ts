import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LengthUnit } from '../utils/units'

interface SettingsState {
  lengthUnit: LengthUnit
  setLengthUnit: (unit: LengthUnit) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      lengthUnit: 'm',
      setLengthUnit: (lengthUnit) => set({ lengthUnit }),
    }),
    {
      name: 'bettercad-settings',
      partialize: (state) => ({ lengthUnit: state.lengthUnit }),
    },
  ),
)

