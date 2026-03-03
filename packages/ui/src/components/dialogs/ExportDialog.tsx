import { useEffect, useMemo, useState } from 'react'
import type { BackendCapabilities, ExportFormat, KernelBackend } from '../../services/kernel-bridge'
import { downloadArrayBufferAsFile, downloadBlobAsFile } from '../../utils/file-download'
import { exportToPdf, exportConstructionDocuments, SCALE_LABELS, SHEET_LABELS, type PdfExportOptions, type LegacyPdfExportOptions, type SheetType } from '../../services/pdf-export'
import type { ProjectInfo } from '../../services/title-block'
import type { PaperSizeKey } from '../../services/title-block'
import { useUIStore } from '../../stores/ui-store'

type DialogFormat = ExportFormat | 'pdf'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  kernel: KernelBackend | null
}

const PAPER_SIZE_OPTIONS: { value: PaperSizeKey; label: string }[] = [
  { value: 'ARCH-D', label: 'ARCH-D (36" x 24")' },
  { value: 'A1', label: 'A1 (841 x 594 mm)' },
  { value: 'TABLOID', label: 'Tabloid (17" x 11")' },
  { value: 'LETTER', label: 'Letter (11" x 8.5")' },
]

const SHEET_TYPE_OPTIONS: { value: SheetType; label: string }[] = [
  { value: 'floor_plan', label: 'Floor Plan' },
  { value: 'electrical_plan', label: 'Electrical Plan' },
  { value: 'plumbing_plan', label: 'Plumbing Plan' },
  { value: 'reflected_ceiling', label: 'Reflected Ceiling Plan' },
  { value: 'site_plan', label: 'Site Plan' },
  { value: 'elevations', label: 'Elevations' },
  { value: 'schedules', label: 'Schedules' },
]

export function ExportDialog({ open, onClose, kernel }: ExportDialogProps) {
  const planSymbolProfile = useUIStore((s) => s.planSymbolProfile)
  const annotationDensity = useUIStore((s) => s.annotationDensity)
  const showFurnitureLabels = useUIStore((s) => s.showFurnitureLabels)
  const showMepText = useUIStore((s) => s.showMepText)

  const [format, setFormat] = useState<DialogFormat>('step')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null)

  // Construction Document options
  const [paperSize, setPaperSize] = useState<PaperSizeKey>('LETTER')
  const [pdfScale, setPdfScale] = useState('1:100')
  const [units, setUnits] = useState<'imperial' | 'metric'>('metric')
  const [selectedSheets, setSelectedSheets] = useState<SheetType[]>(['floor_plan', 'schedules'])

  // Project info
  const [projectName, setProjectName] = useState('BetterCAD Project')
  const [projectAddress, setProjectAddress] = useState('')
  const [architectName, setArchitectName] = useState('')

  // Advanced mode toggle (show full CD options vs legacy simple mode)
  const [advancedPdf, setAdvancedPdf] = useState(false)

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
    if (!capabilities) return ['pdf'] as DialogFormat[]
    const ordered: ExportFormat[] = ['step', 'ifc', 'gltf', 'dxf']
    const kernelFormats = ordered.filter((candidate) => capabilities.formats[candidate]?.export)
    return [...kernelFormats, 'pdf'] as DialogFormat[]
  }, [capabilities])

  useEffect(() => {
    if (supportedFormats.length === 0) return
    if (!supportedFormats.includes(format)) {
      setFormat(supportedFormats[0])
    }
  }, [format, supportedFormats])

  if (!open) return null

  const isPdf = format === 'pdf'

  const toggleSheet = (sheet: SheetType) => {
    setSelectedSheets((prev) =>
      prev.includes(sheet)
        ? prev.filter((s) => s !== sheet)
        : [...prev, sheet],
    )
  }

  const handleExport = async () => {
    if (!kernel) return

    setLoading(true)
    setError(null)

    try {
      if (isPdf) {
        if (advancedPdf) {
          // Full construction document export
          const projectInfo: ProjectInfo = {
            projectName,
            projectAddress,
            clientName: '',
            architectName,
            architectLicense: '',
            date: new Date().toLocaleDateString(),
            projectNumber: '',
          }
          const options: PdfExportOptions = {
            scale: pdfScale,
            paperSize,
            sheets: selectedSheets,
            projectInfo,
            units,
            includeSchedules: selectedSheets.includes('schedules'),
            planSymbolProfile,
            annotationDensity,
            showFurnitureLabels,
            showMepText,
          }
          await exportConstructionDocuments(kernel, options)
          onClose()
        } else {
          // Legacy simple export
          const options: LegacyPdfExportOptions = {
            projectName,
            includePlan: selectedSheets.includes('floor_plan'),
            includeSections: false,
            includeElevations: selectedSheets.includes('elevations'),
            includeSchedules: selectedSheets.includes('schedules'),
            scale: pdfScale,
          }
          const blob = await exportToPdf(kernel, options)
          downloadBlobAsFile(blob, 'export.pdf')
          onClose()
        }
      } else {
        const kernelFormat = format as ExportFormat
        if (!supportedFormats.includes(kernelFormat)) {
          throw new Error(`Export format "${kernelFormat}" is not enabled for this backend`)
        }
        const data = await kernel.exportModel(kernelFormat)
        const extMap: Record<string, string> = { step: 'step', dxf: 'dxf', ifc: 'ifc', gltf: 'glb' }
        const ext = extMap[kernelFormat] ?? kernelFormat
        downloadArrayBufferAsFile(data, `export.${ext}`)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const formatLabel = (f: DialogFormat) => {
    if (f === 'pdf') return 'PDF Drawing Set (.pdf)'
    if (f === 'gltf') return 'glTF Binary (.glb)'
    return `${f.toUpperCase()} (.${f})`
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
  }

  const fieldGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    marginTop: 6,
    padding: '6px 8px',
    border: '1px solid var(--border-color, #ccc)',
    borderRadius: 4,
    fontSize: 12,
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '2px 4px',
    fontSize: 12,
    borderRadius: 3,
    border: '1px solid var(--border-color, #ccc)',
    background: 'var(--input-bg, #fff)',
    color: 'var(--text-color, #000)',
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h3>Export File</h3>

        <label>
          Format:
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as DialogFormat)}
            disabled={loading || supportedFormats.length === 0}
          >
            {supportedFormats.map((candidate) => (
              <option key={candidate} value={candidate}>
                {formatLabel(candidate)}
              </option>
            ))}
          </select>
        </label>

        {isPdf && (
          <div style={sectionStyle}>
            {/* Toggle between simple and advanced mode */}
            <label style={labelStyle}>
              <input
                type="checkbox"
                checked={advancedPdf}
                onChange={(e) => setAdvancedPdf(e.target.checked)}
              />
              Construction Document Mode
            </label>

            {/* Paper size (advanced mode) */}
            {advancedPdf && (
              <label style={{ marginTop: 4 }}>
                Paper Size:
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as PaperSizeKey)}
                  style={{ marginLeft: 6 }}
                >
                  {PAPER_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Scale */}
            <label style={{ marginTop: 4 }}>
              Scale:
              <select
                value={pdfScale}
                onChange={(e) => setPdfScale(e.target.value)}
                style={{ marginLeft: 6 }}
              >
                {SCALE_LABELS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            {/* Units toggle (advanced mode) */}
            {advancedPdf && (
              <label style={{ marginTop: 4 }}>
                Units:
                <select
                  value={units}
                  onChange={(e) => setUnits(e.target.value as 'imperial' | 'metric')}
                  style={{ marginLeft: 6 }}
                >
                  <option value="imperial">Imperial</option>
                  <option value="metric">Metric</option>
                </select>
              </label>
            )}

            {/* Sheets to include */}
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>Sheets:</div>
            {(advancedPdf ? SHEET_TYPE_OPTIONS : SHEET_TYPE_OPTIONS.filter(s => ['floor_plan', 'elevations', 'schedules'].includes(s.value))).map((opt) => (
              <label key={opt.value} style={labelStyle}>
                <input
                  type="checkbox"
                  checked={selectedSheets.includes(opt.value)}
                  onChange={() => toggleSheet(opt.value)}
                />
                {opt.label}
              </label>
            ))}

            {/* Project info fields (advanced mode) */}
            {advancedPdf && (
              <div style={fieldGroupStyle}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Project Information</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ minWidth: 60 }}>Name:</span>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ minWidth: 60 }}>Address:</span>
                  <input
                    type="text"
                    value={projectAddress}
                    onChange={(e) => setProjectAddress(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ minWidth: 60 }}>Architect:</span>
                  <input
                    type="text"
                    value={architectName}
                    onChange={(e) => setArchitectName(e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            )}
          </div>
        )}

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
