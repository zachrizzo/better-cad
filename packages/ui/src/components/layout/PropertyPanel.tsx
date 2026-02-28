import { useCallback, useRef } from 'react'
import { useHistoryStore } from '../../stores/history-store'
import { useDocumentStore } from '../../stores/document-store'
import { useKernel } from '../../hooks/useKernel'

export function PropertyPanel() {
  const boxParams = useHistoryStore((s) => s.boxParams)
  const setHistoryParams = useHistoryStore((s) => s.setBoxParams)
  const setDocParams = useDocumentStore((s) => s.setBoxParams)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const { kernel, ready } = useKernel()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((field: 'width' | 'height' | 'depth', value: number) => {
    const newParams = { ...boxParams, [field]: value }
    // Update both stores: history-store tracks undo snapshots, document-store is the app state
    setHistoryParams(newParams)
    setDocParams(newParams)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!ready || !kernel) return
      try {
        const mesh = await kernel.createAndTessellateBox(newParams.width, newParams.height, newParams.depth)
        addCadMesh('box-0', mesh)
      } catch (e) {
        console.error('Recompute failed:', e)
      }
    }, 150)
  }, [boxParams, setHistoryParams, setDocParams, addCadMesh, kernel, ready])

  return (
    <div className="property-panel">
      <div className="property-panel-title">Box Properties</div>
      {(['width', 'height', 'depth'] as const).map((field) => (
        <div className="property-row" key={field}>
          <label className="property-label">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
          <input
            type="number"
            className="property-input"
            value={boxParams[field]}
            min={0.01}
            step={0.1}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v > 0) handleChange(field, v)
            }}
          />
        </div>
      ))}
    </div>
  )
}
