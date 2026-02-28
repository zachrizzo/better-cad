import { useSketchStore, type SketchDrawMode } from '../../stores/sketch-store'
import { constraintStatusColor } from '../../utils/sketch-solver'

const DRAW_MODES: { mode: SketchDrawMode; label: string; title: string }[] = [
  { mode: 'none', label: 'Select', title: 'Select entities (click points/lines)' },
  { mode: 'line', label: 'Line', title: 'Draw lines (chain mode, right-click to end)' },
  { mode: 'rectangle', label: 'Rect', title: 'Draw rectangles (click two corners)' },
  { mode: 'circle', label: 'Circle', title: 'Draw circles (click center, then radius)' },
]

export function SketchToolbar() {
  const drawMode = useSketchStore((s) => s.drawMode)
  const setDrawMode = useSketchStore((s) => s.setDrawMode)
  const solverStatus = useSketchStore((s) => s.solverStatus)
  const clearSketch = useSketchStore((s) => s.clearSketch)
  const runSolver = useSketchStore((s) => s.runSolver)

  const statusColor = constraintStatusColor(solverStatus)

  return (
    <div className="sketch-toolbar">
      <span className="sketch-toolbar-label">Sketch:</span>

      {DRAW_MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          className={`toolbar-btn ${drawMode === mode ? 'active' : ''}`}
          onClick={() => setDrawMode(mode)}
          title={title}
        >
          {label}
        </button>
      ))}

      <div className="toolbar-separator" />

      <button
        className="toolbar-btn"
        onClick={runSolver}
        title="Re-run constraint solver"
      >
        Solve
      </button>
      <button
        className="toolbar-btn"
        onClick={clearSketch}
        title="Clear all sketch entities and constraints"
      >
        Clear
      </button>

      <div className="toolbar-separator" />

      <span className="sketch-toolbar-status" style={{ color: statusColor }}>
        {solverStatus === 'fully-constrained' ? 'Fully Constrained' :
          solverStatus === 'over-constrained' ? 'Over-Constrained' :
          'Under-Constrained'}
      </span>
    </div>
  )
}
