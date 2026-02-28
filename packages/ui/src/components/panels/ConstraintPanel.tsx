import { useState, useCallback } from 'react'
import { useSketchStore, type SketchConstraintType } from '../../stores/sketch-store'
import { constraintStatusColor } from '../../utils/sketch-solver'

// ---------------------------------------------------------------------------
// Constraint descriptions for the UI
// ---------------------------------------------------------------------------

interface ConstraintDef {
  type: SketchConstraintType
  label: string
  shortcut: string
  /** Minimum selection requirement */
  needsPoints: number
  needsLines: number
  needsValue: boolean
  needsValue2: boolean
  valueLabel?: string
  value2Label?: string
}

const CONSTRAINT_DEFS: ConstraintDef[] = [
  { type: 'Coincident', label: 'Coincident', shortcut: 'C', needsPoints: 2, needsLines: 0, needsValue: false, needsValue2: false },
  { type: 'Horizontal', label: 'Horizontal', shortcut: 'H', needsPoints: 0, needsLines: 1, needsValue: false, needsValue2: false },
  { type: 'Vertical', label: 'Vertical', shortcut: 'V', needsPoints: 0, needsLines: 1, needsValue: false, needsValue2: false },
  { type: 'Perpendicular', label: 'Perpendicular', shortcut: 'T', needsPoints: 0, needsLines: 2, needsValue: false, needsValue2: false },
  { type: 'Parallel', label: 'Parallel', shortcut: 'L', needsPoints: 0, needsLines: 2, needsValue: false, needsValue2: false },
  { type: 'Equal', label: 'Equal Length', shortcut: 'E', needsPoints: 0, needsLines: 2, needsValue: false, needsValue2: false },
  { type: 'Fixed', label: 'Fix Point', shortcut: 'X', needsPoints: 1, needsLines: 0, needsValue: true, needsValue2: true, valueLabel: 'X', value2Label: 'Y' },
  { type: 'Distance', label: 'Distance', shortcut: 'I', needsPoints: 2, needsLines: 0, needsValue: true, needsValue2: false, valueLabel: 'Dist' },
  { type: 'Angle', label: 'Angle', shortcut: 'A', needsPoints: 0, needsLines: 2, needsValue: true, needsValue2: false, valueLabel: 'Deg' },
]

// ---------------------------------------------------------------------------
// Helper: format constraint description
// ---------------------------------------------------------------------------

function describeConstraint(c: { type: SketchConstraintType; points: string[]; lines: string[]; value?: number; value2?: number }): string {
  switch (c.type) {
    case 'Coincident': return `Coincident(${c.points[0]?.slice(-4)}, ${c.points[1]?.slice(-4)})`
    case 'Horizontal': return `Horizontal(${c.lines[0]?.slice(-4)})`
    case 'Vertical': return `Vertical(${c.lines[0]?.slice(-4)})`
    case 'Distance': return `Distance(${c.points[0]?.slice(-4)}, ${c.points[1]?.slice(-4)}) = ${c.value?.toFixed(2)}`
    case 'Fixed': return `Fixed(${c.points[0]?.slice(-4)}) @ (${c.value?.toFixed(2)}, ${c.value2?.toFixed(2)})`
    case 'Perpendicular': return `Perp(${c.lines[0]?.slice(-4)}, ${c.lines[1]?.slice(-4)})`
    case 'Parallel': return `Para(${c.lines[0]?.slice(-4)}, ${c.lines[1]?.slice(-4)})`
    case 'Angle': return `Angle(${c.lines[0]?.slice(-4)}, ${c.lines[1]?.slice(-4)}) = ${((c.value ?? 0) * 180 / Math.PI).toFixed(1)} deg`
    case 'Equal': return `Equal(${c.lines[0]?.slice(-4)}, ${c.lines[1]?.slice(-4)})`
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConstraintPanel() {
  const active = useSketchStore((s) => s.active)
  const constraints = useSketchStore((s) => s.constraints)
  const selection = useSketchStore((s) => s.selection)
  const solverStatus = useSketchStore((s) => s.solverStatus)
  const lastSolverResult = useSketchStore((s) => s.lastSolverResult)
  const addConstraint = useSketchStore((s) => s.addConstraint)
  const removeConstraint = useSketchStore((s) => s.removeConstraint)
  const points = useSketchStore((s) => s.points)
  const lines = useSketchStore((s) => s.lines)

  const [valueInput, setValueInput] = useState('')
  const [value2Input, setValue2Input] = useState('')
  const [highlightedConstraint, setHighlightedConstraint] = useState<string | null>(null)

  const handleApplyConstraint = useCallback((def: ConstraintDef) => {
    // Check selection requirements
    if (def.needsPoints > 0 && selection.pointIds.length < def.needsPoints) {
      return
    }
    if (def.needsLines > 0 && selection.lineIds.length < def.needsLines) {
      return
    }

    // Parse values
    let value: number | undefined
    let value2: number | undefined
    if (def.needsValue) {
      const parsed = parseFloat(valueInput)
      if (Number.isNaN(parsed)) return
      value = def.type === 'Angle' ? (parsed * Math.PI / 180) : parsed
    }
    if (def.needsValue2) {
      const parsed = parseFloat(value2Input)
      if (Number.isNaN(parsed)) return
      value2 = parsed
    }

    // For Fixed, default to current point position if no value entered
    if (def.type === 'Fixed' && value === undefined) {
      const pt = points.get(selection.pointIds[0])
      if (pt) {
        value = pt.x
        value2 = pt.y
      }
    }

    const id = `c-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`

    addConstraint({
      id,
      type: def.type,
      points: selection.pointIds.slice(0, def.needsPoints),
      lines: selection.lineIds.slice(0, def.needsLines),
      value,
      value2,
    })

    setValueInput('')
    setValue2Input('')
  }, [selection, valueInput, value2Input, addConstraint, points])

  if (!active) return null

  const canApply = (def: ConstraintDef): boolean => {
    if (def.needsPoints > 0 && selection.pointIds.length < def.needsPoints) return false
    if (def.needsLines > 0 && selection.lineIds.length < def.needsLines) return false
    return true
  }

  const statusColor = constraintStatusColor(solverStatus)
  const dof = lastSolverResult?.dof ?? 0

  return (
    <div className="constraint-panel">
      <div className="constraint-panel-title">Sketch Constraints</div>

      {/* Solver status */}
      <div className="constraint-status" style={{ color: statusColor }}>
        <span className="constraint-status-dot" style={{ background: statusColor }} />
        {solverStatus === 'fully-constrained' ? 'Fully Constrained' :
          solverStatus === 'over-constrained' ? 'Over-Constrained' :
          `Under-Constrained (DOF: ${dof})`}
        {lastSolverResult && !lastSolverResult.converged && (
          <span style={{ color: '#ff6b6b', marginLeft: 4 }}> [not converged]</span>
        )}
      </div>

      {/* Selection info */}
      <div className="constraint-selection-info">
        {selection.pointIds.length > 0 && (
          <span>Points: {selection.pointIds.length}</span>
        )}
        {selection.lineIds.length > 0 && (
          <span>Lines: {selection.lineIds.length}</span>
        )}
        {selection.pointIds.length === 0 && selection.lineIds.length === 0 && (
          <span style={{ opacity: 0.5 }}>Select entities to constrain</span>
        )}
      </div>

      {/* Value inputs for dimensional constraints */}
      <div className="constraint-value-row">
        <input
          type="number"
          className="property-input"
          placeholder="Value"
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          className="property-input"
          placeholder="Y"
          value={value2Input}
          onChange={(e) => setValue2Input(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ flex: 1 }}
        />
      </div>

      {/* Constraint buttons */}
      <div className="constraint-buttons">
        {CONSTRAINT_DEFS.map((def) => (
          <button
            key={def.type}
            className={`constraint-btn ${canApply(def) ? '' : 'constraint-btn-disabled'}`}
            disabled={!canApply(def)}
            onClick={() => handleApplyConstraint(def)}
            title={`${def.label} (${def.shortcut})${def.needsPoints > 0 ? ` - needs ${def.needsPoints} point(s)` : ''}${def.needsLines > 0 ? ` - needs ${def.needsLines} line(s)` : ''}`}
          >
            {def.label}
          </button>
        ))}
      </div>

      {/* Constraint list */}
      <div className="constraint-panel-title" style={{ marginTop: 12 }}>
        Active ({constraints.size})
      </div>
      <div className="constraint-list">
        {Array.from(constraints.values()).map((c) => (
          <div
            key={c.id}
            className={`constraint-list-item ${highlightedConstraint === c.id ? 'highlighted' : ''}`}
            onClick={() => setHighlightedConstraint(highlightedConstraint === c.id ? null : c.id)}
          >
            <span className="constraint-list-text">{describeConstraint(c)}</span>
            <button
              className="constraint-delete-btn"
              onClick={(e) => {
                e.stopPropagation()
                removeConstraint(c.id)
                if (highlightedConstraint === c.id) setHighlightedConstraint(null)
              }}
              title="Remove constraint"
            >
              X
            </button>
          </div>
        ))}
        {constraints.size === 0 && (
          <div style={{ fontSize: 11, opacity: 0.4, padding: '4px 0' }}>
            No constraints yet
          </div>
        )}
      </div>
    </div>
  )
}
