import { useEffect, useMemo, useRef, useState } from 'react'
import type { BackendCapabilities, ImportFormat, KernelBackend, TessellatedMesh } from '../../services/kernel-bridge'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  kernel: KernelBackend | null
  onImport: (meshes: TessellatedMesh[]) => void
  onModelChanged?: () => Promise<void> | void
}

function extensionToImportFormat(ext: string): ImportFormat | null {
  if (ext === 'step' || ext === 'stp') return 'step'
  if (ext === 'dxf') return 'dxf'
  if (ext === 'ifc') return 'ifc'
  return null
}

function formatToExtensions(format: ImportFormat): string[] {
  if (format === 'step') return ['.step', '.stp']
  return [`.${format}`]
}

export function ImportDialog({ open, onClose, kernel, onImport, onModelChanged }: ImportDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !kernel) return
    let cancelled = false
    void (async () => {
      try {
        const caps = await kernel.getCapabilities()
        if (!cancelled) setCapabilities(caps)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, kernel])

  const supportedFormats = useMemo(() => {
    if (!capabilities) return [] as ImportFormat[]
    const ordered: ImportFormat[] = ['step', 'dxf', 'ifc']
    return ordered.filter((format) => capabilities.formats[format]?.import)
  }, [capabilities])

  const acceptAttr = useMemo(() => {
    const exts = supportedFormats.flatMap(formatToExtensions)
    return exts.join(',')
  }, [supportedFormats])

  if (!open) return null

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !kernel) return

    setLoading(true)
    setError(null)

    try {
      const buffer = await file.arrayBuffer()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const format = extensionToImportFormat(ext)
      if (!format) {
        throw new Error(`Unsupported file extension ".${ext}"`)
      }
      if (!supportedFormats.includes(format)) {
        throw new Error(`Import format "${format}" is not enabled for this backend`)
      }
      const result = await kernel.importModel(new Uint8Array(buffer), format)
      onImport(result.meshes)
      if (result.stateMutated && onModelChanged) {
        await onModelChanged()
      }
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

        <p>
          {supportedFormats.length > 0
            ? `Supported formats: ${supportedFormats.join(', ').toUpperCase()}`
            : 'No import formats available for this backend.'}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptAttr || undefined}
          onChange={handleFileSelect}
          disabled={loading || supportedFormats.length === 0}
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
