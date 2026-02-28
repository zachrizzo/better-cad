import { useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { useStore } from 'zustand'
import { useUIStore } from './stores/ui-store'
import { useDocumentStore } from './stores/document-store'
import { useMaterialStore } from './stores/material-store'
import { useHistoryStore, useHistoryTemporal } from './stores/history-store'
import { useKernel } from './hooks/useKernel'
import { useUndo } from './hooks/useUndo'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { CadMesh } from './components/viewport/CadMesh'
import { SketchOverlay } from './components/viewport/SketchOverlay'
import { SketchPlane } from './components/viewport/SketchPlane'
import { WallPlane } from './components/viewport/WallPlane'
import { DrawingPlaneGuide } from './components/viewport/DrawingPlaneGuide'
import { DoorPlane } from './components/viewport/DoorPlane'
import { MeasurePlane } from './components/tools/MeasureTool'
import { Viewport2D } from './components/viewport/Viewport2D'
import { PropertyPanel } from './components/layout/PropertyPanel'
import { useSketchStore } from './stores/sketch-store'
import { useBimStore } from './stores/bim-store'
import { ImportDialog } from './components/dialogs/ImportDialog'
import { ExportDialog } from './components/dialogs/ExportDialog'
import { extrudeSketchProfile } from './utils/sketch-extrude'
import { useMeasurementStore } from './stores/measurement-store'
import { useSettingsStore } from './stores/settings-store'
import { formatLength } from './utils/units'
import './App.css'

function getDrawingPlaneHint(tool: string): string | null {
  if (tool === 'sketch') return 'Click first corner, then second corner to preview and place a rectangle. Live world X/Z dimensions are shown below.'
  if (tool === 'wall') return 'Click to start and keep clicking for chained walls. Hold Shift for orthogonal lock; right-click to end the chain.'
  if (tool === 'door') return 'Hover a wall to preview the door snap, then click to place. Doors stay constrained to wall centerlines.'
  if (tool === 'measure') return 'Pick two points on the ground plane to measure distance.'
  return null
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
  const gridCellColor = theme === 'light' ? '#cfd7e6' : '#3a3a50'
  const gridSectionColor = theme === 'light' ? '#9fb1cc' : '#5a5a70'
  const isSelectMode = activeTool === 'select'

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

      {/* Grid */}
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

      {/* Kernel-generated meshes */}
      {Array.from(cadMeshes.entries()).map(([id, mesh]) => (
        <CadMesh
          key={id}
          positions={mesh.positions}
          normals={mesh.normals}
          indices={mesh.indices}
          materialId={bodyMaterials.get(id)}
          color="#4a90d9"
          isSelected={isSelectMode && selectedBodyId === id}
          isHovered={isSelectMode && hoveredBodyId === id}
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
      ))}

      {/* Sketch overlay and interaction plane */}
      <DrawingPlaneGuide />
      <SketchOverlay />
      <SketchPlane />

      {/* Tool interaction planes */}
      <WallPlane />
      <DoorPlane />
      <MeasurePlane />

      {/* Camera controls */}
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
  const projectName = useDocumentStore((s) => s.projectName)
  const cadMeshes = useDocumentStore((s) => s.cadMeshes)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const activateSketch = useSketchStore((s) => s.activateSketch)
  const deactivateSketch = useSketchStore((s) => s.deactivateSketch)
  const clearSketch = useSketchStore((s) => s.clearSketch)
  const sketchProfiles = useSketchStore((s) => s.profiles)
  const walls = useBimStore((s) => s.walls)
  const doors = useBimStore((s) => s.doors)
  const addWall = useBimStore((s) => s.addWall)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const autoExtrudeSketch = useBimStore((s) => s.autoExtrudeSketch)
  const sketchExtrudeMode = useBimStore((s) => s.sketchExtrudeMode)
  const setMaterials = useMaterialStore((s) => s.setMaterials)
  const measurementCursor = useMeasurementStore((s) => s.cursor)
  const toolReadout = useMeasurementStore((s) => s.toolReadout)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const { kernel, ready, error: kernelError } = useKernel()
  const [kernelStatus, setKernelStatus] = useState('loading...')
  const [meshInfo, setMeshInfo] = useState('')
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [hoveredBodyId, setHoveredBodyId] = useState<string | null>(null)
  const [extrudingSketch, setExtrudingSketch] = useState(false)

  // Keyboard shortcuts
  useKeyboardShortcuts()

  // Undo/redo
  useUndo()
  const temporal = useHistoryTemporal()
  const canUndo = useStore(temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(temporal, (s) => s.futureStates.length > 0)
  const historyBoxParams = useHistoryStore((s) => s.boxParams)

  // When undo/redo changes boxParams in history-store, sync to document-store and recompute mesh
  useEffect(() => {
    const docParams = useDocumentStore.getState().boxParams
    if (
      docParams.width === historyBoxParams.width &&
      docParams.height === historyBoxParams.height &&
      docParams.depth === historyBoxParams.depth
    ) return
    useDocumentStore.getState().setBoxParams(historyBoxParams)
    if (!ready || !kernel) return
    kernel.createAndTessellateBox(historyBoxParams.width, historyBoxParams.height, historyBoxParams.depth)
      .then((mesh) => addCadMesh('box-0', mesh))
      .catch((err) => console.error('Undo recompute failed:', err))
  }, [historyBoxParams, ready, kernel, addCadMesh])

  // Handle kernel error
  useEffect(() => {
    if (kernelError) {
      setKernelStatus(`Kernel: FAILED`)
      console.error('[BetterCAD] Kernel error:', kernelError)
    }
  }, [kernelError])

  useEffect(() => {
    if (ready && kernel) {
      kernel.ping().then((result) => {
        setKernelStatus(`Kernel: ${result}`)
        console.log('[BetterCAD] Kernel ping:', result)
      }).catch((err) => {
        setKernelStatus('Kernel: error')
        console.error('[BetterCAD] Kernel ping failed:', err)
      })

      // Load material library
      kernel.getMaterialLibrary().then((mats) => {
        setMaterials(mats)
        console.log('[BetterCAD] Material library loaded:', mats.length, 'materials')
      }).catch((err) => {
        console.warn('[BetterCAD] getMaterialLibrary failed:', err)
      })

      // Create a tessellated box from the kernel
      kernel.createAndTessellateBox(1, 1, 1).then((mesh) => {
        addCadMesh('box-0', mesh)
        const vertexCount = mesh.positions.length / 3
        const triangleCount = mesh.indices.length / 3
        setMeshInfo(`V:${vertexCount} T:${triangleCount}`)
        console.log('[BetterCAD] Tessellated box:', { vertices: vertexCount, triangles: triangleCount })
      }).catch((err) => {
        console.error('[BetterCAD] createAndTessellateBox failed:', err)
      })
    }
  }, [ready, kernel])

  // Compute mesh info from store for status bar
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

  // Keep sketch overlay/plane in sync with the active tool no matter how tool changes.
  useEffect(() => {
    if (activeTool === 'sketch') {
      activateSketch()
    } else {
      deactivateSketch()
    }
  }, [activeTool, activateSketch, deactivateSketch])

  const handleToolChange = (tool: Parameters<typeof setActiveTool>[0]) => {
    setActiveTool(tool)
  }

  const handleExtrudeSketch = async () => {
    if (extrudingSketch || sketchProfiles.size === 0) return
    setExtrudingSketch(true)
    try {
      for (const profile of sketchProfiles.values()) {
        await extrudeSketchProfile({
          profile,
          mode: sketchExtrudeMode,
          height: defaultWallHeight,
          thickness: defaultWallThickness,
          kernel,
          ready,
          addCadMesh,
          addWall,
        })
      }
    } catch (err) {
      console.error('[BetterCAD] Toolbar sketch extrusion failed:', err)
    } finally {
      setExtrudingSketch(false)
    }
  }

  const viewportBackground = theme === 'light' ? '#edf2fa' : '#1a1a2e'
  const splitDividerColor = theme === 'light' ? '#d0d0d0' : '#3a3a50'
  const drawingPlaneHint = viewMode !== '2d' ? getDrawingPlaneHint(activeTool) : null
  const measurementReadout = useMemo(() => {
    const cursorText = measurementCursor
      ? `Cursor X:${formatLength(measurementCursor[0], lengthUnit)} Y:${formatLength(measurementCursor[1], lengthUnit)} Z:${formatLength(measurementCursor[2], lengthUnit)}`
      : null
    if (cursorText && toolReadout) return `${cursorText} • ${toolReadout}`
    return cursorText ?? toolReadout
  }, [lengthUnit, measurementCursor, toolReadout])

  return (
    <div className={`app-layout${theme === 'light' ? ' theme-light' : ''}`}>
      {/* ---------- Kernel Error Banner ---------- */}
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
            Tools will not work without the WASM kernel. Check browser console for details.
          </span>
        </div>
      )}

      {/* ---------- Toolbar ---------- */}
      <div className="toolbar">
        <span className="toolbar-title">BetterCAD</span>

        <div className="toolbar-separator" />

        <button
          className={`toolbar-btn ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => handleToolChange('select')}
          title="Select (Escape)"
        >
          Select
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'wall' ? 'active' : ''}`}
          onClick={() => handleToolChange('wall')}
          title="Wall tool (W)"
        >
          Wall
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'door' ? 'active' : ''}`}
          onClick={() => handleToolChange('door')}
          title="Door tool"
        >
          Door
        </button>
        <button
          className="toolbar-btn toolbar-btn-disabled"
          disabled
          title="Window tool is not implemented yet"
        >
          Window
        </button>
        <button
          className="toolbar-btn"
          disabled={sketchProfiles.size === 0 || extrudingSketch}
          onClick={() => { void handleExtrudeSketch() }}
          title={sketchProfiles.size === 0 ? 'Draw at least one sketch profile first' : 'Extrude all sketch profiles'}
        >
          {extrudingSketch ? 'Extruding...' : 'Extrude'}
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'measure' ? 'active' : ''}`}
          onClick={() => handleToolChange('measure')}
          title="Measure tool (M)"
        >
          Measure
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'sketch' ? 'active' : ''}`}
          onClick={() => handleToolChange('sketch')}
          title="Sketch tool (S)"
        >
          Sketch
        </button>
        <button
          className="toolbar-btn"
          onClick={clearSketch}
        >
          Clear Sketch
        </button>

        <div className="toolbar-separator" />

        <button
          className="toolbar-btn"
          onClick={() => setShowImportDialog(true)}
          title="Import STEP/DXF file"
        >
          Import
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setShowExportDialog(true)}
          title="Export to STEP/DXF"
        >
          Export
        </button>

        <div className="toolbar-separator" />

        <button
          className={`toolbar-btn ${showGrid ? 'active' : ''}`}
          onClick={toggleGrid}
          title="Toggle grid (G)"
        >
          Grid
        </button>
        <button
          className={`toolbar-btn ${snapEnabled ? 'active' : ''}`}
          onClick={toggleSnap}
        >
          Snap
        </button>

        <div className="toolbar-separator" />

        <button
          className="toolbar-btn"
          onClick={() => temporal.getState().undo()}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className="toolbar-btn"
          onClick={() => temporal.getState().redo()}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </button>

        <div className="toolbar-separator" />

        <button
          className={`toolbar-btn ${viewMode === '3d' ? 'active' : ''}`}
          onClick={() => setViewMode('3d')}
        >
          3D
        </button>
        <button
          className={`toolbar-btn ${viewMode === '2d' ? 'active' : ''}`}
          onClick={() => setViewMode('2d')}
        >
          2D
        </button>
        <button
          className={`toolbar-btn ${viewMode === 'split' ? 'active' : ''}`}
          onClick={() => setViewMode('split')}
        >
          Split
        </button>

        <div className="toolbar-separator" />

        <button
          className="toolbar-btn"
          onClick={toggleTheme}
          title="Toggle dark/light theme"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>

      {/* ---------- Viewport + Property Panel ---------- */}
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
                  <strong>Drawing Plane: Ground (XZ), Y=0</strong>
                  <span>{drawingPlaneHint}</span>
                  {measurementReadout && <span className="viewport-hint-metrics">{measurementReadout}</span>}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="viewport">
            <Canvas
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
                <strong>Drawing Plane: Ground (XZ), Y=0</strong>
                <span>{drawingPlaneHint}</span>
                {measurementReadout && <span className="viewport-hint-metrics">{measurementReadout}</span>}
              </div>
            )}
          </div>
        )}
        <PropertyPanel />
      </div>

      {/* ---------- Status Bar ---------- */}
      <div className="status-bar">
        <div className="status-bar-left">
          <span>{projectName}</span>
          <span>Tool: {activeTool}</span>
          {meshInfo && <span>{meshInfo}</span>}
          {measurementReadout && <span>{measurementReadout}</span>}
          {walls.size > 0 && <span>Walls: {walls.size}</span>}
          {doors.size > 0 && <span>Doors: {doors.size}</span>}
          {selectedBodyId && <span>Selected: {selectedBodyId} (Del to remove)</span>}
          {activeTool === 'measure' && (
            <span>Click two points to measure</span>
          )}
          {activeTool === 'door' && (
            <span>Hover a wall, preview snap, then click to place door</span>
          )}
          {activeTool === 'wall' && (
            <span>Shift: orthogonal lock • Right-click: finish wall chain • H:{formatLength(defaultWallHeight, lengthUnit)} T:{formatLength(defaultWallThickness, lengthUnit)}</span>
          )}
          {activeTool === 'sketch' && (
            <span>Sketches: {sketchProfiles.size} • {autoExtrudeSketch ? `Auto ${sketchExtrudeMode.toUpperCase()} @ H:${formatLength(defaultWallHeight, lengthUnit)} T:${formatLength(defaultWallThickness, lengthUnit)}` : 'Auto extrude off'}</span>
          )}
        </div>
        <div className="status-bar-right">
          <span>View: {viewMode.toUpperCase()}</span>
          <span>Units: {lengthUnit.toUpperCase()}</span>
          <span>{showGrid ? 'Grid ON' : 'Grid OFF'}</span>
          <span>{snapEnabled ? 'Snap ON' : 'Snap OFF'}</span>
          <span>{kernelStatus}</span>
        </div>
      </div>

      {/* ---------- Import/Export Dialogs ---------- */}
      <ImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        kernel={kernel}
        onImport={(meshes) => {
          meshes.forEach((mesh, i) => addCadMesh(`imported-${i}`, mesh))
        }}
      />
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        kernel={kernel}
      />
    </div>
  )
}
