import { describe, expect, it } from 'vitest'
import { renderSymbolPrimitives2D } from '../../renderers/viewport-symbol-renderer'
import { drawSymbolPrimitivesPdf } from '../../renderers/pdf-symbol-renderer'
import { generateFurniturePrimitives } from '../furniture'
import { generatePlumbingPrimitives } from '../plumbing'
import { generateElectricalPrimitives } from '../electrical'

function baseOptions() {
  return {
    planSymbolProfile: 'open_us_v1' as const,
    annotationDensity: 'minimal' as const,
    showLabels: false,
  }
}

describe('viewport/pdf primitive parity', () => {
  it('renders equivalent primitive counts from a shared bundle', () => {
    const bundle = generateFurniturePrimitives(
      {
        kind: 'furniture',
        meta: { id: 'f-1', name: 'Sofa' },
        symbol_type: 'sofa',
        position: [2, 3],
        rotation: 0,
        width: 2.2,
        depth: 0.9,
      },
      baseOptions(),
    )

    const viewportNodes = renderSymbolPrimitives2D(bundle.primitives, bundle.domain, 'test')
    expect(viewportNodes.length).toBe(bundle.primitives.length)

    const calls = { line: 0, text: 0 }
    const mockDoc: any = {
      setDrawColor: () => {},
      setTextColor: () => {},
      setLineWidth: () => {},
      line: () => { calls.line += 1 },
      setFont: () => {},
      setFontSize: () => {},
      text: () => { calls.text += 1 },
    }

    drawSymbolPrimitivesPdf(
      mockDoc,
      bundle.primitives,
      bundle.domain,
      (x) => x,
      (y) => y,
      10,
      true,
    )

    expect(calls.line).toBeGreaterThan(0)
    expect(calls.text).toBe(bundle.primitives.filter((p) => p.kind === 'text').length)
  })

  it('supports electrical and plumbing bundles through both renderers', () => {
    const electrical = generateElectricalPrimitives(
      {
        kind: 'electrical',
        meta: { id: 'e-1', name: 'Switch' },
        symbol_type: 'switch',
        position: [0, 0],
        rotation: 0,
      },
      baseOptions(),
    )
    const plumbing = generatePlumbingPrimitives(
      {
        kind: 'plumbing',
        meta: { id: 'p-1', name: 'Sink' },
        symbol_type: 'sink',
        position: [0, 0],
        rotation: 0,
      },
      baseOptions(),
    )

    expect(renderSymbolPrimitives2D(electrical.primitives, electrical.domain, 'e').length).toBe(electrical.primitives.length)
    expect(renderSymbolPrimitives2D(plumbing.primitives, plumbing.domain, 'p').length).toBe(plumbing.primitives.length)
  })
})

