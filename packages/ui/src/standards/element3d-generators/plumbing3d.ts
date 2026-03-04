import type { Element3DSpec, PrimitiveSpec } from '../element3d-specs'
import type { PlumbingSymbolType } from '../../services/kernel-bridge'

export function generatePlumbing3D(symbolType: PlumbingSymbolType): Element3DSpec {
  const gen = GENERATORS[symbolType]
  if (gen) return gen()
  return {
    primitives: [
      { type: 'box', width: 0.4, height: 0.4, depth: 0.4, position: [0, 0.2, 0], material: 'porcelain_white' },
    ],
    defaultHeight: 0.4,
  }
}

// ---------------------------------------------------------------------------
// Generator lookup table
// ---------------------------------------------------------------------------

const GENERATORS: Record<PlumbingSymbolType, () => Element3DSpec> = {
  toilet: generateToilet,
  sink: generateSink,
  bathtub: generateBathtub,
  shower: generateShower,
  water_heater: generateWaterHeater,
  hose_bib: generateHoseBib,
  floor_drain: generateFloorDrain,
  dishwasher: generateDishwasher,
  washing_machine: generateWashingMachine,
  urinal: generateUrinal,
  double_sink: generateDoubleSink,
  bidet: generateBidet,
  utility_sink: generateUtilitySink,
  pedestal_sink: generatePedestalSink,
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

function generateToilet(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Tank (rear)
    {
      type: 'box',
      width: 0.38,
      height: 0.35,
      depth: 0.15,
      position: [0, 0.225, -0.2],
      material: 'ceramic_white',
    },
    // Bowl
    {
      type: 'cylinder',
      radiusTop: 0.17,
      radiusBottom: 0.15,
      height: 0.35,
      segments: 24,
      position: [0, 0.175, 0.05],
      material: 'porcelain_white',
    },
    // Seat (thin lid)
    {
      type: 'box',
      width: 0.38,
      height: 0.02,
      depth: 0.35,
      position: [0, 0.36, 0.05],
      material: 'porcelain_white',
    },
  ]
  return { primitives, defaultHeight: 0.40 }
}

function generateSink(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Vanity cabinet
    {
      type: 'box',
      width: 0.50,
      height: 0.80,
      depth: 0.40,
      position: [0, 0.40, 0],
      material: 'wood_light',
    },
    // Countertop
    {
      type: 'box',
      width: 0.52,
      height: 0.03,
      depth: 0.42,
      position: [0, 0.80, 0],
      material: 'countertop_white',
    },
    // Basin (recessed into countertop)
    {
      type: 'cylinder',
      radiusTop: 0.18,
      radiusBottom: 0.18,
      height: 0.10,
      segments: 24,
      position: [0, 0.78, 0],
      material: 'porcelain_white',
    },
    // Faucet
    {
      type: 'cylinder',
      radiusTop: 0.015,
      radiusBottom: 0.015,
      height: 0.15,
      segments: 12,
      position: [0, 0.88, -0.12],
      material: 'metal_chrome',
    },
  ]
  return { primitives, defaultHeight: 0.85 }
}

function generateBathtub(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Outer shell
    {
      type: 'box',
      width: 1.52,
      height: 0.45,
      depth: 0.70,
      position: [0, 0.225, 0],
      material: 'porcelain_white',
    },
    // Inner basin (slightly inset)
    {
      type: 'box',
      width: 1.42,
      height: 0.40,
      depth: 0.60,
      position: [0, 0.25, 0],
      material: 'ceramic_white',
    },
  ]
  return { primitives, defaultHeight: 0.45 }
}

function generateShower(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Base / tray
    {
      type: 'box',
      width: 0.90,
      height: 0.02,
      depth: 0.90,
      position: [0, 0.01, 0],
      material: 'ceramic_white',
    },
    // Back glass wall
    {
      type: 'plane',
      width: 0.90,
      height: 2.10,
      position: [0, 1.05, -0.45],
      material: 'glass_clear',
    },
    // Left glass wall
    {
      type: 'plane',
      width: 0.90,
      height: 2.10,
      position: [-0.45, 1.05, 0],
      rotation: [0, Math.PI / 2, 0],
      material: 'glass_clear',
    },
    // Right glass door (partial)
    {
      type: 'plane',
      width: 0.45,
      height: 2.10,
      position: [0.45, 1.05, 0],
      rotation: [0, Math.PI / 2, 0],
      material: 'glass_clear',
    },
    // Shower head
    {
      type: 'cylinder',
      radiusTop: 0.04,
      radiusBottom: 0.04,
      height: 0.05,
      segments: 16,
      position: [0, 2.05, -0.35],
      material: 'metal_chrome',
    },
  ]
  return { primitives, defaultHeight: 2.10 }
}

function generateWaterHeater(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Main tank body
    {
      type: 'cylinder',
      radiusTop: 0.25,
      radiusBottom: 0.25,
      height: 1.40,
      segments: 24,
      position: [0, 0.70, 0],
      material: 'appliance_white',
    },
    // Hot pipe stub
    {
      type: 'cylinder',
      radiusTop: 0.02,
      radiusBottom: 0.02,
      height: 0.10,
      segments: 8,
      position: [-0.08, 1.45, 0],
      material: 'metal_chrome',
    },
    // Cold pipe stub
    {
      type: 'cylinder',
      radiusTop: 0.02,
      radiusBottom: 0.02,
      height: 0.10,
      segments: 8,
      position: [0.08, 1.45, 0],
      material: 'metal_chrome',
    },
  ]
  return { primitives, defaultHeight: 1.40 }
}

function generateHoseBib(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Mounting plate
    {
      type: 'box',
      width: 0.08,
      height: 0.08,
      depth: 0.05,
      position: [0, 0.50, 0],
      material: 'metal_chrome',
    },
    // Spout
    {
      type: 'cylinder',
      radiusTop: 0.01,
      radiusBottom: 0.01,
      height: 0.06,
      segments: 8,
      position: [0, 0.50, 0.04],
      rotation: [Math.PI / 2, 0, 0],
      material: 'metal_chrome',
    },
  ]
  return { primitives, defaultHeight: 0.08 }
}

function generateFloorDrain(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Drain cover disc
    {
      type: 'cylinder',
      radiusTop: 0.05,
      radiusBottom: 0.05,
      height: 0.01,
      segments: 16,
      position: [0, 0.005, 0],
      material: 'metal_dark',
    },
  ]
  return { primitives, defaultHeight: 0.01 }
}

function generateDishwasher(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Body
    {
      type: 'box',
      width: 0.60,
      height: 0.85,
      depth: 0.60,
      position: [0, 0.425, 0],
      material: 'appliance_white',
    },
    // Handle bar
    {
      type: 'box',
      width: 0.40,
      height: 0.02,
      depth: 0.02,
      position: [0, 0.75, 0.31],
      material: 'metal_chrome',
    },
  ]
  return { primitives, defaultHeight: 0.85 }
}

function generateWashingMachine(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Body
    {
      type: 'box',
      width: 0.60,
      height: 0.85,
      depth: 0.60,
      position: [0, 0.425, 0],
      material: 'appliance_white',
    },
    // Drum window (front-loading)
    {
      type: 'cylinder',
      radiusTop: 0.18,
      radiusBottom: 0.18,
      height: 0.02,
      segments: 24,
      position: [0, 0.45, 0.31],
      rotation: [Math.PI / 2, 0, 0],
      material: 'glass_frosted',
    },
  ]
  return { primitives, defaultHeight: 0.85 }
}

function generateUrinal(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Main body (wall-mounted)
    {
      type: 'box',
      width: 0.35,
      height: 0.55,
      depth: 0.30,
      position: [0, 0.775, 0],
      material: 'porcelain_white',
    },
  ]
  return { primitives, defaultHeight: 1.05 }
}

function generateDoubleSink(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Vanity cabinet
    { type: 'box', width: 0.80, height: 0.80, depth: 0.50, position: [0, 0.40, 0], material: 'wood_medium' },
    // Left basin
    { type: 'cylinder', radiusTop: 0.14, radiusBottom: 0.14, height: 0.10, segments: 24, position: [-0.18, 0.78, 0], material: 'ceramic_white' },
    // Right basin
    { type: 'cylinder', radiusTop: 0.14, radiusBottom: 0.14, height: 0.10, segments: 24, position: [0.18, 0.78, 0], material: 'ceramic_white' },
  ]
  return { primitives, defaultHeight: 0.85 }
}

function generateBidet(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    { type: 'cylinder', radiusTop: 0.15, radiusBottom: 0.13, height: 0.30, segments: 24, position: [0, 0.15, 0], material: 'ceramic_white' },
  ]
  return { primitives, defaultHeight: 0.35 }
}

function generateUtilitySink(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Deep basin
    { type: 'box', width: 0.60, height: 0.35, depth: 0.50, position: [0, 0.70, 0], material: 'metal_chrome' },
    // Left leg
    { type: 'cylinder', radiusTop: 0.02, radiusBottom: 0.02, height: 0.52, segments: 8, position: [-0.25, 0.26, 0.20], material: 'metal_chrome' },
    // Right leg
    { type: 'cylinder', radiusTop: 0.02, radiusBottom: 0.02, height: 0.52, segments: 8, position: [0.25, 0.26, 0.20], material: 'metal_chrome' },
    // Left rear leg
    { type: 'cylinder', radiusTop: 0.02, radiusBottom: 0.02, height: 0.52, segments: 8, position: [-0.25, 0.26, -0.20], material: 'metal_chrome' },
    // Right rear leg
    { type: 'cylinder', radiusTop: 0.02, radiusBottom: 0.02, height: 0.52, segments: 8, position: [0.25, 0.26, -0.20], material: 'metal_chrome' },
  ]
  return { primitives, defaultHeight: 0.87 }
}

function generatePedestalSink(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Basin
    { type: 'cylinder', radiusTop: 0.22, radiusBottom: 0.20, height: 0.12, segments: 24, position: [0, 0.80, 0], material: 'ceramic_white' },
    // Pedestal
    { type: 'cylinder', radiusTop: 0.08, radiusBottom: 0.10, height: 0.74, segments: 16, position: [0, 0.37, 0], material: 'ceramic_white' },
  ]
  return { primitives, defaultHeight: 0.86 }
}
