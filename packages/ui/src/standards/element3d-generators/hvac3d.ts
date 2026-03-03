import type { Element3DSpec, PrimitiveSpec } from '../element3d-specs'
import type { HvacSymbolType } from '../../services/kernel-bridge'

type HvacGenerator = (width?: number, depth?: number) => Element3DSpec

const GENERATORS: Record<HvacSymbolType, HvacGenerator> = {
  supply_vent(_w, _d) {
    const slats: PrimitiveSpec[] = []
    // 4 horizontal slat bars across the grille
    for (let i = 0; i < 4; i++) {
      const z = -0.06 + i * 0.04
      slats.push({
        type: 'box',
        width: 0.26,
        height: 0.003,
        depth: 0.008,
        position: [0, 2.78, z],
        material: 'metal_white',
      })
    }
    return {
      primitives: [
        // Outer grille frame
        {
          type: 'box',
          width: 0.30,
          height: 0.02,
          depth: 0.15,
          position: [0, 2.78, 0],
          material: 'metal_white',
        },
        // Slat bars
        ...slats,
      ],
      defaultHeight: 0.02,
    }
  },

  return_vent(_w, _d) {
    const slats: PrimitiveSpec[] = []
    // 4 horizontal slat bars across the return grille
    for (let i = 0; i < 4; i++) {
      const z = -0.12 + i * 0.08
      slats.push({
        type: 'box',
        width: 0.31,
        height: 0.003,
        depth: 0.008,
        position: [0, 0.15, z],
        material: 'metal_white',
      })
    }
    return {
      primitives: [
        // Outer grille frame
        {
          type: 'box',
          width: 0.35,
          height: 0.02,
          depth: 0.35,
          position: [0, 0.15, 0],
          material: 'metal_white',
        },
        // Slat bars
        ...slats,
      ],
      defaultHeight: 0.02,
    }
  },

  thermostat(_w, _d) {
    return {
      primitives: [
        // Main body
        {
          type: 'box',
          width: 0.08,
          height: 0.12,
          depth: 0.02,
          position: [0, 1.40, 0],
          material: 'plastic_white',
        },
        // Screen
        {
          type: 'box',
          width: 0.05,
          height: 0.04,
          depth: 0.005,
          position: [0, 1.40, 0.013],
          material: 'plastic_gray',
        },
      ],
      defaultHeight: 0.12,
    }
  },

  exhaust_fan(_w, _d) {
    return {
      primitives: [
        // Outer housing
        {
          type: 'cylinder',
          radiusTop: 0.15,
          radiusBottom: 0.15,
          height: 0.05,
          segments: 32,
          position: [0, 2.78, 0],
          material: 'metal_white',
        },
        // Inner fan disc
        {
          type: 'cylinder',
          radiusTop: 0.12,
          radiusBottom: 0.12,
          height: 0.01,
          segments: 32,
          position: [0, 2.76, 0],
          material: 'plastic_gray',
        },
      ],
      defaultHeight: 0.05,
    }
  },

  ductwork(width, depth) {
    const w = width ?? 0.30
    const d = depth ?? 1.0
    return {
      primitives: [
        {
          type: 'box',
          width: w,
          height: 0.25,
          depth: d,
          position: [0, 2.65, 0],
          material: 'metal_white',
        },
      ],
      defaultHeight: 0.25,
    }
  },

  mini_split(_w, _d) {
    return {
      primitives: [
        // Main body
        {
          type: 'box',
          width: 0.80,
          height: 0.25,
          depth: 0.22,
          position: [0, 2.00, 0],
          material: 'plastic_white',
        },
        // Vent slats at bottom-front
        {
          type: 'box',
          width: 0.70,
          height: 0.02,
          depth: 0.01,
          position: [0, 1.92, 0.11],
          material: 'plastic_gray',
        },
      ],
      defaultHeight: 0.25,
    }
  },
}

export function generateHvac3D(
  symbolType: HvacSymbolType,
  width?: number,
  depth?: number,
): Element3DSpec {
  const gen = GENERATORS[symbolType]
  if (gen) return gen(width, depth)
  return {
    primitives: [
      {
        type: 'box',
        width: 0.3,
        height: 0.1,
        depth: 0.3,
        position: [0, 2.75, 0],
        material: 'metal_white',
      },
    ],
    defaultHeight: 0.10,
  }
}
