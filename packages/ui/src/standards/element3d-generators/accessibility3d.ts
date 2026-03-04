import type { Element3DSpec, PrimitiveSpec } from '../element3d-specs'
import type { AccessibilitySymbolType } from '../../services/kernel-bridge'

type AccessibilityGenerator = (width?: number, depth?: number) => Element3DSpec

const GENERATORS: Record<AccessibilitySymbolType, AccessibilityGenerator> = {
  wheelchair(_w, _d) {
    return {
      primitives: [
        // Left large wheel
        {
          type: 'cylinder',
          radiusTop: 0.30,
          radiusBottom: 0.30,
          height: 0.03,
          segments: 32,
          position: [-0.25, 0.30, 0],
          rotation: [0, 0, Math.PI / 2],
          material: 'rubber_black',
        },
        // Right large wheel
        {
          type: 'cylinder',
          radiusTop: 0.30,
          radiusBottom: 0.30,
          height: 0.03,
          segments: 32,
          position: [0.25, 0.30, 0],
          rotation: [0, 0, Math.PI / 2],
          material: 'rubber_black',
        },
        // Seat
        {
          type: 'box',
          width: 0.40,
          height: 0.04,
          depth: 0.40,
          position: [0, 0.50, 0],
          material: 'fabric_gray',
        },
        // Backrest
        {
          type: 'box',
          width: 0.40,
          height: 0.35,
          depth: 0.03,
          position: [0, 0.72, -0.18],
          material: 'fabric_gray',
        },
        // Left front caster wheel
        {
          type: 'cylinder',
          radiusTop: 0.05,
          radiusBottom: 0.05,
          height: 0.02,
          segments: 16,
          position: [-0.12, 0.05, 0.20],
          material: 'rubber_black',
        },
        // Right front caster wheel
        {
          type: 'cylinder',
          radiusTop: 0.05,
          radiusBottom: 0.05,
          height: 0.02,
          segments: 16,
          position: [0.12, 0.05, 0.20],
          material: 'rubber_black',
        },
        // Left push handle
        {
          type: 'cylinder',
          radiusTop: 0.01,
          radiusBottom: 0.01,
          height: 0.30,
          segments: 8,
          position: [-0.18, 0.85, -0.22],
          material: 'metal_chrome',
        },
        // Right push handle
        {
          type: 'cylinder',
          radiusTop: 0.01,
          radiusBottom: 0.01,
          height: 0.30,
          segments: 8,
          position: [0.18, 0.85, -0.22],
          material: 'metal_chrome',
        },
      ],
      defaultHeight: 0.95,
    }
  },

  ramp(width, depth) {
    const w = width ?? 1.2
    const d = depth ?? 1.0
    const halfW = w / 2 - 0.02
    return {
      primitives: [
        // Ramp surface
        {
          type: 'box',
          width: w,
          height: 0.10,
          depth: d,
          position: [0, 0.05, 0],
          rotation: [0.1, 0, 0],
          material: 'concrete_gray',
        },
        // Left side rail
        {
          type: 'cylinder',
          radiusTop: 0.02,
          radiusBottom: 0.02,
          height: d,
          segments: 12,
          position: [-halfW, 0.15, 0],
          rotation: [Math.PI / 2 - 0.1, 0, 0],
          material: 'metal_chrome',
        },
        // Right side rail
        {
          type: 'cylinder',
          radiusTop: 0.02,
          radiusBottom: 0.02,
          height: d,
          segments: 12,
          position: [halfW, 0.15, 0],
          rotation: [Math.PI / 2 - 0.1, 0, 0],
          material: 'metal_chrome',
        },
      ],
      defaultHeight: 0.10,
    }
  },

  grab_bar(_w, _d) {
    return {
      primitives: [
        // Main bar (horizontal)
        {
          type: 'cylinder',
          radiusTop: 0.02,
          radiusBottom: 0.02,
          height: 0.60,
          segments: 16,
          position: [0, 0.90, 0],
          rotation: [0, 0, Math.PI / 2],
          material: 'metal_chrome',
        },
        // Left mounting disc
        {
          type: 'cylinder',
          radiusTop: 0.03,
          radiusBottom: 0.03,
          height: 0.02,
          segments: 16,
          position: [-0.28, 0.90, 0],
          material: 'metal_chrome',
        },
        // Right mounting disc
        {
          type: 'cylinder',
          radiusTop: 0.03,
          radiusBottom: 0.03,
          height: 0.02,
          segments: 16,
          position: [0.28, 0.90, 0],
          material: 'metal_chrome',
        },
      ],
      defaultHeight: 0.04,
    }
  },

  accessible_parking(width, depth) {
    const w = width ?? 3.6
    const d = depth ?? 5.4
    return {
      primitives: [
        {
          type: 'plane',
          width: w,
          height: d,
          position: [0, 0.005, 0],
          rotation: [-Math.PI / 2, 0, 0],
          material: 'blue_accent',
        },
      ],
      defaultHeight: 0.01,
    }
  },

  tactile_warning(width, depth) {
    const w = width ?? 0.60
    const d = depth ?? 0.60
    // Grid of 4x4 bump spheres
    const bumps: PrimitiveSpec[] = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = -w / 2 + w * (col + 0.5) / 4
        const z = -d / 2 + d * (row + 0.5) / 4
        bumps.push({
          type: 'sphere',
          radius: 0.01,
          segments: 8,
          position: [x, 0.03, z],
          material: 'yellow_warning',
        })
      }
    }
    return {
      primitives: [
        // Base pad
        {
          type: 'box',
          width: w,
          height: 0.02,
          depth: d,
          position: [0, 0.01, 0],
          material: 'yellow_warning',
        },
        // Tactile bumps
        ...bumps,
      ],
      defaultHeight: 0.02,
    }
  },

  ada_restroom(_w, _d) {
    return {
      primitives: [
        { type: 'box', width: 1.5, height: 2.5, depth: 1.5, position: [0, 1.25, 0], material: 'blue_accent' },
      ],
      defaultHeight: 2.50,
    }
  },

  hearing_loop(_w, _d) {
    return {
      primitives: [
        { type: 'box', width: 0.3, height: 0.3, depth: 0.05, position: [0, 1.20, 0], material: 'plastic_dark' },
      ],
      defaultHeight: 0.30,
    }
  },
}

export function generateAccessibility3D(
  symbolType: AccessibilitySymbolType,
  width?: number,
  depth?: number,
): Element3DSpec {
  const gen = GENERATORS[symbolType]
  if (gen) return gen(width, depth)
  return {
    primitives: [
      {
        type: 'box',
        width: 0.5,
        height: 0.5,
        depth: 0.5,
        position: [0, 0.25, 0],
        material: 'blue_accent',
      },
    ],
    defaultHeight: 0.5,
  }
}
