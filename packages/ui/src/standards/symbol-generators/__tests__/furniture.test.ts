import { describe, expect, it } from 'vitest'
import type { FurnitureElement } from '../../../services/kernel-bridge'
import { generateFurniturePrimitives } from '../furniture'

function fixture(symbol_type: FurnitureElement['symbol_type']): FurnitureElement {
  return {
    kind: 'furniture',
    meta: { id: `f-${symbol_type}`, name: symbol_type },
    symbol_type,
    position: [10, 5],
    rotation: 0,
    width: 2,
    depth: 1,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasOnlyFiniteGeometry(bundle: ReturnType<typeof generateFurniturePrimitives>): boolean {
  for (const primitive of bundle.primitives) {
    if ('lineClass' in primitive && typeof primitive.lineClass !== 'string') return false
    if (primitive.kind === 'polyline') {
      for (const [x, y] of primitive.points) {
        if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false
      }
    } else if (primitive.kind === 'circle' || primitive.kind === 'arc') {
      if (!isFiniteNumber(primitive.center[0]) || !isFiniteNumber(primitive.center[1])) return false
      if (!isFiniteNumber(primitive.radius)) return false
    } else if (primitive.kind === 'text') {
      if (!isFiniteNumber(primitive.position[0]) || !isFiniteNumber(primitive.position[1])) return false
      if (!isFiniteNumber(primitive.size)) return false
    }
  }
  return true
}

describe('generateFurniturePrimitives', () => {
  it('produces finite geometry for each furniture symbol type', () => {
    const symbolTypes: FurnitureElement['symbol_type'][] = [
      'desk',
      'chair',
      'table',
      'bed',
      'sofa',
      'dining_table',
      'bookshelf',
      'wardrobe',
      'toilet_stall',
      'reception_desk',
      'conference_table',
      'kitchen_island',
      'refrigerator',
      'stove',
      'washer',
      'dryer',
      'nightstand',
      'coffee_table',
      'tv_console',
      'console_table',
      'bench',
      'ottoman',
      'vanity',
    ]

    for (const symbolType of symbolTypes) {
      const bundle = generateFurniturePrimitives(fixture(symbolType), {
        planSymbolProfile: 'open_us_v1',
        annotationDensity: 'minimal',
        showLabels: false,
      })
      expect(hasOnlyFiniteGeometry(bundle)).toBe(true)
      expect(bundle.primitives.length).toBeGreaterThan(0)
    }
  })

  it('shows appliance tags only when density policy allows them', () => {
    const base = fixture('refrigerator')
    const minimal = generateFurniturePrimitives(base, {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'minimal',
      showLabels: false,
    })
    const medium = generateFurniturePrimitives(base, {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'medium',
      showLabels: false,
    })

    expect(minimal.primitives.some((p) => p.kind === 'text')).toBe(false)
    expect(medium.primitives.some((p) => p.kind === 'text' && p.text === 'REF')).toBe(true)
  })

  it('keeps geometry magnitude stable across rotation', () => {
    const a = fixture('sofa')
    const b = fixture('sofa')
    b.rotation = Math.PI / 3

    const aBundle = generateFurniturePrimitives(a, {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'minimal',
      showLabels: false,
    })
    const bBundle = generateFurniturePrimitives(b, {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'minimal',
      showLabels: false,
    })

    const firstA = aBundle.primitives.find((p) => p.kind === 'polyline')
    const firstB = bBundle.primitives.find((p) => p.kind === 'polyline')
    expect(firstA?.kind).toBe('polyline')
    expect(firstB?.kind).toBe('polyline')
    if (!firstA || !firstB || firstA.kind !== 'polyline' || firstB.kind !== 'polyline') return

    const radiiA = firstA.points
      .map(([x, y]) => Math.hypot(x - a.position[0], y - a.position[1]))
      .sort((x, y) => x - y)
    const radiiB = firstB.points
      .map(([x, y]) => Math.hypot(x - b.position[0], y - b.position[1]))
      .sort((x, y) => x - y)

    expect(radiiA.length).toBe(radiiB.length)
    radiiA.forEach((radius, index) => {
      expect(radius).toBeCloseTo(radiiB[index], 6)
    })
  })
})
