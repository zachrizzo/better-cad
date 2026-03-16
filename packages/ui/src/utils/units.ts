export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft'

interface UnitDef {
  symbol: string
  metersPerUnit: number
  precision: number
}

export const LENGTH_UNITS: Record<LengthUnit, UnitDef> = {
  mm: { symbol: 'mm', metersPerUnit: 0.001, precision: 1 },
  cm: { symbol: 'cm', metersPerUnit: 0.01, precision: 2 },
  m: { symbol: 'm', metersPerUnit: 1, precision: 3 },
  in: { symbol: 'in', metersPerUnit: 0.0254, precision: 2 },
  ft: { symbol: 'ft', metersPerUnit: 0.3048, precision: 3 },
}

export function metersToUnitValue(meters: number, unit: LengthUnit): number {
  return meters / LENGTH_UNITS[unit].metersPerUnit
}

export function unitValueToMeters(value: number, unit: LengthUnit): number {
  return value * LENGTH_UNITS[unit].metersPerUnit
}

export function formatLength(meters: number, unit: LengthUnit, digits?: number): string {
  const def = LENGTH_UNITS[unit]
  const value = metersToUnitValue(meters, unit)
  const precision = digits ?? def.precision
  return `${value.toFixed(precision)} ${def.symbol}`
}

// ── Unified dimension formatting ──────────────────────────────────────────

export interface DimensionFormatOptions {
  precision?: number
  fractional?: boolean
}

/**
 * Greatest common divisor helper used for reducing fractions.
 */
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

/**
 * Format a length value as a dimension string suitable for annotations,
 * schedules, and PDF export.
 *
 * When `opts.fractional` is true and `unit` is `'in'` or `'ft'`, the result
 * uses feet-inches notation with fractions rounded to the nearest 1/16".
 * Otherwise the value is formatted with `toFixed(precision)`.
 */
export function formatDimensionText(
  meters: number,
  unit: LengthUnit,
  opts?: DimensionFormatOptions,
): string {
  const def = LENGTH_UNITS[unit]
  const fractional = opts?.fractional ?? false

  if (fractional && (unit === 'in' || unit === 'ft')) {
    const totalInches = meters / LENGTH_UNITS['in'].metersPerUnit // meters * ~39.3701
    const feet = Math.floor(totalInches / 12)
    const inches = totalInches % 12
    // Round to nearest 1/16"
    const sixteenths = Math.round(inches * 16) / 16
    const wholeInches = Math.floor(sixteenths)
    const frac = sixteenths - wholeInches
    let inchStr = wholeInches.toString()
    if (frac > 0) {
      const num = Math.round(frac * 16)
      const den = 16
      const g = gcd(num, den)
      inchStr += ` ${num / g}/${den / g}`
    }
    if (feet > 0) return `${feet}'-${inchStr}"`
    return `${inchStr}"`
  }

  const value = metersToUnitValue(meters, unit)
  const precision = opts?.precision ?? def.precision
  return `${value.toFixed(precision)} ${def.symbol}`
}

/**
 * Format an area value (square meters) into the given unit squared.
 */
export function formatArea(
  sqMeters: number,
  unit: LengthUnit,
  opts?: DimensionFormatOptions,
): string {
  const def = LENGTH_UNITS[unit]
  const value = sqMeters / (def.metersPerUnit * def.metersPerUnit)
  const precision = opts?.precision ?? def.precision
  return `${value.toFixed(precision)} ${def.symbol}\u00B2`
}

/**
 * Format an angle given in radians as a degree string with the ° symbol.
 */
export function formatAngle(radians: number, precision?: number): string {
  const degrees = radians * (180 / Math.PI)
  return `${degrees.toFixed(precision ?? 1)}\u00B0`
}

