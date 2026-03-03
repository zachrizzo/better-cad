import type { WindowElement, WallElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import { addLine, type Point2, type SymbolPrimitive } from './_helpers'

interface WindowSymbolContext {
  window: WindowElement
  wall: WallElement
}

export function generateWindowPrimitives(
  context: WindowSymbolContext,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const win = context.window
  const wall = context.wall
  const windowType = win.window_type ?? 'double_hung'

  const spec = getSymbolSpec(options.planSymbolProfile, 'windows', windowType) ?? {
    domain: 'architectural' as const,
    title: 'Window',
    lineClass: 'primary' as const,
    allowsLabel: true,
    provenance: getDefaultSymbolProvenance(),
  }

  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.max(1e-8, Math.hypot(dx, dz))
  const dir: Point2 = [dx / len, dz / len]
  const normal: Point2 = [-dir[1], dir[0]]
  const center: Point2 = [
    wall.start[0] + dx * win.position_along_wall,
    wall.start[1] + dz * win.position_along_wall,
  ]
  const half = win.width / 2
  const offset = wall.thickness * 0.3

  const primitives: SymbolPrimitive[] = []

  // Helper: line across the opening offset by a given amount along the normal
  function openingLine(normalOffset: number, lineClass: 'cut' | 'primary' | 'secondary' | 'annotation'): void {
    const start: Point2 = [
      center[0] - dir[0] * half + normal[0] * normalOffset,
      center[1] - dir[1] * half + normal[1] * normalOffset,
    ]
    const end: Point2 = [
      center[0] + dir[0] * half + normal[0] * normalOffset,
      center[1] + dir[1] * half + normal[1] * normalOffset,
    ]
    primitives.push({ kind: 'polyline', points: [start, end], lineClass })
  }

  switch (windowType) {
    case 'fixed': {
      // Single line centered in wall opening
      openingLine(0, spec.lineClass)
      break
    }

    case 'double_hung': {
      // Three parallel lines: outer sash at +offset, meeting rail at center, outer sash at -offset
      openingLine(offset, spec.lineClass)
      openingLine(0, 'secondary')
      openingLine(-offset, spec.lineClass)
      break
    }

    case 'casement': {
      // Frame line at center
      openingLine(0, spec.lineClass)

      // Arc showing outward swing from one edge (quarter circle outward)
      const hingeEdge: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      const arcPts: Point2[] = []
      for (let i = 0; i <= 14; i++) {
        const theta = (Math.PI / 2) * (i / 14)
        arcPts.push([
          hingeEdge[0] + win.width * (dir[0] * Math.cos(theta) + normal[0] * Math.sin(theta)),
          hingeEdge[1] + win.width * (dir[1] * Math.cos(theta) + normal[1] * Math.sin(theta)),
        ])
      }
      primitives.push({ kind: 'polyline', points: arcPts, lineClass: 'secondary' })

      // Leaf line from hinge to open position
      const leafEnd: Point2 = [
        hingeEdge[0] + normal[0] * win.width,
        hingeEdge[1] + normal[1] * win.width,
      ]
      primitives.push({ kind: 'polyline', points: [hingeEdge, leafEnd], lineClass: 'secondary' })
      break
    }

    case 'sliding': {
      // Two parallel lines (like double-hung but only 2)
      openingLine(offset * 0.5, spec.lineClass)
      openingLine(-offset * 0.5, spec.lineClass)

      // Small arrow showing slide direction
      const arrowBase: Point2 = [
        center[0] + normal[0] * wall.thickness * 0.5,
        center[1] + normal[1] * wall.thickness * 0.5,
      ]
      const arrowTip: Point2 = [
        arrowBase[0] + dir[0] * win.width * 0.25,
        arrowBase[1] + dir[1] * win.width * 0.25,
      ]
      const arrowHeadSize = win.width * 0.06
      const arrowLeft: Point2 = [
        arrowTip[0] - dir[0] * arrowHeadSize + normal[0] * arrowHeadSize,
        arrowTip[1] - dir[1] * arrowHeadSize + normal[1] * arrowHeadSize,
      ]
      const arrowRight: Point2 = [
        arrowTip[0] - dir[0] * arrowHeadSize - normal[0] * arrowHeadSize,
        arrowTip[1] - dir[1] * arrowHeadSize - normal[1] * arrowHeadSize,
      ]
      primitives.push({ kind: 'polyline', points: [arrowBase, arrowTip], lineClass: 'annotation' })
      primitives.push({ kind: 'polyline', points: [arrowLeft, arrowTip, arrowRight], lineClass: 'annotation' })
      break
    }

    case 'awning': {
      // Top frame line
      openingLine(offset, spec.lineClass)

      // Arc sweeping outward from top edge
      const topEdge: Point2 = [center[0] + normal[0] * offset, center[1] + normal[1] * offset]
      const awningDepth = win.width * 0.5
      const arcPts: Point2[] = []
      for (let i = 0; i <= 14; i++) {
        const theta = (Math.PI / 2) * (i / 14)
        // Sweep from along-dir (closed/flat) to along-negative-normal (open/outward)
        arcPts.push([
          topEdge[0] + awningDepth * (dir[0] * Math.cos(theta) - normal[0] * Math.sin(theta)),
          topEdge[1] + awningDepth * (dir[1] * Math.cos(theta) - normal[1] * Math.sin(theta)),
        ])
      }
      primitives.push({ kind: 'polyline', points: arcPts, lineClass: 'secondary' })

      // Bottom line at closed position
      openingLine(-offset, 'secondary')
      break
    }

    case 'bay': {
      // Center pane line
      const centerPaneHalf = half * 0.5
      const centerStart: Point2 = [center[0] - dir[0] * centerPaneHalf, center[1] - dir[1] * centerPaneHalf]
      const centerEnd: Point2 = [center[0] + dir[0] * centerPaneHalf, center[1] + dir[1] * centerPaneHalf]
      primitives.push({ kind: 'polyline', points: [centerStart, centerEnd], lineClass: spec.lineClass })

      // Angled side panes at each end (30 degrees outward)
      const sideLen = half * 0.55
      const bayAngle = Math.PI / 6 // 30 degrees

      // Left side pane
      const leftJoint: Point2 = [center[0] - dir[0] * centerPaneHalf, center[1] - dir[1] * centerPaneHalf]
      const leftEnd: Point2 = [
        leftJoint[0] - dir[0] * sideLen * Math.cos(bayAngle) + normal[0] * sideLen * Math.sin(bayAngle),
        leftJoint[1] - dir[1] * sideLen * Math.cos(bayAngle) + normal[1] * sideLen * Math.sin(bayAngle),
      ]
      primitives.push({ kind: 'polyline', points: [leftJoint, leftEnd], lineClass: spec.lineClass })

      // Right side pane
      const rightJoint: Point2 = [center[0] + dir[0] * centerPaneHalf, center[1] + dir[1] * centerPaneHalf]
      const rightEnd: Point2 = [
        rightJoint[0] + dir[0] * sideLen * Math.cos(bayAngle) + normal[0] * sideLen * Math.sin(bayAngle),
        rightJoint[1] + dir[1] * sideLen * Math.cos(bayAngle) + normal[1] * sideLen * Math.sin(bayAngle),
      ]
      primitives.push({ kind: 'polyline', points: [rightJoint, rightEnd], lineClass: spec.lineClass })
      break
    }

    default: {
      // Fallback: single line
      openingLine(0, spec.lineClass)
      break
    }
  }

  // Optional label
  if (options.showLabels && spec.allowsLabel) {
    const labelPos: Point2 = [
      center[0] + normal[0] * wall.thickness * 0.7,
      center[1] + normal[1] * wall.thickness * 0.7,
    ]
    const wallAngle = Math.atan2(dz, dx)
    const label = win.meta?.name ?? windowType.replace(/_/g, ' ').toUpperCase()
    primitives.push({
      kind: 'text',
      position: labelPos,
      text: label,
      size: win.width * 0.12,
      rotation: wallAngle,
      lineClass: 'annotation',
    })
  }

  return {
    domain: spec.domain,
    primitives,
  }
}
