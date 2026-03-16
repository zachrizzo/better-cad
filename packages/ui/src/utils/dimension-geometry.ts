import type { DimensionStyle, DimensionMode, TerminatorType, TextPlacement } from './dimension-styles'
import { resolveDimensionStyle } from './dimension-styles'
import { formatLength, type LengthUnit } from './units'

export interface DimensionGeometry {
  // Extension lines
  ext1Start: [number, number]
  ext1End: [number, number]
  ext2Start: [number, number]
  ext2End: [number, number]
  // Dimension line
  dimLineStart: [number, number]
  dimLineEnd: [number, number]
  dimLineSegments: [[number, number], [number, number]][]
  // Terminators
  terminator: TerminatorType
  terminatorAngle: number
  // Text
  textPosition: [number, number]
  textAngle: number
  displayText: string
  textPlacement: TextPlacement
  // Measured value
  measuredLength: number
}

export interface DimensionComputeInput {
  p1: [number, number]
  p2: [number, number]
  offset: number
  mode?: DimensionMode
  styleId?: string
  textOverride?: string
  isReference?: boolean
  tolerancePlus?: number
  toleranceMinus?: number
  lengthUnit: LengthUnit
}

export function computeDimensionGeometry(input: DimensionComputeInput): DimensionGeometry {
  const style = resolveDimensionStyle(input.styleId as any)
  const { p1, p2, offset, mode } = input

  // Compute direction based on mode
  let dx = p2[0] - p1[0]
  let dy = p2[1] - p1[1]
  let measuredLength: number

  if (mode === 'horizontal') {
    measuredLength = Math.abs(dx)
    dy = 0
  } else if (mode === 'vertical') {
    measuredLength = Math.abs(dy)
    dx = 0
  } else {
    measuredLength = Math.sqrt(dx * dx + dy * dy)
  }

  if (measuredLength < 1e-9) measuredLength = 0

  // Direction and perpendicular
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const dirX = dx / len
  const dirY = dy / len
  const perpX = -dirY
  const perpY = dirX

  // Effective p1/p2 for horizontal/vertical modes
  let ep1: [number, number] = p1
  let ep2: [number, number]
  if (mode === 'horizontal') {
    ep2 = [p2[0], p1[1]]
  } else if (mode === 'vertical') {
    ep2 = [p1[0], p2[1]]
  } else {
    ep2 = p2
  }

  const gap = style.extensionGap
  const overshoot = style.extensionOvershoot
  const sign = offset >= 0 ? 1 : -1
  const absOffset = Math.abs(offset)

  // Extension lines
  const ext1Start: [number, number] = [ep1[0] + perpX * gap * sign, ep1[1] + perpY * gap * sign]
  const ext1End: [number, number] = [ep1[0] + perpX * (absOffset + overshoot) * sign, ep1[1] + perpY * (absOffset + overshoot) * sign]
  const ext2Start: [number, number] = [ep2[0] + perpX * gap * sign, ep2[1] + perpY * gap * sign]
  const ext2End: [number, number] = [ep2[0] + perpX * (absOffset + overshoot) * sign, ep2[1] + perpY * (absOffset + overshoot) * sign]

  // Dimension line
  const dimLineStart: [number, number] = [ep1[0] + perpX * absOffset * sign, ep1[1] + perpY * absOffset * sign]
  const dimLineEnd: [number, number] = [ep2[0] + perpX * absOffset * sign, ep2[1] + perpY * absOffset * sign]

  // Text
  let displayText = input.textOverride || formatLength(measuredLength, input.lengthUnit)
  if (input.isReference) displayText = `(${displayText})`
  if (input.tolerancePlus != null || input.toleranceMinus != null) {
    const plus = input.tolerancePlus ?? 0
    const minus = input.toleranceMinus ?? 0
    displayText += ` +${formatLength(plus, input.lengthUnit)}/-${formatLength(minus, input.lengthUnit)}`
  }

  const textPosition: [number, number] = [
    (dimLineStart[0] + dimLineEnd[0]) / 2,
    (dimLineStart[1] + dimLineEnd[1]) / 2,
  ]

  const textAngle = Math.atan2(dimLineEnd[1] - dimLineStart[1], dimLineEnd[0] - dimLineStart[0])

  // For inline text, split the dim line into two segments with a gap
  let dimLineSegments: [[number, number], [number, number]][]
  if (style.textPlacement === 'inline') {
    const textGap = measuredLength > 0 ? Math.min(measuredLength * 0.3, 0.4) : 0.1
    const midT = 0.5
    const gapHalfNorm = textGap / (2 * (Math.sqrt((dimLineEnd[0] - dimLineStart[0]) ** 2 + (dimLineEnd[1] - dimLineStart[1]) ** 2) || 1))
    const t1 = Math.max(0, midT - gapHalfNorm)
    const t2 = Math.min(1, midT + gapHalfNorm)
    const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    dimLineSegments = [
      [dimLineStart, lerp(dimLineStart, dimLineEnd, t1)],
      [lerp(dimLineStart, dimLineEnd, t2), dimLineEnd],
    ]
  } else {
    dimLineSegments = [[dimLineStart, dimLineEnd]]
  }

  const terminatorAngle = textAngle

  return {
    ext1Start, ext1End,
    ext2Start, ext2End,
    dimLineStart, dimLineEnd,
    dimLineSegments,
    terminator: style.terminator,
    terminatorAngle,
    textPosition,
    textAngle,
    displayText,
    textPlacement: style.textPlacement,
    measuredLength,
  }
}
