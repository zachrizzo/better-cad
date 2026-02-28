import { useMemo } from 'react'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useKernel } from '../../hooks/useKernel'
import { MaterialPicker } from '../materials/MaterialPicker'
import { isBeamElement, isColumnElement, isDimensionElement, isDoorElement, isFloorElement, isRoofElement, isRoomElement, isStairElement, isTextAnnotationElement, isWallElement, isWindowElement, useEntityStore } from '../../stores/entity-store'
import { LENGTH_UNITS, metersToUnitValue, type LengthUnit, unitValueToMeters } from '../../utils/units'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import { LevelManager } from '../panels/LevelManager'

const MIN_VALUE = 0.01

export function PropertyPanel() {
  const selectedBodyId = useUIStore((s) => s.selectedBodyId)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const setLengthUnit = useSettingsStore((s) => s.setLengthUnit)

  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const defaultDoorWidth = useBimStore((s) => s.defaultDoorWidth)
  const defaultDoorHeight = useBimStore((s) => s.defaultDoorHeight)
  const defaultDoorSill = useBimStore((s) => s.defaultDoorSill)
  const defaultDoorSwing = useBimStore((s) => s.defaultDoorSwing)
  const defaultFloorThickness = useBimStore((s) => s.defaultFloorThickness)
  const defaultStairWidth = useBimStore((s) => s.defaultStairWidth)
  const defaultStairRisers = useBimStore((s) => s.defaultStairRisers)
  const defaultStairHeight = useBimStore((s) => s.defaultStairHeight)
  const defaultWindowWidth = useBimStore((s) => s.defaultWindowWidth)
  const defaultWindowHeight = useBimStore((s) => s.defaultWindowHeight)
  const defaultWindowSill = useBimStore((s) => s.defaultWindowSill)
  const defaultColumnWidth = useBimStore((s) => s.defaultColumnWidth)
  const defaultColumnDepth = useBimStore((s) => s.defaultColumnDepth)
  const defaultColumnHeight = useBimStore((s) => s.defaultColumnHeight)

  const setDefaultWallHeight = useBimStore((s) => s.setDefaultWallHeight)
  const setDefaultWallThickness = useBimStore((s) => s.setDefaultWallThickness)
  const setDefaultDoorWidth = useBimStore((s) => s.setDefaultDoorWidth)
  const setDefaultDoorHeight = useBimStore((s) => s.setDefaultDoorHeight)
  const setDefaultDoorSill = useBimStore((s) => s.setDefaultDoorSill)
  const setDefaultDoorSwing = useBimStore((s) => s.setDefaultDoorSwing)
  const setDefaultFloorThickness = useBimStore((s) => s.setDefaultFloorThickness)
  const setDefaultStairWidth = useBimStore((s) => s.setDefaultStairWidth)
  const setDefaultStairRisers = useBimStore((s) => s.setDefaultStairRisers)
  const setDefaultStairHeight = useBimStore((s) => s.setDefaultStairHeight)
  const setDefaultWindowWidth = useBimStore((s) => s.setDefaultWindowWidth)
  const setDefaultWindowHeight = useBimStore((s) => s.setDefaultWindowHeight)
  const setDefaultWindowSill = useBimStore((s) => s.setDefaultWindowSill)
  const setDefaultColumnWidth = useBimStore((s) => s.setDefaultColumnWidth)
  const setDefaultColumnDepth = useBimStore((s) => s.setDefaultColumnDepth)
  const setDefaultColumnHeight = useBimStore((s) => s.setDefaultColumnHeight)
  const defaultRoofThickness = useBimStore((s) => s.defaultRoofThickness)
  const defaultRoofElevation = useBimStore((s) => s.defaultRoofElevation)
  const setDefaultRoofThickness = useBimStore((s) => s.setDefaultRoofThickness)
  const setDefaultRoofElevation = useBimStore((s) => s.setDefaultRoofElevation)

  const elements = useEntityStore((s) => s.elements)
  const selectedElement = selectedBodyId ? elements.get(selectedBodyId) ?? null : null

  const { kernel, ready } = useKernel()

  const unitStep = useMemo(() => {
    if (lengthUnit === 'mm') return 1
    if (lengthUnit === 'cm') return 0.1
    if (lengthUnit === 'in') return 0.1
    if (lengthUnit === 'ft') return 0.01
    return 0.01
  }, [lengthUnit])

  const displayMin = useMemo(() => metersToUnitValue(MIN_VALUE, lengthUnit), [lengthUnit])

  const patchSelectedElement = async (next: typeof selectedElement) => {
    if (!next || !ready || !kernel) return
    await kernel.updateElement(next.meta.id, next)
    await syncEntitiesAndRegenerateMeshes(kernel)
  }

  const panelTitle = selectedElement
    ? `Element (${selectedElement.meta.name})`
    : 'Prototype Defaults'

  return (
    <div className="property-panel">
      <LevelManager />
      <div className="property-panel-title">{panelTitle}</div>

      <div className="property-row">
        <label className="property-label">Units</label>
        <select
          className="property-input"
          value={lengthUnit}
          onChange={(e) => setLengthUnit(e.target.value as LengthUnit)}
        >
          <option value="mm">Millimeters (mm)</option>
          <option value="cm">Centimeters (cm)</option>
          <option value="m">Meters (m)</option>
          <option value="in">Inches (in)</option>
          <option value="ft">Feet (ft)</option>
        </select>
      </div>

      <div className="property-panel-title" style={{ marginTop: 14 }}>
        Defaults ({LENGTH_UNITS[lengthUnit].symbol})
      </div>

      <div className="property-row">
        <label className="property-label">Wall H</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultWallHeight, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultWallHeight(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Wall T</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultWallThickness, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultWallThickness(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Door W</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultDoorWidth, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultDoorWidth(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Door H</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultDoorHeight, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultDoorHeight(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Door S</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultDoorSill, lengthUnit)}
          min={0}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v >= 0) setDefaultDoorSill(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Door Swing</label>
        <select
          className="property-input"
          value={defaultDoorSwing}
          onChange={(e) => setDefaultDoorSwing(e.target.value === 'left' ? 'left' : 'right')}
        >
          <option value="right">Right</option>
          <option value="left">Left</option>
        </select>
      </div>

      <div className="property-row">
        <label className="property-label">Win W</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultWindowWidth, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultWindowWidth(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Win H</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultWindowHeight, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultWindowHeight(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Win Sill</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultWindowSill, lengthUnit)}
          min={0}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v >= 0) setDefaultWindowSill(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Floor T</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultFloorThickness, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultFloorThickness(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Stair W</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultStairWidth, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultStairWidth(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Stair R</label>
        <input
          type="number"
          className="property-input"
          value={defaultStairRisers}
          min={2}
          max={64}
          step={1}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!Number.isNaN(v)) setDefaultStairRisers(v)
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Stair H</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultStairHeight, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultStairHeight(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Col W</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultColumnWidth, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultColumnWidth(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Col D</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultColumnDepth, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultColumnDepth(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Col H</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultColumnHeight, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultColumnHeight(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Roof T</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultRoofThickness, lengthUnit)}
          min={displayMin}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v > 0) setDefaultRoofThickness(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Roof E</label>
        <input
          type="number"
          className="property-input"
          value={metersToUnitValue(defaultRoofElevation, lengthUnit)}
          min={0}
          step={unitStep}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v) && v >= 0) setDefaultRoofElevation(unitValueToMeters(v, lengthUnit))
          }}
        />
      </div>

      {selectedElement && (
        <>
          <div className="property-panel-title" style={{ marginTop: 14 }}>
            Selected Element
          </div>
          <div className="property-panel-meta">
            ID: {selectedElement.meta.id}
            <br />
            Kind: {selectedElement.kind}
          </div>

          {isWallElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Height</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.height, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, height: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Thick</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.thickness, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, thickness: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}

          {isDoorElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Width</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.width, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, width: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Height</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.height, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, height: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Swing</label>
                <select
                  className="property-input"
                  value={selectedElement.swing ?? 'right'}
                  onChange={(e) => {
                    const next = { ...selectedElement, swing: e.target.value === 'left' ? 'left' : 'right' }
                    void patchSelectedElement(next)
                  }}
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </div>
            </>
          )}

          {isWindowElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Width</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.width, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, width: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Height</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.height, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, height: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Sill H</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.sill_height, lengthUnit)}
                  min={0}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v < 0) return
                    const next = { ...selectedElement, sill_height: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}

          {isFloorElement(selectedElement) && (
            <div className="property-row">
              <label className="property-label">Thick</label>
              <input
                type="number"
                className="property-input"
                value={metersToUnitValue(selectedElement.thickness, lengthUnit)}
                min={displayMin}
                step={unitStep}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (Number.isNaN(v) || v <= 0) return
                  const next = { ...selectedElement, thickness: unitValueToMeters(v, lengthUnit) }
                  void patchSelectedElement(next)
                }}
              />
            </div>
          )}

          {isStairElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Width</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.width, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, width: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Risers</label>
                <input
                  type="number"
                  className="property-input"
                  value={selectedElement.risers}
                  min={2}
                  max={64}
                  step={1}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (Number.isNaN(v)) return
                    const next = { ...selectedElement, risers: Math.max(2, Math.min(64, v)) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Height</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.total_height, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, total_height: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}

          {isColumnElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Width</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.width, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, width: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Depth</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.depth, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, depth: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Height</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.height, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, height: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}

          {isBeamElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Width</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.width, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, width: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Depth</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.depth, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, depth: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}

          {isRoofElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Thick</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.thickness, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, thickness: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Elev</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.elevation, lengthUnit)}
                  min={0}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v < 0) return
                    const next = { ...selectedElement, elevation: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}

          {isRoomElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Name</label>
                <input
                  type="text"
                  className="property-input"
                  value={selectedElement.name}
                  onChange={(e) => {
                    const next = { ...selectedElement, name: e.target.value, meta: { ...selectedElement.meta, name: e.target.value } }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Color</label>
                <input
                  type="color"
                  className="property-input"
                  value={selectedElement.color || '#8b5cf6'}
                  onChange={(e) => {
                    const next = { ...selectedElement, color: e.target.value }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Area</label>
                <span className="property-input" style={{ background: 'transparent', border: 'none' }}>
                  {(() => {
                    const pts = selectedElement.boundary
                    let sum = 0
                    for (let i = 0; i < pts.length; i++) {
                      const next = pts[(i + 1) % pts.length]
                      sum += pts[i][0] * next[1] - next[0] * pts[i][1]
                    }
                    return `${Math.abs(sum / 2).toFixed(2)} m\u00B2`
                  })()}
                </span>
              </div>
              <div className="property-row">
                <label className="property-label">Perimeter</label>
                <span className="property-input" style={{ background: 'transparent', border: 'none' }}>
                  {(() => {
                    const pts = selectedElement.boundary
                    let perim = 0
                    for (let i = 0; i < pts.length; i++) {
                      const next = pts[(i + 1) % pts.length]
                      perim += Math.hypot(next[0] - pts[i][0], next[1] - pts[i][1])
                    }
                    return `${perim.toFixed(2)} m`
                  })()}
                </span>
              </div>
            </>
          )}

          {isDimensionElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Offset</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.offset, lengthUnit)}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v)) return
                    const next = { ...selectedElement, offset: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Override</label>
                <input
                  type="text"
                  className="property-input"
                  value={selectedElement.text_override ?? ''}
                  placeholder="Auto"
                  onChange={(e) => {
                    const next = {
                      ...selectedElement,
                      text_override: e.target.value || undefined,
                    }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}

          {isTextAnnotationElement(selectedElement) && (
            <>
              <div className="property-row">
                <label className="property-label">Text</label>
                <input
                  type="text"
                  className="property-input"
                  value={selectedElement.text}
                  onChange={(e) => {
                    const next = { ...selectedElement, text: e.target.value }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Size</label>
                <input
                  type="number"
                  className="property-input"
                  value={metersToUnitValue(selectedElement.font_size, lengthUnit)}
                  min={displayMin}
                  step={unitStep}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v) || v <= 0) return
                    const next = { ...selectedElement, font_size: unitValueToMeters(v, lengthUnit) }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
              <div className="property-row">
                <label className="property-label">Rotation</label>
                <input
                  type="number"
                  className="property-input"
                  value={Math.round(selectedElement.rotation * 180 / Math.PI)}
                  step={5}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isNaN(v)) return
                    const next = { ...selectedElement, rotation: v * Math.PI / 180 }
                    void patchSelectedElement(next)
                  }}
                />
              </div>
            </>
          )}
        </>
      )}

      <MaterialPicker />
    </div>
  )
}
