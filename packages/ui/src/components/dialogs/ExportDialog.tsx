import { useState } from 'react'
import type { KernelBackend } from '../../services/kernel-bridge'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  kernel: KernelBackend | null
}

export function ExportDialog({ open, onClose, kernel }: ExportDialogProps) {
  const [format, setFormat] = useState('step')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleExport = async () => {
    if (!kernel) return

    setLoading(true)
    setError(null)

    try {
      const data = await kernel.exportFile(format)
      const ext = format === 'step' ? 'step' : 'dxf'
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Export File</h3>

        <label>
          Format:
          <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={loading}>
            <option value="step">STEP (.step)</option>
            <option value="dxf">DXF (.dxf) - stub</option>
          </select>
        </label>

        {loading && <p className="dialog-loading">Exporting...</p>}
        {error && <p className="dialog-error">{error}</p>}

        <div className="dialog-actions">
          <button onClick={handleExport} disabled={loading}>Export</button>
          <button onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
