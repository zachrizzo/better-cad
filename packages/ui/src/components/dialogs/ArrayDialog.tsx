import { useState } from 'react'

export interface ArrayParams {
  type: 'linear' | 'polar'
  count: number
  // Linear
  spacingX: number
  spacingY: number
  // Polar
  centerX: number
  centerY: number
  totalAngle: number // degrees
}

interface ArrayDialogProps {
  open: boolean
  onClose: () => void
  onApply: (params: ArrayParams) => void
  elementName: string
}

export function ArrayDialog({ open, onClose, onApply, elementName }: ArrayDialogProps) {
  const [arrayType, setArrayType] = useState<'linear' | 'polar'>('linear')
  const [count, setCount] = useState(4)
  const [spacingX, setSpacingX] = useState(3)
  const [spacingY, setSpacingY] = useState(0)
  const [centerX, setCenterX] = useState(0)
  const [centerY, setCenterY] = useState(0)
  const [totalAngle, setTotalAngle] = useState(360)

  if (!open) return null

  const handleApply = () => {
    if (count < 1) return
    onApply({
      type: arrayType,
      count,
      spacingX,
      spacingY,
      centerX,
      centerY,
      totalAngle,
    })
  }

  const previewText =
    arrayType === 'linear'
      ? `${count} copies spaced [${spacingX.toFixed(2)}m, ${spacingY.toFixed(2)}m] apart`
      : `${count} copies rotated around (${centerX.toFixed(1)}, ${centerY.toFixed(1)}) over ${totalAngle} degrees`

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ minWidth: 340 }}>
        <h3>Array: {elementName}</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className={`toolbar-btn${arrayType === 'linear' ? ' active' : ''}`}
            onClick={() => setArrayType('linear')}
            style={{ flex: 1 }}
          >
            Linear
          </button>
          <button
            className={`toolbar-btn${arrayType === 'polar' ? ' active' : ''}`}
            onClick={() => setArrayType('polar')}
            style={{ flex: 1 }}
          >
            Polar
          </button>
        </div>

        <label style={{ display: 'block', marginBottom: 8 }}>
          Count:
          <input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>

        {arrayType === 'linear' ? (
          <>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Spacing X (m):
              <input
                type="number"
                step={0.1}
                value={spacingX}
                onChange={(e) => setSpacingX(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Spacing Y (m):
              <input
                type="number"
                step={0.1}
                value={spacingY}
                onChange={(e) => setSpacingY(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
          </>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Center X (m):
              <input
                type="number"
                step={0.1}
                value={centerX}
                onChange={(e) => setCenterX(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Center Y (m):
              <input
                type="number"
                step={0.1}
                value={centerY}
                onChange={(e) => setCenterY(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Total Angle (degrees):
              <input
                type="number"
                step={1}
                value={totalAngle}
                onChange={(e) => setTotalAngle(parseFloat(e.target.value) || 360)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
          </>
        )}

        <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0' }}>
          Preview: {previewText}
        </p>

        <div className="dialog-actions">
          <button onClick={handleApply}>Apply</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
