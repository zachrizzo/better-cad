import { useCallback } from 'react'
import { useLayerStore, LAYER_PRESETS } from '../../stores/layer-store'
import type { LayerInfo } from '../../stores/layer-store'
import { useUIStore } from '../../stores/ui-store'

function LayerRow({ layer, isActive, onToggleVisibility, onToggleLock, onSetActive }: {
  layer: LayerInfo
  isActive: boolean
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string, locked: boolean) => void
  onSetActive: (id: string) => void
}) {
  const theme = useUIStore((s) => s.theme)
  const isDark = theme === 'dark'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        borderRadius: 4,
        background: isActive
          ? (isDark ? 'rgba(100,149,237,0.25)' : 'rgba(100,149,237,0.15)')
          : 'transparent',
        cursor: 'pointer',
        fontSize: 12,
        opacity: layer.visible ? 1 : 0.45,
      }}
      onClick={() => onSetActive(layer.id)}
      title={`Set ${layer.name} as active layer`}
    >
      {/* Visibility toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id) }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          fontSize: 14,
          lineHeight: 1,
          color: isDark ? '#ccc' : '#555',
        }}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible ? '\u{1F441}' : '\u2014'}
      </button>

      {/* Lock toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id, !layer.locked) }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          fontSize: 12,
          lineHeight: 1,
          color: isDark ? '#ccc' : '#555',
        }}
        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
      >
        {layer.locked ? '\u{1F512}' : '\u{1F513}'}
      </button>

      {/* Color indicator */}
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: 2,
          backgroundColor: layer.color,
          border: `1px solid ${isDark ? '#666' : '#ccc'}`,
          flexShrink: 0,
        }}
      />

      {/* Layer name */}
      <span style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: isDark ? '#ddd' : '#222',
      }}>
        {layer.id}
      </span>
      <span style={{
        fontSize: 10,
        color: isDark ? '#999' : '#888',
        flexShrink: 0,
      }}>
        {layer.name}
      </span>
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
  const theme = useUIStore((s) => s.theme)
  const isDark = theme === 'dark'

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPreset(e.target.value)
    },
    [setPreset],
  )

  return (
    <div style={{ padding: 8, fontSize: 12 }}>
      <div className="property-panel-title">Layers</div>

      {/* Preset dropdown */}
      <div style={{ marginBottom: 8 }}>
        <label
          htmlFor="layer-preset-select"
          style={{ display: 'block', fontSize: 11, marginBottom: 3, color: isDark ? '#aaa' : '#666' }}
        >
          Preset
        </label>
        <select
          id="layer-preset-select"
          onChange={handlePresetChange}
          defaultValue=""
          style={{
            width: '100%',
            padding: '4px 6px',
            fontSize: 12,
            borderRadius: 4,
            border: `1px solid ${isDark ? '#555' : '#ccc'}`,
            background: isDark ? '#2a2a2a' : '#fff',
            color: isDark ? '#ddd' : '#222',
          }}
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

      {/* Active layer indicator */}
      <div style={{
        marginBottom: 6,
        fontSize: 11,
        color: isDark ? '#aaa' : '#666',
      }}>
        Active: <strong style={{ color: isDark ? '#7ec8e3' : '#1e6fa0' }}>{activeLayerId}</strong>
      </div>

      {/* Layer list */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxHeight: 400,
        overflowY: 'auto',
      }}>
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
