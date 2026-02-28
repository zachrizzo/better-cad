import { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { useStore } from 'zustand'
import { useUIStore } from './stores/ui-store'
import { useDocumentStore } from './stores/document-store'
import { useHistoryStore, useHistoryTemporal } from './stores/history-store'
import { useKernel } from './hooks/useKernel'
import { useUndo } from './hooks/useUndo'
import { CadMesh } from './components/viewport/CadMesh'
import { SketchOverlay } from './components/viewport/SketchOverlay'
import { SketchPlane } from './components/viewport/SketchPlane'
import { PropertyPanel } from './components/layout/PropertyPanel'
import { useSketchStore } from './stores/sketch-store'
import './App.css'

function Scene() {
  const showGrid = useUIStore((s) => s.showGrid)
  const cadMeshes = useDocumentStore((s) => s.cadMeshes)

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
          cellColor="#3a3a50"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#5a5a70"
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
          color="#4a90d9"
        />
      ))}

      {/* Fallback hardcoded demo box when no kernel meshes are loaded */}
      {cadMeshes.size === 0 && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#4a90d9" metalness={0.1} roughness={0.7} />
        </mesh>
      )}

      {/* Sketch overlay and interaction plane */}
      <SketchOverlay />
      <SketchPlane />

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
  const projectName = useDocumentStore((s) => s.projectName)
  const cadMeshes = useDocumentStore((s) => s.cadMeshes)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const { kernel, ready } = useKernel()
  const [kernelStatus, setKernelStatus] = useState('loading...')
  const [meshInfo, setMeshInfo] = useState('')

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

  useEffect(() => {
    if (ready && kernel) {
      kernel.ping().then((result) => {
        setKernelStatus(`Kernel: ${result}`)
        console.log('[BetterCAD] Kernel ping:', result)
      })

      // Create a tessellated box from the kernel
      kernel.createAndTessellateBox(1, 1, 1).then((mesh) => {
        if (mesh.positions.length > 0) {
          addCadMesh('default-box', mesh)
          const vertexCount = mesh.positions.length / 3
          const triangleCount = mesh.indices.length / 3
          setMeshInfo(`V:${vertexCount} T:${triangleCount}`)
          console.log('[BetterCAD] Tessellated box:', { vertices: vertexCount, triangles: triangleCount })
        }
      }).catch((err) => {
        console.warn('[BetterCAD] createAndTessellateBox failed:', err)
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
    }
  }, [cadMeshes])

  return (
    <div className="app-layout">
      {/* ---------- Toolbar ---------- */}
      <div className="toolbar">
        <span className="toolbar-title">BetterCAD</span>

        <div className="toolbar-separator" />

        <button
          className={`toolbar-btn ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => setActiveTool('select')}
        >
          Select
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'wall' ? 'active' : ''}`}
          onClick={() => setActiveTool('wall')}
        >
          Wall
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'door' ? 'active' : ''}`}
          onClick={() => setActiveTool('door')}
        >
          Door
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'window' ? 'active' : ''}`}
          onClick={() => setActiveTool('window')}
        >
          Window
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'extrude' ? 'active' : ''}`}
          onClick={() => setActiveTool('extrude')}
        >
          Extrude
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'measure' ? 'active' : ''}`}
          onClick={() => setActiveTool('measure')}
        >
          Measure
        </button>
        <button
          className={`toolbar-btn ${activeTool === 'sketch' ? 'active' : ''}`}
          onClick={() => {
            setActiveTool('sketch')
            useSketchStore.getState().activateSketch()
          }}
        >
          Sketch
        </button>
        <button
          className="toolbar-btn"
          onClick={() => useSketchStore.getState().clearSketch()}
        >
          Clear Sketch
        </button>

        <div className="toolbar-separator" />

        <button
          className={`toolbar-btn ${showGrid ? 'active' : ''}`}
          onClick={toggleGrid}
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
      </div>

      {/* ---------- Viewport + Property Panel ---------- */}
      <div className="viewport-area">
        <div className="viewport">
          <Canvas
            camera={{ position: [5, 5, 5], fov: 50 }}
          >
            <color attach="background" args={['#1a1a2e']} />
            <Scene />
          </Canvas>
        </div>
        <PropertyPanel />
      </div>

      {/* ---------- Status Bar ---------- */}
      <div className="status-bar">
        <div className="status-bar-left">
          <span>{projectName}</span>
          <span>Tool: {activeTool}</span>
          {meshInfo && <span>{meshInfo}</span>}
        </div>
        <div className="status-bar-right">
          <span>View: {viewMode.toUpperCase()}</span>
          <span>{showGrid ? 'Grid ON' : 'Grid OFF'}</span>
          <span>{snapEnabled ? 'Snap ON' : 'Snap OFF'}</span>
          <span>{kernelStatus}</span>
        </div>
      </div>
    </div>
  )
}
