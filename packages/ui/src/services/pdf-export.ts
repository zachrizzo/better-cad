/**
 * Enhanced PDF Export for BetterCAD Construction Documents.
 *
 * Supports multi-sheet drawing sets with:
 * - Architectural and metric scales
 * - Professional lineweights
 * - Title blocks with project info and revision tracking
 * - Layer-aware sheet filtering (floor plan, electrical, plumbing, etc.)
 * - Door, window, and room schedules
 */
import { jsPDF } from 'jspdf'
import type {
  KernelBackend,
  PrototypeElement,
  WallElement,
  DoorElement,
  WindowElement,
  ColumnElement,
  RoomElement,
  DimensionElement,
  TextAnnotationElement,
  ElectricalElement,
  PlumbingElement,
  FurnitureElement,
  SiteDetailElement,
  TagElement,
  StairElement,
  FloorElement,
  BeamElement,
} from './kernel-bridge'
import {
  renderTitleBlockToPdf,
  getDrawableArea,
  getPaperSize,
  type ProjectInfo,
  type TitleBlockConfig,
  type PaperSizeKey,
  type SheetInfo,
} from './title-block'
import { downloadBlobAsFile } from '../utils/file-download'
import { formatDimensionText } from '../utils/units'
import {
  PDF_MONOCHROME_DEFAULT,
  type AnnotationDensity,
  type PlanSymbolProfileId,
} from '../standards/plan-symbol-profile'
import { drawSymbolPrimitivesPdf } from '../standards/renderers/pdf-symbol-renderer'
import { generateElectricalPrimitives } from '../standards/symbol-generators/electrical'
import { generatePlumbingPrimitives } from '../standards/symbol-generators/plumbing'
import { generateFurniturePrimitives } from '../standards/symbol-generators/furniture'

// ---------------------------------------------------------------------------
// Architectural Scales
// ---------------------------------------------------------------------------

export const ARCH_SCALES: Record<string, number> = {
  '1/8" = 1\'-0"':   1 / 96,
  '3/16" = 1\'-0"':  1 / 64,
  '1/4" = 1\'-0"':   1 / 48,
  '3/8" = 1\'-0"':   1 / 32,
  '1/2" = 1\'-0"':   1 / 24,
  '1" = 1\'-0"':     1 / 12,
  // Metric
  '1:200': 1 / 200,
  '1:100': 1 / 100,
  '1:50':  1 / 50,
  '1:20':  1 / 20,
}

export const SCALE_LABELS = Object.keys(ARCH_SCALES)

// ---------------------------------------------------------------------------
// Lineweight System (mm on paper)
// ---------------------------------------------------------------------------

const LINEWEIGHTS = {
  wall_cut:     0.50,
  wall_beyond:  0.25,
  door_window:  0.25,
  dimension:    0.18,
  extension:    0.13,
  hidden:       0.13,
  centerline:   0.09,
  hatch:        0.09,
  text_leader:  0.18,
  border:       1.00,
  border_inner: 0.25,
}

// ---------------------------------------------------------------------------
// Sheet Types and Layer Filters
// ---------------------------------------------------------------------------

export type SheetType =
  | 'floor_plan'
  | 'electrical_plan'
  | 'plumbing_plan'
  | 'reflected_ceiling'
  | 'site_plan'
  | 'elevations'
  | 'schedules'

export const SHEET_LABELS: Record<SheetType, string> = {
  floor_plan:        'Floor Plan',
  electrical_plan:   'Electrical Plan',
  plumbing_plan:     'Plumbing Plan',
  reflected_ceiling: 'Reflected Ceiling Plan',
  site_plan:         'Site Plan',
  elevations:        'Elevations',
  schedules:         'Schedules',
}

/** Layers visible per sheet type. */
const SHEET_LAYER_FILTERS: Record<SheetType, string[]> = {
  floor_plan:        ['A-WALL', 'A-DOOR', 'A-WIND', 'A-FLOR', 'A-STRS', 'A-COLS', 'G-DIMS', 'G-ANNO', 'G-TAGS'],
  electrical_plan:   ['A-WALL', 'A-DOOR', 'A-WIND', 'E-POWR', 'E-LITE', 'G-DIMS'],
  plumbing_plan:     ['A-WALL', 'A-DOOR', 'A-WIND', 'P-FIXT', 'G-DIMS'],
  reflected_ceiling: ['A-WALL', 'A-CLNG', 'E-LITE', 'G-DIMS'],
  site_plan:         ['L-SITE', 'A-WALL', 'G-ANNO'],
  elevations:        [],
  schedules:         [],
}

/** Map element kind to layer id. */
const KIND_TO_LAYER: Record<string, string> = {
  wall: 'A-WALL', door: 'A-DOOR', window: 'A-WIND', floor: 'A-FLOR',
  roof: 'A-ROOF', stair: 'A-STRS', column: 'A-COLS', beam: 'A-BEAM',
  foundation: 'A-FNDN', electrical: 'E-POWR', plumbing: 'P-FIXT',
  furniture: 'F-FURN', site_detail: 'L-SITE', dimension: 'G-DIMS',
  text_annotation: 'G-ANNO', leader_annotation: 'G-ANNO', keynote: 'G-ANNO',
  tag: 'G-TAGS', room: 'A-FLOR', level: 'A-FLOR',
}

// For electrical, further differentiate light vs power
function getElementLayer(el: PrototypeElement): string {
  if (el.kind === 'electrical') {
    const eEl = el as ElectricalElement
    const lightTypes = ['light_fixture', 'ceiling_fan']
    return lightTypes.includes(eEl.symbol_type) ? 'E-LITE' : 'E-POWR'
  }
  return el.meta.layer ?? KIND_TO_LAYER[el.kind] ?? ''
}

// ---------------------------------------------------------------------------
// Sheet number generation
// ---------------------------------------------------------------------------

const SHEET_NUMBER_PREFIX: Record<SheetType, string> = {
  floor_plan: 'A',
  electrical_plan: 'E',
  plumbing_plan: 'P',
  reflected_ceiling: 'A',
  site_plan: 'C',
  elevations: 'A',
  schedules: 'A',
}

function generateSheetNumber(sheetType: SheetType, index: number): string {
  const prefix = SHEET_NUMBER_PREFIX[sheetType] ?? 'A'
  const baseNum = sheetType === 'schedules' ? 600 : sheetType === 'elevations' ? 200 : 100
  return `${prefix}-${baseNum + index + 1}`
}

// ---------------------------------------------------------------------------
// Export Options
// ---------------------------------------------------------------------------

export interface PdfExportOptions {
  scale: string
  paperSize: PaperSizeKey
  sheets: SheetType[]
  projectInfo: ProjectInfo
  units: 'imperial' | 'metric'
  includeSchedules: boolean
  planSymbolProfile?: PlanSymbolProfileId
  annotationDensity?: AnnotationDensity
  showFurnitureLabels?: boolean
  showMepText?: boolean
  monochromeSymbols?: boolean
}

/** Legacy options kept for backward compatibility. */
export interface LegacyPdfExportOptions {
  projectName: string
  includePlan: boolean
  includeSections: boolean
  includeElevations: boolean
  includeSchedules: boolean
  scale: string
}

// ---------------------------------------------------------------------------
// Core Export Function
// ---------------------------------------------------------------------------

/**
 * Generate a complete construction document PDF and trigger browser download.
 */
export async function exportConstructionDocuments(
  kernel: KernelBackend,
  options: PdfExportOptions,
): Promise<void> {
  const elements = await kernel.queryElements()
  const paper = getPaperSize(options.paperSize)

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [paper.width, paper.height],
  })

  let pageAdded = false
  let sheetIndex = 0

  for (const sheetType of options.sheets) {
    if (sheetType === 'schedules') {
      // Schedule sheets
      if (pageAdded) doc.addPage([paper.width, paper.height], 'landscape')
      pageAdded = true

      const sheetInfo: SheetInfo = {
        sheetNumber: generateSheetNumber(sheetType, sheetIndex),
        sheetTitle: 'SCHEDULES',
        scale: 'N/A',
        revisions: [],
      }
      const tbConfig: TitleBlockConfig = {
        project: options.projectInfo,
        sheet: sheetInfo,
        paperSize: options.paperSize,
      }
      renderTitleBlockToPdf(doc, tbConfig)
      const area = getDrawableArea(tbConfig)
      drawScheduleSheets(doc, elements, area, options.units)
      sheetIndex++
      continue
    }

    if (sheetType === 'elevations') {
      if (pageAdded) doc.addPage([paper.width, paper.height], 'landscape')
      pageAdded = true

      const sheetInfo: SheetInfo = {
        sheetNumber: generateSheetNumber(sheetType, sheetIndex),
        sheetTitle: 'ELEVATIONS',
        scale: options.scale,
        revisions: [],
      }
      const tbConfig: TitleBlockConfig = {
        project: options.projectInfo,
        sheet: sheetInfo,
        paperSize: options.paperSize,
      }
      renderTitleBlockToPdf(doc, tbConfig)
      const area = getDrawableArea(tbConfig)
      drawElevationsPlaceholder(doc, area)
      sheetIndex++
      continue
    }

    // Drawing sheets (floor plan, electrical, plumbing, reflected ceiling, site plan)
    if (pageAdded) doc.addPage([paper.width, paper.height], 'landscape')
    pageAdded = true

    const visibleLayers = SHEET_LAYER_FILTERS[sheetType]
    const filtered = elements.filter((el) => {
      const layer = getElementLayer(el)
      return visibleLayers.includes(layer)
    })

    const sheetInfo: SheetInfo = {
      sheetNumber: generateSheetNumber(sheetType, sheetIndex),
      sheetTitle: SHEET_LABELS[sheetType].toUpperCase(),
      scale: options.scale,
      revisions: [],
    }
    const tbConfig: TitleBlockConfig = {
      project: options.projectInfo,
      sheet: sheetInfo,
      paperSize: options.paperSize,
    }

    renderTitleBlockToPdf(doc, tbConfig)
    const area = getDrawableArea(tbConfig)

    // Use thin lineweight for walls on non-floor-plan sheets
    const thinWalls = sheetType !== 'floor_plan'
    const dashedWalls = sheetType === 'reflected_ceiling'

    drawPlanElements(doc, filtered, elements, options.scale, area, options.units, thinWalls, dashedWalls, {
      planSymbolProfile: options.planSymbolProfile ?? 'open_us_v1',
      annotationDensity: options.annotationDensity ?? 'minimal',
      showFurnitureLabels: options.showFurnitureLabels ?? false,
      showMepText: options.showMepText ?? false,
      monochromeSymbols: options.monochromeSymbols ?? PDF_MONOCHROME_DEFAULT,
    })
    sheetIndex++
  }

  if (!pageAdded) {
    // No sheets selected; output at least an empty page
    doc.setFontSize(12)
    doc.text('No sheets selected for export.', 20, 30)
  }

  const blob = doc.output('blob')
  downloadBlobAsFile(blob, `${options.projectInfo.projectName.replace(/\s+/g, '_')}_CD.pdf`)
}

// ---------------------------------------------------------------------------
// Legacy wrapper (preserves backward compatibility)
// ---------------------------------------------------------------------------

export async function exportToPdf(
  kernel: KernelBackend,
  options: LegacyPdfExportOptions,
): Promise<Blob> {
  const sheets: SheetType[] = []
  if (options.includePlan) sheets.push('floor_plan')
  if (options.includeElevations) sheets.push('elevations')
  if (options.includeSchedules) sheets.push('schedules')

  const projectInfo: ProjectInfo = {
    projectName: options.projectName,
    projectAddress: '',
    clientName: '',
    architectName: '',
    architectLicense: '',
    date: new Date().toLocaleDateString(),
    projectNumber: '',
  }

  const elements = await kernel.queryElements()
  const paper = getPaperSize('LETTER')

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [paper.width, paper.height],
  })

  let pageAdded = false

  if (options.includePlan) {
    const tbConfig: TitleBlockConfig = {
      project: projectInfo,
      sheet: {
        sheetNumber: 'A-101',
        sheetTitle: 'FLOOR PLAN',
        scale: options.scale,
        revisions: [],
      },
      paperSize: 'LETTER',
    }
    renderTitleBlockToPdf(doc, tbConfig)
    const area = getDrawableArea(tbConfig)
    drawPlanElements(doc, elements, elements, options.scale, area, 'metric', false, false, {
      planSymbolProfile: 'open_us_v1',
      annotationDensity: 'minimal',
      showFurnitureLabels: false,
      showMepText: false,
      monochromeSymbols: PDF_MONOCHROME_DEFAULT,
    })
    pageAdded = true
  }

  if (options.includeSections) {
    if (pageAdded) doc.addPage([paper.width, paper.height], 'landscape')
    const tbConfig: TitleBlockConfig = {
      project: projectInfo,
      sheet: { sheetNumber: 'A-201', sheetTitle: 'SECTIONS', scale: options.scale, revisions: [] },
      paperSize: 'LETTER',
    }
    renderTitleBlockToPdf(doc, tbConfig)
    const area = getDrawableArea(tbConfig)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text('Section views generated from 3D model', area.left + 10, area.top + 20)
    doc.setTextColor(0)
    pageAdded = true
  }

  if (options.includeElevations) {
    if (pageAdded) doc.addPage([paper.width, paper.height], 'landscape')
    const tbConfig: TitleBlockConfig = {
      project: projectInfo,
      sheet: { sheetNumber: 'A-301', sheetTitle: 'ELEVATIONS', scale: options.scale, revisions: [] },
      paperSize: 'LETTER',
    }
    renderTitleBlockToPdf(doc, tbConfig)
    const area = getDrawableArea(tbConfig)
    drawElevationsPlaceholder(doc, area)
    pageAdded = true
  }

  if (options.includeSchedules) {
    if (pageAdded) doc.addPage([paper.width, paper.height], 'landscape')
    const tbConfig: TitleBlockConfig = {
      project: projectInfo,
      sheet: { sheetNumber: 'A-601', sheetTitle: 'SCHEDULES', scale: 'N/A', revisions: [] },
      paperSize: 'LETTER',
    }
    renderTitleBlockToPdf(doc, tbConfig)
    const area = getDrawableArea(tbConfig)
    drawScheduleSheets(doc, elements, area, 'metric')
    pageAdded = true
  }

  if (!pageAdded) {
    doc.setFontSize(10)
    doc.text('No content selected.', 20, 30)
  }

  return doc.output('blob')
}

// ---------------------------------------------------------------------------
// Scale helpers
// ---------------------------------------------------------------------------

function getScaleFactor(scaleStr: string): number {
  if (ARCH_SCALES[scaleStr] !== undefined) return ARCH_SCALES[scaleStr]
  // Parse metric "1:N" format
  const parts = scaleStr.split(':')
  if (parts.length === 2) {
    const n = parseFloat(parts[1])
    if (n > 0) return 1 / n
  }
  return 1 / 100 // default
}

// ---------------------------------------------------------------------------
// Drawing area coordinate transforms
// ---------------------------------------------------------------------------

interface ViewportTransform {
  toPageX: (worldX: number) => number
  toPageY: (worldY: number) => number
  fitScale: number
  pxPerUnit: number
}

function computeViewport(
  elements: PrototypeElement[],
  scaleStr: string,
  area: { left: number; top: number; width: number; height: number },
): ViewportTransform | null {
  // Find bounding box of all positionable elements
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  function expand(x: number, y: number) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  for (const el of elements) {
    switch (el.kind) {
      case 'wall': {
        const w = el as WallElement
        expand(w.start[0], w.start[1])
        expand(w.end[0], w.end[1])
        break
      }
      case 'column': {
        const c = el as ColumnElement
        expand(c.center[0] - c.width / 2, c.center[1] - c.depth / 2)
        expand(c.center[0] + c.width / 2, c.center[1] + c.depth / 2)
        break
      }
      case 'stair': {
        const s = el as StairElement
        expand(s.start[0], s.start[1])
        expand(s.end[0], s.end[1])
        break
      }
      case 'beam': {
        const b = el as BeamElement
        expand(b.start[0], b.start[1])
        expand(b.end[0], b.end[1])
        break
      }
      case 'room':
      case 'floor':
      case 'foundation': {
        const withBoundary = el as RoomElement | FloorElement
        if ('boundary' in withBoundary && Array.isArray(withBoundary.boundary)) {
          for (const p of withBoundary.boundary) {
            expand(p[0], p[1])
          }
        }
        break
      }
      case 'electrical': {
        const ee = el as ElectricalElement
        expand(ee.position[0], ee.position[1])
        break
      }
      case 'plumbing': {
        const pe = el as PlumbingElement
        expand(pe.position[0], pe.position[1])
        break
      }
      case 'furniture': {
        const fe = el as FurnitureElement
        expand(fe.position[0] - fe.width / 2, fe.position[1] - fe.depth / 2)
        expand(fe.position[0] + fe.width / 2, fe.position[1] + fe.depth / 2)
        break
      }
      case 'site_detail': {
        const se = el as SiteDetailElement
        for (const p of se.points) {
          expand(p[0], p[1])
        }
        break
      }
      case 'dimension': {
        const d = el as DimensionElement
        expand(d.p1[0], d.p1[1])
        expand(d.p2[0], d.p2[1])
        break
      }
      default:
        break
    }
  }

  if (!isFinite(minX)) return null

  // Scale factor: at the nominal scale, 1 model unit -> scaleFactor * 1000 mm on paper
  const scaleFactor = getScaleFactor(scaleStr)
  const pxPerUnit = scaleFactor * 1000 // mm per model unit on paper

  const modelW = (maxX - minX) * pxPerUnit
  const modelH = (maxY - minY) * pxPerUnit

  // Fit to drawable area with 5mm padding
  const pad = 5
  const fitScale = Math.min(
    (area.width - 2 * pad) / Math.max(modelW, 1),
    (area.height - 2 * pad) / Math.max(modelH, 1),
    1,
  )

  const offsetX = area.left + pad + (area.width - 2 * pad - modelW * fitScale) / 2
  const offsetY = area.top + pad + (area.height - 2 * pad - modelH * fitScale) / 2

  return {
    toPageX: (x: number) => offsetX + (x - minX) * pxPerUnit * fitScale,
    toPageY: (y: number) => offsetY + (maxY - y) * pxPerUnit * fitScale,
    fitScale,
    pxPerUnit,
  }
}

// ---------------------------------------------------------------------------
// Text sizing relative to drawing scale
// ---------------------------------------------------------------------------

function textSizeMm(mmOnPaper: number, fitScale: number): number {
  // Convert mm-on-paper to jsPDF font size (points). 1pt = 0.353mm
  return Math.max((mmOnPaper * fitScale) / 0.353, 4)
}

// ---------------------------------------------------------------------------
// Draw Plan Elements
// ---------------------------------------------------------------------------

function drawPlanElements(
  doc: jsPDF,
  filteredElements: PrototypeElement[],
  allElements: PrototypeElement[],
  scaleStr: string,
  area: { left: number; top: number; width: number; height: number },
  _units: string,
  thinWalls: boolean,
  dashedWalls: boolean,
  symbolOptions: {
    planSymbolProfile: PlanSymbolProfileId
    annotationDensity: AnnotationDensity
    showFurnitureLabels: boolean
    showMepText: boolean
    monochromeSymbols: boolean
  },
): void {
  const vp = computeViewport(filteredElements, scaleStr, area)
  if (!vp) return
  const { toPageX, toPageY, fitScale, pxPerUnit } = vp
  const showElementTags = symbolOptions.annotationDensity !== 'minimal'

  // --- Draw Walls ---
  for (const el of filteredElements) {
    if (el.kind !== 'wall') continue
    const w = el as WallElement
    const dx = w.end[0] - w.start[0]
    const dy = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-8) continue
    const nx = (-dy / len) * w.thickness / 2
    const ny = (dx / len) * w.thickness / 2

    const corners = [
      [w.start[0] + nx, w.start[1] + ny],
      [w.end[0] + nx, w.end[1] + ny],
      [w.end[0] - nx, w.end[1] - ny],
      [w.start[0] - nx, w.start[1] - ny],
    ]

    doc.setDrawColor(0)
    doc.setLineWidth(thinWalls ? LINEWEIGHTS.wall_beyond : LINEWEIGHTS.wall_cut)

    if (dashedWalls) {
      // Draw dashed wall outlines
      doc.setLineDashPattern([2, 1.5], 0)
    }

    doc.setFillColor(220, 220, 220)
    const path = corners.map(([x, y]) => [toPageX(x), toPageY(y)])
    doc.lines(
      path.slice(1).map((p, i) => [p[0] - path[i][0], p[1] - path[i][1]]),
      path[0][0], path[0][1],
      [1, 1], dashedWalls ? 'S' : 'FD', true,
    )

    if (dashedWalls) {
      doc.setLineDashPattern([], 0)
    }
  }

  // --- Draw Doors ---
  doc.setLineWidth(LINEWEIGHTS.door_window)
  for (const el of filteredElements) {
    if (el.kind !== 'door') continue
    const d = el as DoorElement
    const wall = allElements.find(
      (w): w is WallElement => w.kind === 'wall' && w.meta.id === d.wall_id,
    )
    if (!wall) continue
    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const wLen = Math.hypot(dx, dy)
    if (wLen < 1e-8) continue

    const ux = dx / wLen
    const uy = dy / wLen
    const cx = wall.start[0] + ux * d.position_along_wall * wLen
    const cy = wall.start[1] + uy * d.position_along_wall * wLen
    const px = toPageX(cx)
    const py = toPageY(cy)
    const r = d.width * pxPerUnit * fitScale / 2

    // Draw arc swing
    doc.setDrawColor(100, 100, 100)
    const startAngle = Math.atan2(-dy, dx) * (180 / Math.PI)
    const swing = d.swing === 'left' ? 90 : -90
    // Simplified: draw a quarter-circle for the door swing
    doc.circle(px, py, Math.max(r, 0.5), 'S')

    // Draw opening gap as white rectangle over the wall
    const gapHalfW = d.width / 2
    const gx1 = cx - ux * gapHalfW
    const gy1 = cy - uy * gapHalfW
    const gx2 = cx + ux * gapHalfW
    const gy2 = cy + uy * gapHalfW
    const nx = (-uy) * wall.thickness / 2
    const ny2 = ux * wall.thickness / 2
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(255, 255, 255)
    const gapCorners = [
      [toPageX(gx1 + nx), toPageY(gy1 + ny2)],
      [toPageX(gx2 + nx), toPageY(gy2 + ny2)],
      [toPageX(gx2 - nx), toPageY(gy2 - ny2)],
      [toPageX(gx1 - nx), toPageY(gy1 - ny2)],
    ]
    doc.lines(
      gapCorners.slice(1).map((p, i) => [p[0] - gapCorners[i][0], p[1] - gapCorners[i][1]]),
      gapCorners[0][0], gapCorners[0][1],
      [1, 1], 'F', true,
    )
    doc.setDrawColor(0)
  }

  // --- Draw Windows (three parallel lines across wall thickness) ---
  for (const el of filteredElements) {
    if (el.kind !== 'window') continue
    const win = el as WindowElement
    const wall = allElements.find(
      (w): w is WallElement => w.kind === 'wall' && w.meta.id === win.wall_id,
    )
    if (!wall) continue
    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const wLen = Math.hypot(dx, dy)
    if (wLen < 1e-8) continue

    const ux = dx / wLen
    const uy = dy / wLen
    const cx = wall.start[0] + ux * win.position_along_wall * wLen
    const cy = wall.start[1] + uy * win.position_along_wall * wLen
    const hw = win.width / 2
    const nxW = (-uy) * wall.thickness / 2
    const nyW = ux * wall.thickness / 2

    doc.setDrawColor(0, 100, 200)
    doc.setLineWidth(LINEWEIGHTS.door_window)

    // Three parallel lines: outer, center, inner
    for (const frac of [-1, 0, 1]) {
      const offX = nxW * frac * 0.6
      const offY = nyW * frac * 0.6
      doc.line(
        toPageX(cx - ux * hw + offX), toPageY(cy - uy * hw + offY),
        toPageX(cx + ux * hw + offX), toPageY(cy + uy * hw + offY),
      )
    }
    doc.setDrawColor(0)
  }

  // --- Draw Columns (filled small rectangle with X) ---
  for (const el of filteredElements) {
    if (el.kind !== 'column') continue
    const col = el as ColumnElement
    const x = toPageX(col.center[0] - col.width / 2)
    const y = toPageY(col.center[1] + col.depth / 2)
    const w = col.width * pxPerUnit * fitScale
    const h = col.depth * pxPerUnit * fitScale

    doc.setFillColor(100, 100, 100)
    doc.setDrawColor(0)
    doc.setLineWidth(LINEWEIGHTS.wall_cut)
    doc.rect(x, y, w, h, 'FD')

    // Draw X inside the column
    doc.setLineWidth(LINEWEIGHTS.centerline)
    doc.line(x, y, x + w, y + h)
    doc.line(x + w, y, x, y + h)
  }

  // --- Draw Stairs ---
  for (const el of filteredElements) {
    if (el.kind !== 'stair') continue
    const s = el as StairElement
    const dx = s.end[0] - s.start[0]
    const dy = s.end[1] - s.start[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-8) continue
    const nx = (-dy / len) * s.width / 2
    const ny = (dx / len) * s.width / 2

    doc.setDrawColor(0)
    doc.setLineWidth(LINEWEIGHTS.wall_beyond)

    // Outline
    const corners = [
      [s.start[0] + nx, s.start[1] + ny],
      [s.end[0] + nx, s.end[1] + ny],
      [s.end[0] - nx, s.end[1] - ny],
      [s.start[0] - nx, s.start[1] - ny],
    ]
    const pathS = corners.map(([x, y]) => [toPageX(x), toPageY(y)])
    doc.lines(
      pathS.slice(1).map((p, i) => [p[0] - pathS[i][0], p[1] - pathS[i][1]]),
      pathS[0][0], pathS[0][1],
      [1, 1], 'S', true,
    )

    // Draw tread lines
    const risers = s.risers || 12
    const ux = dx / len
    const uy = dy / len
    for (let i = 1; i < risers; i++) {
      const t = i / risers
      const tx = s.start[0] + ux * len * t
      const ty = s.start[1] + uy * len * t
      doc.setLineWidth(LINEWEIGHTS.hatch)
      doc.line(toPageX(tx + nx), toPageY(ty + ny), toPageX(tx - nx), toPageY(ty - ny))
    }

    // Direction arrow
    const midX = (s.start[0] + s.end[0]) / 2
    const midY = (s.start[1] + s.end[1]) / 2
    doc.setLineWidth(LINEWEIGHTS.dimension)
    doc.line(toPageX(s.start[0]), toPageY(s.start[1]), toPageX(midX), toPageY(midY))
  }

  // --- Draw Electrical Symbols ---
  for (const el of filteredElements) {
    if (el.kind !== 'electrical') continue
    const eEl = el as ElectricalElement
    const bundle = generateElectricalPrimitives(eEl, {
      planSymbolProfile: symbolOptions.planSymbolProfile,
      annotationDensity: symbolOptions.annotationDensity,
      showLabels: symbolOptions.showMepText,
    })
    drawSymbolPrimitivesPdf(
      doc,
      bundle.primitives,
      bundle.domain,
      toPageX,
      toPageY,
      pxPerUnit * fitScale,
      symbolOptions.monochromeSymbols,
    )
  }

  // --- Draw Plumbing Symbols ---
  for (const el of filteredElements) {
    if (el.kind !== 'plumbing') continue
    const pEl = el as PlumbingElement
    const bundle = generatePlumbingPrimitives(pEl, {
      planSymbolProfile: symbolOptions.planSymbolProfile,
      annotationDensity: symbolOptions.annotationDensity,
      showLabels: symbolOptions.showMepText,
    })
    drawSymbolPrimitivesPdf(
      doc,
      bundle.primitives,
      bundle.domain,
      toPageX,
      toPageY,
      pxPerUnit * fitScale,
      symbolOptions.monochromeSymbols,
    )
  }

  // --- Draw Furniture ---
  for (const el of filteredElements) {
    if (el.kind !== 'furniture') continue
    const fEl = el as FurnitureElement
    const bundle = generateFurniturePrimitives(fEl, {
      planSymbolProfile: symbolOptions.planSymbolProfile,
      annotationDensity: symbolOptions.annotationDensity,
      showLabels: symbolOptions.showFurnitureLabels,
    })
    drawSymbolPrimitivesPdf(
      doc,
      bundle.primitives,
      bundle.domain,
      toPageX,
      toPageY,
      pxPerUnit * fitScale,
      symbolOptions.monochromeSymbols,
    )
  }

  // --- Draw Site Details ---
  for (const el of filteredElements) {
    if (el.kind !== 'site_detail') continue
    const sd = el as SiteDetailElement
    if (sd.points.length < 2) continue

    doc.setDrawColor(0, 100, 0)

    switch (sd.detail_type) {
      case 'property_line':
        doc.setLineWidth(LINEWEIGHTS.wall_beyond)
        doc.setLineDashPattern([3, 1, 1, 1], 0)
        for (let i = 0; i < sd.points.length - 1; i++) {
          doc.line(
            toPageX(sd.points[i][0]), toPageY(sd.points[i][1]),
            toPageX(sd.points[i + 1][0]), toPageY(sd.points[i + 1][1]),
          )
        }
        doc.setLineDashPattern([], 0)
        break
      case 'tree':
        if (sd.points.length > 0) {
          const r = (sd.radius ?? 1) * pxPerUnit * fitScale
          doc.circle(toPageX(sd.points[0][0]), toPageY(sd.points[0][1]), Math.max(r, 1), 'S')
        }
        break
      default:
        doc.setLineWidth(LINEWEIGHTS.extension)
        for (let i = 0; i < sd.points.length - 1; i++) {
          doc.line(
            toPageX(sd.points[i][0]), toPageY(sd.points[i][1]),
            toPageX(sd.points[i + 1][0]), toPageY(sd.points[i + 1][1]),
          )
        }
        break
    }
    doc.setDrawColor(0)
  }

  // --- Draw Dimensions ---
  for (const el of filteredElements) {
    if (el.kind !== 'dimension') continue
    const dim = el as DimensionElement
    const p1x = toPageX(dim.p1[0])
    const p1y = toPageY(dim.p1[1])
    const p2x = toPageX(dim.p2[0])
    const p2y = toPageY(dim.p2[1])

    const dx = dim.p2[0] - dim.p1[0]
    const dy = dim.p2[1] - dim.p1[1]
    const dist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    // Perpendicular offset direction
    const offDist = dim.offset * pxPerUnit * fitScale
    const offX = -Math.sin(angle) * offDist
    const offY = Math.cos(angle) * offDist

    // Offset dimension line endpoints
    const d1x = p1x + offX
    const d1y = p1y - offY  // Y inverted
    const d2x = p2x + offX
    const d2y = p2y - offY

    // Extension lines
    doc.setDrawColor(0)
    doc.setLineWidth(LINEWEIGHTS.extension)
    doc.line(p1x, p1y, d1x, d1y)
    doc.line(p2x, p2y, d2x, d2y)

    // Dimension line
    doc.setLineWidth(LINEWEIGHTS.dimension)
    doc.line(d1x, d1y, d2x, d2y)

    // Tick marks at endpoints
    const tickLen = 1.5
    const tickAngle = angle + Math.PI / 4
    const tdx = Math.cos(tickAngle) * tickLen
    const tdy = Math.sin(tickAngle) * tickLen
    doc.setLineWidth(LINEWEIGHTS.wall_beyond)
    doc.line(d1x - tdx, d1y + tdy, d1x + tdx, d1y - tdy)
    doc.line(d2x - tdx, d2y + tdy, d2x + tdx, d2y - tdy)

    // Dimension text
    const text = dim.text_override || dist.toFixed(2)
    const midDx = (d1x + d2x) / 2
    const midDy = (d1y + d2y) / 2

    doc.setFontSize(textSizeMm(2.5, 1))
    doc.setTextColor(0)
    doc.text(text, midDx, midDy - 0.8, { align: 'center' })
  }

  // --- Draw Room Labels ---
  for (const el of filteredElements) {
    if (el.kind !== 'room') continue
    const room = el as RoomElement
    if (!room.boundary || room.boundary.length < 3) continue

    let cx = 0, cy = 0
    for (const [x, y] of room.boundary) { cx += x; cy += y }
    cx /= room.boundary.length
    cy /= room.boundary.length

    const px = toPageX(cx)
    const py = toPageY(cy)

    // Room name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(textSizeMm(3, 1))
    doc.setTextColor(60, 60, 60)
    const name = (room.name || room.meta.name || 'Room').toUpperCase()
    doc.text(name, px, py, { align: 'center' })

    // Compute area (simple shoelace)
    let area2 = 0
    const pts = room.boundary
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      area2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    }
    const areaVal = Math.abs(area2 / 2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(textSizeMm(2, 1))
    doc.text(`${areaVal.toFixed(1)} m\u00B2`, px, py + 3.5, { align: 'center' })
    doc.setTextColor(0)
  }

  // --- Draw Text Annotations ---
  for (const el of filteredElements) {
    if (el.kind !== 'text_annotation') continue
    const ta = el as TextAnnotationElement
    const px = toPageX(ta.position[0])
    const py = toPageY(ta.position[1])
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(textSizeMm(2.5, 1))
    doc.setTextColor(30, 30, 30)
    doc.text(ta.text, px, py)
    doc.setTextColor(0)
  }

  // --- Draw Tags (circled number/letter) ---
  if (showElementTags) {
    for (const el of filteredElements) {
      if (el.kind !== 'tag') continue
      const tag = el as TagElement
      const px = toPageX(tag.position[0])
      const py = toPageY(tag.position[1])
      const r = 3

      doc.setDrawColor(0)
      doc.setLineWidth(LINEWEIGHTS.dimension)
      doc.circle(px, py, r, 'S')

      // Find target element for auto text
      let label = tag.tag_type.charAt(0).toUpperCase()
      if (tag.auto_text) {
        const target = allElements.find((e) => e.meta.id === tag.target_element_id)
        if (target) {
          label = target.meta.name ? target.meta.name.substring(0, 3) : label
        }
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(textSizeMm(2, 1))
      doc.setTextColor(0)
      doc.text(label, px, py + 0.8, { align: 'center' })
    }
  }
}

// ---------------------------------------------------------------------------
// Schedule Drawing
// ---------------------------------------------------------------------------

interface DrawableArea {
  left: number
  top: number
  width: number
  height: number
}

function drawScheduleSheets(
  doc: jsPDF,
  elements: PrototypeElement[],
  area: DrawableArea,
  units: string,
): void {
  let y = area.top + 5

  // ----- Door Schedule -----
  const doors = elements.filter((e): e is DoorElement => e.kind === 'door')
  if (doors.length > 0) {
    y = drawScheduleTable(
      doc, 'DOOR SCHEDULE', y, area,
      ['Mark', 'Width', 'Height', 'Type', 'Swing', 'Sill Ht', 'Remarks'],
      doors.map((d, i) => [
        d.meta.name || `D${i + 1}`,
        formatDim(d.width, units),
        formatDim(d.height, units),
        'Std',
        d.swing || '-',
        formatDim(d.sill_height ?? 0, units),
        '-',
      ]),
    )
    y += 8
  }

  // ----- Window Schedule -----
  const windows = elements.filter((e): e is WindowElement => e.kind === 'window')
  if (windows.length > 0) {
    y = drawScheduleTable(
      doc, 'WINDOW SCHEDULE', y, area,
      ['Mark', 'Width', 'Height', 'Sill Ht', 'Type', 'Glazing', 'Remarks'],
      windows.map((w, i) => [
        w.meta.name || `W${i + 1}`,
        formatDim(w.width, units),
        formatDim(w.height, units),
        formatDim(w.sill_height ?? 0, units),
        'Fixed',
        'Clear',
        '-',
      ]),
    )
    y += 8
  }

  // ----- Room Schedule -----
  const rooms = elements.filter((e): e is RoomElement => e.kind === 'room')
  if (rooms.length > 0) {
    y = drawScheduleTable(
      doc, 'ROOM SCHEDULE', y, area,
      ['Number', 'Name', 'Floor Area', 'Clg Height', 'Floor Finish', 'Wall Finish', 'Clg Finish'],
      rooms.map((r, i) => {
        // Calculate area
        let a2 = 0
        const pts = r.boundary || []
        for (let j = 0; j < pts.length; j++) {
          const k = (j + 1) % pts.length
          a2 += pts[j][0] * pts[k][1] - pts[k][0] * pts[j][1]
        }
        const areaVal = Math.abs(a2 / 2)
        return [
          `${i + 1}`,
          r.name || r.meta.name || '-',
          `${areaVal.toFixed(1)} m\u00B2`,
          '2.7m',
          '-',
          '-',
          '-',
        ]
      }),
    )
    y += 8
  }

  // ----- Element Summary (if no specific schedules) -----
  if (doors.length === 0 && windows.length === 0 && rooms.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text('No schedulable elements found in the project.', area.left + 10, y + 10)
  }
}

function drawScheduleTable(
  doc: jsPDF,
  title: string,
  startY: number,
  area: DrawableArea,
  headers: string[],
  rows: string[][],
): number {
  const colCount = headers.length
  const colWidth = Math.min((area.width - 10) / colCount, 35)
  const rowHeight = 5
  const x0 = area.left + 5

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0)
  doc.text(title, x0, startY)
  let y = startY + 3

  // Header row
  doc.setFillColor(230, 230, 230)
  doc.setDrawColor(0)
  doc.setLineWidth(0.25)

  for (let c = 0; c < colCount; c++) {
    const cx = x0 + c * colWidth
    doc.rect(cx, y, colWidth, rowHeight, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.text(headers[c], cx + 1.5, y + 3.5)
  }
  y += rowHeight

  // Data rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  for (const row of rows) {
    if (y + rowHeight > area.top + area.height - 5) break // prevent overflow
    for (let c = 0; c < colCount; c++) {
      const cx = x0 + c * colWidth
      doc.rect(cx, y, colWidth, rowHeight, 'S')
      doc.text(row[c] ?? '-', cx + 1.5, y + 3.5)
    }
    y += rowHeight
  }

  return y
}

/**
 * Thin wrapper that maps the legacy 'imperial' | 'metric' string to the
 * unified `formatDimensionText` from utils/units.ts.
 */
function formatDim(meters: number, units: string): string {
  if (units === 'imperial') {
    return formatDimensionText(meters, 'ft', { fractional: true })
  }
  // Metric: small values in mm, otherwise in m (matches previous behaviour)
  if (meters < 1) return formatDimensionText(meters, 'mm', { precision: 0 })
  return formatDimensionText(meters, 'm', { precision: 2 })
}

// ---------------------------------------------------------------------------
// Elevations Placeholder
// ---------------------------------------------------------------------------

function drawElevationsPlaceholder(
  doc: jsPDF,
  area: DrawableArea,
): void {
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text('Elevation Views', area.left + 10, area.top + 15)
  doc.setFontSize(7)
  doc.text('(Generated from 3D model - North, South, East, West)', area.left + 10, area.top + 22)
  doc.setTextColor(0)

  // Draw four quadrant labels
  const quadW = area.width / 2 - 10
  const quadH = area.height / 2 - 15
  const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST']
  const positions = [
    { x: area.left + 5, y: area.top + 30 },
    { x: area.left + 5 + quadW + 10, y: area.top + 30 },
    { x: area.left + 5, y: area.top + 30 + quadH + 10 },
    { x: area.left + 5 + quadW + 10, y: area.top + 30 + quadH + 10 },
  ]

  doc.setLineWidth(0.15)
  doc.setDrawColor(180, 180, 180)
  for (let i = 0; i < 4; i++) {
    const pos = positions[i]
    doc.rect(pos.x, pos.y, quadW, quadH, 'S')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(directions[i] + ' ELEVATION', pos.x + quadW / 2, pos.y + quadH / 2, { align: 'center' })
  }
  doc.setTextColor(0)
  doc.setDrawColor(0)
}
