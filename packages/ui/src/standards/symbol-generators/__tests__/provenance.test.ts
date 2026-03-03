import { describe, expect, it } from 'vitest'
import { getDefaultSymbolProvenance, getSymbolSpec } from '../../plan-symbol-profile'
import type {
  ElectricalSymbolType,
  FurnitureSymbolType,
  PlumbingSymbolType,
} from '../../../services/kernel-bridge'

describe('open_us_v1 clean-room provenance', () => {
  it('returns clean-room provenance for all furniture symbols', () => {
    const symbols: FurnitureSymbolType[] = [
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

    for (const symbolType of symbols) {
      const spec = getSymbolSpec('open_us_v1', 'furniture', symbolType)
      expect(spec).toBeTruthy()
      expect(spec?.provenance).toEqual(getDefaultSymbolProvenance())
    }
  })

  it('returns clean-room provenance for all plumbing/electrical symbols', () => {
    const plumbing: PlumbingSymbolType[] = [
      'toilet',
      'sink',
      'bathtub',
      'shower',
      'water_heater',
      'hose_bib',
      'floor_drain',
      'dishwasher',
      'washing_machine',
      'urinal',
    ]
    const electrical: ElectricalSymbolType[] = [
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

    for (const symbolType of plumbing) {
      const spec = getSymbolSpec('open_us_v1', 'plumbing', symbolType)
      expect(spec?.provenance).toEqual(getDefaultSymbolProvenance())
    }

    for (const symbolType of electrical) {
      const spec = getSymbolSpec('open_us_v1', 'electrical', symbolType)
      expect(spec?.provenance).toEqual(getDefaultSymbolProvenance())
    }
  })
})

