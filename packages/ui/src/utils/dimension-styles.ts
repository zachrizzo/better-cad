export type DimensionStyleId = 'aia' | 'iso' | 'custom'
export type TerminatorType = 'tick' | 'arrow' | 'dot' | 'none'
export type TextPlacement = 'above' | 'inline'
export type DimensionMode = 'aligned' | 'horizontal' | 'vertical'

export interface DimensionStyle {
  id: DimensionStyleId
  label: string
  terminator: TerminatorType
  textPlacement: TextPlacement
  extensionGap: number
  extensionOvershoot: number
  color: string
  fontSize: number
}

export const DIMENSION_STYLES: Record<DimensionStyleId, DimensionStyle> = {
  aia: {
    id: 'aia',
    label: 'AIA (US)',
    terminator: 'tick',
    textPlacement: 'above',
    extensionGap: 0.03,
    extensionOvershoot: 0.05,
    color: '#000000',
    fontSize: 1.0,
  },
  iso: {
    id: 'iso',
    label: 'ISO',
    terminator: 'arrow',
    textPlacement: 'inline',
    extensionGap: 0.02,
    extensionOvershoot: 0.04,
    color: '#000000',
    fontSize: 1.0,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    terminator: 'tick',
    textPlacement: 'above',
    extensionGap: 0.03,
    extensionOvershoot: 0.05,
    color: '#000000',
    fontSize: 1.0,
  },
}

export function resolveDimensionStyle(styleId?: DimensionStyleId): DimensionStyle {
  return DIMENSION_STYLES[styleId ?? 'aia']
}
