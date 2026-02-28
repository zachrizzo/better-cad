import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { useUIStore } from './stores/ui-store'
import { useDocumentStore } from './stores/document-store'
import { useMaterialStore } from './stores/material-store'
import { useKernel } from './hooks/useKernel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useUndo } from './hooks/useUndo'
import { CadMesh } from './components/viewport/CadMesh'
import { WallPlane } from './components/viewport/WallPlane'
import { DrawingPlaneGuide } from './components/viewport/DrawingPlaneGuide'
import { DoorPlane } from './components/viewport/DoorPlane'
import { FloorPlane } from './components/viewport/FloorPlane'
import { StairPlane } from './components/viewport/StairPlane'
import { WindowPlane } from './components/viewport/WindowPlane'
import { ColumnPlane } from './components/viewport/ColumnPlane'
import { BeamPlane } from './components/viewport/BeamPlane'
import { RoofPlane } from './components/viewport/RoofPlane'
import { SketchPlane } from './components/viewport/SketchPlane'
import { SectionPlane } from './components/viewport/SectionPlane'
import { SectionView, SectionCutLine } from './components/viewport/SectionView'
import { ElevationCamera } from './components/viewport/ElevationCamera'
import { DimensionPlane, DimensionOverlay3D } from './components/viewport/DimensionPlane'
import { TextAnnotationPlane, TextAnnotationOverlay3D } from './components/viewport/TextAnnotationPlane'
import { MeasurePlane } from './components/tools/MeasureTool'
import { SelectionGizmo } from './components/viewport/SelectionGizmo'
import { Viewport2D } from './components/viewport/Viewport2D'
import { PropertyPanel } from './components/layout/PropertyPanel'
import { ConstraintPanel } from './components/panels/ConstraintPanel'
import { ViewPanel } from './components/panels/ViewPanel'
import { SchedulePanel } from './components/panels/SchedulePanel'
import { SketchToolbar } from './components/panels/SketchToolbar'
import { useBimStore } from './stores/bim-store'
import { useSketchStore } from './stores/sketch-store'
import { useMeasurementStore } from './stores/measurement-store'
import { useSettingsStore, LIGHTING_PRESETS, type LightingPreset } from './stores/settings-store'
import { useViewStore } from './stores/view-store'
import { useLevelStore, type LevelVisibility } from './stores/level-store'
import { formatLength } from './utils/units'
import {
  isBeamElement,
  isColumnElement,
  isDoorElement,
  isFloorElement,
  isRoofElement,
  isRoomElement,
  isStairElement,
  isWallElement,
  isWindowElement,
  useEntityStore,
} from './stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from './services/entity-regeneration'
import { detectRooms } from './services/room-detection'
import { ImportDialog } from './components/dialogs/ImportDialog'
import { ExportDialog } from './components/dialogs/ExportDialog'
import type { TessellatedMesh, WallElement } from './services/kernel-bridge'
import './App.css'

function getDrawingPlaneHint(tool: string): string | null {
  if (tool === 'wall') return 'Click to start and keep clicking for chained walls. Hold Shift for orthogonal lock; right-click to end the chain.'
  if (tool === 'door') return 'Hover a wall to preview the door snap, then click to place.'
  if (tool === 'floor') return 'Click to set one floor corner, move cursor, then click opposite corner.'
  if (tool === 'stair') return 'Click stair start, then click stair run end. Hold Shift for orthogonal lock.'
  if (tool === 'measure') return 'Pick two points on the ground plane to measure distance.'
  if (tool === 'window') return 'Click on a wall to place a window.'
  if (tool === 'column') return 'Click on the ground plane to place a column.'
  if (tool === 'beam') return 'Click start point then end point to place a beam. Hold Shift for orthogonal lock.'
  if (tool === 'roof') return 'Click to place polygon vertices. Double-click or right-click to close the roof polygon.'
  if (tool === 'dimension') return 'Click first point, then second point to place a persistent dimension line.'
  if (tool === 'text') return 'Click to place a text annotation, then type and press Enter.'
  if (tool === 'sketch') return 'Parametric sketch mode. Use sub-tools to draw lines, rectangles, circles. Apply constraints in the panel.'
  if (tool === 'section') return 'Click two points on the ground plane to define the section cut line.'
  return null
}

function opacityForVisibility(vis: LevelVisibility): number {
  if (vis === 'visible') return 1.0
  if (vis === 'ghosted') return 0.25
  return 0
}

function Scene({ selectedBodyId, hoveredBodyId, onSelectBody, onHoverBody }: {
  selectedBodyId: string | null
  hoveredBodyId: string | null
  onSelectBody: (id: string | null) => void
  onHoverBody: (id: string | null) => void
}) {
  const activeTool = useUIStore((s) => s.activeTool)
  const showGrid = useUIStore((s) => s.showGrid)
  const theme = useUIStore((s) => s.theme)
  const cadMeshes = useDocumentStore((s) => s.cadMeshes)
  const bodyMaterials = useMaterialStore((s) => s.bodyMaterials)
  const entityElements = useEntityStore((s) => s.elements)
  const levels = useLevelStore((s) => s.levels)
  const lightingPreset = useSettingsStore((s) => s.lightingPreset)
  const lighting = LIGHTING_PRESETS[lightingPreset]
  const activeViewId = useViewStore((s) => s.activeViewId)
  const views = useViewStore((s) => s.views)
  const activeView = activeViewId ? views.get(activeViewId) ?? null : null
  const gridCellColor = theme === 'light' ? '#cfd7e6' : '#3a3a50'
  const gridSectionColor = theme === 'light' ? '#9fb1cc' : '#5a5a70'
  const isSelectMode = activeTool === 'select'

  // Level visibility and elevation lookup
  const levelMap = useMemo(() => {
    const map = new Map<string, { elevation: number; visibility: LevelVisibility }>()
    for (const level of levels) {
      map.set(level.id, { elevation: level.elevation, visibility: level.visibility })
    }
    return map
  }, [levels])

  const elementLevelInfo = useMemo(() => {
    const info = new Map<string, { opacity: number; elevationOffset: number }>()
    for (const [id, el] of entityElements) {
      const levelId = el.meta.level_id
      if (levelId && levelMap.has(levelId)) {
        const lvl = levelMap.get(levelId)!
        info.set(id, {
          opacity: opacityForVisibility(lvl.visibility),
          elevationOffset: lvl.elevation,
        })
      } else {
        info.set(id, { opacity: 1.0, elevationOffset: 0 })
      }
    }
    return info
  }, [entityElements, levelMap])

  return (
    <>
      {/* Enhanced lighting based on active preset */}
      <ambientLight intensity={lighting.ambientIntensity} color={lighting.ambientColor} />
      <directionalLight
        position={lighting.mainLightPosition}
        intensity={lighting.mainLightIntensity}
        color={lighting.mainLightColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />
      <directionalLight
        position={lighting.fillLightPosition}
        intensity={lighting.fillLightIntensity}
        color={lighting.fillLightColor}
      />
      <hemisphereLight
        args={[lighting.hemisphereSkyColor, lighting.hemisphereGroundColor, lighting.hemisphereIntensity]}
      />

      {/* Environment map for reflections */}
      <Environment preset={lighting.environmentPreset} background={false} />

      {/* Shadow-receiving ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <shadowMaterial opacity={0.15} />
      </mesh>

      {showGrid && (
        <Grid
          infiniteGrid
          cellSize={1}
          cellThickness={0.5}
          cellColor={gridCellColor}
          sectionSize={5}
          sectionThickness={1}
          sectionColor={gridSectionColor}
          fadeDistance={50}
          fadeStrength={1.5}
        />
      )}

      {Array.from(cadMeshes.entries()).map(([id, mesh]) => {
        const lvlInfo = elementLevelInfo.get(id)
        const opacity = lvlInfo?.opacity ?? 1.0
        const elevationOffset = lvlInfo?.elevationOffset ?? 0
        if (opacity <= 0) return null
        return (
          <CadMesh
            key={id}
            positions={mesh.positions}
            normals={mesh.normals}
            indices={mesh.indices}
            materialId={bodyMaterials.get(id)}
            color="#4a90d9"
            isSelected={isSelectMode && selectedBodyId === id}
            isHovered={isSelectMode && hoveredBodyId === id}
            levelOpacity={opacity}
            elevationOffset={elevationOffset}
            onClick={isSelectMode ? (e) => {
              e.stopPropagation()
              onSelectBody(selectedBodyId === id ? null : id)
            } : undefined}
            onPointerOver={isSelectMode ? (e) => {
              e.stopPropagation()
              onHoverBody(id)
            } : undefined}
            onPointerOut={isSelectMode ? (e) => {
              e.stopPropagation()
              onHoverBody(null)
            } : undefined}
          />
        )
      })}

      <DrawingPlaneGuide />
      <WallPlane />
      <DoorPlane />
      <FloorPlane />
      <StairPlane />
      <WindowPlane />
      <ColumnPlane />
      <BeamPlane />
      <RoofPlane />
      <SketchPlane />
      <SectionPlane />
      <MeasurePlane />
      <DimensionPlane />
      <TextAnnotationPlane />
      <DimensionOverlay3D />
      <TextAnnotationOverlay3D />
      <SelectionGizmo />

      {/* Section/Elevation view support */}
      {activeView?.type === 'section' && <SectionView view={activeView} />}
      {activeView?.type === 'section' && <SectionCutLine view={activeView} />}
      {activeView?.type === 'elevation' && <ElevationCamera view={activeView} />}

      <OrbitControls makeDefault />
    </>
  )
}

export default function App() {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const showGrid = useUIStore((s) => s.showGrid)
  const toggleGrid = useUIStore((s) => s.toggleGrid)
  const snapEnabled = useUIStore((s) => s.snapEnabled)
  const toggleSnap = useUIStore((s) => s.toggleSnap)
  const viewMode = useUIStore((s) => s.viewMode)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const selectedBodyId = useUIStore((s) => s.selectedBodyId)
  const selectBody = useUIStore((s) => s.selectBody)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)

  const cadMeshes = useDocumentStore((s) => s.cadMeshes)

  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const defaultDoorSwing = useBimStore((s) => s.defaultDoorSwing)
  const defaultFloorThickness = useBimStore((s) => s.defaultFloorThickness)
  const defaultStairWidth = useBimStore((s) => s.defaultStairWidth)
  const defaultStairRisers = useBimStore((s) => s.defaultStairRisers)
  const defaultStairHeight = useBimStore((s) => s.defaultStairHeight)
  const defaultColumnWidth = useBimStore((s) => s.defaultColumnWidth)
  const defaultColumnDepth = useBimStore((s) => s.defaultColumnDepth)
  const defaultColumnHeight = useBimStore((s) => s.defaultColumnHeight)
  const defaultBeamWidth = useBimStore((s) => s.defaultBeamWidth)
  const defaultBeamDepth = useBimStore((s) => s.defaultBeamDepth)
  const defaultBeamElevation = useBimStore((s) => s.defaultBeamElevation)
  const defaultRoofThickness = useBimStore((s) => s.defaultRoofThickness)
  const defaultRoofElevation = useBimStore((s) => s.defaultRoofElevation)

  const activateSketch = useSketchStore((s) => s.activateSketch)
  const deactivateSketch = useSketchStore((s) => s.deactivateSketch)
  const sketchActive = useSketchStore((s) => s.active)
  const sketchSolverStatus = useSketchStore((s) => s.solverStatus)
  const sketchPoints = useSketchStore((s) => s.points)
  const sketchLines = useSketchStore((s) => s.lines)
  const sketchConstraints = useSketchStore((s) => s.constraints)

  const entityElements = useEntityStore((s) => s.elements)
  const projectName = useEntityStore((s) => s.projectName)
  const setProjectMeta = useEntityStore((s) => s.setProjectMeta)
  const undoStackLen = useEntityStore((s) => s.undoStack.length)
  const redoStackLen = useEntityStore((s) => s.redoStack.length)

  const activeLevelId = useLevelStore((s) => s.activeLevelId)
  const levels = useLevelStore((s) => s.levels)
  const activeLevel = useMemo(
    () => levels.find((l) => l.id === activeLevelId),
    [levels, activeLevelId],
  )

  const setMaterials = useMaterialStore((s) => s.setMaterials)
  const measurementCursor = useMeasurementStore((s) => s.cursor)
  const toolReadout = useMeasurementStore((s) => s.toolReadout)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const lightingPreset = useSettingsStore((s) => s.lightingPreset)
  const setLightingPreset = useSettingsStore((s) => s.setLightingPreset)
  const activeViewId = useViewStore((s) => s.activeViewId)
  const activeViewName = useViewStore((s) => {
    if (!s.activeViewId) return null
    return s.views.get(s.activeViewId)?.name ?? null
  })
  const clearActiveView = useViewStore((s) => s.clearActiveView)
  const { kernel, ready, error: kernelError } = useKernel()

  const [kernelStatus, setKernelStatus] = useState('loading...')
  const [meshInfo, setMeshInfo] = useState('')
  const [hoveredBodyId, setHoveredBodyId] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [showSchedules, setShowSchedules] = useState(false)
  const toggleSchedules = useCallback(() => setShowSchedules((v) => !v), [])
  const loadInputRef = useRef<HTMLInputElement>(null)

  const handleSaveProject = useCallback(async () => {
    if (!kernel) return
    try {
      const data = await kernel.saveProject()
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName || 'project'}.bcad`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[BetterCAD] Save failed:', err)
    }
  }, [kernel, projectName])

  const handleLoadProject = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !kernel) return
    try {
      const buffer = await file.arrayBuffer()
      await kernel.loadProject(buffer)
      useEntityStore.getState().clearProject()
      await syncEntitiesAndRegenerateMeshes(kernel)
    } catch (err) {
      console.error('[BetterCAD] Load failed:', err)
    }
    if (loadInputRef.current) loadInputRef.current.value = ''
  }, [kernel])

  const handleImport = useCallback(async (meshes: TessellatedMesh[]) => {
    const addCadMesh = useDocumentStore.getState().addCadMesh
    meshes.forEach((mesh, i) => {
      addCadMesh(`import-${Date.now()}-${i}`, mesh)
    })
  }, [])

  useKeyboardShortcuts({ onSave: handleSaveProject, onLoad: () => loadInputRef.current?.click() })
  const { performUndo, performRedo } = useUndo()

  const ROOM_COLORS = ['#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#6366f1']

  const handleDetectRooms = async () => {
    if (!ready || !kernel) return
    const allElements = useEntityStore.getState().elements
    const levelWalls = Array.from(allElements.values()).filter(
      (e): e is WallElement => isWallElement(e) && (!e.meta.level_id || e.meta.level_id === activeLevelId),
    )
    if (levelWalls.length < 3) return

    const existingRooms = Array.from(allElements.values()).filter(
      (e) => isRoomElement(e) && (!e.meta.level_id || e.meta.level_id === activeLevelId),
    )
    for (const room of existingRooms) {
      await kernel.deleteElement(room.meta.id)
      useEntityStore.getState().removeElement(room.meta.id)
    }

    const detected = detectRooms(levelWalls)
    for (let i = 0; i < detected.length; i++) {
      const room = detected[i]
      const roomElement = {
        kind: 'room' as const,
        meta: {
          id: `room-${crypto.randomUUID()}`,
          name: `Room ${i + 1}`,
          level_id: activeLevelId,
        },
        boundary: room.boundary,
        name: `Room ${i + 1}`,
        color: ROOM_COLORS[i % ROOM_COLORS.length],
      }
      await kernel.createElement(roomElement)
    }
    await syncEntitiesAndRegenerateMeshes(kernel)
  }

  // Sync sketch activation with tool changes
  useEffect(() => {
    if (activeTool === 'sketch') {
      if (!sketchActive) activateSketch()
    } else {
      if (sketchActive) deactivateSketch()
    }
  }, [activeTool, sketchActive, activateSketch, deactivateSketch])

  useEffect(() => {
    if (kernelError) {
      setKernelStatus('Kernel: FAILED')
      console.error('[BetterCAD] Kernel error:', kernelError)
    }
  }, [kernelError])

  useEffect(() => {
    if (!ready || !kernel) return

    void (async () => {
      try {
        const ping = await kernel.ping()
        setKernelStatus(`Kernel: ${ping}`)

        const mats = await kernel.getMaterialLibrary()
        setMaterials(mats)

        const elements = await kernel.queryElements()
        if (elements.length === 0) {
          await kernel.resetProject('Prototype Project', 'm')
          await kernel.createElement({
            kind: 'level',
            meta: {
              id: `level-${crypto.randomUUID()}`,
              name: 'Level 1',
            },
            elevation: 0,
          })
        }

        setProjectMeta('Prototype Project', 'm')
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (err) {
        setKernelStatus('Kernel: error')
        console.error('[BetterCAD] Kernel bootstrap failed:', err)
      }
    })()
  }, [ready, kernel, setMaterials, setProjectMeta])

  useEffect(() => {
    if (cadMeshes.size > 0) {
      let totalVerts = 0
      let totalTris = 0
      cadMeshes.forEach((m) => {
        totalVerts += m.positions.length / 3
        totalTris += m.indices.length / 3
      })
      setMeshInfo(`V:${totalVerts} T:${totalTris}`)
    } else {
      setMeshInfo('')
    }
  }, [cadMeshes])

  const handleToolChange = (tool: Parameters<typeof setActiveTool>[0]) => {
    setActiveTool(tool)
  }

  const walls = useMemo(
    () => Array.from(entityElements.values()).filter(isWallElement),
    [entityElements],
  )
  const doors = useMemo(
    () => Array.from(entityElements.values()).filter(isDoorElement),
    [entityElements],
  )
  const floors = useMemo(
    () => Array.from(entityElements.values()).filter(isFloorElement),
    [entityElements],
  )
  const stairs = useMemo(
    () => Array.from(entityElements.values()).filter(isStairElement),
    [entityElements],
  )
  const windowElements = useMemo(
    () => Array.from(entityElements.values()).filter(isWindowElement),
    [entityElements],
  )
  const columnElements = useMemo(
    () => Array.from(entityElements.values()).filter(isColumnElement),
    [entityElements],
  )
  const beamElements = useMemo(
    () => Array.from(entityElements.values()).filter(isBeamElement),
    [entityElements],
  )
  const roofElements = useMemo(
    () => Array.from(entityElements.values()).filter(isRoofElement),
    [entityElements],
  )
  const roomElements = useMemo(
    () => Array.from(entityElements.values()).filter(isRoomElement),
    [entityElements],
  )

  const viewportBackground = theme === 'light' ? '#edf2fa' : '#1a1a2e'
  const splitDividerColor = theme === 'light' ? '#d0d0d0' : '#3a3a50'
  const drawingPlaneHint = viewMode !== '2d' ? getDrawingPlaneHint(activeTool) : null
  const isSketchMode = activeTool === 'sketch'

  const measurementReadout = useMemo(() => {
    const cursorText = measurementCursor
      ? `Cursor X:${formatLength(measurementCursor[0], lengthUnit)} Y:${formatLength(measurementCursor[1], lengthUnit)} Z:${formatLength(measurementCursor[2], lengthUnit)}`
      : null
    if (cursorText && toolReadout) return `${cursorText} • ${toolReadout}`
    return cursorText ?? toolReadout
  }, [lengthUnit, measurementCursor, toolReadout])

  return (
    <div className={`app-layout${theme === 'light' ? ' theme-light' : ''}`}>
      {kernelError && (
        <div style={{
          background: '#dc2626',
          color: '#fff',
          padding: '8px 16px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 1000,
        }}>
          <strong>Kernel Error:</strong>
          <span>{kernelError}</span>
          <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: '11px' }}>
            Tools will not work without the kernel.
          </span>
        </div>
      )}

      <div className="toolbar">
        <span className="toolbar-title">BetterCAD Prototype</span>

        <div className="toolbar-separator" />

        <button className="toolbar-btn" onClick={() => void handleSaveProject()} title="Save project (Ctrl+S)">Save</button>
        <button className="toolbar-btn" onClick={() => loadInputRef.current?.click()} title="Open project (Ctrl+O)">Open</button>
        <button className="toolbar-btn" onClick={() => setImportDialogOpen(true)} title="Import file (STEP, DXF)">Import</button>
        <button className="toolbar-btn" onClick={() => setExportDialogOpen(true)} title="Export file (STEP, IFC, glTF, DXF)">Export</button>

        <div className="toolbar-separator" />

        <button className="toolbar-btn" onClick={() => void performUndo()} disabled={undoStackLen === 0} title="Undo (Ctrl+Z)">Undo</button>
        <button className="toolbar-btn" onClick={() => void performRedo()} disabled={redoStackLen === 0} title="Redo (Ctrl+Shift+Z)">Redo</button>

        <div className="toolbar-separator" />

        <button className={`toolbar-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => handleToolChange('select')} title="Select (Escape)">Select</button>
        <button className={`toolbar-btn ${activeTool === 'wall' ? 'active' : ''}`} onClick={() => handleToolChange('wall')} title="Wall tool (W)">Wall</button>
        <button className={`toolbar-btn ${activeTool === 'door' ? 'active' : ''}`} onClick={() => handleToolChange('door')} title="Door tool (D)">Door</button>
        <button className={`toolbar-btn ${activeTool === 'window' ? 'active' : ''}`} onClick={() => handleToolChange('window')} title="Window (N)">Window</button>
        <button className={`toolbar-btn ${activeTool === 'floor' ? 'active' : ''}`} onClick={() => handleToolChange('floor')} title="Floor tool (F)">Floor</button>
        <button className={`toolbar-btn ${activeTool === 'stair' ? 'active' : ''}`} onClick={() => handleToolChange('stair')} title="Stair tool (S)">Stair</button>
        <button className={`toolbar-btn ${activeTool === 'column' ? 'active' : ''}`} onClick={() => handleToolChange('column')} title="Column tool (C)">Column</button>
        <button className={`toolbar-btn ${activeTool === 'beam' ? 'active' : ''}`} onClick={() => handleToolChange('beam')} title="Beam tool (B)">Beam</button>
        <button className={`toolbar-btn ${activeTool === 'roof' ? 'active' : ''}`} onClick={() => handleToolChange('roof')} title="Roof tool (O)">Roof</button>
        <button className={`toolbar-btn ${activeTool === 'dimension' ? 'active' : ''}`} onClick={() => handleToolChange('dimension')} title="Dimension tool (A)">Dimension</button>
        <button className={`toolbar-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => handleToolChange('text')} title="Text annotation (T)">Text</button>
        <button className={`toolbar-btn ${activeTool === 'sketch' ? 'active' : ''}`} onClick={() => handleToolChange('sketch')} title="Sketch tool (K)">Sketch</button>
        <button className={`toolbar-btn ${activeTool === 'measure' ? 'active' : ''}`} onClick={() => handleToolChange('measure')} title="Measure tool (M)">Measure</button>
        <button className={`toolbar-btn ${activeTool === 'section' ? 'active' : ''}`} onClick={() => handleToolChange('section')} title="Section cut tool">Section</button>
        <button className="toolbar-btn" onClick={() => void handleDetectRooms()} title="Auto-detect rooms from walls on active level">Rooms</button>
        {activeViewId && (
          <button className="toolbar-btn active" onClick={clearActiveView} title="Return to normal 3D view" style={{ background: '#f59e0b', borderColor: '#f59e0b' }}>Back to 3D</button>
        )}
        <button className={`toolbar-btn ${showGrid ? 'active' : ''}`} onClick={toggleGrid} title="Toggle grid (G)">Grid</button>
        <button className={`toolbar-btn ${snapEnabled ? 'active' : ''}`} onClick={toggleSnap}>Snap</button>
        <button className={`toolbar-btn ${showSchedules ? 'active' : ''}`} onClick={toggleSchedules} title="Schedules & Quantities">Schedules</button>

        <div className="toolbar-separator" />

        <button className={`toolbar-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')}>3D</button>
        <button className={`toolbar-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')}>2D</button>
        <button className={`toolbar-btn ${viewMode === 'split' ? 'active' : ''}`} onClick={() => setViewMode('split')}>Split</button>

        <div className="toolbar-separator" />

        <button className="toolbar-btn" onClick={toggleTheme} title="Toggle dark/light theme">{theme === 'dark' ? 'Light' : 'Dark'}</button>

        <div className="toolbar-separator" />

        <select
          className="toolbar-select"
          value={lightingPreset}
          onChange={(e) => setLightingPreset(e.target.value as LightingPreset)}
          title="Lighting preset"
        >
          <option value="daylight">Daylight</option>
          <option value="evening">Evening</option>
          <option value="studio">Studio</option>
        </select>
      </div>

      {/* Sketch sub-toolbar */}
      {isSketchMode && <SketchToolbar />}

      <div className="viewport-area">
        {viewMode === '2d' ? (
          <div className="viewport">
            <Viewport2D background={viewportBackground} />
          </div>
        ) : viewMode === 'split' ? (
          <>
            <div className="viewport" style={{ flex: 1 }}>
              <Viewport2D background={viewportBackground} />
            </div>
            <div className="viewport" style={{ flex: 1, borderLeft: `1px solid ${splitDividerColor}` }}>
              <Canvas
                shadows
                camera={{ position: [5, 5, 5], fov: 50 }}
                onPointerMissed={() => {
                  if (activeTool === 'select') {
                    selectBody(null)
                  }
                }}
              >
                <color attach="background" args={[viewportBackground]} />
                <Scene
                  selectedBodyId={selectedBodyId}
                  hoveredBodyId={hoveredBodyId}
                  onSelectBody={selectBody}
                  onHoverBody={setHoveredBodyId}
                />
              </Canvas>
              {drawingPlaneHint && (
                <div className="viewport-hint">
                  <strong>Drawing Plane: {activeLevel?.name ?? 'Ground'} (XZ), Y={formatLength(activeLevel?.elevation ?? 0, lengthUnit)}</strong>
                  <span>{drawingPlaneHint}</span>
                  {measurementReadout && <span className="viewport-hint-metrics">{measurementReadout}</span>}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="viewport">
            <Canvas
              shadows
              camera={{ position: [5, 5, 5], fov: 50 }}
              onPointerMissed={() => {
                if (activeTool === 'select') {
                  selectBody(null)
                }
              }}
            >
              <color attach="background" args={[viewportBackground]} />
              <Scene
                selectedBodyId={selectedBodyId}
                hoveredBodyId={hoveredBodyId}
                onSelectBody={selectBody}
                onHoverBody={setHoveredBodyId}
              />
            </Canvas>
            {drawingPlaneHint && (
              <div className="viewport-hint">
                <strong>Drawing Plane: {activeLevel?.name ?? 'Ground'} (XZ), Y={formatLength(activeLevel?.elevation ?? 0, lengthUnit)}</strong>
                <span>{drawingPlaneHint}</span>
                {measurementReadout && <span className="viewport-hint-metrics">{measurementReadout}</span>}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {isSketchMode ? <ConstraintPanel /> : <PropertyPanel />}
          <ViewPanel />
        </div>
      </div>

      <input
        ref={loadInputRef}
        type="file"
        accept=".bcad"
        style={{ display: 'none' }}
        onChange={handleLoadProject}
      />

      <ImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        kernel={kernel}
        onImport={handleImport}
      />

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        kernel={kernel}
      />

      {showSchedules && <SchedulePanel onClose={toggleSchedules} />}

      <div className="status-bar">
        <div className="status-bar-left">
          <span>{projectName}</span>
          <span>Tool: {activeTool}</span>
          {meshInfo && <span>{meshInfo}</span>}
          {measurementReadout && <span>{measurementReadout}</span>}
          {walls.length > 0 && <span>Walls: {walls.length}</span>}
          {doors.length > 0 && <span>Doors: {doors.length}</span>}
          {floors.length > 0 && <span>Floors: {floors.length}</span>}
          {stairs.length > 0 && <span>Stairs: {stairs.length}</span>}
          {windowElements.length > 0 && <span>Windows: {windowElements.length}</span>}
          {columnElements.length > 0 && <span>Columns: {columnElements.length}</span>}
          {beamElements.length > 0 && <span>Beams: {beamElements.length}</span>}
          {roofElements.length > 0 && <span>Roofs: {roofElements.length}</span>}
          {roomElements.length > 0 && <span>Rooms: {roomElements.length}</span>}
          {selectedBodyId && <span>Selected: {selectedBodyId} (Del remove | Ctrl+D copy | R rotate | drag gizmo to move)</span>}
          {activeTool === 'measure' && <span>Click two points to measure</span>}
          {activeTool === 'door' && <span>Hover a wall, preview snap, then click to place door - swing:{defaultDoorSwing}</span>}
          {activeTool === 'window' && <span>Hover a wall, then click to place a window</span>}
          {activeTool === 'floor' && <span>Click two opposite corners to place a rectangular slab - T:{formatLength(defaultFloorThickness, lengthUnit)}</span>}
          {activeTool === 'stair' && <span>Click start then end of stair run - W:{formatLength(defaultStairWidth, lengthUnit)} R:{defaultStairRisers} H:{formatLength(defaultStairHeight, lengthUnit)}</span>}
          {activeTool === 'column' && <span>Click to place column - W:{formatLength(defaultColumnWidth, lengthUnit)} D:{formatLength(defaultColumnDepth, lengthUnit)} H:{formatLength(defaultColumnHeight, lengthUnit)}</span>}
          {activeTool === 'beam' && <span>Click start then end - W:{formatLength(defaultBeamWidth, lengthUnit)} D:{formatLength(defaultBeamDepth, lengthUnit)} Elev:{formatLength(defaultBeamElevation, lengthUnit)}</span>}
          {activeTool === 'roof' && <span>Click polygon vertices, dbl-click/right-click to close - T:{formatLength(defaultRoofThickness, lengthUnit)} Elev:{formatLength(defaultRoofElevation, lengthUnit)}</span>}
          {activeTool === 'wall' && <span>Shift: orthogonal lock - Right-click: finish wall chain - H:{formatLength(defaultWallHeight, lengthUnit)} T:{formatLength(defaultWallThickness, lengthUnit)}</span>}
          {activeTool === 'sketch' && <span>Sketch: Pts:{sketchPoints.size} Ln:{sketchLines.size} Cstr:{sketchConstraints.size} [{sketchSolverStatus}]</span>}
          {activeTool === 'section' && <span>Click two points to define section cut line</span>}
          {activeViewName && <span>Active View: {activeViewName}</span>}
        </div>
        <div className="status-bar-right">
          <span>Level: {activeLevel?.name ?? 'Ground'}</span>
          <span>View: {viewMode.toUpperCase()}</span>
          <span>Units: {lengthUnit.toUpperCase()}</span>
          <span>{showGrid ? 'Grid ON' : 'Grid OFF'}</span>
          <span>{snapEnabled ? 'Snap ON' : 'Snap OFF'}</span>
          <span>{kernelStatus}</span>
        </div>
      </div>
    </div>
  )
}
