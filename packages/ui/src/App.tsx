import { useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { useUIStore } from './stores/ui-store'
import { useDocumentStore } from './stores/document-store'
import { useMaterialStore } from './stores/material-store'
import { useKernel } from './hooks/useKernel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { CadMesh } from './components/viewport/CadMesh'
import { WallPlane } from './components/viewport/WallPlane'
import { DrawingPlaneGuide } from './components/viewport/DrawingPlaneGuide'
import { DoorPlane } from './components/viewport/DoorPlane'
import { FloorPlane } from './components/viewport/FloorPlane'
import { StairPlane } from './components/viewport/StairPlane'
import { MeasurePlane } from './components/tools/MeasureTool'
import { Viewport2D } from './components/viewport/Viewport2D'
import { PropertyPanel } from './components/layout/PropertyPanel'
import { useBimStore } from './stores/bim-store'
import { useMeasurementStore } from './stores/measurement-store'
import { useSettingsStore } from './stores/settings-store'
import { formatLength } from './utils/units'
import { isDoorElement, isFloorElement, isStairElement, isWallElement, useEntityStore } from './stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from './services/entity-regeneration'
import './App.css'

function getDrawingPlaneHint(tool: string): string | null {
  if (tool === 'wall') return 'Click to start and keep clicking for chained walls. Hold Shift for orthogonal lock; right-click to end the chain.'
  if (tool === 'door') return 'Hover a wall to preview the door snap, then click to place.'
  if (tool === 'floor') return 'Click to set one floor corner, move cursor, then click opposite corner.'
  if (tool === 'stair') return 'Click stair start, then click stair run end. Hold Shift for orthogonal lock.'
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
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

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

      <DrawingPlaneGuide />
      <WallPlane />
      <DoorPlane />
      <FloorPlane />
      <StairPlane />
      <MeasurePlane />

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

  const entityElements = useEntityStore((s) => s.elements)
  const projectName = useEntityStore((s) => s.projectName)
  const setProjectMeta = useEntityStore((s) => s.setProjectMeta)

  const setMaterials = useMaterialStore((s) => s.setMaterials)
  const measurementCursor = useMeasurementStore((s) => s.cursor)
  const toolReadout = useMeasurementStore((s) => s.toolReadout)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const { kernel, ready, error: kernelError } = useKernel()

  const [kernelStatus, setKernelStatus] = useState('loading...')
  const [meshInfo, setMeshInfo] = useState('')
  const [hoveredBodyId, setHoveredBodyId] = useState<string | null>(null)

  useKeyboardShortcuts()

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
          title="Door tool (D)"
        >
          Door
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'floor' ? 'active' : ''}`}
          onClick={() => handleToolChange('floor')}
          title="Floor tool (F)"
        >
          Floor
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'stair' ? 'active' : ''}`}
          onClick={() => handleToolChange('stair')}
          title="Stair tool (S)"
        >
          Stair
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'measure' ? 'active' : ''}`}
          onClick={() => handleToolChange('measure')}
          title="Measure tool (M)"
        >
          Measure
        </button>
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
          {selectedBodyId && <span>Selected: {selectedBodyId} (Del to remove)</span>}
          {activeTool === 'measure' && <span>Click two points to measure</span>}
          {activeTool === 'door' && (
            <span>Hover a wall, preview snap, then click to place door • swing:{defaultDoorSwing}</span>
          )}
          {activeTool === 'floor' && (
            <span>Click two opposite corners to place a rectangular slab • T:{formatLength(defaultFloorThickness, lengthUnit)}</span>
          )}
          {activeTool === 'stair' && (
            <span>Click start then end of stair run • W:{formatLength(defaultStairWidth, lengthUnit)} R:{defaultStairRisers} H:{formatLength(defaultStairHeight, lengthUnit)}</span>
          )}
          {activeTool === 'wall' && (
            <span>Shift: orthogonal lock • Right-click: finish wall chain • H:{formatLength(defaultWallHeight, lengthUnit)} T:{formatLength(defaultWallThickness, lengthUnit)}</span>
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
    </div>
  )
}
