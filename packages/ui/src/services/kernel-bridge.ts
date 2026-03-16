import type { PbrMaterial } from '../stores/material-store'

export interface TessellatedMesh {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export type ImportFormat = 'step' | 'dxf' | 'ifc'
export type ExportFormat = 'step' | 'dxf' | 'ifc' | 'gltf'
export type ModelFormat = ImportFormat | ExportFormat

export interface ElementMeta {
  id: string
  name: string
  level_id?: string | null
  host_id?: string | null
  type_id?: string | null
  parent_id?: string | null
  material_id?: string | null
  ifc_guid?: string | null
  classification?: string | null
  layer?: string
}

export interface WallElement {
  kind: 'wall'
  meta: ElementMeta
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
}

export type DoorType = 'single_swing' | 'double_swing' | 'sliding' | 'pocket' | 'bifold' | 'garage'
export type WindowType = 'fixed' | 'double_hung' | 'casement' | 'sliding' | 'awning' | 'bay'

export interface DoorElement {
  kind: 'door'
  meta: ElementMeta
  wall_id: string
  position_along_wall: number
  width: number
  height: number
  sill_height: number
  swing: 'left' | 'right'
  door_type?: DoorType
}

export interface WindowElement {
  kind: 'window'
  meta: ElementMeta
  wall_id: string
  position_along_wall: number
  width: number
  height: number
  sill_height: number
  window_type?: WindowType
}

export interface FloorElement {
  kind: 'floor'
  meta: ElementMeta
  boundary: [number, number][]
  thickness: number
}

export interface RoofElement {
  kind: 'roof'
  meta: ElementMeta
  boundary: [number, number][]
  thickness: number
  elevation: number
  auto_elevation: boolean
  roof_type: 'flat' | 'shed' | 'gable' | 'hip'
  pitch_degrees: number
  ridge_angle_degrees: number
}

export interface StairElement {
  kind: 'stair'
  meta: ElementMeta
  start: [number, number]
  end: [number, number]
  width: number
  risers: number
  total_height: number
  stair_type?: 'straight' | 'spiral'
  spiral_turns?: number
  side_wall_thickness?: number
}

export interface FoundationElement {
  kind: 'foundation'
  meta: ElementMeta
  boundary: [number, number][]
  thickness: number
}

export interface ColumnElement {
  kind: 'column'
  meta: ElementMeta
  center: [number, number]
  width: number
  depth: number
  height: number
}

export interface BeamElement {
  kind: 'beam'
  meta: ElementMeta
  start: [number, number, number]
  end: [number, number, number]
  width: number
  depth: number
}

export interface RoomElement {
  kind: 'room'
  meta: ElementMeta
  boundary: [number, number][]
  name: string
  color?: string
}

export interface DimensionElement {
  kind: 'dimension'
  meta: ElementMeta
  p1: [number, number]
  p2: [number, number]
  offset: number
  text_override?: string
  // Style & display
  dimension_mode?: 'aligned' | 'horizontal' | 'vertical' | 'chain' | 'baseline' | 'ordinate'
  style_id?: string
  terminator?: string
  text_placement?: 'above' | 'inline'
  extension_gap?: number
  extension_overshoot?: number
  is_reference?: boolean
  tolerance_plus?: number
  tolerance_minus?: number
  // Grouping
  chain_group_id?: string
  baseline_origin?: [number, number]
  ordinate_axis?: 'x' | 'y'
  ordinate_datum?: [number, number]
  // Associative anchors (for BIM-61)
  anchor1?: { element_id: string; anchor: string; face?: string }
  anchor2?: { element_id: string; anchor: string; face?: string }
}

export interface SpotElevationElement {
  kind: 'spot_elevation'
  meta: ElementMeta
  position: [number, number]
  elevation: number
  reference_level_id?: string
  symbol_style: 'circle' | 'triangle' | 'hexagon'
}

export interface TextAnnotationElement {
  kind: 'text_annotation'
  meta: ElementMeta
  position: [number, number]
  text: string
  font_size: number
  rotation: number
}

export interface LevelElement {
  kind: 'level'
  meta: ElementMeta
  elevation: number
}

export interface GenericElement {
  kind: string
  meta: ElementMeta
  [key: string]: unknown
}

export type ElectricalSymbolType = 'outlet' | 'switch' | 'light_fixture' | 'panel' | 'smoke_detector' | 'junction_box' | 'three_way_switch' | 'dimmer_switch' | 'gfci_outlet' | 'floor_outlet' | 'ceiling_fan' | 'thermostat' | 'recessed_light' | 'wall_sconce' | 'pendant_light' | 'track_light' | 'outdoor_light' | 'data_outlet' | 'timer_switch' | 'motion_sensor'
export type PlumbingSymbolType = 'toilet' | 'sink' | 'bathtub' | 'shower' | 'water_heater' | 'hose_bib' | 'floor_drain' | 'dishwasher' | 'washing_machine' | 'urinal' | 'double_sink' | 'bidet' | 'utility_sink' | 'pedestal_sink'
export type FurnitureSymbolType = 'desk' | 'chair' | 'table' | 'bed' | 'sofa' | 'dining_table' | 'bookshelf' | 'wardrobe' | 'toilet_stall' | 'reception_desk' | 'conference_table' | 'kitchen_island' | 'refrigerator' | 'stove' | 'washer' | 'dryer' | 'nightstand' | 'coffee_table' | 'tv_console' | 'console_table' | 'bench' | 'ottoman' | 'vanity' | 'microwave' | 'oven' | 'range_hood' | 'plant' | 'mirror' | 'fireplace' | 'coffee_maker' | 'artwork'
export type SiteDetailType = 'property_line' | 'setback' | 'tree' | 'parking_space' | 'sidewalk' | 'driveway' | 'compass' | 'contour_line' | 'fence' | 'retaining'
export type TagType = 'room' | 'door' | 'window' | 'wall' | 'column' | 'beam'
export type HatchPattern = 'concrete' | 'insulation' | 'earth' | 'wood' | 'brick' | 'steel' | 'gravel' | 'glass' | 'none'

export type HvacSymbolType = 'supply_vent' | 'return_vent' | 'thermostat' | 'exhaust_fan' | 'ductwork' | 'mini_split' | 'air_handler' | 'condensing_unit' | 'damper' | 'diffuser'
export type FireSafetySymbolType = 'fire_extinguisher' | 'sprinkler_head' | 'exit_sign' | 'pull_station' | 'smoke_alarm' | 'fire_alarm_panel' | 'fire_hose_cabinet' | 'annunciator'
export type AccessibilitySymbolType = 'wheelchair' | 'ramp' | 'grab_bar' | 'accessible_parking' | 'tactile_warning' | 'ada_restroom' | 'hearing_loop'

export interface ElectricalElement {
  kind: 'electrical'
  meta: ElementMeta
  symbol_type: ElectricalSymbolType
  position: [number, number]
  rotation: number
  circuit_id?: string
  connected_to?: string
}

export interface PlumbingElement {
  kind: 'plumbing'
  meta: ElementMeta
  symbol_type: PlumbingSymbolType
  position: [number, number]
  rotation: number
}

export interface FurnitureElement {
  kind: 'furniture'
  meta: ElementMeta
  symbol_type: FurnitureSymbolType
  position: [number, number]
  rotation: number
  width: number
  depth: number
}

export interface SiteDetailElement {
  kind: 'site_detail'
  meta: ElementMeta
  detail_type: SiteDetailType
  points: [number, number][]
  radius?: number
  elevation?: number
}

export interface LeaderAnnotationElement {
  kind: 'leader_annotation'
  meta: ElementMeta
  start: [number, number]
  end: [number, number]
  text: string
  arrow_type: string
}

export interface KeynoteElement {
  kind: 'keynote'
  meta: ElementMeta
  position: [number, number]
  keynote_id: string
  text: string
}

export interface TagElement {
  kind: 'tag'
  meta: ElementMeta
  position: [number, number]
  target_element_id: string
  tag_type: TagType
  auto_text: boolean
}

export interface HvacElement {
  kind: 'hvac'
  meta: ElementMeta
  symbol_type: HvacSymbolType
  position: [number, number]
  rotation: number
  width?: number
  depth?: number
}

export interface FireSafetyElement {
  kind: 'fire_safety'
  meta: ElementMeta
  symbol_type: FireSafetySymbolType
  position: [number, number]
  rotation: number
}

export interface AccessibilityElement {
  kind: 'accessibility'
  meta: ElementMeta
  symbol_type: AccessibilitySymbolType
  position: [number, number]
  rotation: number
  width?: number
  depth?: number
}

export type CabinetType = 'base' | 'upper' | 'tall' | 'corner_base' | 'corner_upper' | 'corner_tall' | 'sink_base' | 'lazy_susan' | 'blind_corner' | 'pantry' | 'drawer_base' | 'appliance_garage'

export interface CabinetElement {
  kind: 'cabinet'
  meta: ElementMeta
  cabinet_type: CabinetType
  position: [number, number]
  rotation: number
  width: number
  depth: number
  height: number
  wall_id?: string
  door_count: number
  drawer_count: number
}

export type PrototypeElement =
  | WallElement
  | DoorElement
  | WindowElement
  | FloorElement
  | RoofElement
  | FoundationElement
  | StairElement
  | ColumnElement
  | BeamElement
  | RoomElement
  | DimensionElement
  | TextAnnotationElement
  | LevelElement
  | ElectricalElement
  | PlumbingElement
  | FurnitureElement
  | SiteDetailElement
  | LeaderAnnotationElement
  | KeynoteElement
  | TagElement
  | HvacElement
  | FireSafetyElement
  | AccessibilityElement
  | CabinetElement
  | SpotElevationElement
  | GenericElement

export interface RegeneratedMesh extends TessellatedMesh {
  id: string
}

export interface FormatCapability {
  import: boolean
  export: boolean
}

export interface BackendCapabilities {
  formats: Record<ModelFormat, FormatCapability>
}

export interface ImportWarning {
  entity_id: number
  message: string
}

export interface ImportResult {
  meshes: TessellatedMesh[]
  stateMutated: boolean
  importedElementCount?: number
  warnings?: ImportWarning[]
}

export interface RegenOptions {
  includeKinds?: string[]
}

// --- Documentation view types ---

export interface PlanHatch {
  corners: [[number, number], [number, number], [number, number], [number, number]]
  element_id: string
}

export interface PlanSymbol {
  symbol_type: 'DoorSwing' | 'WindowGlazing'
  center: [number, number]
  angle: number
  radius: number
  element_id: string
}

export interface PlanRoomLabel {
  centroid: [number, number]
  name: string
  area: number
}

export interface EnrichedPlanViewData {
  wall_lines: Array<{ start: [number, number]; end: [number, number] }>
  wall_hatches: PlanHatch[]
  opening_symbols: PlanSymbol[]
  room_labels: PlanRoomLabel[]
}

export interface CutLine {
  start: [number, number]
  end: [number, number]
  element_id: string
  element_kind: string
}

export interface HatchPolygon {
  points: [number, number][]
  element_id: string
}

export interface SectionViewData {
  cut_lines: CutLine[]
  hatch_polygons: HatchPolygon[]
  view_width: number
  view_height: number
}

export interface ElevationLine {
  start: [number, number]
  end: [number, number]
  element_id: string
}

export interface ElevationViewData {
  lines: ElevationLine[]
  view_width: number
  view_height: number
}

export interface KernelBackend {
  getCapabilities(): Promise<BackendCapabilities>
  resetProject(name: string, units: string): Promise<void>
  createElement(element: PrototypeElement): Promise<string>
  updateElement(elementId: string, element: PrototypeElement): Promise<void>
  deleteElement(elementId: string): Promise<void>
  queryElements(): Promise<PrototypeElement[]>
  regenView(opts?: RegenOptions): Promise<RegeneratedMesh[]>
  createBox(width: number, height: number, depth: number): Promise<string>
  tessellate(bodyId: string): Promise<TessellatedMesh>
  createAndTessellateBox(width: number, height: number, depth: number): Promise<TessellatedMesh>
  extrudeSketchPoints(points: [number, number][], height: number): Promise<TessellatedMesh>
  addWall(startX: number, startY: number, endX: number, endY: number, height: number, thickness: number): Promise<TessellatedMesh>
  generatePlanView(wallsJson: string): Promise<string>
  generatePlanViewV2(): Promise<EnrichedPlanViewData>
  generateSectionCut(cutStartX: number, cutStartY: number, cutEndX: number, cutEndY: number, cutHeight: number): Promise<SectionViewData>
  generateElevation(direction: string): Promise<ElevationViewData>
  importModel(data: Uint8Array, format: ImportFormat): Promise<ImportResult>
  exportModel(format: ExportFormat): Promise<ArrayBuffer>
  /**
   * Legacy compatibility wrappers retained while callsites migrate.
   * New code should call importModel/exportModel.
   */
  importFile(data: Uint8Array, format: string): Promise<TessellatedMesh[]>
  exportFile(format: string): Promise<ArrayBuffer>
  getMaterialLibrary(): Promise<PbrMaterial[]>
  saveProject(projectJson?: string): Promise<ArrayBuffer>
  loadProject(data: ArrayBuffer): Promise<string>
  ping(): Promise<string>
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getKernel(): Promise<KernelBackend> {
  if (isTauri()) {
    const { TauriBackend } = await import('./tauri-backend')
    return new TauriBackend()
  }
  const { WasmBackend } = await import('./wasm-backend')
  const backend = new WasmBackend()
  await backend.initialize()
  return backend
}
