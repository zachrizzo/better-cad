// 3D Furniture Generators for BetterCAD
// Data-only: no React, no Three.js — just PrimitiveSpec arrays.

import type { Element3DSpec, PrimitiveSpec, MaterialId } from '../element3d-specs'
import type { FurnitureSymbolType } from '../../services/kernel-bridge'

// ---------------------------------------------------------------------------
// Helper: four legs at corners
// ---------------------------------------------------------------------------
function fourLegs(
  w: number,
  d: number,
  radius: number,
  height: number,
  material: MaterialId,
  inset = 0.05,
): PrimitiveSpec[] {
  const hx = w / 2 - inset
  const hz = d / 2 - inset
  return [
    { type: 'cylinder', radiusTop: radius, radiusBottom: radius, height, segments: 12, position: [-hx, height / 2, -hz], material },
    { type: 'cylinder', radiusTop: radius, radiusBottom: radius, height, segments: 12, position: [hx, height / 2, -hz], material },
    { type: 'cylinder', radiusTop: radius, radiusBottom: radius, height, segments: 12, position: [-hx, height / 2, hz], material },
    { type: 'cylinder', radiusTop: radius, radiusBottom: radius, height, segments: 12, position: [hx, height / 2, hz], material },
  ]
}

// ---------------------------------------------------------------------------
// Fallback: plain box
// ---------------------------------------------------------------------------
function fallbackBox(w: number, d: number): Element3DSpec {
  const h = 0.75
  return {
    primitives: [
      { type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' },
    ],
    defaultHeight: h,
  }
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

function generateDesk(w: number, d: number): Element3DSpec {
  const topThick = 0.03
  const legH = 0.72
  return {
    primitives: [
      // desktop surface
      { type: 'box', width: w, height: topThick, depth: d, position: [0, legH + topThick / 2, 0], material: 'wood_light' },
      // 4 legs
      ...fourLegs(w, d, 0.025, legH, 'wood_dark'),
    ],
    defaultHeight: 0.75,
  }
}

function generateChair(_w: number, _d: number): Element3DSpec {
  const seatW = 0.45
  const seatD = 0.45
  const seatThick = 0.04
  const seatH = 0.45
  const backH = 0.40
  const backThick = 0.03
  const legR = 0.02
  return {
    primitives: [
      // seat
      { type: 'box', width: seatW, height: seatThick, depth: seatD, position: [0, seatH + seatThick / 2, 0], material: 'fabric_gray' },
      // backrest
      { type: 'box', width: seatW, height: backH, depth: backThick, position: [0, seatH + seatThick + backH / 2, -seatD / 2 + backThick / 2], material: 'fabric_gray' },
      // 4 legs
      ...fourLegs(seatW, seatD, legR, seatH, 'metal_chrome'),
    ],
    defaultHeight: 0.85,
  }
}

function generateTable(w: number, d: number): Element3DSpec {
  const topThick = 0.03
  const legH = 0.72
  return {
    primitives: [
      { type: 'box', width: w, height: topThick, depth: d, position: [0, legH + topThick / 2, 0], material: 'wood_medium' },
      ...fourLegs(w, d, 0.025, legH, 'wood_dark'),
    ],
    defaultHeight: 0.75,
  }
}

function generateBed(w: number, d: number): Element3DSpec {
  const frameH = 0.15
  const frameY = 0.22
  const mattressH = 0.20
  const mattressY = frameY + frameH / 2 + mattressH / 2
  const headboardH = 0.60
  const headboardThick = 0.05
  return {
    primitives: [
      // frame
      { type: 'box', width: w, height: frameH, depth: d, position: [0, frameY + frameH / 2, 0], material: 'wood_light' },
      // mattress
      { type: 'box', width: w - 0.1, height: mattressH, depth: d - 0.1, position: [0, mattressY, 0], material: 'mattress_white' },
      // headboard
      { type: 'box', width: w, height: headboardH, depth: headboardThick, position: [0, frameY + headboardH / 2, -d / 2 + headboardThick / 2], material: 'wood_light' },
    ],
    defaultHeight: 0.90,
  }
}

function generateSofa(w: number, d: number): Element3DSpec {
  const baseH = 0.35
  const baseY = 0.17
  const backH = 0.35
  const backD = 0.15
  const armW = 0.12
  const armH = 0.25
  return {
    primitives: [
      // base / seat
      { type: 'box', width: w, height: baseH, depth: d, position: [0, baseY + baseH / 2, 0], material: 'fabric_beige' },
      // back cushion
      { type: 'box', width: w, height: backH, depth: backD, position: [0, baseY + baseH + backH / 2, -d / 2 + backD / 2], material: 'cushion_beige' },
      // left arm
      { type: 'box', width: armW, height: armH, depth: d, position: [-w / 2 + armW / 2, baseY + baseH + armH / 2 - 0.10, 0], material: 'fabric_beige' },
      // right arm
      { type: 'box', width: armW, height: armH, depth: d, position: [w / 2 - armW / 2, baseY + baseH + armH / 2 - 0.10, 0], material: 'fabric_beige' },
    ],
    defaultHeight: 0.70,
  }
}

function generateDiningTable(w: number, d: number): Element3DSpec {
  const topThick = 0.03
  const legH = 0.72
  return {
    primitives: [
      { type: 'box', width: w, height: topThick, depth: d, position: [0, legH + topThick / 2, 0], material: 'wood_medium' },
      ...fourLegs(w, d, 0.03, legH, 'wood_dark'),
    ],
    defaultHeight: 0.75,
  }
}

function generateBookshelf(w: number, d: number): Element3DSpec {
  const h = 1.80
  const thick = 0.02
  const shelfCount = 4
  const prims: PrimitiveSpec[] = []

  // left side
  prims.push({ type: 'box', width: thick, height: h, depth: d, position: [-w / 2 + thick / 2, h / 2, 0], material: 'wood_light' })
  // right side
  prims.push({ type: 'box', width: thick, height: h, depth: d, position: [w / 2 - thick / 2, h / 2, 0], material: 'wood_light' })
  // top
  prims.push({ type: 'box', width: w, height: thick, depth: d, position: [0, h - thick / 2, 0], material: 'wood_light' })
  // bottom
  prims.push({ type: 'box', width: w, height: thick, depth: d, position: [0, thick / 2, 0], material: 'wood_light' })
  // back panel
  prims.push({ type: 'box', width: w - thick * 2, height: h - thick * 2, depth: 0.005, position: [0, h / 2, -d / 2 + 0.005 / 2], material: 'wood_medium' })

  // interior shelves
  const innerW = w - thick * 2
  const spacing = (h - thick * 2) / (shelfCount + 1)
  for (let i = 1; i <= shelfCount; i++) {
    const sy = thick + spacing * i
    prims.push({ type: 'box', width: innerW, height: thick, depth: d - 0.01, position: [0, sy, 0], material: 'wood_light' })
  }

  return { primitives: prims, defaultHeight: 1.80 }
}

function generateWardrobe(w: number, d: number): Element3DSpec {
  const h = 2.0
  const thick = 0.02
  const prims: PrimitiveSpec[] = []

  // body (solid box)
  prims.push({ type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' })
  // vertical divider
  prims.push({ type: 'box', width: thick, height: h - 0.04, depth: d - 0.04, position: [0, h / 2, 0], material: 'wood_dark' })
  // left door handle
  prims.push({ type: 'cylinder', radiusTop: 0.01, radiusBottom: 0.01, height: 0.10, segments: 8, position: [-0.08, h * 0.5, d / 2 + 0.015], material: 'metal_chrome' })
  // right door handle
  prims.push({ type: 'cylinder', radiusTop: 0.01, radiusBottom: 0.01, height: 0.10, segments: 8, position: [0.08, h * 0.5, d / 2 + 0.015], material: 'metal_chrome' })

  return { primitives: prims, defaultHeight: 2.00 }
}

function generateToiletStall(w: number, d: number): Element3DSpec {
  const h = 1.80
  const wallThick = 0.04
  const prims: PrimitiveSpec[] = []

  // left wall
  prims.push({ type: 'box', width: wallThick, height: h, depth: d, position: [-w / 2 + wallThick / 2, h / 2, 0], material: 'plastic_gray' })
  // right wall
  prims.push({ type: 'box', width: wallThick, height: h, depth: d, position: [w / 2 - wallThick / 2, h / 2, 0], material: 'plastic_gray' })
  // back wall
  prims.push({ type: 'box', width: w, height: h, depth: wallThick, position: [0, h / 2, -d / 2 + wallThick / 2], material: 'plastic_gray' })

  return { primitives: prims, defaultHeight: 1.80 }
}

function generateReceptionDesk(w: number, d: number): Element3DSpec {
  const workH = 0.72
  const topThick = 0.03
  const frontPanelH = 1.10
  const frontPanelThick = 0.05
  const riserH = 0.38
  const prims: PrimitiveSpec[] = []

  // front panel (full height)
  prims.push({ type: 'box', width: w, height: frontPanelH, depth: frontPanelThick, position: [0, frontPanelH / 2, d / 2 - frontPanelThick / 2], material: 'wood_dark' })
  // work surface
  prims.push({ type: 'box', width: w, height: topThick, depth: d, position: [0, workH + topThick / 2, 0], material: 'wood_light' })
  // front riser panel (transaction counter)
  prims.push({ type: 'box', width: w, height: riserH, depth: frontPanelThick, position: [0, workH + topThick + riserH / 2, d / 2 - frontPanelThick / 2], material: 'wood_dark' })

  return { primitives: prims, defaultHeight: 1.10 }
}

function generateConferenceTable(w: number, d: number): Element3DSpec {
  const topThick = 0.03
  const legH = 0.72
  const pedW = 0.40
  const pedD = 0.40
  return {
    primitives: [
      { type: 'box', width: w, height: topThick, depth: d, position: [0, legH + topThick / 2, 0], material: 'wood_dark' },
      // center pedestal
      { type: 'box', width: pedW, height: legH, depth: pedD, position: [0, legH / 2, 0], material: 'wood_dark' },
    ],
    defaultHeight: 0.75,
  }
}

function generateKitchenIsland(w: number, d: number): Element3DSpec {
  const bodyH = 0.87
  const ctopThick = 0.03
  return {
    primitives: [
      // body
      { type: 'box', width: w, height: bodyH, depth: d, position: [0, bodyH / 2, 0], material: 'wood_medium' },
      // countertop overhang
      { type: 'box', width: w + 0.05, height: ctopThick, depth: d + 0.05, position: [0, bodyH + ctopThick / 2, 0], material: 'countertop_gray' },
    ],
    defaultHeight: 0.90,
  }
}

function generateRefrigerator(w: number, d: number): Element3DSpec {
  const h = 1.70
  return {
    primitives: [
      // body
      { type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'appliance_white' },
      // handle (vertical bar on front-right)
      { type: 'cylinder', radiusTop: 0.012, radiusBottom: 0.012, height: 0.40, segments: 8, position: [w / 2 - 0.06, h * 0.55, d / 2 + 0.02], material: 'metal_chrome' },
      // door divider line (horizontal)
      { type: 'box', width: w - 0.02, height: 0.005, depth: 0.005, position: [0, h * 0.62, d / 2 + 0.003], material: 'plastic_gray' },
    ],
    defaultHeight: 1.70,
  }
}

function generateStove(w: number, d: number): Element3DSpec {
  const bodyH = 0.87
  const burnerR = 0.055
  const burnerH = 0.01
  const topY = bodyH + burnerH / 2
  const bx = w * 0.2
  const bz = d * 0.2
  return {
    primitives: [
      { type: 'box', width: w, height: bodyH, depth: d, position: [0, bodyH / 2, 0], material: 'appliance_stainless' },
      // 4 burners
      { type: 'cylinder', radiusTop: burnerR, radiusBottom: burnerR, height: burnerH, segments: 16, position: [-bx, topY, -bz], material: 'metal_dark' },
      { type: 'cylinder', radiusTop: burnerR, radiusBottom: burnerR, height: burnerH, segments: 16, position: [bx, topY, -bz], material: 'metal_dark' },
      { type: 'cylinder', radiusTop: burnerR, radiusBottom: burnerR, height: burnerH, segments: 16, position: [-bx, topY, bz], material: 'metal_dark' },
      { type: 'cylinder', radiusTop: burnerR, radiusBottom: burnerR, height: burnerH, segments: 16, position: [bx, topY, bz], material: 'metal_dark' },
      // control panel strip at back
      { type: 'box', width: w - 0.02, height: 0.06, depth: 0.02, position: [0, bodyH + 0.03, -d / 2 + 0.01], material: 'appliance_stainless' },
    ],
    defaultHeight: 0.90,
  }
}

function generateWasher(w: number, d: number): Element3DSpec {
  const h = 0.85
  const drumR = Math.min(w, d) * 0.22
  return {
    primitives: [
      { type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'appliance_white' },
      // drum circle on front
      { type: 'cylinder', radiusTop: drumR, radiusBottom: drumR, height: 0.01, segments: 20, position: [0, h * 0.45, d / 2 + 0.006], rotation: [Math.PI / 2, 0, 0], material: 'glass_clear' },
      // control panel strip at top-front
      { type: 'box', width: w - 0.04, height: 0.06, depth: 0.02, position: [0, h - 0.03, d / 2 - 0.01], material: 'plastic_gray' },
    ],
    defaultHeight: 0.85,
  }
}

function generateDryer(w: number, d: number): Element3DSpec {
  const h = 0.85
  const drumR = Math.min(w, d) * 0.22
  return {
    primitives: [
      { type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'appliance_white' },
      // drum circle on front
      { type: 'cylinder', radiusTop: drumR, radiusBottom: drumR, height: 0.01, segments: 20, position: [0, h * 0.45, d / 2 + 0.006], rotation: [Math.PI / 2, 0, 0], material: 'glass_clear' },
      // control panel strip at top-front
      { type: 'box', width: w - 0.04, height: 0.06, depth: 0.02, position: [0, h - 0.03, d / 2 - 0.01], material: 'plastic_gray' },
    ],
    defaultHeight: 0.85,
  }
}

function generateNightstand(w: number, d: number): Element3DSpec {
  const h = 0.50
  const dividerThick = 0.01
  return {
    primitives: [
      // body
      { type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_light' },
      // drawer divider
      { type: 'box', width: w - 0.02, height: dividerThick, depth: d - 0.02, position: [0, h / 2, 0], material: 'wood_dark' },
      // drawer handle (top drawer)
      { type: 'cylinder', radiusTop: 0.008, radiusBottom: 0.008, height: 0.06, segments: 8, position: [0, h * 0.75, d / 2 + 0.01], rotation: [0, 0, Math.PI / 2], material: 'metal_chrome' },
      // drawer handle (bottom drawer)
      { type: 'cylinder', radiusTop: 0.008, radiusBottom: 0.008, height: 0.06, segments: 8, position: [0, h * 0.25, d / 2 + 0.01], rotation: [0, 0, Math.PI / 2], material: 'metal_chrome' },
    ],
    defaultHeight: 0.50,
  }
}

function generateCoffeeTable(w: number, d: number): Element3DSpec {
  const topThick = 0.03
  const legH = 0.40
  return {
    primitives: [
      { type: 'box', width: w, height: topThick, depth: d, position: [0, legH + topThick / 2, 0], material: 'wood_medium' },
      ...fourLegs(w, d, 0.02, legH, 'wood_dark'),
    ],
    defaultHeight: 0.43,
  }
}

function generateTvConsole(w: number, d: number): Element3DSpec {
  const h = 0.45
  const shelfThick = 0.015
  return {
    primitives: [
      // body
      { type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' },
      // shelf divider (horizontal)
      { type: 'box', width: w - 0.04, height: shelfThick, depth: d - 0.02, position: [0, h * 0.45, 0], material: 'wood_dark' },
      // vertical dividers (creating 3 compartments)
      { type: 'box', width: 0.015, height: h - 0.04, depth: d - 0.02, position: [-w / 3.5, h / 2, 0], material: 'wood_dark' },
      { type: 'box', width: 0.015, height: h - 0.04, depth: d - 0.02, position: [w / 3.5, h / 2, 0], material: 'wood_dark' },
    ],
    defaultHeight: 0.50,
  }
}

function generateConsoleTable(w: number, d: number): Element3DSpec {
  const topThick = 0.02
  const legH = 0.75
  return {
    primitives: [
      { type: 'box', width: w, height: topThick, depth: d, position: [0, legH + topThick / 2, 0], material: 'wood_light' },
      ...fourLegs(w, d, 0.02, legH, 'metal_chrome'),
    ],
    defaultHeight: 0.77,
  }
}

function generateBench(w: number, d: number): Element3DSpec {
  const seatThick = 0.05
  const legH = 0.42
  return {
    primitives: [
      { type: 'box', width: w, height: seatThick, depth: d, position: [0, legH + seatThick / 2, 0], material: 'wood_medium' },
      ...fourLegs(w, d, 0.03, legH, 'metal_chrome'),
    ],
    defaultHeight: 0.47,
  }
}

function generateOttoman(w: number, d: number): Element3DSpec {
  const h = 0.35
  return {
    primitives: [
      { type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'fabric_beige' },
    ],
    defaultHeight: 0.35,
  }
}

function generateVanity(w: number, d: number): Element3DSpec {
  const bodyH = 0.80
  const mirrorH = 0.50
  const mirrorThick = 0.02
  return {
    primitives: [
      // cabinet body
      { type: 'box', width: w, height: bodyH, depth: d, position: [0, bodyH / 2, 0], material: 'wood_light' },
      // countertop
      { type: 'box', width: w + 0.02, height: 0.02, depth: d + 0.02, position: [0, bodyH + 0.01, 0], material: 'countertop_white' },
      // mirror
      { type: 'box', width: w - 0.10, height: mirrorH, depth: mirrorThick, position: [0, bodyH + 0.05 + mirrorH / 2, -d / 2 + mirrorThick / 2], material: 'glass_clear' },
    ],
    defaultHeight: 1.30,
  }
}

function generateMicrowave(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.5, height: 0.3, depth: 0.4, position: [0, 0.15, 0], material: 'metal_dark' },
      { type: 'plane', width: 0.35, height: 0.22, position: [0, 0.15, 0.201], material: 'glass_tinted' },
    ],
    defaultHeight: 0.30,
  }
}

function generateOven(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.76, height: 0.9, depth: 0.65, position: [0, 0.45, 0], material: 'metal_dark' },
      { type: 'plane', width: 0.60, height: 0.50, position: [0, 0.45, 0.326], material: 'glass_tinted' },
    ],
    defaultHeight: 0.90,
  }
}

function generateRangeHood(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.76, height: 0.3, depth: 0.5, position: [0, 0.15, 0], material: 'metal_dark' },
      { type: 'box', width: 0.70, height: 0.02, depth: 0.44, position: [0, 0.01, 0], material: 'metal_chrome' },
    ],
    defaultHeight: 0.30,
  }
}

function generatePlant(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'cylinder', radiusTop: 0.15, radiusBottom: 0.12, height: 0.3, segments: 16, position: [0, 0.15, 0], material: 'wood_medium' },
      { type: 'sphere', radius: 0.25, segments: 16, position: [0, 0.50, 0], material: 'green_foliage' },
    ],
    defaultHeight: 0.75,
  }
}

function generateMirror(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.6, height: 0.9, depth: 0.03, position: [0, 0.45, 0], material: 'wood_light' },
      { type: 'plane', width: 0.54, height: 0.84, position: [0, 0.45, 0.016], material: 'glass_clear' },
    ],
    defaultHeight: 0.90,
  }
}

function generateFireplace(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 1.2, height: 1.0, depth: 0.5, position: [0, 0.5, 0], material: 'stone_gray' },
      { type: 'box', width: 1.3, height: 0.15, depth: 0.55, position: [0, 1.075, 0], material: 'wood_medium' },
    ],
    defaultHeight: 1.15,
  }
}

function generateCoffeeMaker(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.25, height: 0.35, depth: 0.2, position: [0, 0.175, 0], material: 'plastic_dark' },
      { type: 'cylinder', radiusTop: 0.06, radiusBottom: 0.05, height: 0.15, segments: 12, position: [0, 0.075, 0.12], material: 'glass_clear' },
    ],
    defaultHeight: 0.35,
  }
}

function generateArtwork(_w: number, _d: number): Element3DSpec {
  return {
    primitives: [
      { type: 'box', width: 0.8, height: 0.6, depth: 0.03, position: [0, 0.3, 0], material: 'wood_light' },
      { type: 'plane', width: 0.72, height: 0.52, position: [0, 0.3, 0.016], material: 'plastic_dark' },
    ],
    defaultHeight: 0.60,
  }
}

// ---------------------------------------------------------------------------
// Generator dispatch map
// ---------------------------------------------------------------------------
type GeneratorFn = (w: number, d: number) => Element3DSpec

const GENERATORS: Record<FurnitureSymbolType, GeneratorFn> = {
  desk: generateDesk,
  chair: generateChair,
  table: generateTable,
  bed: generateBed,
  sofa: generateSofa,
  dining_table: generateDiningTable,
  bookshelf: generateBookshelf,
  wardrobe: generateWardrobe,
  toilet_stall: generateToiletStall,
  reception_desk: generateReceptionDesk,
  conference_table: generateConferenceTable,
  kitchen_island: generateKitchenIsland,
  refrigerator: generateRefrigerator,
  stove: generateStove,
  washer: generateWasher,
  dryer: generateDryer,
  nightstand: generateNightstand,
  coffee_table: generateCoffeeTable,
  tv_console: generateTvConsole,
  console_table: generateConsoleTable,
  bench: generateBench,
  ottoman: generateOttoman,
  vanity: generateVanity,
  microwave: generateMicrowave,
  oven: generateOven,
  range_hood: generateRangeHood,
  plant: generatePlant,
  mirror: generateMirror,
  fireplace: generateFireplace,
  coffee_maker: generateCoffeeMaker,
  artwork: generateArtwork,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a data-driven 3D spec for a furniture element.
 * Returns an array of PrimitiveSpec objects that can be rendered
 * by the 3D viewport without any Three.js dependency in this module.
 */
export function generateFurniture3D(
  symbolType: FurnitureSymbolType,
  width: number,
  depth: number,
): Element3DSpec {
  const generator = GENERATORS[symbolType]
  if (generator) return generator(width, depth)
  return fallbackBox(width, depth)
}
