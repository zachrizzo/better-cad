export const MEASUREMENT_SNAP_TOOLS = ['measure', 'dimension'] as const

export type MeasurementSnapTool = typeof MEASUREMENT_SNAP_TOOLS[number]

export const MEASUREMENT_SNAP_MODES = ['endpoint', 'center', 'nearest'] as const

export type MeasurementSnapMode = typeof MEASUREMENT_SNAP_MODES[number]

export type MeasurementSnapModeSettings = Record<MeasurementSnapMode, boolean>

export type MeasurementSnapSettings = Record<MeasurementSnapTool, MeasurementSnapModeSettings>

export const MEASUREMENT_SNAP_MODE_LABELS: Record<MeasurementSnapMode, string> = {
  endpoint: 'Endpoint',
  center: 'Center',
  nearest: 'Nearest',
}

export const DEFAULT_MEASUREMENT_SNAP_SETTINGS: MeasurementSnapSettings = {
  measure: {
    endpoint: true,
    center: true,
    nearest: true,
  },
  dimension: {
    endpoint: true,
    center: true,
    nearest: true,
  },
}

export function isMeasurementSnapTool(tool: string): tool is MeasurementSnapTool {
  return tool === 'measure' || tool === 'dimension'
}

export function cloneMeasurementSnapSettings(
  settings: MeasurementSnapSettings = DEFAULT_MEASUREMENT_SNAP_SETTINGS,
): MeasurementSnapSettings {
  return {
    measure: { ...settings.measure },
    dimension: { ...settings.dimension },
  }
}

export function updateMeasurementSnapMode(
  settings: MeasurementSnapSettings,
  tool: MeasurementSnapTool,
  mode: MeasurementSnapMode,
  enabled: boolean,
): MeasurementSnapSettings {
  return {
    ...settings,
    [tool]: {
      ...settings[tool],
      [mode]: enabled,
    },
  }
}

export function getEnabledMeasurementSnapModes(
  settings: MeasurementSnapModeSettings,
  masterEnabled = true,
): MeasurementSnapMode[] {
  if (!masterEnabled) return []
  return MEASUREMENT_SNAP_MODES.filter((mode) => settings[mode])
}

export function hasEnabledMeasurementSnapModes(settings: MeasurementSnapModeSettings): boolean {
  return getEnabledMeasurementSnapModes(settings).length > 0
}
