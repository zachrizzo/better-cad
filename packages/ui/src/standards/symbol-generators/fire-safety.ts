import type { FireSafetyElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import {
  addRect, addLine, addCircle, addText,
  type SymbolPrimitive,
} from './_helpers'

function textForType(symbolType: FireSafetyElement['symbol_type']): string | null {
  switch (symbolType) {
    case 'fire_extinguisher':
      return 'FE'
    case 'pull_station':
      return 'FP'
    case 'smoke_alarm':
      return 'SA'
    case 'fire_alarm_panel':
      return 'FACP'
    case 'fire_hose_cabinet':
      return 'FHC'
    case 'annunciator':
      return 'ANN'
    default:
      return null
  }
}

export function generateFireSafetyPrimitives(
  element: FireSafetyElement,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const spec = getSymbolSpec(options.planSymbolProfile, 'fire_safety', element.symbol_type) ?? {
    domain: 'fire_safety' as const,
    title: element.symbol_type,
    lineClass: 'primary' as const,
    allowsLabel: false,
    provenance: getDefaultSymbolProvenance(),
  }
  const primitives: SymbolPrimitive[] = []
  const [x, y] = element.position
  const rotation = element.rotation ?? 0

  switch (element.symbol_type) {
    case 'fire_extinguisher': {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.10, 'primary')
      addText(primitives, [x, y], rotation, 'FE', 0.07)
      break
    }

    case 'sprinkler_head': {
      // Outer circle
      addCircle(primitives, [x, y], rotation, [0, 0], 0.08, 'primary')
      // Center dot
      addCircle(primitives, [x, y], rotation, [0, 0], 0.02, 'primary')
      // 4 short radiating lines at 0, PI/2, PI, 3PI/2
      const innerR = 0.04
      const outerR = 0.09
      addLine(primitives, [x, y], rotation, [innerR, 0], [outerR, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0, innerR], [0, outerR], 'secondary')
      addLine(primitives, [x, y], rotation, [-innerR, 0], [-outerR, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0, -innerR], [0, -outerR], 'secondary')
      break
    }

    case 'exit_sign': {
      addRect(primitives, [x, y], rotation, 0.30, 0.12, 'primary')
      addText(primitives, [x, y], rotation, 'EXIT', 0.06)
      // Direction arrow to the right
      addLine(primitives, [x, y], rotation, [0.18, 0], [0.24, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0.21, 0.03], [0.24, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0.21, -0.03], [0.24, 0], 'secondary')
      break
    }

    case 'pull_station': {
      addRect(primitives, [x, y], rotation, 0.12, 0.12, 'primary')
      addText(primitives, [x, y], rotation, 'FP', 0.06)
      break
    }

    case 'smoke_alarm': {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.09, 'primary')
      addText(primitives, [x, y], rotation, 'SA', 0.07)
      break
    }

    case 'fire_alarm_panel': {
      addRect(primitives, [x, y], rotation, 0.30, 0.20, 'primary')
      addText(primitives, [x, y], rotation, 'FACP', 0.05)
      break
    }

    case 'fire_hose_cabinet': {
      addRect(primitives, [x, y], rotation, 0.60, 0.20, 'primary')
      addText(primitives, [x, y], rotation, 'FHC', 0.06)
      break
    }

    case 'annunciator': {
      addRect(primitives, [x, y], rotation, 0.40, 0.10, 'primary')
      addText(primitives, [x, y], rotation, 'ANN', 0.05)
      break
    }

    default: {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.10, spec.lineClass as 'primary')
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
