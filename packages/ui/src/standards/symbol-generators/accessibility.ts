import type { AccessibilityElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import {
  addRect, addLine, addCircle, addText,
  type SymbolPrimitive,
} from './_helpers'

function addWheelchairSymbol(
  primitives: SymbolPrimitive[],
  cx: number,
  cy: number,
  rotation: number,
  scale: number,
): void {
  // Simplified ISA wheelchair icon
  // Head
  addCircle(primitives, [cx, cy], rotation, [0, 0.14 * scale], 0.03 * scale, 'primary')
  // Body vertical line
  addLine(primitives, [cx, cy], rotation, [0, 0.11 * scale], [0, 0.02 * scale], 'primary')
  // Arm line
  addLine(primitives, [cx, cy], rotation, [0, 0.08 * scale], [0.06 * scale, 0.06 * scale], 'primary')
  // Large wheel
  addCircle(primitives, [cx, cy], rotation, [0, -0.02 * scale], 0.07 * scale, 'primary')
  // Small front wheel
  addCircle(primitives, [cx, cy], rotation, [0.06 * scale, -0.02 * scale], 0.02 * scale, 'primary')
  // Footrest
  addLine(primitives, [cx, cy], rotation, [0.03 * scale, -0.02 * scale], [0.08 * scale, -0.06 * scale], 'primary')
}

export function generateAccessibilityPrimitives(
  element: AccessibilityElement,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const spec = getSymbolSpec(options.planSymbolProfile, 'accessibility', element.symbol_type) ?? {
    domain: 'accessibility' as const,
    title: element.symbol_type,
    lineClass: 'primary' as const,
    allowsLabel: false,
    provenance: getDefaultSymbolProvenance(),
  }
  const primitives: SymbolPrimitive[] = []
  const [x, y] = element.position
  const rotation = element.rotation ?? 0

  switch (element.symbol_type) {
    case 'wheelchair': {
      addWheelchairSymbol(primitives, x, y, rotation, 1.0)
      break
    }

    case 'ramp': {
      // Two parallel lines
      addLine(primitives, [x, y], rotation, [-0.30, 0.075], [0.30, 0.075], 'primary')
      addLine(primitives, [x, y], rotation, [-0.30, -0.075], [0.30, -0.075], 'primary')
      // Direction arrow
      addLine(primitives, [x, y], rotation, [0.20, 0], [0.30, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0.26, 0.03], [0.30, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0.26, -0.03], [0.30, 0], 'secondary')
      // Slope label
      if (options.showLabels || options.annotationDensity !== 'minimal') {
        addText(primitives, [x, y], rotation, '1:12', 0.06)
      }
      break
    }

    case 'grab_bar': {
      // Heavy line for the bar
      addLine(primitives, [x, y], rotation, [-0.30, 0], [0.30, 0], 'cut')
      // Mounting dots at each end
      addCircle(primitives, [x, y], rotation, [-0.30, 0], 0.025, 'primary')
      addCircle(primitives, [x, y], rotation, [0.30, 0], 0.025, 'primary')
      break
    }

    case 'accessible_parking': {
      // Parking space rectangle
      addRect(primitives, [x, y], rotation, 1.0, 0.50, 'primary')
      // Scaled wheelchair symbol inside
      addWheelchairSymbol(primitives, x, y, rotation, 0.6)
      break
    }

    case 'tactile_warning': {
      // Rectangle outline
      addRect(primitives, [x, y], rotation, 0.40, 0.30, 'primary')
      // Grid of small dots (4 columns x 3 rows)
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const lx = -0.135 + col * 0.09
          const ly = -0.09 + row * 0.09
          addCircle(primitives, [x, y], rotation, [lx, ly], 0.012, 'secondary')
        }
      }
      break
    }

    case 'ada_restroom': {
      addRect(primitives, [x, y], rotation, 1.50, 1.50, 'primary')
      addText(primitives, [x, y], rotation, 'ADA', 0.12)
      addWheelchairSymbol(primitives, x, y, rotation, 0.5)
      break
    }

    case 'hearing_loop': {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.15, 'primary')
      addText(primitives, [x, y], rotation, 'HL', 0.08)
      break
    }

    default: {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.15, spec.lineClass as 'primary')
      break
    }
  }

  return {
    domain: spec.domain,
    primitives,
  }
}
