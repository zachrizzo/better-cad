import { useCallback } from 'react'
import { useViewStore } from '../../stores/view-store'
import { useUIStore } from '../../stores/ui-store'
import type { SavedView } from '../../stores/view-store'

function directionLabel(dir?: string): string {
  switch (dir) {
    case 'north': return 'North'
    case 'south': return 'South'
    case 'east': return 'East'
    case 'west': return 'West'
    default: return ''
  }
}

/**
 * ViewPanel is a sidebar section that lists saved section/elevation views
 * and provides controls for creating new ones and navigating between them.
 */
export function ViewPanel() {
  const views = useViewStore((s) => s.views)
  const activeViewId = useViewStore((s) => s.activeViewId)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const clearActiveView = useViewStore((s) => s.clearActiveView)
  const removeView = useViewStore((s) => s.removeView)
  const addView = useViewStore((s) => s.addView)
  const setActiveTool = useUIStore((s) => s.setActiveTool)

  const handleActivate = useCallback(
    (id: string) => {
      if (activeViewId === id) {
        clearActiveView()
      } else {
        setActiveView(id)
      }
    },
    [activeViewId, setActiveView, clearActiveView],
  )

  const handleNewSection = useCallback(() => {
    setActiveTool('section')
    clearActiveView()
  }, [setActiveTool, clearActiveView])

  const handleNewElevation = useCallback(
    (direction: 'north' | 'south' | 'east' | 'west') => {
      const viewCount = views.size
      // Camera positioned far away looking from the given cardinal direction
      let cameraPosition: [number, number, number]
      const cameraTarget: [number, number, number] = [0, 3, 0]
      const dist = 50

      switch (direction) {
        case 'north':
          cameraPosition = [0, 3, -dist]
          break
        case 'south':
          cameraPosition = [0, 3, dist]
          break
        case 'east':
          cameraPosition = [dist, 3, 0]
          break
        case 'west':
          cameraPosition = [-dist, 3, 0]
          break
      }

      const view: SavedView = {
        id: `elevation-${crypto.randomUUID()}`,
        name: `${direction.charAt(0).toUpperCase() + direction.slice(1)} Elevation ${viewCount + 1}`,
        type: 'elevation',
        direction,
        cameraPosition,
        cameraTarget,
      }

      addView(view)
      setActiveView(view.id)
    },
    [views.size, addView, setActiveView],
  )

  const handleBackTo3D = useCallback(() => {
    clearActiveView()
  }, [clearActiveView])

  const viewList = Array.from(views.values())

  return (
    <div className="view-panel">
      <div className="property-panel-title">Views</div>

      {activeViewId && (
        <button
          className="toolbar-btn view-back-btn"
          onClick={handleBackTo3D}
          style={{ marginBottom: 8, width: '100%' }}
        >
          Back to 3D
        </button>
      )}

      <div className="view-panel-actions">
        <button
          className="constraint-btn"
          onClick={handleNewSection}
          title="Place a section cut line on the plan"
        >
          + Section
        </button>
        <div className="view-panel-elevation-group">
          <span className="view-panel-elevation-label">Elevation:</span>
          <button className="constraint-btn" onClick={() => handleNewElevation('north')} title="North elevation">N</button>
          <button className="constraint-btn" onClick={() => handleNewElevation('south')} title="South elevation">S</button>
          <button className="constraint-btn" onClick={() => handleNewElevation('east')} title="East elevation">E</button>
          <button className="constraint-btn" onClick={() => handleNewElevation('west')} title="West elevation">W</button>
        </div>
      </div>

      {viewList.length === 0 && (
        <div className="view-panel-empty">No saved views yet.</div>
      )}

      <div className="view-panel-list">
        {viewList.map((v) => (
          <div
            key={v.id}
            className={`view-panel-item${activeViewId === v.id ? ' active' : ''}`}
            onClick={() => handleActivate(v.id)}
          >
            <span className="view-panel-item-icon">
              {v.type === 'section' ? '\u2702' : '\u25A1'}
            </span>
            <span className="view-panel-item-name">{v.name}</span>
            {v.type === 'elevation' && v.direction && (
              <span className="view-panel-item-tag">{directionLabel(v.direction)}</span>
            )}
            <button
              className="constraint-delete-btn"
              onClick={(e) => {
                e.stopPropagation()
                removeView(v.id)
              }}
              title="Delete view"
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
