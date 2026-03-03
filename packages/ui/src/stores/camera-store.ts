import { create } from 'zustand'

export interface CameraState {
  /** Desired camera position — set by AI or programmatic control */
  position: [number, number, number]
  /** Desired camera look-at target */
  target: [number, number, number]
  /** Incremented each time AI/programmatic camera update is requested */
  revision: number
  /** Latest viewport screenshot as base64 PNG (null until first capture) */
  lastScreenshot: string | null

  setCamera: (position: [number, number, number], target: [number, number, number]) => void
  setScreenshot: (base64Png: string) => void
}

export const useCameraStore = create<CameraState>((set) => ({
  position: [5, 5, 5],
  target: [0, 0, 0],
  revision: 0,
  lastScreenshot: null,

  setCamera: (position, target) =>
    set((s) => ({ position, target, revision: s.revision + 1 })),

  setScreenshot: (base64Png) => set({ lastScreenshot: base64Png }),
}))
