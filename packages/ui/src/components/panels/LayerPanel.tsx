import { useCallback } from 'react'
import { useLayerStore, LAYER_PRESETS } from '../../stores/layer-store'
import type { LayerInfo } from '../../stores/layer-store'

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l12 12M6.5 6.5a2 2 0 002.9 2.9M1.5 8s2.1-3.7 5.3-4.4M10.5 5.2C13 6.5 14.5 8 14.5 8s-2.5 4.5-6.5 4.5c-.8 0-1.5-.1-2.2-.4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  )
}

function UnlockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0" />
    </svg>
  )
}

function LayerRow({ layer, isActive, onToggleVisibility, onToggleLock, onSetActive }: {
  layer: LayerInfo
  isActive: boolean
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string, locked: boolean) => void
  onSetActive: (id: string) => void
}) {
  const classes = ['layer-row']
  if (isActive) classes.push('active')
  if (!layer.visible) classes.push('hidden')

  return (
    <div
      className={classes.join(' ')}
      onClick={() => onSetActive(layer.id)}
      title={`Set ${layer.name} as active layer`}
    >
      <button
        className="layer-row-btn"
        onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id) }}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
      </button>

      <button
        className="layer-row-btn"
        onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id, !layer.locked) }}
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
      >
        {layer.locked ? <LockIcon /> : <UnlockIcon />}
      </button>

      <span className="layer-color-swatch" style={{ backgroundColor: layer.color }} />

      <span className="layer-row-id">{layer.id}</span>
      <span className="layer-row-name">{layer.name}</span>
    </div>
  )
}

export function LayerPanel() {
  const layers = useLayerStore((s) => s.layers)
  const activeLayerId = useLayerStore((s) => s.activeLayerId)
  const toggleLayerVisibility = useLayerStore((s) => s.toggleLayerVisibility)
  const setLayerLocked = useLayerStore((s) => s.setLayerLocked)
  const setActiveLayer = useLayerStore((s) => s.setActiveLayer)
  const setPreset = useLayerStore((s) => s.setPreset)

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPreset(e.target.value)
    },
    [setPreset],
  )

  return (
    <div className="layer-panel">
      <div className="property-panel-title">Layers</div>

      <div className="layer-preset-section">
        <label className="layer-preset-label" htmlFor="layer-preset-select">
          Preset
        </label>
        <select
          id="layer-preset-select"
          className="layer-preset-select"
          onChange={handlePresetChange}
          defaultValue=""
        >
          <option value="" disabled>
            Choose preset...
          </option>
          {LAYER_PRESETS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="layer-active-indicator">
        Active layer: <span className="layer-active-name">{activeLayerId}</span>
      </div>

      <div className="layer-list">
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            isActive={layer.id === activeLayerId}
            onToggleVisibility={toggleLayerVisibility}
            onToggleLock={setLayerLocked}
            onSetActive={setActiveLayer}
          />
        ))}
      </div>
    </div>
  )
}
