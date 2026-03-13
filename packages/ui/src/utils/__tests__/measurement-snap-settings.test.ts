import { describe, expect, it } from 'vitest'
import {
  cloneMeasurementSnapSettings,
  DEFAULT_MEASUREMENT_SNAP_SETTINGS,
  getEnabledMeasurementSnapModes,
  hasEnabledMeasurementSnapModes,
  updateMeasurementSnapMode,
} from '../measurement-snap-settings'

describe('measurement snap settings', () => {
  it('enables all measurement snap modes by default for measure and dimension', () => {
    expect(getEnabledMeasurementSnapModes(DEFAULT_MEASUREMENT_SNAP_SETTINGS.measure)).toEqual([
      'endpoint',
      'center',
      'nearest',
    ])
    expect(getEnabledMeasurementSnapModes(DEFAULT_MEASUREMENT_SNAP_SETTINGS.dimension)).toEqual([
      'endpoint',
      'center',
      'nearest',
    ])
  })

  it('updates an individual tool mode without mutating the original settings object', () => {
    const original = cloneMeasurementSnapSettings()
    const updated = updateMeasurementSnapMode(original, 'dimension', 'nearest', false)

    expect(original.dimension.nearest).toBe(true)
    expect(updated.dimension.nearest).toBe(false)
    expect(updated.measure).toEqual(original.measure)
  })

  it('honors the master snap toggle when listing active modes', () => {
    expect(getEnabledMeasurementSnapModes(DEFAULT_MEASUREMENT_SNAP_SETTINGS.measure, false)).toEqual([])
  })

  it('reports when no per-tool snap modes remain enabled', () => {
    const settings = {
      endpoint: false,
      center: false,
      nearest: false,
    }

    expect(hasEnabledMeasurementSnapModes(settings)).toBe(false)
  })
})
