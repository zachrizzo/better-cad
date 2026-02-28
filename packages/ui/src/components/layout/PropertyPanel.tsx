import { useMemo } from 'react'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useKernel } from '../../hooks/useKernel'
import { MaterialPicker } from '../materials/MaterialPicker'
import { isDoorElement, isFloorElement, isStairElement, isWallElement, useEntityStore } from '../../stores/entity-store'
import { LENGTH_UNITS, metersToUnitValue, type LengthUnit, unitValueToMeters } from '../../utils/units'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'

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
        </>
      )}

      <MaterialPicker />
    </div>
  )
}
