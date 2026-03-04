import type { Element3DSpec, PrimitiveSpec } from '../element3d-specs'
import type { ElectricalSymbolType } from '../../services/kernel-bridge'

export function generateElectrical3D(symbolType: ElectricalSymbolType): Element3DSpec {
  const gen = GENERATORS[symbolType]
  if (gen) return gen()
  return {
    primitives: [
      { type: 'box', width: 0.08, height: 0.08, depth: 0.02, position: [0, 1.0, 0], material: 'plastic_white' },
    ],
    defaultHeight: 0.08,
  }
}

// ---------------------------------------------------------------------------
// Generator lookup table
// ---------------------------------------------------------------------------

const GENERATORS: Record<ElectricalSymbolType, () => Element3DSpec> = {
  outlet: generateOutlet,
  switch: generateSwitch,
  light_fixture: generateLightFixture,
  panel: generatePanel,
  smoke_detector: generateSmokeDetector,
  junction_box: generateJunctionBox,
  three_way_switch: generateThreeWaySwitch,
  dimmer_switch: generateDimmerSwitch,
  gfci_outlet: generateGfciOutlet,
  floor_outlet: generateFloorOutlet,
  ceiling_fan: generateCeilingFan,
  thermostat: generateThermostat,
  recessed_light: generateRecessedLight,
  wall_sconce: generateWallSconce,
  pendant_light: generatePendantLight,
  track_light: generateTrackLight,
  outdoor_light: generateOutdoorLight,
  data_outlet: generateDataOutlet,
  timer_switch: generateTimerSwitch,
  motion_sensor: generateMotionSensor,
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

function generateOutlet(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Face plate
    {
      type: 'box',
      width: 0.07,
      height: 0.11,
      depth: 0.02,
      position: [0, 0.30, 0],
      material: 'plastic_white',
    },
    // Top socket hole
    {
      type: 'cylinder',
      radiusTop: 0.005,
      radiusBottom: 0.005,
      height: 0.005,
      segments: 8,
      position: [-0.01, 0.325, 0.011],
      material: 'plastic_black',
    },
    // Bottom socket hole
    {
      type: 'cylinder',
      radiusTop: 0.005,
      radiusBottom: 0.005,
      height: 0.005,
      segments: 8,
      position: [-0.01, 0.275, 0.011],
      material: 'plastic_black',
    },
  ]
  return { primitives, defaultHeight: 0.11 }
}

function generateSwitch(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Face plate
    {
      type: 'box',
      width: 0.07,
      height: 0.11,
      depth: 0.02,
      position: [0, 1.10, 0],
      material: 'plastic_white',
    },
    // Toggle
    {
      type: 'box',
      width: 0.02,
      height: 0.03,
      depth: 0.01,
      position: [0, 1.10, 0.015],
      material: 'plastic_gray',
    },
  ]
  return { primitives, defaultHeight: 0.11 }
}

function generateLightFixture(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Ceiling disc / base
    {
      type: 'cylinder',
      radiusTop: 0.15,
      radiusBottom: 0.15,
      height: 0.03,
      segments: 24,
      position: [0, 2.80, 0],
      material: 'plastic_white',
    },
    // Bulb
    {
      type: 'sphere',
      radius: 0.04,
      segments: 16,
      position: [0, 2.76, 0],
      material: 'glass_frosted',
    },
  ]
  return { primitives, defaultHeight: 0.03 }
}

function generatePanel(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Panel enclosure
    {
      type: 'box',
      width: 0.60,
      height: 0.90,
      depth: 0.15,
      position: [0, 1.25, 0],
      material: 'metal_dark',
    },
    // Panel door
    {
      type: 'box',
      width: 0.56,
      height: 0.86,
      depth: 0.01,
      position: [0, 1.25, 0.08],
      material: 'metal_dark',
    },
  ]
  return { primitives, defaultHeight: 0.90 }
}

function generateSmokeDetector(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Disc housing
    {
      type: 'cylinder',
      radiusTop: 0.06,
      radiusBottom: 0.06,
      height: 0.03,
      segments: 20,
      position: [0, 2.78, 0],
      material: 'plastic_white',
    },
  ]
  return { primitives, defaultHeight: 0.03 }
}

function generateJunctionBox(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Box
    {
      type: 'box',
      width: 0.10,
      height: 0.10,
      depth: 0.05,
      position: [0, 2.50, 0],
      material: 'metal_dark',
    },
  ]
  return { primitives, defaultHeight: 0.10 }
}

function generateThreeWaySwitch(): Element3DSpec {
  // Visually identical to a standard switch
  const primitives: PrimitiveSpec[] = [
    // Face plate
    {
      type: 'box',
      width: 0.07,
      height: 0.11,
      depth: 0.02,
      position: [0, 1.10, 0],
      material: 'plastic_white',
    },
    // Toggle
    {
      type: 'box',
      width: 0.02,
      height: 0.03,
      depth: 0.01,
      position: [0, 1.10, 0.015],
      material: 'plastic_gray',
    },
  ]
  return { primitives, defaultHeight: 0.11 }
}

function generateDimmerSwitch(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Face plate
    {
      type: 'box',
      width: 0.07,
      height: 0.11,
      depth: 0.02,
      position: [0, 1.10, 0],
      material: 'plastic_white',
    },
    // Rotary dial
    {
      type: 'cylinder',
      radiusTop: 0.015,
      radiusBottom: 0.015,
      height: 0.01,
      segments: 12,
      position: [0, 1.10, 0.015],
      material: 'plastic_gray',
    },
  ]
  return { primitives, defaultHeight: 0.11 }
}

function generateGfciOutlet(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Face plate (slightly taller than standard outlet)
    {
      type: 'box',
      width: 0.07,
      height: 0.13,
      depth: 0.02,
      position: [0, 0.30, 0],
      material: 'plastic_white',
    },
    // Test button
    {
      type: 'box',
      width: 0.015,
      height: 0.01,
      depth: 0.005,
      position: [-0.012, 0.31, 0.013],
      material: 'plastic_red',
    },
    // Reset button
    {
      type: 'box',
      width: 0.015,
      height: 0.01,
      depth: 0.005,
      position: [0.012, 0.31, 0.013],
      material: 'plastic_black',
    },
  ]
  return { primitives, defaultHeight: 0.13 }
}

function generateFloorOutlet(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Recessed cylinder housing
    {
      type: 'cylinder',
      radiusTop: 0.05,
      radiusBottom: 0.05,
      height: 0.02,
      segments: 16,
      position: [0, 0.01, 0],
      material: 'metal_dark',
    },
    // Flip-up lid
    {
      type: 'box',
      width: 0.08,
      height: 0.01,
      depth: 0.08,
      position: [0, 0.02, 0],
      material: 'metal_dark',
    },
  ]
  return { primitives, defaultHeight: 0.02 }
}

function generateCeilingFan(): Element3DSpec {
  const bladeLength = 0.50
  const bladeWidth = 0.12
  const bladeY = 2.70

  const primitives: PrimitiveSpec[] = [
    // Center motor housing
    {
      type: 'cylinder',
      radiusTop: 0.08,
      radiusBottom: 0.08,
      height: 0.15,
      segments: 20,
      position: [0, 2.75, 0],
      material: 'metal_chrome',
    },
    // Blade 1 (front, +Z)
    {
      type: 'plane',
      width: bladeLength,
      height: bladeWidth,
      position: [0, bladeY, 0.30],
      rotation: [Math.PI / 2, 0, 0],
      material: 'wood_light',
    },
    // Blade 2 (back, -Z)
    {
      type: 'plane',
      width: bladeLength,
      height: bladeWidth,
      position: [0, bladeY, -0.30],
      rotation: [Math.PI / 2, 0, 0],
      material: 'wood_light',
    },
    // Blade 3 (right, +X)
    {
      type: 'plane',
      width: bladeLength,
      height: bladeWidth,
      position: [0.30, bladeY, 0],
      rotation: [Math.PI / 2, Math.PI / 2, 0],
      material: 'wood_light',
    },
    // Blade 4 (left, -X)
    {
      type: 'plane',
      width: bladeLength,
      height: bladeWidth,
      position: [-0.30, bladeY, 0],
      rotation: [Math.PI / 2, Math.PI / 2, 0],
      material: 'wood_light',
    },
  ]
  return { primitives, defaultHeight: 0.15 }
}

function generateThermostat(): Element3DSpec {
  const primitives: PrimitiveSpec[] = [
    // Housing
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
  ]
  return { primitives, defaultHeight: 0.12 }
}

function generateRecessedLight(): Element3DSpec {
  return {
    primitives: [
      { type: 'cylinder', radiusTop: 0.075, radiusBottom: 0.075, height: 0.05, segments: 20, position: [0, 2.78, 0], material: 'metal_chrome' },
    ],
    defaultHeight: 0.05,
  }
}

function generateWallSconce(): Element3DSpec {
  return {
    primitives: [
      { type: 'cylinder', radiusTop: 0.08, radiusBottom: 0.08, height: 0.15, segments: 16, position: [0, 1.80, 0], material: 'metal_chrome' },
    ],
    defaultHeight: 0.15,
  }
}

function generatePendantLight(): Element3DSpec {
  return {
    primitives: [
      { type: 'cylinder', radiusTop: 0.12, radiusBottom: 0.15, height: 0.18, segments: 20, position: [0, 2.20, 0], material: 'metal_dark' },
      { type: 'cylinder', radiusTop: 0.005, radiusBottom: 0.005, height: 0.50, segments: 8, position: [0, 2.54, 0], material: 'plastic_dark' },
    ],
    defaultHeight: 0.68,
  }
}

function generateTrackLight(): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 1.0, height: 0.04, depth: 0.04, position: [0, 2.78, 0], material: 'metal_dark' },
      { type: 'cylinder', radiusTop: 0.03, radiusBottom: 0.03, height: 0.06, segments: 12, position: [-0.30, 2.74, 0], material: 'metal_chrome' },
      { type: 'cylinder', radiusTop: 0.03, radiusBottom: 0.03, height: 0.06, segments: 12, position: [0, 2.74, 0], material: 'metal_chrome' },
      { type: 'cylinder', radiusTop: 0.03, radiusBottom: 0.03, height: 0.06, segments: 12, position: [0.30, 2.74, 0], material: 'metal_chrome' },
    ],
    defaultHeight: 0.10,
  }
}

function generateOutdoorLight(): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.15, height: 0.20, depth: 0.10, position: [0, 2.30, 0], material: 'metal_dark' },
    ],
    defaultHeight: 0.20,
  }
}

function generateDataOutlet(): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.07, height: 0.07, depth: 0.02, position: [0, 0.30, 0], material: 'plastic_dark' },
    ],
    defaultHeight: 0.07,
  }
}

function generateTimerSwitch(): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.07, height: 0.11, depth: 0.02, position: [0, 1.10, 0], material: 'plastic_dark' },
    ],
    defaultHeight: 0.11,
  }
}

function generateMotionSensor(): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.06, height: 0.06, depth: 0.03, position: [0, 2.50, 0], material: 'plastic_dark' },
    ],
    defaultHeight: 0.06,
  }
}
