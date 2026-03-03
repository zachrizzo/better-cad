import { describe, expect, it } from 'vitest'
import type { ElectricalElement, PlumbingElement } from '../../../services/kernel-bridge'
import { generateElectricalPrimitives } from '../electrical'
import { generatePlumbingPrimitives } from '../plumbing'

function electrical(symbol_type: ElectricalElement['symbol_type']): ElectricalElement {
  return {
    kind: 'electrical',
    meta: { id: `e-${symbol_type}`, name: symbol_type },
    symbol_type,
    position: [1, 2],
    rotation: 0,
  }
}

function plumbing(symbol_type: PlumbingElement['symbol_type']): PlumbingElement {
  return {
    kind: 'plumbing',
    meta: { id: `p-${symbol_type}`, name: symbol_type },
    symbol_type,
    position: [3, 4],
    rotation: 0,
  }
}

function finiteMepGeometry(
  bundle: ReturnType<typeof generateElectricalPrimitives> | ReturnType<typeof generatePlumbingPrimitives>,
): boolean {
  for (const primitive of bundle.primitives) {
    if (primitive.kind === 'polyline') {
      for (const [x, y] of primitive.points) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false
      }
    } else if (primitive.kind === 'circle' || primitive.kind === 'arc') {
      if (!Number.isFinite(primitive.center[0]) || !Number.isFinite(primitive.center[1])) return false
      if (!Number.isFinite(primitive.radius)) return false
    } else if (primitive.kind === 'text') {
      if (!Number.isFinite(primitive.position[0]) || !Number.isFinite(primitive.position[1])) return false
      if (!Number.isFinite(primitive.size)) return false
    }
  }
  return true
}

describe('MEP symbol generators', () => {
  it('assigns finite geometry and line classes for electrical primitives', () => {
    const types: ElectricalElement['symbol_type'][] = [
      'outlet',
      'switch',
      'light_fixture',
      'panel',
      'smoke_detector',
      'junction_box',
      'three_way_switch',
      'dimmer_switch',
      'gfci_outlet',
      'floor_outlet',
      'ceiling_fan',
      'thermostat',
    ]
    for (const symbol_type of types) {
      const bundle = generateElectricalPrimitives(electrical(symbol_type), {
        planSymbolProfile: 'open_us_v1',
        annotationDensity: 'minimal',
        showLabels: false,
      })
      expect(bundle.domain).toBe('electrical')
      expect(bundle.primitives.length).toBeGreaterThan(0)
      expect(finiteMepGeometry(bundle)).toBe(true)
      expect(bundle.primitives.every((p) => typeof p.lineClass === 'string')).toBe(true)
    }
  })

  it('enforces electrical label policy by density', () => {
    const switchMinimal = generateElectricalPrimitives(electrical('switch'), {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'minimal',
      showLabels: false,
    })
    const panelMinimal = generateElectricalPrimitives(electrical('panel'), {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'minimal',
      showLabels: false,
    })
    const panelMedium = generateElectricalPrimitives(electrical('panel'), {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'medium',
      showLabels: false,
    })

    expect(switchMinimal.primitives.some((p) => p.kind === 'text' && p.text === 'S')).toBe(true)
    expect(panelMinimal.primitives.some((p) => p.kind === 'text')).toBe(false)
    expect(panelMedium.primitives.some((p) => p.kind === 'text' && p.text === 'P')).toBe(true)
  })

  it('enforces plumbing label policy by density', () => {
    const minimal = generatePlumbingPrimitives(plumbing('floor_drain'), {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'minimal',
      showLabels: false,
    })
    const medium = generatePlumbingPrimitives(plumbing('floor_drain'), {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'medium',
      showLabels: false,
    })

    expect(minimal.primitives.some((p) => p.kind === 'text')).toBe(false)
    expect(medium.primitives.some((p) => p.kind === 'text' && p.text === 'FD')).toBe(true)
    expect(finiteMepGeometry(medium)).toBe(true)
  })
})
