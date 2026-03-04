import type { PlumbingElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import {
  addRect, addLine, addCircle, addText, addEllipse, addPolyline, clamp,
  type Point2, type SymbolPrimitive,
} from './_helpers'

function textForType(symbolType: PlumbingElement['symbol_type']): string | null {
  switch (symbolType) {
    case 'water_heater':
      return 'WH'
    case 'floor_drain':
      return 'FD'
    case 'dishwasher':
      return 'DW'
    case 'washing_machine':
      return 'WM'
    case 'urinal':
      return 'U'
    default:
      return null
  }
}

export function generatePlumbingPrimitives(
  element: PlumbingElement,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const spec = getSymbolSpec(options.planSymbolProfile, 'plumbing', element.symbol_type) ?? {
    domain: 'plumbing',
    title: element.symbol_type,
    lineClass: 'primary',
    allowsLabel: false,
    provenance: getDefaultSymbolProvenance(),
  }
  const primitives: SymbolPrimitive[] = []
  const [x, y] = element.position
  const rotation = element.rotation ?? 0

  switch (element.symbol_type) {
    case 'toilet': {
      const w = 0.38
      const d = 0.70
      // Tank rectangle at rear
      addRect(primitives, [x, y], rotation, w * 0.9, d * 0.25, 'primary', [0, d * 0.35])
      // Elongated bowl — U-shape: flat top, straight sides, semicircular front
      const bowlW = w * 0.45
      const bowlTop = d * 0.18
      const bowlBot = -d * 0.35
      const bowlPts: Point2[] = []
      // Top-right → down right side
      bowlPts.push([bowlW, bowlTop])
      bowlPts.push([bowlW, bowlBot * 0.4])
      // Semicircular front (right to left, 12 segments)
      const arcSegments = 12
      const arcCenterY = bowlBot * 0.4
      for (let i = 0; i <= arcSegments; i++) {
        const angle = -Math.PI / 2 + (Math.PI * i) / arcSegments
        bowlPts.push([
          Math.cos(angle) * bowlW,
          arcCenterY + Math.sin(angle) * (bowlBot * 0.6 * -1),
        ])
      }
      // Up left side back to top-left
      bowlPts.push([-bowlW, bowlBot * 0.4])
      bowlPts.push([-bowlW, bowlTop])
      addPolyline(primitives, [x, y], rotation, bowlPts, 'primary', true)
      // Inner seat outline (slightly smaller)
      const seatInset = 0.025
      const seatW = bowlW - seatInset
      const seatTop = bowlTop - seatInset
      const seatBotMid = bowlBot * 0.4
      const seatPts: Point2[] = []
      seatPts.push([seatW, seatTop])
      seatPts.push([seatW, seatBotMid])
      for (let i = 0; i <= arcSegments; i++) {
        const angle = -Math.PI / 2 + (Math.PI * i) / arcSegments
        seatPts.push([
          Math.cos(angle) * seatW,
          seatBotMid + Math.sin(angle) * (bowlBot * 0.6 * -1 - seatInset),
        ])
      }
      seatPts.push([-seatW, seatBotMid])
      seatPts.push([-seatW, seatTop])
      addPolyline(primitives, [x, y], rotation, seatPts, 'secondary', true)
      break
    }

    case 'sink': {
      const w = 0.50
      const d = 0.40
      // Outer vanity rectangle
      addRect(primitives, [x, y], rotation, w, d, 'primary')
      // Elliptical basin
      addEllipse(primitives, [x, y], rotation, [0, 0], 0.12, 0.08, 'secondary')
      // Drain dot
      addCircle(primitives, [x, y], rotation, [0, 0], 0.015, 'primary')
      // Faucet lines at back (two short lines)
      const faucetY = d * 0.38
      addLine(primitives, [x, y], rotation, [-0.03, faucetY], [-0.03, faucetY - 0.05], 'secondary')
      addLine(primitives, [x, y], rotation, [0.03, faucetY], [0.03, faucetY - 0.05], 'secondary')
      break
    }

    case 'bathtub': {
      const w = 0.76
      const d = 1.52
      // Outer shape — rounded-corner rectangle via polyline
      const r = 0.08
      const hw = w / 2
      const hd = d / 2
      const outerPts: Point2[] = []
      const cornerSegs = 6
      // Top-right corner
      for (let i = 0; i <= cornerSegs; i++) {
        const angle = (Math.PI / 2) * (i / cornerSegs)
        outerPts.push([hw - r + Math.cos(angle) * r, hd - r + Math.sin(angle) * r])
      }
      // Top-left corner
      for (let i = 0; i <= cornerSegs; i++) {
        const angle = Math.PI / 2 + (Math.PI / 2) * (i / cornerSegs)
        outerPts.push([-(hw - r) + Math.cos(angle) * r, hd - r + Math.sin(angle) * r])
      }
      // Bottom-left corner
      for (let i = 0; i <= cornerSegs; i++) {
        const angle = Math.PI + (Math.PI / 2) * (i / cornerSegs)
        outerPts.push([-(hw - r) + Math.cos(angle) * r, -(hd - r) + Math.sin(angle) * r])
      }
      // Bottom-right corner
      for (let i = 0; i <= cornerSegs; i++) {
        const angle = (3 * Math.PI) / 2 + (Math.PI / 2) * (i / cornerSegs)
        outerPts.push([hw - r + Math.cos(angle) * r, -(hd - r) + Math.sin(angle) * r])
      }
      addPolyline(primitives, [x, y], rotation, outerPts, 'primary', true)
      // Inner tub rectangle inset by 0.06
      const inset = 0.06
      addRect(primitives, [x, y], rotation, w - inset * 2, d - inset * 2, 'secondary')
      // Drain circle near one end
      addCircle(primitives, [x, y], rotation, [0, -hd + 0.20], 0.02, 'primary')
      break
    }

    case 'shower': {
      const s = 0.90
      // Square outline
      addRect(primitives, [x, y], rotation, s, s, 'primary')
      // Center drain dot
      addCircle(primitives, [x, y], rotation, [0, 0], 0.02, 'primary')
      // Shower head circle at top center
      addCircle(primitives, [x, y], rotation, [0, s / 2 - 0.08], 0.04, 'secondary')
      break
    }

    case 'urinal': {
      const w = 0.38
      const d = 0.36
      const hw = w / 2
      const hd = d / 2
      // U-shape: flat top, sides going down, semicircular bottom
      const uPts: Point2[] = []
      uPts.push([-hw, hd])
      uPts.push([-hw, -hd * 0.3])
      // Semicircular bottom (left to right)
      const uSegs = 12
      for (let i = 0; i <= uSegs; i++) {
        const angle = Math.PI + (Math.PI * i) / uSegs
        uPts.push([
          Math.cos(angle) * hw,
          -hd * 0.3 + Math.sin(angle) * (hd * 0.7),
        ])
      }
      uPts.push([hw, -hd * 0.3])
      uPts.push([hw, hd])
      addPolyline(primitives, [x, y], rotation, uPts, 'primary', true)
      // Drain circle at center-bottom
      addCircle(primitives, [x, y], rotation, [0, -hd * 0.3], 0.02, 'primary')
      break
    }

    case 'floor_drain': {
      // Circle
      addCircle(primitives, [x, y], rotation, [0, 0], 0.12, 'primary')
      // Cross pattern — two perpendicular lines, each 0.10 long
      const half = 0.05
      addLine(primitives, [x, y], rotation, [-half, 0], [half, 0], 'secondary')
      addLine(primitives, [x, y], rotation, [0, -half], [0, half], 'secondary')
      break
    }

    case 'water_heater': {
      // Circle
      addCircle(primitives, [x, y], rotation, [0, 0], 0.25, 'primary')
      break
    }

    case 'dishwasher': {
      const s = 0.60
      // Rectangle
      addRect(primitives, [x, y], rotation, s, s, 'primary')
      // Horizontal center line
      addLine(primitives, [x, y], rotation, [-s / 2, 0], [s / 2, 0], 'secondary')
      break
    }

    case 'washing_machine': {
      const s = 0.65
      // Square outline
      addRect(primitives, [x, y], rotation, s, s, 'primary')
      // Inner drum circle
      addCircle(primitives, [x, y], rotation, [0, 0], 0.20, 'secondary')
      break
    }

    case 'hose_bib': {
      // Triangle symbol
      addPolyline(
        primitives, [x, y], rotation,
        [[-0.08, 0.08], [0.08, 0.08], [0, -0.08]],
        'secondary', true,
      )
      break
    }

    case 'double_sink': {
      const w = 0.80
      const d = 0.50
      addRect(primitives, [x, y], rotation, w, d, 'primary')
      addEllipse(primitives, [x, y], rotation, [-w * 0.2, 0], 0.10, 0.07, 'secondary')
      addEllipse(primitives, [x, y], rotation, [w * 0.2, 0], 0.10, 0.07, 'secondary')
      addLine(primitives, [x, y], rotation, [0, -d * 0.4], [0, d * 0.4], 'secondary')
      break
    }

    case 'bidet': {
      addEllipse(primitives, [x, y], rotation, [0, 0], 0.15, 0.12, 'primary')
      break
    }

    case 'utility_sink': {
      const w = 0.60
      const d = 0.50
      addRect(primitives, [x, y], rotation, w, d, 'primary')
      addRect(primitives, [x, y], rotation, w * 0.8, d * 0.75, 'secondary')
      break
    }

    case 'pedestal_sink': {
      addEllipse(primitives, [x, y], rotation, [0, 0], 0.18, 0.14, 'primary')
      addCircle(primitives, [x, y], rotation, [0, 0], 0.04, 'secondary')
      break
    }

    default: {
      addCircle(primitives, [x, y], rotation, [0, 0], 0.25, spec.lineClass as 'primary')
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
