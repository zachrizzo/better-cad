import { useUIStore } from '../../stores/ui-store'

export type DimensionSubMode = 'aligned' | 'horizontal' | 'vertical' | 'chain' | 'baseline' | 'ordinate'

const DIMENSION_SUB_MODES: { mode: DimensionSubMode; label: string; title: string }[] = [
  { mode: 'aligned', label: 'Aligned', title: 'Aligned dimension (default)' },
  { mode: 'horizontal', label: 'Horiz', title: 'Horizontal dimension (constrain to X)' },
  { mode: 'vertical', label: 'Vert', title: 'Vertical dimension (constrain to Y)' },
  { mode: 'chain', label: 'Chain', title: 'Chained dimensions (continuous)' },
  { mode: 'baseline', label: 'Base', title: 'Baseline dimensions (from origin)' },
  { mode: 'ordinate', label: 'Ord', title: 'Ordinate dimensions (X/Y from datum)' },
]

export function DimensionToolbar() {
  const dimensionSubMode = useUIStore((s) => s.dimensionSubMode)
  const setDimensionSubMode = useUIStore((s) => s.setDimensionSubMode)

  return (
    <div className="sketch-toolbar">
      <span className="sketch-toolbar-label">Dim:</span>

      {DIMENSION_SUB_MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          className={`toolbar-btn ${dimensionSubMode === mode ? 'active' : ''}`}
          onClick={() => setDimensionSubMode(mode)}
          title={title}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
