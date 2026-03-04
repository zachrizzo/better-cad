// 3D Cabinet Generators for BetterCAD
// Data-only: no React, no Three.js — just PrimitiveSpec arrays.

import type { Element3DSpec, PrimitiveSpec, MaterialId } from '../element3d-specs'
import type { CabinetType } from '../../services/kernel-bridge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function doorPanel(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  material: MaterialId = 'wood_light',
): PrimitiveSpec {
  return { type: 'box', width: w, height: h, depth: 0.02, position: [x, y, z], material }
}

function handle(
  x: number,
  y: number,
  z: number,
): PrimitiveSpec {
  return {
    type: 'cylinder',
    radiusTop: 0.008,
    radiusBottom: 0.008,
    height: 0.08,
    segments: 8,
    position: [x, y, z],
    rotation: [0, 0, Math.PI / 2],
    material: 'metal_chrome',
  }
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

function generateBase(w: number, d: number, h: number, doorCount: number, drawerCount: number): Element3DSpec {
  const bodyH = h
  const ctopThick = 0.03
  const prims: PrimitiveSpec[] = []

  // Body
  prims.push({ type: 'box', width: w, height: bodyH, depth: d, position: [0, bodyH / 2, 0], material: 'wood_medium' })
  // Countertop with overhang
  prims.push({ type: 'box', width: w + 0.025, height: ctopThick, depth: d + 0.025, position: [0, bodyH + ctopThick / 2, 0], material: 'countertop_gray' })

  // Door panels on front
  const panelH = bodyH * 0.92
  const panelY = bodyH / 2
  const frontZ = d / 2 + 0.011
  const count = Math.max(1, doorCount)
  const panelW = (w - 0.04) / count
  for (let i = 0; i < count; i++) {
    const px = -w / 2 + 0.02 + panelW / 2 + i * panelW
    prims.push(doorPanel(px, panelY, frontZ, panelW - 0.01, panelH))
    prims.push(handle(px, bodyH * 0.55, frontZ + 0.015))
  }

  return { primitives: prims, defaultHeight: bodyH + ctopThick }
}

function generateDrawerBase(w: number, d: number, h: number): Element3DSpec {
  const bodyH = h
  const ctopThick = 0.03
  const prims: PrimitiveSpec[] = []

  prims.push({ type: 'box', width: w, height: bodyH, depth: d, position: [0, bodyH / 2, 0], material: 'wood_medium' })
  prims.push({ type: 'box', width: w + 0.025, height: ctopThick, depth: d + 0.025, position: [0, bodyH + ctopThick / 2, 0], material: 'countertop_gray' })

  // 3 drawer fronts
  const frontZ = d / 2 + 0.011
  const drawerW = w - 0.04
  const drawerH = (bodyH - 0.06) / 3
  for (let i = 0; i < 3; i++) {
    const dy = 0.03 + drawerH / 2 + i * drawerH
    prims.push(doorPanel(0, dy, frontZ, drawerW, drawerH - 0.01))
    prims.push(handle(0, dy, frontZ + 0.015))
  }

  return { primitives: prims, defaultHeight: bodyH + ctopThick }
}

function generateUpper(w: number, d: number, h: number, doorCount: number): Element3DSpec {
  const prims: PrimitiveSpec[] = []

  // Body (no countertop, mounted on wall)
  prims.push({ type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' })

  // Door panels
  const panelH = h * 0.92
  const panelY = h / 2
  const frontZ = d / 2 + 0.011
  const count = Math.max(1, doorCount)
  const panelW = (w - 0.04) / count
  for (let i = 0; i < count; i++) {
    const px = -w / 2 + 0.02 + panelW / 2 + i * panelW
    prims.push(doorPanel(px, panelY, frontZ, panelW - 0.01, panelH))
    prims.push(handle(px, h * 0.45, frontZ + 0.015))
  }

  // Interior shelf
  prims.push({ type: 'box', width: w - 0.04, height: 0.015, depth: d - 0.02, position: [0, h / 2, 0], material: 'wood_light' })

  return { primitives: prims, defaultHeight: h }
}

function generateTall(w: number, d: number, h: number, doorCount: number): Element3DSpec {
  const prims: PrimitiveSpec[] = []

  prims.push({ type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' })

  // Upper door
  const upperH = h * 0.45
  const upperY = h - upperH / 2 - 0.02
  const frontZ = d / 2 + 0.011
  const panelW = w - 0.04
  prims.push(doorPanel(0, upperY, frontZ, panelW, upperH - 0.02))
  prims.push(handle(0, upperY - upperH * 0.15, frontZ + 0.015))

  // Lower door
  const lowerH = h * 0.45
  const lowerY = lowerH / 2 + 0.02
  prims.push(doorPanel(0, lowerY, frontZ, panelW, lowerH - 0.02))
  prims.push(handle(0, lowerY + lowerH * 0.15, frontZ + 0.015))

  // Horizontal divider
  prims.push({ type: 'box', width: w - 0.02, height: 0.02, depth: d - 0.02, position: [0, h / 2, 0], material: 'wood_dark' })

  return { primitives: prims, defaultHeight: h }
}

function generateCornerBase(w: number, d: number, h: number): Element3DSpec {
  const ctopThick = 0.03
  const prims: PrimitiveSpec[] = []

  prims.push({ type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' })
  prims.push({ type: 'box', width: w + 0.025, height: ctopThick, depth: d + 0.025, position: [0, h + ctopThick / 2, 0], material: 'countertop_gray' })

  // Single angled door panel
  const frontZ = d / 2 + 0.011
  prims.push(doorPanel(0, h / 2, frontZ, w * 0.6, h * 0.9))
  prims.push(handle(0, h * 0.55, frontZ + 0.015))

  return { primitives: prims, defaultHeight: h + ctopThick }
}

function generateSinkBase(w: number, d: number, h: number): Element3DSpec {
  const ctopThick = 0.03
  const prims: PrimitiveSpec[] = []

  prims.push({ type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' })
  prims.push({ type: 'box', width: w + 0.025, height: ctopThick, depth: d + 0.025, position: [0, h + ctopThick / 2, 0], material: 'countertop_gray' })

  // Sink basin (recessed box on top)
  const sinkW = w * 0.6
  const sinkD = d * 0.45
  const sinkH = 0.15
  prims.push({ type: 'box', width: sinkW, height: sinkH, depth: sinkD, position: [0, h + ctopThick - sinkH / 2, 0.05], material: 'porcelain_white' })

  // Faucet
  prims.push({
    type: 'cylinder', radiusTop: 0.012, radiusBottom: 0.012, height: 0.12, segments: 8,
    position: [0, h + ctopThick + 0.06, -sinkD / 2 + 0.02], material: 'metal_chrome',
  })

  // Door panels
  const frontZ = d / 2 + 0.011
  const panelW = (w - 0.04) / 2
  for (let i = 0; i < 2; i++) {
    const px = -w / 2 + 0.02 + panelW / 2 + i * panelW
    prims.push(doorPanel(px, h / 2, frontZ, panelW - 0.01, h * 0.9))
    prims.push(handle(px, h * 0.55, frontZ + 0.015))
  }

  return { primitives: prims, defaultHeight: h + ctopThick + 0.12 }
}

function generateLazySusan(w: number, d: number, h: number): Element3DSpec {
  const ctopThick = 0.03
  const prims: PrimitiveSpec[] = []

  prims.push({ type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' })
  prims.push({ type: 'box', width: w + 0.025, height: ctopThick, depth: d + 0.025, position: [0, h + ctopThick / 2, 0], material: 'countertop_gray' })

  // Rotating shelf disc inside
  prims.push({
    type: 'cylinder', radiusTop: Math.min(w, d) * 0.35, radiusBottom: Math.min(w, d) * 0.35,
    height: 0.015, segments: 24, position: [0, h * 0.5, 0], material: 'wood_light',
  })

  return { primitives: prims, defaultHeight: h + ctopThick }
}

function generateApplianceGarage(w: number, d: number, h: number): Element3DSpec {
  const prims: PrimitiveSpec[] = []

  // Open-front box mounted above counter
  prims.push({ type: 'box', width: w, height: h, depth: d, position: [0, h / 2, 0], material: 'wood_medium' })

  // Roll-up door (thin panel at front)
  prims.push({ type: 'box', width: w - 0.02, height: h - 0.04, depth: 0.005, position: [0, h / 2, d / 2 - 0.003], material: 'metal_chrome' })
  prims.push(handle(0, h * 0.3, d / 2 + 0.01))

  return { primitives: prims, defaultHeight: h }
}

// ---------------------------------------------------------------------------
// Generator dispatch
// ---------------------------------------------------------------------------

type GeneratorFn = (w: number, d: number, h: number, doorCount: number, drawerCount: number) => Element3DSpec

const GENERATORS: Record<CabinetType, GeneratorFn> = {
  base: generateBase,
  drawer_base: (_w, _d, _h, _dc, _drc) => generateDrawerBase(_w, _d, _h),
  upper: (w, d, h, dc) => generateUpper(w, d, h, dc),
  tall: (w, d, h, dc) => generateTall(w, d, h, dc),
  pantry: (w, d, h, dc) => generateTall(w, d, h, dc),
  corner_base: (w, d, h) => generateCornerBase(w, d, h),
  corner_upper: (w, d, h, dc) => generateUpper(w, d, h, dc),
  corner_tall: (w, d, h, dc) => generateTall(w, d, h, dc),
  sink_base: (w, d, h) => generateSinkBase(w, d, h),
  lazy_susan: (w, d, h) => generateLazySusan(w, d, h),
  blind_corner: generateBase,
  appliance_garage: (w, d, h) => generateApplianceGarage(w, d, h),
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateCabinet3D(
  cabinetType: CabinetType,
  width: number,
  depth: number,
  height: number,
  doorCount: number,
  drawerCount: number,
): Element3DSpec {
  const generator = GENERATORS[cabinetType]
  if (generator) return generator(width, depth, height, doorCount, drawerCount)
  return generateBase(width, depth, height, doorCount, drawerCount)
}
