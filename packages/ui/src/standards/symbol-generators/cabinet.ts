import type { CabinetElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import {
  addRect, addLine, addText, addEllipse, clamp,
  type SymbolPrimitive,
} from './_helpers'

export function generateCabinetPrimitives(
  element: CabinetElement,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const [x, y] = element.position
  const rotation = element.rotation ?? 0
  const width = Math.max(0.25, Math.abs(element.width))
  const depth = Math.max(0.25, Math.abs(element.depth))
  const hw = width / 2
  const hd = depth / 2
  const minDim = Math.min(width, depth)

  const primitives: SymbolPrimitive[] = []

  const isAboveCut =
    element.cabinet_type === 'upper' ||
    element.cabinet_type === 'corner_upper' ||
    element.cabinet_type === 'appliance_garage'

  switch (element.cabinet_type) {
    case 'base':
    case 'drawer_base': {
      // Solid rectangle + countertop overhang line at front + door partitions
      addRect(primitives, [x, y], rotation, width, depth, 'primary')
      // Countertop overhang at front
      addLine(primitives, [x, y], rotation, [-hw, hd + 0.025], [hw, hd + 0.025], 'secondary')
      // Door partition for 2-door cabinets
      if (element.door_count >= 2) {
        addLine(primitives, [x, y], rotation, [0, -hd], [0, hd], 'secondary')
      }
      // Horizontal drawer lines for drawer_base
      if (element.cabinet_type === 'drawer_base') {
        for (let i = 1; i <= 3; i++) {
          const ly = -hd + (depth * i / 4)
          addLine(primitives, [x, y], rotation, [-hw, ly], [hw, ly], 'secondary')
        }
      }
      break
    }

    case 'upper': {
      // Dashed rectangle (above cut plane) + dashed shelf line
      addRect(primitives, [x, y], rotation, width, depth, 'primary', [0, 0], true)
      addLine(primitives, [x, y], rotation, [-hw, 0], [hw, 0], 'secondary', true)
      break
    }

    case 'tall':
    case 'pantry': {
      // Solid rectangle + horizontal line separating upper/lower
      addRect(primitives, [x, y], rotation, width, depth, 'primary')
      addLine(primitives, [x, y], rotation, [-hw, 0], [hw, 0], 'secondary')
      break
    }

    case 'corner_base': {
      // Rectangle with diagonal line
      addRect(primitives, [x, y], rotation, width, depth, 'primary')
      addLine(primitives, [x, y], rotation, [-hw, hd], [hw, -hd], 'secondary')
      break
    }

    case 'corner_upper': {
      // Dashed rectangle with dashed diagonal
      addRect(primitives, [x, y], rotation, width, depth, 'primary', [0, 0], true)
      addLine(primitives, [x, y], rotation, [-hw, hd], [hw, -hd], 'secondary', true)
      break
    }

    case 'corner_tall': {
      // Solid outline with diagonal + horizontal divider
      addRect(primitives, [x, y], rotation, width, depth, 'primary')
      addLine(primitives, [x, y], rotation, [-hw, hd], [hw, -hd], 'secondary')
      addLine(primitives, [x, y], rotation, [-hw, 0], [hw, 0], 'secondary')
      break
    }

    case 'sink_base': {
      // Rectangle + countertop overhang + sink basin oval inside
      addRect(primitives, [x, y], rotation, width, depth, 'primary')
      addLine(primitives, [x, y], rotation, [-hw, hd + 0.025], [hw, hd + 0.025], 'secondary')
      addEllipse(primitives, [x, y], rotation, [0, 0.05], width * 0.3, depth * 0.25, 'secondary')
      break
    }

    case 'lazy_susan': {
      // Square with X diagonals to indicate rotation
      addRect(primitives, [x, y], rotation, width, depth, 'primary')
      addLine(primitives, [x, y], rotation, [-hw, -hd], [hw, hd], 'secondary')
      addLine(primitives, [x, y], rotation, [hw, -hd], [-hw, hd], 'secondary')
      break
    }

    case 'blind_corner': {
      // Rectangle with vertical partition
      addRect(primitives, [x, y], rotation, width, depth, 'primary')
      addLine(primitives, [x, y], rotation, [0, -hd], [0, hd], 'secondary')
      break
    }

    case 'appliance_garage': {
      // Dashed rectangle (mounted above counter)
      addRect(primitives, [x, y], rotation, width, depth, 'primary', [0, 0], true)
      break
    }

    default:
      addRect(primitives, [x, y], rotation, width, depth, 'primary', [0, 0], isAboveCut)
      break
  }

  // Label
  if (options.showLabels) {
    const label = element.cabinet_type.replace(/_/g, ' ').toUpperCase()
    addText(primitives, [x, y], rotation, label, clamp(minDim * 0.22, 0.06, 0.14))
  }

  return {
    domain: 'cabinet',
    primitives,
  }
}
