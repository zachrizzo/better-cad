import { useState, useRef } from 'react'
import type { KernelBackend, TessellatedMesh } from '../../services/kernel-bridge'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  kernel: KernelBackend | null
  onImport: (meshes: TessellatedMesh[]) => void
}

export function ImportDialog({ open, onClose, kernel, onImport }: ImportDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !kernel) return

    setLoading(true)
    setError(null)

    try {
      const buffer = await file.arrayBuffer()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const format = ext === 'stp' ? 'step' : ext
      const meshes = await kernel.importFile(new Uint8Array(buffer), format)
      onImport(meshes)
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
        <h3>Import File</h3>

        <p>Select a STEP (.step, .stp) or DXF (.dxf) file to import.</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".step,.stp,.dxf"
          onChange={handleFileSelect}
          disabled={loading}
        />

        {loading && <p className="dialog-loading">Importing...</p>}
        {error && <p className="dialog-error">{error}</p>}

        <div className="dialog-actions">
          <button onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
