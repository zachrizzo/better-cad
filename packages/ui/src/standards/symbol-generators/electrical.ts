import type { ElectricalElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import {
  addRect, addLine, addCircle, addArc, addText,
  type Point2, type SymbolPrimitive,
} from './_helpers'

// ── Outlet variants ──────────────────────────────────────────────────────────

function addDuplexOutlet(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  // Small circle
  addCircle(primitives, center, rotation, [0, 0], 0.07, 'primary')
  // Two short prongs extending from top and bottom of circle, perpendicular to wall
  addLine(primitives, center, rotation, [0, 0.07], [0, 0.12], 'primary')
  addLine(primitives, center, rotation, [0, -0.07], [0, -0.12], 'primary')
}

function addGfciOutlet(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  addDuplexOutlet(primitives, center, rotation)
  addText(primitives, center, rotation, 'GFI', 0.05)
}

function addFloorOutlet(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  // Same geometry as duplex outlet
  addDuplexOutlet(primitives, center, rotation)
}

// ── Switch variants ──────────────────────────────────────────────────────────

function addSwitch(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  addCircle(primitives, center, rotation, [0, 0], 0.07, 'primary')
  addText(primitives, center, rotation, 'S', 0.06)
  // Short line extending from circle to the right
  addLine(primitives, center, rotation, [0.07, 0], [0.15, 0], 'primary')
}

function addThreeWaySwitch(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  addCircle(primitives, center, rotation, [0, 0], 0.07, 'primary')
  addText(primitives, center, rotation, 'S3', 0.05)
  addLine(primitives, center, rotation, [0.07, 0], [0.15, 0], 'primary')
}

function addDimmerSwitch(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  addCircle(primitives, center, rotation, [0, 0], 0.07, 'primary')
  addText(primitives, center, rotation, 'DIM', 0.04)
  addLine(primitives, center, rotation, [0.07, 0], [0.15, 0], 'primary')
}

// ── Ceiling fixtures ─────────────────────────────────────────────────────────

function addCeilingLight(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  const r = 0.12
  const ext = r + 0.06 // crosshair extends 0.06 past circle edge
  addCircle(primitives, center, rotation, [0, 0], r, 'primary')
  // Horizontal crosshair
  addLine(primitives, center, rotation, [-ext, 0], [ext, 0], 'secondary')
  // Vertical crosshair
  addLine(primitives, center, rotation, [0, -ext], [0, ext], 'secondary')
}

function addCeilingFan(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  const r = 0.14
  addCircle(primitives, center, rotation, [0, 0], r, 'primary')
  // 3 curved blade arcs at 120-degree intervals inside the circle
  const bladeRadius = 0.10
  const sweepDeg = 50
  const halfSweep = (sweepDeg / 2) * (Math.PI / 180)
  for (let i = 0; i < 3; i++) {
    const baseAngle = (i * 120) * (Math.PI / 180)
    addArc(
      primitives, center, rotation,
      [0, 0], bladeRadius,
      baseAngle - halfSweep,
      baseAngle + halfSweep,
      'secondary',
    )
  }
  addText(primitives, center, rotation, 'CF', 0.05)
}

// ── Panel ────────────────────────────────────────────────────────────────────

function addPanel(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  const w = 0.26
  const d = 0.36
  addRect(primitives, center, rotation, w, d, 'primary')
  // 3 internal horizontal grid lines evenly spaced
  const halfH = d / 2
  const halfW = w / 2
  for (let i = 1; i <= 3; i++) {
    const ly = -halfH + (i * d) / 4
    addLine(primitives, center, rotation, [-halfW, ly], [halfW, ly], 'secondary')
  }
}

// ── Small-circle-with-text symbols ───────────────────────────────────────────

function addSmokeDetector(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  addCircle(primitives, center, rotation, [0, 0], 0.09, 'primary')
  addText(primitives, center, rotation, 'SD', 0.06)
}

function addThermostat(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  addCircle(primitives, center, rotation, [0, 0], 0.06, 'primary')
  addText(primitives, center, rotation, 'T', 0.05)
}

function addJunctionBox(
  primitives: SymbolPrimitive[],
  center: Point2,
  rotation: number,
): void {
  addCircle(primitives, center, rotation, [0, 0], 0.08, 'primary')
  addText(primitives, center, rotation, 'J', 0.06)
}

// ── Main generator ───────────────────────────────────────────────────────────

export function generateElectricalPrimitives(
  element: ElectricalElement,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const spec = getSymbolSpec(options.planSymbolProfile, 'electrical', element.symbol_type) ?? {
    domain: 'electrical',
    title: element.symbol_type,
    lineClass: 'primary',
    allowsLabel: false,
    provenance: getDefaultSymbolProvenance(),
  }

  const primitives: SymbolPrimitive[] = []
  const center: Point2 = [element.position[0], element.position[1]]
  const rotation = element.rotation ?? 0

  switch (element.symbol_type) {
    case 'outlet':
      addDuplexOutlet(primitives, center, rotation)
      break
    case 'gfci_outlet':
      addGfciOutlet(primitives, center, rotation)
      break
    case 'floor_outlet':
      addFloorOutlet(primitives, center, rotation)
      break
    case 'switch':
      addSwitch(primitives, center, rotation)
      break
    case 'three_way_switch':
      addThreeWaySwitch(primitives, center, rotation)
      break
    case 'dimmer_switch':
      addDimmerSwitch(primitives, center, rotation)
      break
    case 'light_fixture':
      addCeilingLight(primitives, center, rotation)
      break
    case 'ceiling_fan':
      addCeilingFan(primitives, center, rotation)
      break
    case 'panel':
      addPanel(primitives, center, rotation)
      break
    case 'smoke_detector':
      addSmokeDetector(primitives, center, rotation)
      break
    case 'thermostat':
      addThermostat(primitives, center, rotation)
      break
    case 'junction_box':
      addJunctionBox(primitives, center, rotation)
      break
    default:
      // Fallback: simple circle
      addCircle(primitives, center, rotation, [0, 0], 0.09, 'primary')
      break
  }

  // Tag annotation — show for symbol types that embed text as part of
  // their geometry only when labels are explicitly requested or density
  // is not minimal, since the text is already baked into the symbol above.
  // For types without baked-in text (outlet, light_fixture), show a tag
  // if one exists and labels are enabled.
  const tag = defaultTagForType(element.symbol_type)
  const hasBakedText = [
    'gfci_outlet', 'switch', 'three_way_switch', 'dimmer_switch',
    'ceiling_fan', 'smoke_detector', 'thermostat', 'junction_box',
  ].includes(element.symbol_type)

  if (tag && !hasBakedText && (options.showLabels || options.annotationDensity !== 'minimal')) {
    addText(primitives, center, rotation, tag, 0.1)
  }

  return {
    domain: spec.domain,
    primitives,
  }
}

function defaultTagForType(symbolType: ElectricalElement['symbol_type']): string | null {
  switch (symbolType) {
    case 'switch':
      return 'S'
    case 'three_way_switch':
      return 'S3'
    case 'dimmer_switch':
      return 'DIM'
    case 'panel':
      return 'P'
    case 'smoke_detector':
      return 'SD'
    case 'junction_box':
      return 'J'
    case 'thermostat':
      return 'T'
    case 'ceiling_fan':
      return 'CF'
    case 'gfci_outlet':
      return 'GFI'
    case 'floor_outlet':
      return 'FLR'
    default:
      return null
  }
}
