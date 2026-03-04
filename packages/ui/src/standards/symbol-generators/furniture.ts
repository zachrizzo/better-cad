import type { FurnitureElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import {
  addRect, addLine, addCircle, addArc, addText, clamp,
  type Point2, type SymbolPrimitive,
} from './_helpers'

function applianceTag(symbolType: FurnitureElement['symbol_type']): string | null {
  switch (symbolType) {
    case 'refrigerator':
      return 'REF'
    case 'stove':
      return 'RNG'
    case 'washer':
      return 'WM'
    case 'dryer':
      return 'DR'
    case 'microwave':
      return 'MW'
    case 'oven':
      return 'OVN'
    case 'coffee_maker':
      return 'CM'
    default:
      return null
  }
}

function shouldShowFurnitureTag(
  symbolType: FurnitureElement['symbol_type'],
  options: SymbolGenerationOptions,
): boolean {
  const hasApplianceTag = applianceTag(symbolType) !== null
  if (!hasApplianceTag && !options.showLabels) return false
  if (options.showLabels) return true
  return options.annotationDensity !== 'minimal'
}

export function generateFurniturePrimitives(
  element: FurnitureElement,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const spec = getSymbolSpec(options.planSymbolProfile, 'furniture', element.symbol_type) ?? {
    domain: 'furniture',
    title: element.symbol_type,
    lineClass: 'primary',
    allowsLabel: false,
    provenance: getDefaultSymbolProvenance(),
  }
  const lineClass = spec.lineClass
  const [x, y] = element.position
  const rotation = element.rotation ?? 0
  const width = Math.max(0.25, Math.abs(element.width))
  const depth = Math.max(0.25, Math.abs(element.depth))
  const minDim = Math.min(width, depth)
  const maxDim = Math.max(width, depth)

  const primitives: SymbolPrimitive[] = []

  switch (element.symbol_type) {
    case 'desk': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addLine(
        primitives,
        [x, y],
        rotation,
        [-width * 0.42, depth * 0.28],
        [width * 0.42, depth * 0.28],
        'secondary',
      )
      addRect(
        primitives,
        [x, y],
        rotation,
        width * 0.4,
        depth * 0.28,
        'secondary',
        [0, -depth * 0.18],
      )
      break
    }
    case 'chair': {
      const seatRadius = minDim * 0.28
      addCircle(primitives, [x, y], rotation, [0, 0], seatRadius, 'primary')
      addArc(
        primitives,
        [x, y],
        rotation,
        [0, 0],
        seatRadius * 1.55,
        Math.PI * 0.2,
        Math.PI * 0.8,
        'secondary',
      )
      addLine(
        primitives,
        [x, y],
        rotation,
        [-seatRadius * 0.7, seatRadius * 0.88],
        [seatRadius * 0.7, seatRadius * 0.88],
        'secondary',
      )
      break
    }
    case 'table': {
      addRect(primitives, [x, y], rotation, width * 0.9, depth * 0.9, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.38, 0], [width * 0.38, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0, -depth * 0.38], [0, depth * 0.38], 'secondary')
      break
    }
    case 'dining_table': {
      if (Math.abs(width - depth) <= maxDim * 0.18) {
        addCircle(primitives, [x, y], rotation, [0, 0], minDim * 0.42, lineClass)
      } else {
        addRect(primitives, [x, y], rotation, width * 0.9, depth * 0.68, lineClass)
      }
      const chairRadius = clamp(minDim * 0.09, 0.08, 0.16)
      addCircle(primitives, [x, y], rotation, [0, depth * 0.43], chairRadius, 'secondary')
      addCircle(primitives, [x, y], rotation, [0, -depth * 0.43], chairRadius, 'secondary')
      addCircle(primitives, [x, y], rotation, [width * 0.43, 0], chairRadius, 'secondary')
      addCircle(primitives, [x, y], rotation, [-width * 0.43, 0], chairRadius, 'secondary')
      break
    }
    case 'bed': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addRect(
        primitives,
        [x, y],
        rotation,
        width * 0.96,
        depth * 0.12,
        'secondary',
        [0, depth * 0.44],
      )
      addArc(primitives, [x, y], rotation, [-width * 0.23, depth * 0.34], width * 0.16, Math.PI, Math.PI * 2, 'secondary')
      addArc(primitives, [x, y], rotation, [width * 0.23, depth * 0.34], width * 0.16, Math.PI, Math.PI * 2, 'secondary')
      break
    }
    case 'sofa': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addRect(
        primitives,
        [x, y],
        rotation,
        width * 0.82,
        depth * 0.22,
        'secondary',
        [0, depth * 0.33],
      )
      addArc(primitives, [x, y], rotation, [-width * 0.36, 0], depth * 0.38, Math.PI * 0.5, Math.PI * 1.5, 'secondary')
      addArc(primitives, [x, y], rotation, [width * 0.36, 0], depth * 0.38, -Math.PI * 0.5, Math.PI * 0.5, 'secondary')
      addLine(primitives, [x, y], rotation, [-width * 0.13, -depth * 0.25], [-width * 0.13, depth * 0.25], 'secondary')
      addLine(primitives, [x, y], rotation, [width * 0.13, -depth * 0.25], [width * 0.13, depth * 0.25], 'secondary')
      addLine(primitives, [x, y], rotation, [-width * 0.3, -depth * 0.06], [width * 0.3, -depth * 0.06], 'secondary')
      break
    }
    case 'bookshelf': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.46, depth * 0.32], [width * 0.46, depth * 0.32], 'primary')
      const shelfCount = clamp(Math.round(width / 0.45), 2, 6)
      for (let i = 1; i < shelfCount; i += 1) {
        const t = i / shelfCount
        const lx = -width / 2 + width * t
        addLine(primitives, [x, y], rotation, [lx, -depth / 2], [lx, depth / 2], 'secondary')
      }
      const shelfRows = clamp(Math.round(depth / 0.25), 2, 4)
      for (let i = 1; i < shelfRows; i++) {
        const t = i / shelfRows
        const ly = -depth / 2 + depth * t
        addLine(primitives, [x, y], rotation, [-width * 0.46, ly], [width * 0.46, ly], 'secondary')
      }
      break
    }
    case 'wardrobe': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addLine(primitives, [x, y], rotation, [0, -depth / 2], [0, depth / 2], 'secondary')
      addLine(primitives, [x, y], rotation, [-width * 0.46, 0], [width * 0.46, 0], 'secondary')
      addCircle(primitives, [x, y], rotation, [-width * 0.22, depth * 0.1], 0.03, 'secondary')
      addCircle(primitives, [x, y], rotation, [width * 0.22, depth * 0.1], 0.03, 'secondary')
      break
    }
    case 'toilet_stall': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addRect(primitives, [x, y], rotation, width * 0.28, depth * 0.42, 'primary', [0, -depth * 0.04])
      addCircle(primitives, [x, y], rotation, [0, depth * 0.1], minDim * 0.14, 'secondary')
      break
    }
    case 'reception_desk': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addRect(primitives, [x, y], rotation, width * 0.78, depth * 0.42, 'secondary', [0, -depth * 0.1])
      addLine(primitives, [x, y], rotation, [-width * 0.39, depth * 0.18], [width * 0.39, depth * 0.18], 'secondary')
      break
    }
    case 'conference_table': {
      addRect(primitives, [x, y], rotation, width * 0.92, depth * 0.58, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.4, 0], [width * 0.4, 0], 'secondary')
      const seats = clamp(Math.round(width / 0.75), 4, 8)
      const seatRadius = clamp(minDim * 0.07, 0.06, 0.12)
      for (let i = 0; i < seats; i += 1) {
        const t = seats === 1 ? 0.5 : i / (seats - 1)
        const sx = -width * 0.38 + width * 0.76 * t
        addCircle(primitives, [x, y], rotation, [sx, depth * 0.42], seatRadius, 'secondary')
        addCircle(primitives, [x, y], rotation, [sx, -depth * 0.42], seatRadius, 'secondary')
      }
      break
    }
    case 'kitchen_island': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addRect(primitives, [x, y], rotation, width * 0.24, depth * 0.22, 'secondary', [-width * 0.18, 0])
      addCircle(primitives, [x, y], rotation, [-width * 0.18, 0], minDim * 0.04, 'secondary')
      addCircle(primitives, [x, y], rotation, [width * 0.24, -depth * 0.08], minDim * 0.06, 'secondary')
      addCircle(primitives, [x, y], rotation, [width * 0.24, depth * 0.08], minDim * 0.06, 'secondary')
      break
    }
    case 'refrigerator': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      if (width >= depth) {
        addLine(primitives, [x, y], rotation, [0, -depth * 0.48], [0, depth * 0.48], 'secondary')
      } else {
        addLine(primitives, [x, y], rotation, [-width * 0.48, 0], [width * 0.48, 0], 'secondary')
      }
      addLine(
        primitives,
        [x, y],
        rotation,
        [-width * 0.06, depth * 0.12],
        [width * 0.06, depth * 0.12],
        'secondary',
      )
      break
    }
    case 'stove': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addRect(primitives, [x, y], rotation, width * 0.8, depth * 0.14, 'secondary', [0, depth * 0.35])
      const offsets: Point2[] = [
        [-width * 0.2, -depth * 0.2],
        [width * 0.2, -depth * 0.2],
        [-width * 0.2, depth * 0.2],
        [width * 0.2, depth * 0.2],
      ]
      for (const offset of offsets) {
        addCircle(primitives, [x, y], rotation, offset, minDim * 0.11, 'secondary')
      }
      break
    }
    case 'washer':
    case 'dryer': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addRect(primitives, [x, y], rotation, width * 0.88, depth * 0.2, 'secondary', [0, depth * 0.34])
      addCircle(primitives, [x, y], rotation, [0, -depth * 0.02], minDim * 0.24, 'secondary')
      addCircle(primitives, [x, y], rotation, [0, -depth * 0.02], minDim * 0.12, 'secondary')
      break
    }
    case 'nightstand': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.4, 0], [width * 0.4, 0], 'secondary')
      addCircle(primitives, [x, y], rotation, [0, -depth * 0.22], minDim * 0.05, 'secondary')
      break
    }
    case 'coffee_table': {
      if (Math.abs(width - depth) <= maxDim * 0.2) {
        addCircle(primitives, [x, y], rotation, [0, 0], minDim * 0.42, lineClass)
      } else {
        addRect(primitives, [x, y], rotation, width * 0.86, depth * 0.62, lineClass)
      }
      addLine(primitives, [x, y], rotation, [-width * 0.24, 0], [width * 0.24, 0], 'secondary')
      break
    }
    case 'tv_console': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addLine(primitives, [x, y], rotation, [-width / 6, -depth * 0.46], [-width / 6, depth * 0.46], 'secondary')
      addLine(primitives, [x, y], rotation, [width / 6, -depth * 0.46], [width / 6, depth * 0.46], 'secondary')
      break
    }
    case 'console_table': {
      addRect(primitives, [x, y], rotation, width * 0.96, depth * 0.42, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.32, -depth * 0.2], [-width * 0.32, depth * 0.2], 'secondary')
      addLine(primitives, [x, y], rotation, [width * 0.32, -depth * 0.2], [width * 0.32, depth * 0.2], 'secondary')
      break
    }
    case 'bench': {
      addRect(primitives, [x, y], rotation, width * 0.96, depth * 0.56, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.3, -depth * 0.26], [-width * 0.3, depth * 0.26], 'secondary')
      addLine(primitives, [x, y], rotation, [width * 0.3, -depth * 0.26], [width * 0.3, depth * 0.26], 'secondary')
      break
    }
    case 'ottoman': {
      addRect(primitives, [x, y], rotation, width * 0.9, depth * 0.9, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.35, -depth * 0.35], [width * 0.35, depth * 0.35], 'secondary')
      addLine(primitives, [x, y], rotation, [width * 0.35, -depth * 0.35], [-width * 0.35, depth * 0.35], 'secondary')
      break
    }
    case 'vanity': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.44, depth * 0.2], [width * 0.44, depth * 0.2], 'secondary')
      addCircle(primitives, [x, y], rotation, [0, 0], minDim * 0.16, 'secondary')
      break
    }
    case 'microwave': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addText(primitives, [x, y], rotation, 'MW', minDim * 0.24)
      break
    }
    case 'oven': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addText(primitives, [x, y], rotation, 'OVN', minDim * 0.24)
      break
    }
    case 'range_hood': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addArc(primitives, [x, y], rotation, [-width * 0.2, -depth * 0.2], minDim * 0.3, 0, Math.PI / 2, 'secondary')
      break
    }
    case 'plant': {
      addCircle(primitives, [x, y], rotation, [0, 0], minDim * 0.35, lineClass)
      const rayLen = minDim * 0.12
      const rayStart = minDim * 0.38
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4
        addLine(
          primitives, [x, y], rotation,
          [Math.cos(angle) * rayStart, Math.sin(angle) * rayStart],
          [Math.cos(angle) * (rayStart + rayLen), Math.sin(angle) * (rayStart + rayLen)],
          'secondary',
        )
      }
      break
    }
    case 'mirror': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addLine(primitives, [x, y], rotation, [-width * 0.4, -depth * 0.4], [width * 0.4, depth * 0.4], 'secondary')
      addLine(primitives, [x, y], rotation, [width * 0.4, -depth * 0.4], [-width * 0.4, depth * 0.4], 'secondary')
      break
    }
    case 'fireplace': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addArc(primitives, [x, y], rotation, [0, -depth * 0.1], minDim * 0.28, Math.PI, Math.PI * 2, 'secondary')
      break
    }
    case 'coffee_maker': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      addText(primitives, [x, y], rotation, 'CM', minDim * 0.24)
      break
    }
    case 'artwork': {
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      const cm = minDim * 0.08
      addLine(primitives, [x, y], rotation, [-width / 2, -depth / 2], [-width / 2 + cm, -depth / 2], 'secondary')
      addLine(primitives, [x, y], rotation, [-width / 2, -depth / 2], [-width / 2, -depth / 2 + cm], 'secondary')
      addLine(primitives, [x, y], rotation, [width / 2, -depth / 2], [width / 2 - cm, -depth / 2], 'secondary')
      addLine(primitives, [x, y], rotation, [width / 2, -depth / 2], [width / 2, -depth / 2 + cm], 'secondary')
      addLine(primitives, [x, y], rotation, [-width / 2, depth / 2], [-width / 2 + cm, depth / 2], 'secondary')
      addLine(primitives, [x, y], rotation, [-width / 2, depth / 2], [-width / 2, depth / 2 - cm], 'secondary')
      addLine(primitives, [x, y], rotation, [width / 2, depth / 2], [width / 2 - cm, depth / 2], 'secondary')
      addLine(primitives, [x, y], rotation, [width / 2, depth / 2], [width / 2, depth / 2 - cm], 'secondary')
      break
    }
    default:
      addRect(primitives, [x, y], rotation, width, depth, lineClass)
      break
  }

  if (shouldShowFurnitureTag(element.symbol_type, options)) {
    const tag = applianceTag(element.symbol_type) ?? element.symbol_type.replace(/_/g, ' ').toUpperCase()
    addText(primitives, [x, y], rotation, tag, Math.min(width, depth) * 0.24)
  }

  return {
    domain: spec.domain,
    primitives,
  }
}
