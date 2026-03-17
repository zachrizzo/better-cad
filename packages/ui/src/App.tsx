import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { useUIStore } from './stores/ui-store'
import { useDocumentStore } from './stores/document-store'
import { useMaterialStore } from './stores/material-store'
import { useKernel } from './hooks/useKernel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useUndo } from './hooks/useUndo'
import { useActiveDrawingSurface } from './hooks/useActiveDrawingSurface'
import { CadMesh } from './components/viewport/CadMesh'
import { WallPlane } from './components/viewport/WallPlane'
import { DrawingPlaneGuide } from './components/viewport/DrawingPlaneGuide'
import { DoorPlane } from './components/viewport/DoorPlane'
import { SlabTool } from './components/tools/SlabTool'
import { StairPlane } from './components/viewport/StairPlane'
import { WindowPlane } from './components/viewport/WindowPlane'
import { ColumnPlane } from './components/viewport/ColumnPlane'
import { BeamPlane } from './components/viewport/BeamPlane'
import { RoofPlane } from './components/viewport/RoofPlane'
import { SketchPlane } from './components/viewport/SketchPlane'
import { SectionPlane } from './components/viewport/SectionPlane'
import { CameraSync } from './components/viewport/CameraSync'
import { SectionView, SectionCutLine } from './components/viewport/SectionView'
import { ElevationCamera } from './components/viewport/ElevationCamera'
import { DimensionPlane, DimensionOverlay3D } from './components/tools/DimensionTool'
import { TextAnnotationPlane, TextAnnotationOverlay3D } from './components/viewport/TextAnnotationPlane'
import { FurniturePlane } from './components/viewport/FurniturePlane'
import { CabinetPlane } from './components/viewport/CabinetPlane'
import { Viewport3DInteractionLayer } from './components/viewport/Viewport3DInteractionLayer'
import { MeasurePlane } from './components/tools/MeasureTool'
import { PathMeasurePlane } from './components/tools/PathMeasureTool'
import { AreaMeasurePlane } from './components/tools/AreaMeasureTool'
import { AngleMeasurePlane } from './components/tools/AngleMeasureTool'
import { SpotElevationPlane, SpotElevationOverlay3D } from './components/tools/SpotElevationTool'
import { DimensionToolbar } from './components/panels/DimensionToolbar'
import { useAssociativeDimensions } from './hooks/useAssociativeDimensions'
import { SelectionGizmo } from './components/viewport/SelectionGizmo'
import { Elements3DGroup } from './components/viewport/elements3d/Elements3DGroup'
import { Viewport2D } from './components/viewport/Viewport2D'
import { PropertyPanel } from './components/layout/PropertyPanel'
import { ConstraintPanel } from './components/panels/ConstraintPanel'
import { ViewPanel } from './components/panels/ViewPanel'
import { LayerPanel } from './components/panels/LayerPanel'
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
  isFoundationElement,
  isRoofElement,
  isRoomElement,
  isStairElement,
  isWallElement,
  isWindowElement,
  useEntityStore,
} from './stores/entity-store'
import { syncEntitiesAndRegenerateMeshes } from './services/entity-regeneration'
import { autoJoinWalls } from './services/wall-cleanup'
import { detectRooms } from './services/room-detection'
import { ImportDialog } from './components/dialogs/ImportDialog'
import { ExportDialog } from './components/dialogs/ExportDialog'
import { ArrayDialog, type ArrayParams } from './components/dialogs/ArrayDialog'
import type { TessellatedMesh, WallElement } from './services/kernel-bridge'
import { downloadArrayBufferAsFile } from './utils/file-download'
import { linearArray, polarArray, isArrayableElement } from './services/array-tools'
import { setOpenArrayDialogCallback } from './hooks/useKeyboardShortcuts'
import {
  getEnabledMeasurementSnapModes,
  isMeasurementSnapTool,
  MEASUREMENT_SNAP_MODE_LABELS,
} from './utils/measurement-snap-settings'
import './App.css'

// Lazy-load ChatPanel + @anthropic-ai/sdk so they don't run during initial app render
const ChatPanel = lazy(() =>
  import('./components/panels/ChatPanel').then((m) => ({ default: m.ChatPanel })),
)

const TOOL_OPTIONS = [
  { tool: 'select', label: 'Select', title: 'Select entities', shortcut: 'Esc' },
  { tool: 'foundation', label: 'Foundation', title: 'Foundation tool', shortcut: 'H' },
  { tool: 'parking', label: 'Parking', title: 'Parking lot tool', shortcut: 'P' },
  { tool: 'wall', label: 'Wall', title: 'Wall tool', shortcut: 'W' },
  { tool: 'door', label: 'Door', title: 'Door tool', shortcut: 'D' },
  { tool: 'window', label: 'Window', title: 'Window tool', shortcut: 'N' },
  { tool: 'floor', label: 'Floor', title: 'Floor tool', shortcut: 'F' },
  { tool: 'stair', label: 'Stair', title: 'Stair tool', shortcut: 'S' },
  { tool: 'column', label: 'Column', title: 'Column tool', shortcut: 'C' },
  { tool: 'beam', label: 'Beam', title: 'Beam tool', shortcut: 'B' },
  { tool: 'roof', label: 'Roof', title: 'Roof tool', shortcut: 'O' },
  { tool: 'dimension', label: 'Dimension', title: 'Dimension tool', shortcut: 'A' },
  { tool: 'text', label: 'Text', title: 'Text annotation tool', shortcut: 'T' },
  { tool: 'sketch', label: 'Sketch', title: 'Sketch tool', shortcut: 'K' },
  { tool: 'furniture', label: 'Furniture', title: 'Furniture placement tool', shortcut: 'I' },
  { tool: 'plumbing', label: 'Plumbing', title: 'Plumbing fixture tool', shortcut: 'U' },
  { tool: 'electrical', label: 'Electrical', title: 'Electrical symbol tool', shortcut: 'E' },
  { tool: 'cabinet', label: 'Cabinet', title: 'Kitchen cabinet tool', shortcut: 'J' },
  { tool: 'hvac', label: 'HVAC', title: 'HVAC element tool', shortcut: 'V' },
  { tool: 'fire_safety', label: 'Fire Safety', title: 'Fire safety element tool', shortcut: 'G' },
  { tool: 'accessibility', label: 'Access.', title: 'Accessibility element tool', shortcut: 'Y' },
  { tool: 'measure', label: 'Measure', title: 'Measure tool', shortcut: 'M' },
  { tool: 'measure_path', label: 'Path', title: 'Cumulative path measurement', shortcut: '' },
  { tool: 'measure_area', label: 'Area', title: 'Polygon area measurement', shortcut: '' },
  { tool: 'measure_angle', label: 'Angle', title: '3-point angle measurement', shortcut: '' },
  { tool: 'spot_elevation', label: 'Spot Elev', title: 'Spot elevation callout', shortcut: '' },
  { tool: 'section', label: 'Section', title: 'Section cut tool', shortcut: '-' },
] as const

const FOUNDATION_REQUIRED_TOOLS = ['wall', 'door', 'window', 'floor', 'stair', 'column', 'beam', 'roof'] as const

const LIGHTING_OPTIONS: readonly LightingPreset[] = ['daylight', 'evening', 'studio']

const LIGHTING_LABELS: Record<LightingPreset, string> = {
  daylight: 'Daylight',
  evening: 'Evening',
  studio: 'Studio',
}

const SIDE_PANEL_DEFAULT_WIDTH = 320
const SIDE_PANEL_MIN_WIDTH = 260
const SIDE_PANEL_MAX_WIDTH = 520

type MenuAction = {
  label: string
  onSelect: () => void
  title?: string
  hint?: string
  active?: boolean
  disabled?: boolean
}

type SaveFeedback = {
  id: number
  tone: 'info' | 'success' | 'error'
  message: string
}

function ViewportHint({
  heading,
  hint,
  measurementReadout,
}: {
  heading: string
  hint?: string | null
  measurementReadout?: string | null
}) {
  if (!hint && !measurementReadout) return null

  return (
    <div className="viewport-hint">
      <strong>{heading}</strong>
      {hint && <span>{hint}</span>}
      {measurementReadout && <span className="viewport-hint-metrics">{measurementReadout}</span>}
    </div>
  )
}

function HeaderMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div className="header-menu" ref={menuRef}>
      <button
        className={`toolbar-btn header-menu-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={`${label} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="header-menu-popover" role="menu" aria-label={`${label} menu`}>
          {actions.map((action) => (
            <button
              key={`${label}-${action.label}`}
              className={`header-menu-item${action.active ? ' active' : ''}`}
              onClick={() => {
                if (action.disabled) return
                action.onSelect()
                setOpen(false)
              }}
              title={action.title}
              disabled={action.disabled}
              role="menuitem"
            >
              <span>{action.label}</span>
              {action.hint && <span className="header-menu-hint">{action.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getDrawingPlaneHint(tool: string): string | null {
  if (tool === 'foundation') return 'Click to set one foundation corner, move cursor, then click opposite corner.'
  if (tool === 'parking') return 'Click to set one parking lot corner, move cursor, then click opposite corner.'
  if (tool === 'wall') return 'Click to start and keep clicking for chained walls. Hold Shift for orthogonal lock; right-click to end the chain.'
  if (tool === 'door') return 'Hover a wall to preview the door snap, then click to place.'
  if (tool === 'floor') return 'Click to set one floor corner, move cursor, then click opposite corner.'
  if (tool === 'stair') return 'Click stair start, then click stair run end. Hold Shift for orthogonal lock.'
  if (tool === 'measure') return 'Pick two points on the ground plane to measure distance.'
  if (tool === 'window') return 'Click on a wall to place a window.'
  if (tool === 'column') return 'Click on the ground plane to place a column.'
  if (tool === 'beam') return 'Click start point then end point to place a beam. Hold Shift for orthogonal lock.'
  if (tool === 'roof') return 'Click to set one roof corner, move cursor, then click opposite corner.'
  if (tool === 'dimension') return 'Click first point, then second point to place a persistent dimension line.'
  if (tool === 'text') return 'Click to place a text annotation, then type and press Enter.'
  if (tool === 'sketch') return 'Parametric sketch mode. Use sub-tools to draw lines, rectangles, circles. Apply constraints in the panel.'
  if (tool === 'section') return 'Click two points on the ground plane to define the section cut line.'
  if (tool === 'furniture') return 'Click to place furniture. Press R to rotate. Change type in Properties panel.'
  if (tool === 'plumbing') return 'Click to place plumbing fixture. Press R to rotate. Change type in Properties panel.'
  if (tool === 'electrical') return 'Click to place electrical symbol. Press R to rotate. Change type in Properties panel.'
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
  const wallsVisible = useSettingsStore((s) => s.wallsVisible)
  const lighting = LIGHTING_PRESETS[lightingPreset]
  const activeViewId = useViewStore((s) => s.activeViewId)
  const views = useViewStore((s) => s.views)
  const activeView = activeViewId ? views.get(activeViewId) ?? null : null
  const { activeSurfaceElevation } = useActiveDrawingSurface()
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

  const slabOffsetByLevel = useMemo(() => {
    const offsets = new Map<string, number>()
    for (const element of entityElements.values()) {
      if (!isFloorElement(element)) continue
      const levelId = element.meta.level_id
      if (!levelId) continue
      offsets.set(levelId, Math.max(offsets.get(levelId) ?? 0, element.thickness))
    }
    return offsets
  }, [entityElements])

  const elementLevelInfo = useMemo(() => {
    const info = new Map<string, { opacity: number; elevationOffset: number }>()
    for (const [id, el] of entityElements) {
      const levelId = el.meta.level_id
      if (levelId && levelMap.has(levelId)) {
        const lvl = levelMap.get(levelId)!
        const slabOffset = slabOffsetByLevel.get(levelId) ?? 0
        const surfaceOffset = (isWallElement(el) || isStairElement(el)) ? slabOffset : 0
        info.set(id, {
          opacity: opacityForVisibility(lvl.visibility),
          elevationOffset: lvl.elevation + surfaceOffset,
        })
      } else {
        info.set(id, { opacity: 1.0, elevationOffset: 0 })
      }
    }
    return info
  }, [entityElements, levelMap, slabOffsetByLevel])

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

      {/* Shadow-receiving ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <shadowMaterial opacity={0.15} />
      </mesh>

      {showGrid && (
        <Grid
          position={[0, activeSurfaceElevation + 0.001, 0]}
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
        const element = entityElements.get(id)
        if (!wallsVisible && element && isWallElement(element)) return null
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

      {/* 3D parametric elements (furniture, plumbing, electrical, HVAC, fire safety, accessibility) */}
      <Elements3DGroup elementLevelInfo={elementLevelInfo} />
      <Viewport3DInteractionLayer enabled={activeView == null} planeY={activeSurfaceElevation} />

      <DrawingPlaneGuide />
      <WallPlane />
      <DoorPlane />
      <SlabTool mode="3d" />
      <StairPlane />
      <WindowPlane />
      <ColumnPlane />
      <BeamPlane />
      <RoofPlane />
      <SketchPlane />
      <SectionPlane />
      <MeasurePlane />
      <PathMeasurePlane />
      <AreaMeasurePlane />
      <AngleMeasurePlane />
      <SpotElevationPlane />
      <SpotElevationOverlay3D />
      <DimensionPlane />
      <TextAnnotationPlane />
      <FurniturePlane />
      <CabinetPlane />
      <DimensionOverlay3D />
      <TextAnnotationOverlay3D />
      <SelectionGizmo />

      {/* Section/Elevation view support */}
      {activeView?.type === 'section' && <SectionView view={activeView} />}
      {activeView?.type === 'section' && <SectionCutLine view={activeView} />}
      {activeView?.type === 'elevation' && <ElevationCamera view={activeView} />}

      <OrbitControls makeDefault />
      <CameraSync />
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
  const activeRightTab = useUIStore((s) => s.activeRightTab)
  const setActiveRightTab = useUIStore((s) => s.setActiveRightTab)

  const cadMeshes = useDocumentStore((s) => s.cadMeshes)
  const clearCadMeshes = useDocumentStore((s) => s.clearCadMeshes)

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
  const defaultRoofAutoElevation = useBimStore((s) => s.defaultRoofAutoElevation)
  const defaultRoofType = useBimStore((s) => s.defaultRoofType)
  const defaultRoofPitchDegrees = useBimStore((s) => s.defaultRoofPitchDegrees)
  const defaultFurnitureType = useBimStore((s) => s.defaultFurnitureType)
  const defaultPlumbingType = useBimStore((s) => s.defaultPlumbingType)
  const defaultElectricalType = useBimStore((s) => s.defaultElectricalType)

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
  const { activeSurfaceElevation, slabOffset } = useActiveDrawingSurface()

  const setMaterials = useMaterialStore((s) => s.setMaterials)
  const measurementCursor = useMeasurementStore((s) => s.cursor)
  const toolReadout = useMeasurementStore((s) => s.toolReadout)
  const clearMeasurement = useMeasurementStore((s) => s.clear)
  const setToolReadout = useMeasurementStore((s) => s.setToolReadout)
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const lightingPreset = useSettingsStore((s) => s.lightingPreset)
  const measurementSnapSettings = useSettingsStore((s) => s.measurementSnapSettings)
  const setLightingPreset = useSettingsStore((s) => s.setLightingPreset)
  const wallsVisible = useSettingsStore((s) => s.wallsVisible)
  const toggleWallsVisible = useSettingsStore((s) => s.toggleWallsVisible)
  const activeViewId = useViewStore((s) => s.activeViewId)
  const activeViewName = useViewStore((s) => {
    if (!s.activeViewId) return null
    return s.views.get(s.activeViewId)?.name ?? null
  })
  const clearActiveView = useViewStore((s) => s.clearActiveView)
  const { kernel, ready, error: kernelError } = useKernel()
  useAssociativeDimensions(kernel)

  const [kernelStatus, setKernelStatus] = useState('loading...')
  const [meshInfo, setMeshInfo] = useState('')
  const [hoveredBodyId, setHoveredBodyId] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [arrayDialogOpen, setArrayDialogOpen] = useState(false)
  const [clearProjectConfirmOpen, setClearProjectConfirmOpen] = useState(false)
  const [clearProjectPending, setClearProjectPending] = useState(false)
  const [showSchedules, setShowSchedules] = useState(false)
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_DEFAULT_WIDTH)
  const [sidePanelResizing, setSidePanelResizing] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null)
  const toggleSchedules = useCallback(() => setShowSchedules((v) => !v), [])
  const loadInputRef = useRef<HTMLInputElement>(null)
  const sidePanelResizeStartXRef = useRef(0)
  const sidePanelResizeStartWidthRef = useRef(SIDE_PANEL_DEFAULT_WIDTH)
  const transientReadoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setTransientToolReadout = useCallback((msg: string, ms = 3000) => {
    if (transientReadoutTimerRef.current) clearTimeout(transientReadoutTimerRef.current)
    setToolReadout(msg)
    transientReadoutTimerRef.current = setTimeout(() => {
      setToolReadout(null)
      transientReadoutTimerRef.current = null
    }, ms)
  }, [setToolReadout])

  const showSaveFeedback = useCallback((tone: SaveFeedback['tone'], message: string) => {
    setSaveFeedback({
      id: Date.now(),
      tone,
      message,
    })
  }, [])

  useEffect(() => {
    if (!saveFeedback) return
    const timeoutId = window.setTimeout(() => {
      setSaveFeedback((current) => (current?.id === saveFeedback.id ? null : current))
    }, 3200)
    return () => window.clearTimeout(timeoutId)
  }, [saveFeedback])

  const handleSaveProject = useCallback(async () => {
    if (!kernel) {
      showSaveFeedback('error', 'Save failed: kernel is not ready.')
      return
    }
    if (savePending) {
      showSaveFeedback('info', 'Save already in progress...')
      return
    }

    const filename = `${projectName || 'project'}.bcad`
    setSavePending(true)
    showSaveFeedback('info', `Saving ${filename}...`)
    try {
      const data = await kernel.saveProject()
      if (data.byteLength === 0) {
        throw new Error('generated file is empty')
      }
      downloadArrayBufferAsFile(data, filename)
      showSaveFeedback('success', `Saved ${filename}`)
    } catch (err) {
      console.error('[BetterCAD] Save failed:', err)
      const message = err instanceof Error ? err.message : String(err)
      showSaveFeedback('error', `Save failed: ${message}`)
    } finally {
      setSavePending(false)
    }
  }, [kernel, projectName, savePending, showSaveFeedback])

  const handleLoadProject = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !kernel) return
    try {
      const buffer = await file.arrayBuffer()
      await kernel.loadProject(buffer)
      useEntityStore.getState().clearProject()
      clearCadMeshes()
      await syncEntitiesAndRegenerateMeshes(kernel)
    } catch (err) {
      console.error('[BetterCAD] Load failed:', err)
    }
    if (loadInputRef.current) loadInputRef.current.value = ''
  }, [clearCadMeshes, kernel])

  const handleClearProject = useCallback(async () => {
    if (clearProjectPending) return

    setClearProjectPending(true)
    try {
      if (!kernel) {
        useEntityStore.getState().clearProject()
        clearCadMeshes()
      } else {
        await kernel.resetProject(projectName || 'Prototype Project', 'm')
        const currentLevel = levels.find((l) => l.id === activeLevelId) ?? levels[0]
        if (currentLevel) {
          await kernel.createElement({
            kind: 'level',
            meta: {
              id: `level-${crypto.randomUUID()}`,
              name: currentLevel.name,
            },
            elevation: currentLevel.elevation,
          })
        }
        useEntityStore.getState().clearProject()
        clearCadMeshes()
        await syncEntitiesAndRegenerateMeshes(kernel)
      }

      useMeasurementStore.getState().clear()
      selectBody(null)
      setHoveredBodyId(null)
      clearActiveView()
      setActiveTool('select')
      setClearProjectConfirmOpen(false)
    } catch (err) {
      console.error('[BetterCAD] Clear project failed:', err)
    } finally {
      setClearProjectPending(false)
    }
  }, [
    activeLevelId,
    clearActiveView,
    clearCadMeshes,
    clearProjectPending,
    kernel,
    levels,
    projectName,
    selectBody,
    setActiveTool,
  ])

  const handleImport = useCallback(async (meshes: TessellatedMesh[]) => {
    const addCadMesh = useDocumentStore.getState().addCadMesh
    meshes.forEach((mesh, i) => {
      addCadMesh(`import-${Date.now()}-${i}`, mesh)
    })
  }, [])

  const handleImportedModelMutation = useCallback(async () => {
    if (!kernel) return
    await syncEntitiesAndRegenerateMeshes(kernel)
  }, [kernel])

  const { performUndo, performRedo } = useUndo()

  const ROOM_COLORS = ['#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#6366f1']

  const handleCleanUpWalls = async () => {
    if (!ready || !kernel) return
    setTransientToolReadout('Cleaning up walls...')
    try {
      const count = await autoJoinWalls(kernel, activeLevelId)
      setTransientToolReadout(count > 0 ? `${count} wall joints cleaned up.` : 'No wall cleanup needed.')
    } catch (err) {
      console.error('[BetterCAD] Wall cleanup failed:', err)
      setTransientToolReadout('Wall cleanup failed.')
    }
  }

  const handleDetectRooms = async () => {
    if (!ready || !kernel) return
    const allElements = useEntityStore.getState().elements
    const levelWalls = Array.from(allElements.values()).filter(
      (e): e is WallElement => isWallElement(e) && (!e.meta.level_id || e.meta.level_id === activeLevelId),
    )
    if (levelWalls.length < 3) {
      setTransientToolReadout('Detect Rooms needs at least 3 walls on the active level.')
      return
    }

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

  type ToolName = Parameters<typeof setActiveTool>[0]
  type ToolRuleState = {
    disabled: boolean
    reason?: string
    fallback?: ToolName
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
    () => Array.from(entityElements.values()).filter((el) => isFloorElement(el) && !el.meta.type_id),
    [entityElements],
  )
  const parkingLots = useMemo(
    () => Array.from(entityElements.values()).filter((el) => isFloorElement(el) && el.meta.type_id === 'parking_lot'),
    [entityElements],
  )
  const foundations = useMemo(
    () => Array.from(entityElements.values()).filter(isFoundationElement),
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

  const hasFoundationOnActiveLevel = useMemo(
    () => foundations.some((foundation) => !foundation.meta.level_id || foundation.meta.level_id === activeLevelId),
    [activeLevelId, foundations],
  )

  const isOnActiveLevel = useCallback((levelId?: string | null) => (
    !levelId || levelId === activeLevelId
  ), [activeLevelId])
  const wallCountOnActiveLevel = useMemo(
    () => walls.filter((wall) => isOnActiveLevel(wall.meta.level_id)).length,
    [isOnActiveLevel, walls],
  )
  const columnCountOnActiveLevel = useMemo(
    () => columnElements.filter((column) => isOnActiveLevel(column.meta.level_id)).length,
    [columnElements, isOnActiveLevel],
  )
  const beamCountOnActiveLevel = useMemo(
    () => beamElements.filter((beam) => isOnActiveLevel(beam.meta.level_id)).length,
    [beamElements, isOnActiveLevel],
  )

  const foundationRequiredToolSet = useMemo(
    () => new Set<ToolName>(FOUNDATION_REQUIRED_TOOLS as readonly ToolName[]),
    [],
  )
  const toolLabelByTool = useMemo(
    () => new Map(TOOL_OPTIONS.map((option) => [option.tool as ToolName, option.label])),
    [],
  )

  const toolRulesByTool = useMemo(() => {
    const rules = new Map<ToolName, ToolRuleState>()

    if (!hasFoundationOnActiveLevel) {
      const foundationReason = 'Add a foundation on this level before using structural tools.'
      for (const tool of foundationRequiredToolSet) {
        rules.set(tool, {
          disabled: true,
          reason: foundationReason,
          fallback: 'foundation',
        })
      }
      return rules
    }

    if (wallCountOnActiveLevel === 0) {
      const wallReason = 'Add at least one wall on this level before placing doors or windows.'
      rules.set('door', { disabled: true, reason: wallReason, fallback: 'wall' })
      rules.set('window', { disabled: true, reason: wallReason, fallback: 'wall' })
    }

    const beamSupportCountOnActiveLevel = wallCountOnActiveLevel + columnCountOnActiveLevel + beamCountOnActiveLevel
    if (beamSupportCountOnActiveLevel === 0) {
      rules.set('beam', {
        disabled: true,
        reason: 'Add a wall, column, or existing beam on this level before placing beams.',
        fallback: 'column',
      })
    }

    const roofSupportCountOnActiveLevel = wallCountOnActiveLevel + columnCountOnActiveLevel
    if (roofSupportCountOnActiveLevel === 0) {
      rules.set('roof', {
        disabled: true,
        reason: 'Add walls or columns on this level before creating a roof.',
        fallback: 'wall',
      })
    }

    return rules
  }, [
    beamCountOnActiveLevel,
    columnCountOnActiveLevel,
    foundationRequiredToolSet,
    hasFoundationOnActiveLevel,
    wallCountOnActiveLevel,
  ])

  const canDetectRooms = wallCountOnActiveLevel >= 3

  const handleToolChange = useCallback((tool: ToolName) => {
    const rule = toolRulesByTool.get(tool)
    if (rule?.disabled) {
      if (rule.fallback && rule.fallback !== tool) {
        setActiveTool(rule.fallback)
      }
      setTransientToolReadout(rule.reason ?? `${toolLabelByTool.get(tool) ?? tool} is not available right now.`)
      return
    }
    setActiveTool(tool)
  }, [setActiveTool, setTransientToolReadout, toolLabelByTool, toolRulesByTool])

  useEffect(() => {
    const activeRule = toolRulesByTool.get(activeTool)
    if (!activeRule?.disabled) return

    if (activeRule.fallback && activeRule.fallback !== activeTool) {
      setActiveTool(activeRule.fallback)
    }
    const message = activeRule.reason ?? `${toolLabelByTool.get(activeTool) ?? activeTool} is not available right now.`
    setTransientToolReadout(message)
  }, [activeTool, setActiveTool, setTransientToolReadout, toolLabelByTool, toolRulesByTool])

  useEffect(() => {
    if (wallsVisible || !selectedBodyId) return
    const selectedElement = entityElements.get(selectedBodyId)
    if (!selectedElement || !isWallElement(selectedElement)) return
    selectBody(null)
    setHoveredBodyId((current) => (current === selectedBodyId ? null : current))
  }, [entityElements, selectBody, selectedBodyId, wallsVisible])

  useKeyboardShortcuts({
    onSave: handleSaveProject,
    onLoad: () => loadInputRef.current?.click(),
    onToolSelect: handleToolChange,
  })

  // Register the array dialog opener for Ctrl+Shift+D
  useEffect(() => {
    setOpenArrayDialogCallback(() => setArrayDialogOpen(true))
    return () => setOpenArrayDialogCallback(null)
  }, [])

  const handleArrayApply = useCallback(async (params: ArrayParams) => {
    if (!kernel || !selectedBodyId) return
    const el = entityElements.get(selectedBodyId)
    if (!el || !isArrayableElement(el)) return
    try {
      if (params.type === 'linear') {
        await linearArray(el, {
          count: params.count,
          spacingX: params.spacingX,
          spacingY: params.spacingY,
        }, kernel)
      } else {
        await polarArray(el, {
          count: params.count,
          centerX: params.centerX,
          centerY: params.centerY,
          totalAngleDeg: params.totalAngle,
        }, kernel)
      }
    } catch (err) {
      console.error('[BetterCAD] Array failed:', err)
    }
    setArrayDialogOpen(false)
  }, [entityElements, kernel, selectedBodyId])

  const selectedElementForArray = selectedBodyId ? entityElements.get(selectedBodyId) : null
  const canArray = selectedElementForArray != null && isArrayableElement(selectedElementForArray)

  const viewportBackground = theme === 'light' ? '#edf2fa' : '#1a1a2e'
  const splitDividerColor = theme === 'light' ? '#d0d0d0' : '#3a3a50'
  const drawingPlaneHint = viewMode !== '2d' ? getDrawingPlaneHint(activeTool) : null
  const isSketchMode = activeTool === 'sketch'
  const drawingPlaneHeading = `Drawing Plane: ${activeLevel?.name ?? 'Ground'} (XZ), Y=${formatLength(activeSurfaceElevation, lengthUnit)}${slabOffset > 0 ? ' (on slab)' : ''}`
  const planViewHeading = `Plan View: ${activeLevel?.name ?? 'Ground'} (XY), Elevation Y=${formatLength(activeSurfaceElevation, lengthUnit)}`
  const measurementSnapModeText = useMemo(() => {
    if (!isMeasurementSnapTool(activeTool)) return null
    const enabledModes = getEnabledMeasurementSnapModes(measurementSnapSettings[activeTool], snapEnabled)
    if (enabledModes.length === 0) {
      return snapEnabled ? 'Snap Modes: None' : 'Snap Modes: Off'
    }
    return `Snap Modes: ${enabledModes.map((mode) => MEASUREMENT_SNAP_MODE_LABELS[mode]).join(', ')}`
  }, [activeTool, measurementSnapSettings, snapEnabled])

  const measurementReadout = useMemo(() => {
    const cursorText = measurementCursor
      ? `Cursor X:${formatLength(measurementCursor[0], lengthUnit)} Y:${formatLength(measurementCursor[1], lengthUnit)} Z:${formatLength(measurementCursor[2], lengthUnit)}`
      : null
    if (cursorText && toolReadout) return `${cursorText} • ${toolReadout}`
    return cursorText ?? toolReadout
  }, [lengthUnit, measurementCursor, toolReadout])

  useEffect(() => {
    clearMeasurement()
  }, [clearMeasurement, viewMode])

  useEffect(() => {
    setToolReadout(null)
  }, [activeTool, setToolReadout])

  const suppressViewportContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  const startSidePanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    sidePanelResizeStartXRef.current = event.clientX
    sidePanelResizeStartWidthRef.current = sidePanelWidth
    setSidePanelResizing(true)
  }, [sidePanelWidth])

  useEffect(() => {
    if (!sidePanelResizing) return

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    const handlePointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - sidePanelResizeStartXRef.current
      const nextWidth = Math.min(
        SIDE_PANEL_MAX_WIDTH,
        Math.max(SIDE_PANEL_MIN_WIDTH, sidePanelResizeStartWidthRef.current - deltaX),
      )
      setSidePanelWidth(nextWidth)
    }

    const stopResizing = () => {
      setSidePanelResizing(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }
  }, [sidePanelResizing])

  const fileMenuActions: MenuAction[] = [
    {
      label: 'Save Project',
      hint: 'Ctrl+S',
      title: 'Save project file',
      onSelect: () => void handleSaveProject(),
    },
    {
      label: 'Open Project',
      hint: 'Ctrl+O',
      title: 'Open .bcad file',
      onSelect: () => loadInputRef.current?.click(),
    },
    {
      label: 'Import Geometry',
      title: 'Import STEP or DXF',
      onSelect: () => setImportDialogOpen(true),
    },
    {
      label: 'Export Geometry',
      title: 'Export STEP, IFC, glTF, or DXF',
      onSelect: () => setExportDialogOpen(true),
    },
    {
      label: 'Clear Project...',
      title: 'Remove all project geometry after confirmation',
      onSelect: () => setClearProjectConfirmOpen(true),
    },
  ]

  const editMenuActions: MenuAction[] = [
    {
      label: 'Undo',
      hint: 'Ctrl+Z',
      onSelect: () => void performUndo(),
      disabled: undoStackLen === 0,
    },
    {
      label: 'Redo',
      hint: 'Ctrl+Shift+Z',
      onSelect: () => void performRedo(),
      disabled: redoStackLen === 0,
    },
    {
      label: 'Clean Up Walls',
      onSelect: () => void handleCleanUpWalls(),
      title: wallCountOnActiveLevel >= 2
        ? 'Auto-join wall endpoints and clean up intersections on active level'
        : 'Clean Up Walls needs at least 2 walls on the active level',
      disabled: wallCountOnActiveLevel < 2,
    },
    {
      label: 'Array...',
      hint: 'Ctrl+Shift+D',
      onSelect: () => setArrayDialogOpen(true),
      title: canArray
        ? 'Create a linear or polar array of the selected element'
        : 'Select an arrayable element first (wall, column, floor, etc.)',
      disabled: !canArray,
    },
    {
      label: 'Detect Rooms',
      onSelect: () => void handleDetectRooms(),
      title: canDetectRooms
        ? 'Auto-detect rooms from walls on active level'
        : 'Detect Rooms needs at least 3 walls on the active level',
      disabled: !canDetectRooms,
    },
  ]

  const drawMenuActions: MenuAction[] = TOOL_OPTIONS.map((option) => {
    const tool = option.tool as ToolName
    const rule = toolRulesByTool.get(tool)
    const blockedReason = rule?.disabled ? rule.reason : null
    const title = blockedReason ? `${option.title} • ${blockedReason}` : option.title

    return {
      label: option.label,
      hint: option.shortcut,
      title,
      active: activeTool === option.tool,
      disabled: Boolean(rule?.disabled),
      onSelect: () => handleToolChange(tool),
    }
  })

  const settingsMenuActions: MenuAction[] = [
    {
      label: 'Display Mode: 3D',
      active: viewMode === '3d',
      onSelect: () => setViewMode('3d'),
    },
    {
      label: 'Display Mode: 2D',
      active: viewMode === '2d',
      onSelect: () => setViewMode('2d'),
    },
    {
      label: 'Display Mode: Split',
      active: viewMode === 'split',
      onSelect: () => setViewMode('split'),
    },
    {
      label: showGrid ? 'Grid: On' : 'Grid: Off',
      hint: 'G',
      active: showGrid,
      onSelect: toggleGrid,
    },
    {
      label: wallsVisible ? 'Hide Walls (Interior View)' : 'Show Walls',
      active: !wallsVisible,
      onSelect: toggleWallsVisible,
      title: wallsVisible ? 'Hide structural walls in 3D to inspect interiors' : 'Show structural walls in 3D',
    },
    {
      label: snapEnabled ? 'Snap: On' : 'Snap: Off',
      active: snapEnabled,
      onSelect: toggleSnap,
    },
    {
      label: showSchedules ? 'Schedules: On' : 'Schedules: Off',
      active: showSchedules,
      onSelect: toggleSchedules,
    },
    ...(activeViewId
      ? [{
        label: 'Return to 3D from Active View',
        onSelect: clearActiveView,
        title: 'Exit active section/elevation view',
      }]
      : []),
    {
      label: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
      onSelect: toggleTheme,
    },
    ...LIGHTING_OPTIONS.map((preset) => ({
      label: `Lighting: ${LIGHTING_LABELS[preset]}`,
      active: lightingPreset === preset,
      onSelect: () => setLightingPreset(preset),
    })),
  ]

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

      {saveFeedback && (
        <div className={`file-save-feedback ${saveFeedback.tone}`} role="status" aria-live="polite">
          {saveFeedback.message}
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar-top-row">
          <div className="toolbar-brand-row">
            <span className="toolbar-title">BetterCAD Prototype</span>
            <span className="toolbar-meta-chip">Project: {projectName}</span>
            <span className="toolbar-meta-chip">Level: {activeLevel?.name ?? 'Ground'}</span>
          </div>
        </div>

        <div className="toolbar-nav-row">
          <div className="toolbar-menu-bar">
            <HeaderMenu label="File" actions={fileMenuActions} />
            <HeaderMenu label="Edit" actions={editMenuActions} />
            <HeaderMenu label="Draw" actions={drawMenuActions} />
            <HeaderMenu label="Settings" actions={settingsMenuActions} />
          </div>
        </div>
      </div>

      {/* Sketch sub-toolbar */}
      {isSketchMode && <SketchToolbar />}
      {activeTool === 'dimension' && <DimensionToolbar />}

      <div className="viewport-area">
        {viewMode === '2d' ? (
          <div className="viewport" onContextMenu={suppressViewportContextMenu}>
            <Viewport2D background={viewportBackground} />
            <ViewportHint
              heading={planViewHeading}
              measurementReadout={measurementReadout}
            />
          </div>
        ) : viewMode === 'split' ? (
          <>
            <div className="viewport" style={{ flex: 1 }} onContextMenu={suppressViewportContextMenu}>
              <Viewport2D background={viewportBackground} />
              <ViewportHint
                heading={planViewHeading}
                measurementReadout={measurementReadout}
              />
            </div>
            <div
              className="viewport"
              style={{ flex: 1, borderLeft: `1px solid ${splitDividerColor}` }}
              onContextMenu={suppressViewportContextMenu}
            >
              <Canvas
                shadows
                gl={{ preserveDrawingBuffer: true }}
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
              <ViewportHint
                heading={drawingPlaneHeading}
                hint={drawingPlaneHint}
                measurementReadout={measurementReadout}
              />
            </div>
          </>
        ) : (
          <div className="viewport" onContextMenu={suppressViewportContextMenu}>
            <Canvas
              shadows
              gl={{ preserveDrawingBuffer: true }}
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
            <ViewportHint
              heading={drawingPlaneHeading}
              hint={drawingPlaneHint}
              measurementReadout={measurementReadout}
            />
          </div>
        )}
        <div
          className={`side-panel-resize-handle${sidePanelResizing ? ' dragging' : ''}`}
          onPointerDown={startSidePanelResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side panel"
          title="Drag to resize side panel"
        />
        <aside className="side-panel-shell" style={{ width: sidePanelWidth }}>
          {!isSketchMode && (
            <div className="side-panel-tabs">
              <button
                className={`side-panel-tab${activeRightTab === 'properties' ? ' active' : ''}`}
                onClick={() => setActiveRightTab('properties')}
              >
                Properties
              </button>
              <button
                className={`side-panel-tab${activeRightTab === 'view' ? ' active' : ''}`}
                onClick={() => setActiveRightTab('view')}
              >
                View
              </button>
              <button
                className={`side-panel-tab${activeRightTab === 'layers' ? ' active' : ''}`}
                onClick={() => setActiveRightTab('layers')}
              >
                Layers
              </button>
              <button
                className={`side-panel-tab${activeRightTab === 'chat' ? ' active' : ''}`}
                onClick={() => setActiveRightTab('chat')}
              >
                ✨ AI Chat
              </button>
            </div>
          )}
          <div className="side-panel-content">
            {isSketchMode ? (
              <ConstraintPanel />
            ) : activeRightTab === 'properties' ? (
              <PropertyPanel />
            ) : activeRightTab === 'view' ? (
              <ViewPanel />
            ) : activeRightTab === 'layers' ? (
              <LayerPanel />
            ) : null}
            {/* ChatPanel always mounted — hidden via CSS to preserve state */}
            <Suspense fallback={<div className="chat-loading">Loading AI Chat...</div>}>
              {kernel && <ChatPanel kernel={kernel} visible={!isSketchMode && activeRightTab === 'chat'} />}
            </Suspense>
          </div>
        </aside>
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
        onModelChanged={handleImportedModelMutation}
      />

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        kernel={kernel}
      />

      <ArrayDialog
        open={arrayDialogOpen}
        onClose={() => setArrayDialogOpen(false)}
        onApply={(params) => void handleArrayApply(params)}
        elementName={selectedElementForArray?.meta.name ?? 'Element'}
      />

      {clearProjectConfirmOpen && (
        <div
          className="dialog-overlay"
          onClick={() => {
            if (!clearProjectPending) setClearProjectConfirmOpen(false)
          }}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Clear Project?</h3>
            <p>This removes all model elements and imported geometry from the current project.</p>
            <p>This action cannot be undone.</p>
            <div className="dialog-actions">
              <button onClick={() => setClearProjectConfirmOpen(false)} disabled={clearProjectPending}>
                Cancel
              </button>
              <button className="dialog-btn-danger" onClick={() => void handleClearProject()} disabled={clearProjectPending}>
                {clearProjectPending ? 'Clearing...' : 'Clear Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSchedules && <SchedulePanel onClose={toggleSchedules} />}

      <div className="status-bar">
        <div className="status-bar-left">
          <span>{projectName}</span>
          <span>Tool: {activeTool}</span>
          {meshInfo && <span>{meshInfo}</span>}
          {measurementReadout && <span>{measurementReadout}</span>}
          {walls.length > 0 && <span>Walls: {walls.length}</span>}
          {doors.length > 0 && <span>Doors: {doors.length}</span>}
          {foundations.length > 0 && <span>Foundations: {foundations.length}</span>}
          {parkingLots.length > 0 && <span>Parking Lots: {parkingLots.length}</span>}
          {floors.length > 0 && <span>Floors: {floors.length}</span>}
          {stairs.length > 0 && <span>Stairs: {stairs.length}</span>}
          {windowElements.length > 0 && <span>Windows: {windowElements.length}</span>}
          {columnElements.length > 0 && <span>Columns: {columnElements.length}</span>}
          {beamElements.length > 0 && <span>Beams: {beamElements.length}</span>}
          {roofElements.length > 0 && <span>Roofs: {roofElements.length}</span>}
          {roomElements.length > 0 && <span>Rooms: {roomElements.length}</span>}
          {selectedBodyId && <span>Selected: {selectedBodyId} (Del remove | Ctrl+D copy | Ctrl+Shift+D array | R rotate | drag gizmo to move)</span>}
          {measurementSnapModeText && <span>{measurementSnapModeText}</span>}
          {activeTool === 'measure' && <span>Click two points to measure</span>}
          {activeTool === 'measure_path' && <span>Click points to measure cumulative path (right-click to finish)</span>}
          {activeTool === 'measure_area' && <span>Click to define polygon area (click near first point to close)</span>}
          {activeTool === 'measure_angle' && <span>Click 3 points: A, vertex B, C to measure angle</span>}
          {activeTool === 'spot_elevation' && <span>Click to place elevation marker</span>}
          {activeTool === 'foundation' && <span>Place a foundation slab first; other structural tools require support.</span>}
          {activeTool === 'door' && <span>Hover a wall, preview snap, then click to place door - swing:{defaultDoorSwing}</span>}
          {activeTool === 'window' && <span>Hover a wall, then click to place a window</span>}
          {activeTool === 'floor' && <span>Click two opposite corners to place a rectangular slab - T:{formatLength(defaultFloorThickness, lengthUnit)}</span>}
          {activeTool === 'parking' && <span>Click two opposite corners to place a rectangular parking lot slab - T:{formatLength(defaultFloorThickness, lengthUnit)}</span>}
          {activeTool === 'stair' && <span>Click start then end of stair run - W:{formatLength(defaultStairWidth, lengthUnit)} R:{defaultStairRisers} H:{formatLength(defaultStairHeight, lengthUnit)}</span>}
          {activeTool === 'column' && <span>Click to place column - W:{formatLength(defaultColumnWidth, lengthUnit)} D:{formatLength(defaultColumnDepth, lengthUnit)} H:{formatLength(defaultColumnHeight, lengthUnit)}</span>}
          {activeTool === 'beam' && <span>Click start then end - W:{formatLength(defaultBeamWidth, lengthUnit)} D:{formatLength(defaultBeamDepth, lengthUnit)} Elev:{formatLength(defaultBeamElevation, lengthUnit)}</span>}
          {activeTool === 'roof' && (
            <span>
              Click two opposite corners - {defaultRoofType} Pitch:{defaultRoofPitchDegrees.toFixed(0)}° T:{formatLength(defaultRoofThickness, lengthUnit)} Elev:{formatLength(defaultRoofElevation, lengthUnit)}{defaultRoofAutoElevation ? ' (auto)' : ''}
            </span>
          )}
          {activeTool === 'wall' && <span>Shift: orthogonal lock - Right-click: finish wall chain - H:{formatLength(defaultWallHeight, lengthUnit)} T:{formatLength(defaultWallThickness, lengthUnit)}</span>}
          {activeTool === 'sketch' && <span>Sketch: Pts:{sketchPoints.size} Ln:{sketchLines.size} Cstr:{sketchConstraints.size} [{sketchSolverStatus}]</span>}
          {activeTool === 'section' && <span>Click two points to define section cut line</span>}
          {activeTool === 'furniture' && <span>Click to place {defaultFurnitureType.replace(/_/g, ' ')} - R to rotate</span>}
          {activeTool === 'plumbing' && <span>Click to place {defaultPlumbingType.replace(/_/g, ' ')} - R to rotate</span>}
          {activeTool === 'electrical' && <span>Click to place {defaultElectricalType.replace(/_/g, ' ')} - R to rotate</span>}
          {activeViewName && <span>Active View: {activeViewName}</span>}
        </div>
        <div className="status-bar-right">
          <span>Level: {activeLevel?.name ?? 'Ground'}</span>
          <span>View: {viewMode.toUpperCase()}</span>
          <span>Units: {lengthUnit.toUpperCase()}</span>
          <span>{showGrid ? 'Grid ON' : 'Grid OFF'}</span>
          <span>{wallsVisible ? 'Walls ON' : 'Walls OFF'}</span>
          <span>{snapEnabled ? 'Snap ON' : 'Snap OFF'}</span>
          <span>{kernelStatus}</span>
        </div>
      </div>
    </div>
  )
}
