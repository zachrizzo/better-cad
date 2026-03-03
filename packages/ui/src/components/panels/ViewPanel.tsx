import { useCallback, useMemo, useState } from 'react'
import { useViewStore } from '../../stores/view-store'
import { useUIStore } from '../../stores/ui-store'
import { useSettingsStore } from '../../stores/settings-store'
import type { SavedView } from '../../stores/view-store'

type ElevationDirection = 'north' | 'south' | 'east' | 'west'

const ELEVATION_DIRECTIONS: ElevationDirection[] = ['north', 'south', 'east', 'west']

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
  const planSymbolProfile = useUIStore((s) => s.planSymbolProfile)
  const annotationDensity = useUIStore((s) => s.annotationDensity)
  const showFurnitureLabels = useUIStore((s) => s.showFurnitureLabels)
  const showMepText = useUIStore((s) => s.showMepText)
  const setPlanSymbolProfile = useUIStore((s) => s.setPlanSymbolProfile)
  const setAnnotationDensity = useUIStore((s) => s.setAnnotationDensity)
  const setShowFurnitureLabels = useUIStore((s) => s.setShowFurnitureLabels)
  const setShowMepText = useUIStore((s) => s.setShowMepText)
  const wallsVisible = useSettingsStore((s) => s.wallsVisible)
  const toggleWallsVisible = useSettingsStore((s) => s.toggleWallsVisible)
  const [elevationDirection, setElevationDirection] = useState<ElevationDirection>('north')

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
    (direction: ElevationDirection) => {
      const existingViews = Array.from(useViewStore.getState().views.values())
      const elevationCount = existingViews.filter((view) => view.type === 'elevation').length
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
        name: `${directionLabel(direction)} Elevation ${elevationCount + 1}`,
        type: 'elevation',
        direction,
        cameraPosition,
        cameraTarget,
      }

      addView(view)
      setActiveView(view.id)
    },
    [addView, setActiveView],
  )

  const handleBackTo3D = useCallback(() => {
    clearActiveView()
  }, [clearActiveView])

  const viewList = useMemo(
    () => Array.from(views.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [views],
  )
  const sectionCount = useMemo(
    () => viewList.filter((view) => view.type === 'section').length,
    [viewList],
  )
  const elevationCount = useMemo(
    () => viewList.filter((view) => view.type === 'elevation').length,
    [viewList],
  )

  return (
    <div className="view-panel">
      <div className="property-panel-title">Views</div>
      <div className="view-panel-meta">
        {sectionCount} section{sectionCount === 1 ? '' : 's'} • {elevationCount} elevation{elevationCount === 1 ? '' : 's'}
      </div>
      <div className="view-panel-help">
        Save camera views for section cuts and fixed elevations.
      </div>

      <div className="property-panel-title" style={{ marginTop: 10 }}>Plan Symbols</div>
      <div className="property-row">
        <label className="property-label">Profile</label>
        <select
          className="property-input"
          value={planSymbolProfile}
          onChange={(e) => setPlanSymbolProfile(e.target.value as 'open_us_v1')}
        >
          <option value="open_us_v1">Open US v1</option>
        </select>
      </div>
      <div className="property-row">
        <label className="property-label">Density</label>
        <select
          className="property-input"
          value={annotationDensity}
          onChange={(e) => setAnnotationDensity(e.target.value as 'minimal' | 'medium' | 'verbose')}
        >
          <option value="minimal">Minimal</option>
          <option value="medium">Medium</option>
          <option value="verbose">Verbose</option>
        </select>
      </div>
      <div className="property-row">
        <label className="property-label">Furniture Labels</label>
        <input
          type="checkbox"
          checked={showFurnitureLabels}
          onChange={(e) => setShowFurnitureLabels(e.target.checked)}
        />
      </div>
      <div className="property-row">
        <label className="property-label">MEP Text</label>
        <input
          type="checkbox"
          checked={showMepText}
          onChange={(e) => setShowMepText(e.target.checked)}
        />
      </div>

      {activeViewId && (
        <button
          className="toolbar-btn view-panel-back-btn"
          onClick={handleBackTo3D}
          title="Return to the default 3D perspective"
        >
          Back to 3D
        </button>
      )}

      <div className="view-panel-actions">
        <button
          className={`toolbar-btn view-panel-action-btn${!wallsVisible ? ' active' : ''}`}
          onClick={toggleWallsVisible}
          title={wallsVisible ? 'Hide structural walls in 3D to inspect interiors' : 'Show structural walls in 3D'}
        >
          {wallsVisible ? 'Hide Walls (Interior View)' : 'Show Walls'}
        </button>
        <button
          className="toolbar-btn view-panel-action-btn"
          onClick={handleNewSection}
          title="Place a section cut line on the plan"
        >
          New Section Cut
        </button>
        <div className="view-panel-elevation-builder">
          <label className="view-panel-elevation-label" htmlFor="view-panel-direction-select">New Elevation</label>
          <div className="view-panel-elevation-controls">
            <select
              id="view-panel-direction-select"
              className="view-panel-select"
              value={elevationDirection}
              onChange={(e) => setElevationDirection(e.target.value as ElevationDirection)}
            >
              {ELEVATION_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {directionLabel(direction)}
                </option>
              ))}
            </select>
            <button
              className="toolbar-btn view-panel-action-btn"
              onClick={() => handleNewElevation(elevationDirection)}
              title={`Create and activate a ${directionLabel(elevationDirection).toLowerCase()} elevation`}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {viewList.length === 0 && (
        <div className="view-panel-empty">
          No saved views yet. Create a section cut or an elevation to pin a reusable camera.
        </div>
      )}

      <div className="view-panel-list">
        {viewList.map((v) => (
          <div key={v.id} className={`view-panel-item${activeViewId === v.id ? ' active' : ''}`}>
            <button
              className="view-panel-item-main"
              onClick={() => handleActivate(v.id)}
              title={activeViewId === v.id ? 'Deactivate this view' : 'Activate this view'}
            >
              <span className="view-panel-item-icon">
                {v.type === 'section' ? '\u2702' : '\u25A1'}
              </span>
              <span className="view-panel-item-name">{v.name}</span>
              {v.type === 'elevation' && v.direction && (
                <span className="view-panel-item-tag">{directionLabel(v.direction)}</span>
              )}
            </button>
            <button
              className="toolbar-btn view-panel-delete-btn"
              onClick={() => {
                removeView(v.id)
              }}
              title={`Delete ${v.name}`}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
