import { useState, useCallback, useMemo } from 'react'
import { useLevelStore, type Level, type LevelVisibility } from '../../stores/level-store'
import { useEntityStore } from '../../stores/entity-store'
import { useKernel } from '../../hooks/useKernel'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import { syncEntitiesAndRegenerateMeshes } from '../../services/entity-regeneration'
import type { DoorElement, PrototypeElement, WindowElement } from '../../services/kernel-bridge'

const VIS_LABEL: Record<LevelVisibility, string> = {
  visible: 'V',
  ghosted: 'G',
  hidden: 'H',
}

const VIS_TITLE: Record<LevelVisibility, string> = {
  visible: 'Visible',
  ghosted: 'Ghosted (semi-transparent)',
  hidden: 'Hidden',
}

export function LevelManager() {
  const levels = useLevelStore((s) => s.levels)
  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const setActiveLevel = useLevelStore((s) => s.setActiveLevel)
  const addLevel = useLevelStore((s) => s.addLevel)
  const removeLevel = useLevelStore((s) => s.removeLevel)
  const renameLevel = useLevelStore((s) => s.renameLevel)
  const setLevelElevation = useLevelStore((s) => s.setLevelElevation)
  const toggleLevelVisibility = useLevelStore((s) => s.toggleLevelVisibility)

  const entityElements = useEntityStore((s) => s.elements)
  const { kernel, ready } = useKernel()
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)

  const [collapsed, setCollapsed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editElevation, setEditElevation] = useState('')
  const [copySourceId, setCopySourceId] = useState<string | null>(null)

  const elementCountsByLevel = useMemo(() => {
    const counts = new Map<string, number>()
    for (const el of entityElements.values()) {
      if (el.kind === 'level') continue
      const lid = el.meta.level_id ?? ''
      counts.set(lid, (counts.get(lid) ?? 0) + 1)
    }
    return counts
  }, [entityElements])

  const handleAdd = useCallback(() => {
    const maxElevation = levels.reduce((max, l) => Math.max(max, l.elevation), 0)
    const newElevation = maxElevation + 3.0
    const idx = levels.length + 1
    addLevel(`Level ${idx}`, newElevation)
  }, [addLevel, levels])

  const handleStartEdit = useCallback((level: Level) => {
    setEditingId(level.id)
    setEditName(level.name)
    setEditElevation(String(level.elevation))
  }, [])

  const handleFinishEdit = useCallback(() => {
    if (!editingId) return
    renameLevel(editingId, editName)
    const elev = parseFloat(editElevation)
    if (!Number.isNaN(elev)) {
      setLevelElevation(editingId, elev)
    }
    setEditingId(null)
  }, [editElevation, editName, editingId, renameLevel, setLevelElevation])

  const handleCopyToLevel = useCallback(async (targetLevelId: string) => {
    if (!copySourceId || !ready || !kernel) return
    const sourceLevel = levels.find((l) => l.id === copySourceId)
    const targetLevel = levels.find((l) => l.id === targetLevelId)
    if (!sourceLevel || !targetLevel) return

    const elevationOffset = targetLevel.elevation - sourceLevel.elevation

    const elementsOnSource: PrototypeElement[] = []
    for (const el of entityElements.values()) {
      if (el.kind === 'level') continue
      if (el.meta.level_id === copySourceId) {
        elementsOnSource.push(el)
      }
    }

    if (elementsOnSource.length === 0) {
      setCopySourceId(null)
      return
    }

    const cloneIdBySourceId = new Map<string, string>()
    for (const el of elementsOnSource) {
      cloneIdBySourceId.set(el.meta.id, `${el.kind}-${crypto.randomUUID()}`)
    }

    const clonePriority = (kind: string): number => {
      if (kind === 'wall') return 0
      if (kind === 'door' || kind === 'window') return 2
      return 1
    }
    const sorted = [...elementsOnSource].sort((a, b) => clonePriority(a.kind) - clonePriority(b.kind))

    for (const el of sorted) {
      const cloneId = cloneIdBySourceId.get(el.meta.id) ?? `${el.kind}-${crypto.randomUUID()}`
      const clonedMeta = {
        ...el.meta,
        id: cloneId,
        name: `${el.meta.name} (copy)`,
        level_id: targetLevelId,
        host_id: el.meta.host_id ? (cloneIdBySourceId.get(el.meta.host_id) ?? el.meta.host_id) : el.meta.host_id,
        parent_id: el.meta.parent_id ? (cloneIdBySourceId.get(el.meta.parent_id) ?? el.meta.parent_id) : el.meta.parent_id,
      }

      let clonedElement: PrototypeElement
      if (el.kind === 'door') {
        const door = el as DoorElement
        const mappedWallId = cloneIdBySourceId.get(door.wall_id)
        if (!mappedWallId) {
          console.warn('[BetterCAD] Skipping door clone without cloned host wall:', door.meta.id)
          continue
        }
        clonedElement = {
          ...door,
          meta: { ...clonedMeta, host_id: mappedWallId },
          wall_id: mappedWallId,
        }
      } else if (el.kind === 'window') {
        const windowEl = el as WindowElement
        const mappedWallId = cloneIdBySourceId.get(windowEl.wall_id)
        if (!mappedWallId) {
          console.warn('[BetterCAD] Skipping window clone without cloned host wall:', windowEl.meta.id)
          continue
        }
        clonedElement = {
          ...windowEl,
          meta: { ...clonedMeta, host_id: mappedWallId },
          wall_id: mappedWallId,
        }
      } else {
        clonedElement = { ...el, meta: clonedMeta } as PrototypeElement
      }

      try {
        await kernel.createElement(clonedElement)
      } catch (err) {
        console.error('[BetterCAD] Failed to clone element:', err)
      }
    }

    await syncEntitiesAndRegenerateMeshes(kernel)
    setCopySourceId(null)
  }, [copySourceId, entityElements, kernel, levels, ready])

  const activeLevel = levels.find((l) => l.id === activeLevelId)

  return (
    <div className="level-manager">
      <div
        className="level-manager-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="level-manager-toggle">{collapsed ? '+' : '-'}</span>
        <span className="level-manager-title">Levels</span>
        <span className="level-manager-active-hint">
          {activeLevel ? `${activeLevel.name} (${formatLength(activeLevel.elevation, lengthUnit)})` : ''}
        </span>
      </div>

      {!collapsed && (
        <div className="level-manager-body">
          {levels.map((level) => {
            const isActive = level.id === activeLevelId
            const count = elementCountsByLevel.get(level.id) ?? 0
            const isEditing = editingId === level.id

            return (
              <div
                key={level.id}
                className={`level-row${isActive ? ' level-row-active' : ''}`}
                onClick={() => setActiveLevel(level.id)}
              >
                {isEditing ? (
                  <div className="level-edit-row" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="property-input level-edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFinishEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                    />
                    <input
                      className="property-input level-edit-elev"
                      type="number"
                      value={editElevation}
                      step={0.1}
                      onChange={(e) => setEditElevation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleFinishEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button
                      className="level-btn level-btn-ok"
                      onClick={handleFinishEdit}
                      title="Confirm"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="level-indicator">{isActive ? '>' : ' '}</span>
                    <span className="level-name">{level.name}</span>
                    <span className="level-elevation">{formatLength(level.elevation, lengthUnit)}</span>
                    <span className="level-count">{count > 0 ? `(${count})` : ''}</span>
                    <button
                      className={`level-btn level-btn-vis level-vis-${level.visibility}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLevelVisibility(level.id)
                      }}
                      title={VIS_TITLE[level.visibility]}
                    >
                      {VIS_LABEL[level.visibility]}
                    </button>
                    <button
                      className="level-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartEdit(level)
                      }}
                      title="Edit level"
                    >
                      E
                    </button>
                    {levels.length > 1 && (
                      <button
                        className="level-btn level-btn-remove"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeLevel(level.id)
                        }}
                        title="Remove level"
                      >
                        X
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}

          <div className="level-actions">
            <button className="level-btn level-btn-add" onClick={handleAdd}>
              + Add Level
            </button>
            {copySourceId ? (
              <div className="level-copy-target">
                <span className="level-copy-label">Copy to:</span>
                {levels
                  .filter((l) => l.id !== copySourceId)
                  .map((l) => (
                    <button
                      key={l.id}
                      className="level-btn"
                      onClick={() => void handleCopyToLevel(l.id)}
                    >
                      {l.name}
                    </button>
                  ))}
                <button
                  className="level-btn level-btn-remove"
                  onClick={() => setCopySourceId(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="level-btn"
                onClick={() => setCopySourceId(activeLevelId)}
                title="Copy all elements from active level to another level"
              >
                Copy Level
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
