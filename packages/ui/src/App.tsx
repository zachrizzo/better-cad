import { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { useUIStore } from './stores/ui-store'
import { useDocumentStore } from './stores/document-store'
import { useKernel } from './hooks/useKernel'
import './App.css'

function Scene() {
  const showGrid = useUIStore((s) => s.showGrid)

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

      {/* Hardcoded demo box */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4a90d9" metalness={0.1} roughness={0.7} />
      </mesh>

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
  const { kernel, ready } = useKernel()
  const [kernelStatus, setKernelStatus] = useState('loading...')

  useEffect(() => {
    if (ready && kernel) {
      kernel.ping().then((result) => {
        setKernelStatus(`Kernel: ${result}`)
        console.log('[BetterCAD] Kernel ping:', result)
      })
    }
  }, [ready, kernel])

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

      {/* ---------- Viewport ---------- */}
      <div className="viewport">
        <Canvas
          camera={{ position: [5, 5, 5], fov: 50 }}
        >
          <color attach="background" args={['#1a1a2e']} />
          <Scene />
        </Canvas>
      </div>

      {/* ---------- Status Bar ---------- */}
      <div className="status-bar">
        <div className="status-bar-left">
          <span>{projectName}</span>
          <span>Tool: {activeTool}</span>
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
