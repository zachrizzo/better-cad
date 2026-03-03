import type { DoorElement, WallElement } from '../../services/kernel-bridge'
import type { SymbolGenerationOptions, SymbolPrimitiveBundle } from '../symbol-primitives'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../plan-symbol-profile'
import { addLine, addText, type Point2, type SymbolPrimitive } from './_helpers'

interface DoorSymbolContext {
  door: DoorElement
  wall: WallElement
}

export function generateDoorPrimitives(
  context: DoorSymbolContext,
  options: SymbolGenerationOptions,
): SymbolPrimitiveBundle {
  const spec = getSymbolSpec(options.planSymbolProfile, 'doors', context.door.door_type ?? 'single_swing') ?? {
    domain: 'architectural' as const,
    title: 'Door',
    lineClass: 'primary' as const,
    allowsLabel: true,
    provenance: getDefaultSymbolProvenance(),
  }

  const { door, wall } = context
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.max(1e-8, Math.hypot(dx, dz))
  const dir: Point2 = [dx / len, dz / len]
  const normal: Point2 = [-dir[1], dir[0]]
  const center: Point2 = [
    wall.start[0] + dx * door.position_along_wall,
    wall.start[1] + dz * door.position_along_wall,
  ]
  const half = door.width / 2
  const doorType = door.door_type ?? 'single_swing'
  const swing = door.swing ?? 'left'

  const primitives: SymbolPrimitive[] = []

  switch (doorType) {
    case 'single_swing': {
      // Opening span line
      const spanStart: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      const spanEnd: Point2 = [center[0] + dir[0] * half, center[1] + dir[1] * half]
      primitives.push({ kind: 'polyline', points: [spanStart, spanEnd], lineClass: 'secondary' })

      // Hinge and swing directions
      const hinge: Point2 = swing === 'left'
        ? [center[0] - dir[0] * half, center[1] - dir[1] * half]
        : [center[0] + dir[0] * half, center[1] + dir[1] * half]
      const closedDir: Point2 = swing === 'left' ? dir : [-dir[0], -dir[1]]
      const openDir: Point2 = swing === 'left' ? normal : [-normal[0], -normal[1]]

      // Door leaf line from hinge to open position
      const leafEnd: Point2 = [
        hinge[0] + openDir[0] * door.width,
        hinge[1] + openDir[1] * door.width,
      ]
      primitives.push({ kind: 'polyline', points: [hinge, leafEnd], lineClass: spec.lineClass })

      // Quarter-arc sweep from closed to open
      const arcPts: Point2[] = []
      for (let i = 0; i <= 14; i++) {
        const theta = (Math.PI / 2) * (i / 14)
        arcPts.push([
          hinge[0] + door.width * (closedDir[0] * Math.cos(theta) + openDir[0] * Math.sin(theta)),
          hinge[1] + door.width * (closedDir[1] * Math.cos(theta) + openDir[1] * Math.sin(theta)),
        ])
      }
      primitives.push({ kind: 'polyline', points: arcPts, lineClass: 'secondary' })
      break
    }

    case 'double_swing': {
      // Opening span line
      const spanStart: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      const spanEnd: Point2 = [center[0] + dir[0] * half, center[1] + dir[1] * half]
      primitives.push({ kind: 'polyline', points: [spanStart, spanEnd], lineClass: 'secondary' })

      // Left hinge (at left end of opening)
      const hingeL: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      const leafWidthL = door.width / 2
      const leafEndL: Point2 = [hingeL[0] + normal[0] * leafWidthL, hingeL[1] + normal[1] * leafWidthL]
      primitives.push({ kind: 'polyline', points: [hingeL, leafEndL], lineClass: spec.lineClass })

      // Left arc
      const arcL: Point2[] = []
      for (let i = 0; i <= 14; i++) {
        const theta = (Math.PI / 2) * (i / 14)
        arcL.push([
          hingeL[0] + leafWidthL * (dir[0] * Math.cos(theta) + normal[0] * Math.sin(theta)),
          hingeL[1] + leafWidthL * (dir[1] * Math.cos(theta) + normal[1] * Math.sin(theta)),
        ])
      }
      primitives.push({ kind: 'polyline', points: arcL, lineClass: 'secondary' })

      // Right hinge (at right end of opening)
      const hingeR: Point2 = [center[0] + dir[0] * half, center[1] + dir[1] * half]
      const leafWidthR = door.width / 2
      const leafEndR: Point2 = [hingeR[0] - normal[0] * leafWidthR, hingeR[1] - normal[1] * leafWidthR]
      primitives.push({ kind: 'polyline', points: [hingeR, leafEndR], lineClass: spec.lineClass })

      // Right arc (mirrored)
      const arcR: Point2[] = []
      for (let i = 0; i <= 14; i++) {
        const theta = (Math.PI / 2) * (i / 14)
        arcR.push([
          hingeR[0] + leafWidthR * (-dir[0] * Math.cos(theta) - normal[0] * Math.sin(theta)),
          hingeR[1] + leafWidthR * (-dir[1] * Math.cos(theta) - normal[1] * Math.sin(theta)),
        ])
      }
      primitives.push({ kind: 'polyline', points: arcR, lineClass: 'secondary' })
      break
    }

    case 'sliding': {
      // Two thin overlapping rectangles representing panels
      const panelDepth = wall.thickness * 0.15
      const panelWidth = door.width * 0.55

      // Panel 1 (slightly offset toward normal)
      const p1Center: Point2 = [
        center[0] - dir[0] * panelWidth * 0.15 + normal[0] * panelDepth,
        center[1] - dir[1] * panelWidth * 0.15 + normal[1] * panelDepth,
      ]
      const p1Pts: Point2[] = [
        [p1Center[0] - dir[0] * panelWidth / 2 - normal[0] * panelDepth / 2, p1Center[1] - dir[1] * panelWidth / 2 - normal[1] * panelDepth / 2],
        [p1Center[0] + dir[0] * panelWidth / 2 - normal[0] * panelDepth / 2, p1Center[1] + dir[1] * panelWidth / 2 - normal[1] * panelDepth / 2],
        [p1Center[0] + dir[0] * panelWidth / 2 + normal[0] * panelDepth / 2, p1Center[1] + dir[1] * panelWidth / 2 + normal[1] * panelDepth / 2],
        [p1Center[0] - dir[0] * panelWidth / 2 + normal[0] * panelDepth / 2, p1Center[1] - dir[1] * panelWidth / 2 + normal[1] * panelDepth / 2],
      ]
      primitives.push({ kind: 'polyline', points: p1Pts, closed: true, lineClass: spec.lineClass })

      // Panel 2 (slightly offset away from normal)
      const p2Center: Point2 = [
        center[0] + dir[0] * panelWidth * 0.15 - normal[0] * panelDepth,
        center[1] + dir[1] * panelWidth * 0.15 - normal[1] * panelDepth,
      ]
      const p2Pts: Point2[] = [
        [p2Center[0] - dir[0] * panelWidth / 2 - normal[0] * panelDepth / 2, p2Center[1] - dir[1] * panelWidth / 2 - normal[1] * panelDepth / 2],
        [p2Center[0] + dir[0] * panelWidth / 2 - normal[0] * panelDepth / 2, p2Center[1] + dir[1] * panelWidth / 2 - normal[1] * panelDepth / 2],
        [p2Center[0] + dir[0] * panelWidth / 2 + normal[0] * panelDepth / 2, p2Center[1] + dir[1] * panelWidth / 2 + normal[1] * panelDepth / 2],
        [p2Center[0] - dir[0] * panelWidth / 2 + normal[0] * panelDepth / 2, p2Center[1] - dir[1] * panelWidth / 2 + normal[1] * panelDepth / 2],
      ]
      primitives.push({ kind: 'polyline', points: p2Pts, closed: true, lineClass: spec.lineClass })

      // Arrow showing slide direction
      const arrowBase: Point2 = [center[0] + normal[0] * wall.thickness * 0.5, center[1] + normal[1] * wall.thickness * 0.5]
      const arrowTip: Point2 = [arrowBase[0] + dir[0] * door.width * 0.3, arrowBase[1] + dir[1] * door.width * 0.3]
      const arrowHeadSize = door.width * 0.08
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

    case 'pocket': {
      // Panel line at the opening edge
      const panelStart: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      const panelEnd: Point2 = [center[0] + dir[0] * half, center[1] + dir[1] * half]
      primitives.push({ kind: 'polyline', points: [panelStart, panelEnd], lineClass: spec.lineClass })

      // Dashed-style rectangle inside wall showing pocket recess
      const pocketOffset = swing === 'left' ? -1 : 1
      const pocketCenter: Point2 = [
        center[0] + dir[0] * pocketOffset * door.width,
        center[1] + dir[1] * pocketOffset * door.width,
      ]
      const pocketHalfW = door.width * 0.48
      const pocketHalfD = wall.thickness * 0.3
      const pocketPts: Point2[] = [
        [pocketCenter[0] - dir[0] * pocketHalfW - normal[0] * pocketHalfD, pocketCenter[1] - dir[1] * pocketHalfW - normal[1] * pocketHalfD],
        [pocketCenter[0] + dir[0] * pocketHalfW - normal[0] * pocketHalfD, pocketCenter[1] + dir[1] * pocketHalfW - normal[1] * pocketHalfD],
        [pocketCenter[0] + dir[0] * pocketHalfW + normal[0] * pocketHalfD, pocketCenter[1] + dir[1] * pocketHalfW + normal[1] * pocketHalfD],
        [pocketCenter[0] - dir[0] * pocketHalfW + normal[0] * pocketHalfD, pocketCenter[1] - dir[1] * pocketHalfW + normal[1] * pocketHalfD],
      ]
      primitives.push({ kind: 'polyline', points: pocketPts, closed: true, lineClass: 'annotation' })
      break
    }

    case 'bifold': {
      // Opening span line
      const spanStart: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      const spanEnd: Point2 = [center[0] + dir[0] * half, center[1] + dir[1] * half]
      primitives.push({ kind: 'polyline', points: [spanStart, spanEnd], lineClass: 'secondary' })

      // Two V-shaped fold panel lines from each hinge to center of opening
      const foldDepth = door.width * 0.3
      const midPoint: Point2 = [center[0] + normal[0] * foldDepth, center[1] + normal[1] * foldDepth]

      // Left fold: hinge at left end to fold midpoint, back to center
      const hingeLeft: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      primitives.push({ kind: 'polyline', points: [hingeLeft, midPoint, center], lineClass: spec.lineClass })

      // Right fold: hinge at right end to fold midpoint, back to center
      const hingeRight: Point2 = [center[0] + dir[0] * half, center[1] + dir[1] * half]
      const midPointR: Point2 = [center[0] + normal[0] * foldDepth, center[1] + normal[1] * foldDepth]
      primitives.push({ kind: 'polyline', points: [hingeRight, midPointR, center], lineClass: spec.lineClass })
      break
    }

    case 'garage': {
      // Full-width rectangle across opening
      const rectHalfD = wall.thickness * 0.25
      const rectPts: Point2[] = [
        [center[0] - dir[0] * half - normal[0] * rectHalfD, center[1] - dir[1] * half - normal[1] * rectHalfD],
        [center[0] + dir[0] * half - normal[0] * rectHalfD, center[1] + dir[1] * half - normal[1] * rectHalfD],
        [center[0] + dir[0] * half + normal[0] * rectHalfD, center[1] + dir[1] * half + normal[1] * rectHalfD],
        [center[0] - dir[0] * half + normal[0] * rectHalfD, center[1] - dir[1] * half + normal[1] * rectHalfD],
      ]
      primitives.push({ kind: 'polyline', points: rectPts, closed: true, lineClass: spec.lineClass })

      // Horizontal section lines (3-4 lines across the door panel)
      const sectionCount = 4
      for (let i = 1; i < sectionCount; i++) {
        const t = i / sectionCount
        const offsetN = -rectHalfD + rectHalfD * 2 * t
        const lineStart: Point2 = [
          center[0] - dir[0] * half * 0.9 + normal[0] * offsetN,
          center[1] - dir[1] * half * 0.9 + normal[1] * offsetN,
        ]
        const lineEnd: Point2 = [
          center[0] + dir[0] * half * 0.9 + normal[0] * offsetN,
          center[1] + dir[1] * half * 0.9 + normal[1] * offsetN,
        ]
        primitives.push({ kind: 'polyline', points: [lineStart, lineEnd], lineClass: 'secondary' })
      }

      // Up-arrow indicating overhead operation
      const arrowLen = wall.thickness * 0.6
      const arrowBase: Point2 = [center[0], center[1]]
      const arrowTip: Point2 = [center[0] + normal[0] * arrowLen, center[1] + normal[1] * arrowLen]
      const arrowHeadSize = arrowLen * 0.3
      const arrowLeft: Point2 = [
        arrowTip[0] - normal[0] * arrowHeadSize + dir[0] * arrowHeadSize * 0.5,
        arrowTip[1] - normal[1] * arrowHeadSize + dir[1] * arrowHeadSize * 0.5,
      ]
      const arrowRight: Point2 = [
        arrowTip[0] - normal[0] * arrowHeadSize - dir[0] * arrowHeadSize * 0.5,
        arrowTip[1] - normal[1] * arrowHeadSize - dir[1] * arrowHeadSize * 0.5,
      ]
      primitives.push({ kind: 'polyline', points: [arrowBase, arrowTip], lineClass: 'annotation' })
      primitives.push({ kind: 'polyline', points: [arrowLeft, arrowTip, arrowRight], lineClass: 'annotation' })
      break
    }

    default: {
      // Fallback: simple opening line
      const spanStart: Point2 = [center[0] - dir[0] * half, center[1] - dir[1] * half]
      const spanEnd: Point2 = [center[0] + dir[0] * half, center[1] + dir[1] * half]
      primitives.push({ kind: 'polyline', points: [spanStart, spanEnd], lineClass: spec.lineClass })
      break
    }
  }

  // Optional label
  if (options.showLabels && spec.allowsLabel) {
    const labelPos: Point2 = [
      center[0] + normal[0] * door.width * 0.6,
      center[1] + normal[1] * door.width * 0.6,
    ]
    const wallAngle = Math.atan2(dz, dx)
    const label = door.meta?.name ?? doorType.replace(/_/g, ' ').toUpperCase()
    primitives.push({
      kind: 'text',
      position: labelPos,
      text: label,
      size: door.width * 0.15,
      rotation: wallAngle,
      lineClass: 'annotation',
    })
  }

  return {
    domain: spec.domain,
    primitives,
  }
}
