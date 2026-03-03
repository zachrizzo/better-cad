import type { Element3DSpec, PrimitiveSpec } from '../element3d-specs'
import type { FireSafetySymbolType } from '../../services/kernel-bridge'

type FireSafetyGenerator = () => Element3DSpec

const GENERATORS: Record<FireSafetySymbolType, FireSafetyGenerator> = {
  fire_extinguisher() {
    return {
      primitives: [
        // Main cylinder body
        {
          type: 'cylinder',
          radiusTop: 0.06,
          radiusBottom: 0.06,
          height: 0.45,
          segments: 24,
          position: [0, 0.225, 0],
          material: 'fire_red',
        },
        // Top nozzle
        {
          type: 'cylinder',
          radiusTop: 0.02,
          radiusBottom: 0.02,
          height: 0.05,
          segments: 16,
          position: [0, 0.475, 0],
          material: 'metal_dark',
        },
        // Handle
        {
          type: 'cylinder',
          radiusTop: 0.015,
          radiusBottom: 0.015,
          height: 0.08,
          segments: 12,
          position: [0, 0.50, 0],
          rotation: [0, 0, Math.PI / 4],
          material: 'metal_dark',
        },
      ],
      defaultHeight: 0.55,
    }
  },

  sprinkler_head() {
    return {
      primitives: [
        // Pendant body
        {
          type: 'cylinder',
          radiusTop: 0.025,
          radiusBottom: 0.025,
          height: 0.05,
          segments: 16,
          position: [0, 2.76, 0],
          material: 'metal_chrome',
        },
        // Deflector plate (disc)
        {
          type: 'cylinder',
          radiusTop: 0.04,
          radiusBottom: 0.04,
          height: 0.005,
          segments: 24,
          position: [0, 2.78, 0],
          material: 'metal_chrome',
        },
      ],
      defaultHeight: 0.05,
    }
  },

  exit_sign() {
    return {
      primitives: [
        {
          type: 'box',
          width: 0.35,
          height: 0.18,
          depth: 0.03,
          position: [0, 2.10, 0],
          material: 'exit_green',
        },
      ],
      defaultHeight: 0.18,
    }
  },

  pull_station() {
    return {
      primitives: [
        // Main body
        {
          type: 'box',
          width: 0.10,
          height: 0.15,
          depth: 0.05,
          position: [0, 1.20, 0],
          material: 'fire_red',
        },
        // Pull handle
        {
          type: 'box',
          width: 0.06,
          height: 0.03,
          depth: 0.02,
          position: [0, 1.15, 0.035],
          material: 'plastic_white',
        },
      ],
      defaultHeight: 0.15,
    }
  },

  smoke_alarm() {
    return {
      primitives: [
        // Main disc
        {
          type: 'cylinder',
          radiusTop: 0.06,
          radiusBottom: 0.06,
          height: 0.03,
          segments: 24,
          position: [0, 2.78, 0],
          material: 'plastic_white',
        },
        // Center indicator
        {
          type: 'cylinder',
          radiusTop: 0.01,
          radiusBottom: 0.01,
          height: 0.005,
          segments: 12,
          position: [0, 2.765, 0],
          material: 'plastic_red',
        },
      ],
      defaultHeight: 0.03,
    }
  },

  fire_alarm_panel() {
    return {
      primitives: [
        // Main panel body
        {
          type: 'box',
          width: 0.40,
          height: 0.50,
          depth: 0.10,
          position: [0, 1.35, 0],
          material: 'fire_red',
        },
        // Display screen
        {
          type: 'box',
          width: 0.30,
          height: 0.20,
          depth: 0.005,
          position: [0, 1.40, 0.053],
          material: 'plastic_gray',
        },
        // Keyhole
        {
          type: 'box',
          width: 0.02,
          height: 0.03,
          depth: 0.005,
          position: [0, 1.20, 0.053],
          material: 'metal_chrome',
        },
      ],
      defaultHeight: 0.50,
    }
  },
}

export function generateFireSafety3D(symbolType: FireSafetySymbolType): Element3DSpec {
  const gen = GENERATORS[symbolType]
  if (gen) return gen()
  return {
    primitives: [
      {
        type: 'box',
        width: 0.2,
        height: 0.2,
        depth: 0.1,
        position: [0, 1.0, 0],
        material: 'fire_red',
      },
    ],
    defaultHeight: 0.2,
  }
}
