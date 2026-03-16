import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LengthUnit } from '../utils/units'
import type { DimensionStyleId } from '../utils/dimension-styles'
import type { WallFace } from '../services/wall-reference'
import {
  cloneMeasurementSnapSettings,
  DEFAULT_MEASUREMENT_SNAP_SETTINGS,
  type MeasurementSnapMode,
  type MeasurementSnapSettings,
  type MeasurementSnapTool,
  updateMeasurementSnapMode,
} from '../utils/measurement-snap-settings'

export type LightingPreset = 'daylight' | 'evening' | 'studio'

export interface LightingPresetConfig {
  ambientIntensity: number
  ambientColor: string
  mainLightIntensity: number
  mainLightColor: string
  mainLightPosition: [number, number, number]
  fillLightIntensity: number
  fillLightColor: string
  fillLightPosition: [number, number, number]
  hemisphereIntensity: number
  hemisphereSkyColor: string
  hemisphereGroundColor: string
  environmentPreset: 'sunset' | 'studio' | 'city' | 'apartment' | 'dawn' | 'forest' | 'lobby' | 'night' | 'park' | 'warehouse'
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingPresetConfig> = {
  daylight: {
    ambientIntensity: 0.3,
    ambientColor: '#ffffff',
    mainLightIntensity: 1.0,
    mainLightColor: '#fffde8',
    mainLightPosition: [8, 15, 8],
    fillLightIntensity: 0.3,
    fillLightColor: '#b4d4ff',
    fillLightPosition: [-5, 5, -5],
    hemisphereIntensity: 0.4,
    hemisphereSkyColor: '#87ceeb',
    hemisphereGroundColor: '#8b7355',
    environmentPreset: 'city',
  },
  evening: {
    ambientIntensity: 0.2,
    ambientColor: '#ffd4a0',
    mainLightIntensity: 0.8,
    mainLightColor: '#ff9944',
    mainLightPosition: [3, 6, 10],
    fillLightIntensity: 0.2,
    fillLightColor: '#6688cc',
    fillLightPosition: [-5, 3, -5],
    hemisphereIntensity: 0.3,
    hemisphereSkyColor: '#ff7744',
    hemisphereGroundColor: '#443322',
    environmentPreset: 'sunset',
  },
  studio: {
    ambientIntensity: 0.4,
    ambientColor: '#f0f0f0',
    mainLightIntensity: 0.7,
    mainLightColor: '#ffffff',
    mainLightPosition: [5, 10, 5],
    fillLightIntensity: 0.4,
    fillLightColor: '#e8e8ff',
    fillLightPosition: [-8, 6, -3],
    hemisphereIntensity: 0.3,
    hemisphereSkyColor: '#ffffff',
    hemisphereGroundColor: '#888888',
    environmentPreset: 'studio',
  },
}

interface SettingsState {
  lengthUnit: LengthUnit
  lightingPreset: LightingPreset
  measurementSnapSettings: MeasurementSnapSettings
  wallsVisible: boolean
  defaultDimensionStyle: DimensionStyleId
  dimensionPrecision: number
  dimensionFractional: boolean
  wallReferenceMode: WallFace
  wallFinishThickness: number
  setLengthUnit: (unit: LengthUnit) => void
  setLightingPreset: (preset: LightingPreset) => void
  setMeasurementSnapMode: (tool: MeasurementSnapTool, mode: MeasurementSnapMode, enabled: boolean) => void
  toggleWallsVisible: () => void
  setDefaultDimensionStyle: (style: DimensionStyleId) => void
  setDimensionPrecision: (precision: number) => void
  setDimensionFractional: (fractional: boolean) => void
  setWallReferenceMode: (mode: WallFace) => void
  setWallFinishThickness: (thickness: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      lengthUnit: 'm',
      lightingPreset: 'daylight',
      measurementSnapSettings: cloneMeasurementSnapSettings(DEFAULT_MEASUREMENT_SNAP_SETTINGS),
      wallsVisible: true,
      defaultDimensionStyle: 'aia',
      dimensionPrecision: 2,
      dimensionFractional: false,
      wallReferenceMode: 'centerline' as WallFace,
      wallFinishThickness: 0.013,
      setLengthUnit: (lengthUnit) => set({ lengthUnit }),
      setLightingPreset: (lightingPreset) => set({ lightingPreset }),
      setMeasurementSnapMode: (tool, mode, enabled) => set((state) => ({
        measurementSnapSettings: updateMeasurementSnapMode(state.measurementSnapSettings, tool, mode, enabled),
      })),
      toggleWallsVisible: () => set((state) => ({ wallsVisible: !state.wallsVisible })),
      setDefaultDimensionStyle: (defaultDimensionStyle) => set({ defaultDimensionStyle }),
      setDimensionPrecision: (dimensionPrecision) => set({ dimensionPrecision }),
      setDimensionFractional: (dimensionFractional) => set({ dimensionFractional }),
      setWallReferenceMode: (wallReferenceMode) => set({ wallReferenceMode }),
      setWallFinishThickness: (wallFinishThickness) => set({ wallFinishThickness }),
    }),
    {
      name: 'bettercad-settings',
      partialize: (state) => ({
        lengthUnit: state.lengthUnit,
        lightingPreset: state.lightingPreset,
        measurementSnapSettings: state.measurementSnapSettings,
        wallsVisible: state.wallsVisible,
        defaultDimensionStyle: state.defaultDimensionStyle,
        dimensionPrecision: state.dimensionPrecision,
        dimensionFractional: state.dimensionFractional,
        wallReferenceMode: state.wallReferenceMode,
        wallFinishThickness: state.wallFinishThickness,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<SettingsState>) }
        // Ensure new snap modes added after initial persist are present with defaults
        merged.measurementSnapSettings = {
          measure: { ...DEFAULT_MEASUREMENT_SNAP_SETTINGS.measure, ...merged.measurementSnapSettings?.measure },
          dimension: { ...DEFAULT_MEASUREMENT_SNAP_SETTINGS.dimension, ...merged.measurementSnapSettings?.dimension },
        }
        // Ensure defaultDimensionStyle has a valid fallback
        if (!merged.defaultDimensionStyle) merged.defaultDimensionStyle = 'aia'
        return merged as SettingsState
      },
    },
  ),
)
