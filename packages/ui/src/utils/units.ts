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

