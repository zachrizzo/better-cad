import type { HvacElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import {
  addRect, addLine, addCircle, addText, addPolyline,
  type Point2, type SymbolPrimitive,
} from './_helpers'

function textForType(symbolType: HvacElement['symbol_type']): string | null {
  switch (symbolType) {
    case 'thermostat':
      return 'T'
    case 'exhaust_fan':
      return 'EF'
    case 'mini_split':
      return 'MS'
    case 'air_handler':
      return 'AH'
    case 'condensing_unit':
      return 'CU'
    case 'damper':
      return 'D'
    default:
      return null
  }
}

export function generateHvacPrimitives(
  element: HvacElement,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const spec = getSymbolSpec(options.planSymbolProfile, 'hvac', element.symbol_type) ?? {
    domain: 'hvac' as const,
    title: element.symbol_type,
    lineClass: 'primary' as const,
    allowsLabel: false,
    provenance: getDefaultSymbolProvenance(),
  }
  const primitives: SymbolPrimitive[] = []
  const [x, y] = element.position
  const rotation = element.rotation ?? 0

  switch (element.symbol_type) {
    case 'supply_vent': {
      addRect(primitives, [x, y], rotation, 0.30, 0.15, 'primary')
      for (let i = 1; i <= 3; i++) {
        const ly = -0.075 + 0.15 * (i / 4)
        addLine(primitives, [x, y], rotation, [-0.12, ly], [0.12, ly], 'secondary')
      }
      break
    }

    case 'return_vent': {
      addRect(primitives, [x, y], rotation, 0.35, 0.35, 'primary')
      addLine(primitives, [x, y], rotation, [-0.15, -0.15], [0.15, 0.15], 'secondary')
      addLine(primitives, [x, y], rotation, [0.15, -0.15], [-0.15, 0.15], 'secondary')
      break
    }

    case 'thermostat': {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.06, 'primary')
      addText(primitives, [x, y], rotation, 'T', 0.06)
      break
    }

    case 'exhaust_fan': {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.14, 'primary')
      // Arrow extending outward from top
      addLine(primitives, [x, y], rotation, [0, 0.14], [0, 0.22], 'secondary')
      addLine(primitives, [x, y], rotation, [-0.03, 0.19], [0, 0.22], 'secondary')
      addLine(primitives, [x, y], rotation, [0.03, 0.19], [0, 0.22], 'secondary')
      break
    }

    case 'ductwork': {
      // Double parallel lines
      addLine(primitives, [x, y], rotation, [-0.15, 0.05], [0.15, 0.05], 'primary')
      addLine(primitives, [x, y], rotation, [-0.15, -0.05], [0.15, -0.05], 'primary')
      // Flow arrow
      addLine(primitives, [x, y], rotation, [0.10, 0], [0.15, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0.12, 0.03], [0.15, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0.12, -0.03], [0.15, 0], 'secondary')
      break
    }

    case 'mini_split': {
      addRect(primitives, [x, y], rotation, 0.80, 0.22, 'primary')
      // Zigzag line across the middle
      const zigzagPts: Point2[] = []
      const zigCount = 8
      for (let i = 0; i <= zigCount; i++) {
        const lx = -0.35 + 0.70 * (i / zigCount)
        const ly = (i % 2 === 0) ? 0.04 : -0.04
        zigzagPts.push([lx, ly])
      }
      addPolyline(primitives, [x, y], rotation, zigzagPts, 'secondary')
      break
    }

    case 'air_handler': {
      addRect(primitives, [x, y], rotation, 0.60, 0.40, 'primary')
      addText(primitives, [x, y], rotation, 'AH', 0.12)
      break
    }

    case 'condensing_unit': {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.25, 'primary')
      addText(primitives, [x, y], rotation, 'CU', 0.10)
      break
    }

    case 'damper': {
      addLine(primitives, [x, y], rotation, [-0.15, 0], [0.15, 0], 'primary')
      addText(primitives, [x, y], rotation, 'D', 0.08)
      break
    }

    case 'diffuser': {
      addRect(primitives, [x, y], rotation, 0.30, 0.30, 'primary')
      // 4 small lines outward (arrows)
      addLine(primitives, [x, y], rotation, [0, 0.15], [0, 0.22], 'secondary')
      addLine(primitives, [x, y], rotation, [0, -0.15], [0, -0.22], 'secondary')
      addLine(primitives, [x, y], rotation, [0.15, 0], [0.22, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [-0.15, 0], [-0.22, 0], 'secondary')
      break
    }

    default: {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.15, spec.lineClass as 'primary')
      break
    }
  }

  const tag = textForType(element.symbol_type)
  const showTag = Boolean(tag) && (options.showLabels || options.annotationDensity !== 'minimal')
  if (showTag && tag) {
    addText(primitives, [x, y], rotation, tag, 0.12)
  }

  return {
    domain: spec.domain,
    primitives,
  }
}
