/**
 * Title Block System for BetterCAD Construction Documents.
 *
 * Renders professional AEC-standard title blocks onto jsPDF pages including
 * border, title strip, revision block, and project information.
 */
import type { jsPDF } from 'jspdf'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectInfo {
  projectName: string
  projectAddress: string
  clientName: string
  architectName: string
  architectLicense: string
  date: string
  projectNumber: string
}

export interface RevisionEntry {
  number: string
  date: string
  description: string
}

export interface SheetInfo {
  sheetNumber: string   // e.g., "A-101"
  sheetTitle: string    // e.g., "FIRST FLOOR PLAN"
  scale: string         // e.g., '1/4" = 1\'-0"'
  revisions: RevisionEntry[]
}

export type PaperSizeKey = 'ARCH-D' | 'ARCH-E' | 'A1' | 'A0' | 'LETTER' | 'TABLOID'

export interface TitleBlockConfig {
  project: ProjectInfo
  sheet: SheetInfo
  paperSize: PaperSizeKey
}

// ---------------------------------------------------------------------------
// Paper sizes (mm, landscape orientation)
// ---------------------------------------------------------------------------

const PAPER_SIZES: Record<PaperSizeKey, { width: number; height: number }> = {
  'ARCH-D': { width: 914, height: 610 },
  'ARCH-E': { width: 1219, height: 914 },
  'A1':     { width: 841, height: 594 },
  'A0':     { width: 1189, height: 841 },
  'LETTER': { width: 279, height: 216 },
  'TABLOID': { width: 432, height: 279 },
}

export function getPaperSize(size: string): { width: number; height: number } {
  return PAPER_SIZES[size as PaperSizeKey] ?? PAPER_SIZES['LETTER']
}

// ---------------------------------------------------------------------------
// Title Block Renderer
// ---------------------------------------------------------------------------

/** Margin from paper edge to the outer border line (mm). */
const BORDER_MARGIN = 12

/** Title strip dimensions (mm). */
const TITLE_STRIP_WIDTH = 180
const TITLE_STRIP_HEIGHT = 50

/** Revision block row height (mm). */
const REV_ROW_HEIGHT = 5

/**
 * Render a professional title block onto the current jsPDF page.
 *
 * Layout:
 *   - Thick outer border (1 mm) at `BORDER_MARGIN` from paper edge
 *   - Thin inner border (0.25 mm) at `BORDER_MARGIN + 2` from paper edge
 *   - Title strip in bottom-right corner
 *   - Revision table above the title strip
 *   - Project info in the title strip
 */
export function renderTitleBlockToPdf(pdf: jsPDF, config: TitleBlockConfig): void {
  const paper = getPaperSize(config.paperSize)
  const pw = paper.width
  const ph = paper.height

  // ----- Outer border (thick) -----
  pdf.setDrawColor(0)
  pdf.setLineWidth(1.0)
  pdf.rect(BORDER_MARGIN, BORDER_MARGIN, pw - 2 * BORDER_MARGIN, ph - 2 * BORDER_MARGIN)

  // ----- Inner border (thin) -----
  const innerOff = BORDER_MARGIN + 2
  pdf.setLineWidth(0.25)
  pdf.rect(innerOff, innerOff, pw - 2 * innerOff, ph - 2 * innerOff)

  // ----- Title strip area -----
  const tsRight = pw - BORDER_MARGIN
  const tsLeft = tsRight - TITLE_STRIP_WIDTH
  const tsBottom = ph - BORDER_MARGIN
  const tsTop = tsBottom - TITLE_STRIP_HEIGHT

  // Title strip box
  pdf.setLineWidth(0.5)
  pdf.rect(tsLeft, tsTop, TITLE_STRIP_WIDTH, TITLE_STRIP_HEIGHT)

  // Horizontal dividers inside title strip
  const row1Y = tsTop + 12  // project name / client
  const row2Y = tsTop + 24  // sheet title
  const row3Y = tsTop + 36  // architect / date / scale

  pdf.setLineWidth(0.25)
  pdf.line(tsLeft, row1Y, tsRight, row1Y)
  pdf.line(tsLeft, row2Y, tsRight, row2Y)
  pdf.line(tsLeft, row3Y, tsRight, row3Y)

  // Vertical divider at midpoint for the bottom two rows
  const midX = tsLeft + TITLE_STRIP_WIDTH / 2
  pdf.line(midX, row2Y, midX, row3Y)

  // ----- Text inside title strip -----
  pdf.setTextColor(0)

  // Row 0: Project name (bold, larger)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(config.project.projectName.toUpperCase(), tsLeft + 4, tsTop + 5)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.text(config.project.projectAddress, tsLeft + 4, tsTop + 9)

  // Row 1: Client / Architect info
  pdf.setFontSize(5.5)
  pdf.text(`Client: ${config.project.clientName}`, tsLeft + 4, row1Y + 4)
  pdf.text(`Architect: ${config.project.architectName}`, tsLeft + 4, row1Y + 8)
  pdf.text(`License: ${config.project.architectLicense}`, tsLeft + 4, row1Y + 11.5)

  // Row 2: Sheet title (bold, centered, larger)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  const titleTextWidth = pdf.getTextWidth(config.sheet.sheetTitle)
  const titleCenterX = tsLeft + (TITLE_STRIP_WIDTH - titleTextWidth) / 2
  pdf.text(config.sheet.sheetTitle, titleCenterX, row2Y + 8)

  // Row 3 left: Scale + Date
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.text(`Scale: ${config.sheet.scale}`, tsLeft + 4, row3Y + 4)
  pdf.text(`Date: ${config.project.date}`, tsLeft + 4, row3Y + 8)
  pdf.text(`Project #: ${config.project.projectNumber}`, tsLeft + 4, row3Y + 12)

  // Row 3 right: Sheet number (large, bold, centered)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  const sheetNumWidth = pdf.getTextWidth(config.sheet.sheetNumber)
  const sheetNumX = midX + (TITLE_STRIP_WIDTH / 2 - sheetNumWidth) / 2
  pdf.text(config.sheet.sheetNumber, sheetNumX, row3Y + 9)

  // BetterCAD branding (small, bottom-right corner of title strip)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(5)
  pdf.text('BetterCAD', tsRight - 20, tsBottom - 2)

  // ----- Revision block (above title strip) -----
  const revs = config.sheet.revisions
  if (revs.length > 0) {
    const revBlockHeight = (revs.length + 1) * REV_ROW_HEIGHT
    const revTop = tsTop - revBlockHeight
    const revColDate = tsLeft + 20
    const revColDesc = tsLeft + 55

    // Outline
    pdf.setLineWidth(0.25)
    pdf.rect(tsLeft, revTop, TITLE_STRIP_WIDTH, revBlockHeight)

    // Header row
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(5)
    pdf.text('REV', tsLeft + 3, revTop + 3.5)
    pdf.text('DATE', revColDate + 3, revTop + 3.5)
    pdf.text('DESCRIPTION', revColDesc + 3, revTop + 3.5)
    pdf.line(tsLeft, revTop + REV_ROW_HEIGHT, tsRight, revTop + REV_ROW_HEIGHT)

    // Column dividers
    pdf.line(revColDate, revTop, revColDate, revTop + revBlockHeight)
    pdf.line(revColDesc, revTop, revColDesc, revTop + revBlockHeight)

    // Revision rows
    pdf.setFont('helvetica', 'normal')
    for (let i = 0; i < revs.length; i++) {
      const ry = revTop + (i + 1) * REV_ROW_HEIGHT
      pdf.text(revs[i].number, tsLeft + 3, ry + 3.5)
      pdf.text(revs[i].date, revColDate + 3, ry + 3.5)
      pdf.text(revs[i].description, revColDesc + 3, ry + 3.5)
      if (i < revs.length - 1) {
        pdf.line(tsLeft, ry + REV_ROW_HEIGHT, tsRight, ry + REV_ROW_HEIGHT)
      }
    }
  }
}

/**
 * Returns the drawable area inside the title block (excluding borders and
 * title strip) in page coordinates (mm).
 */
export function getDrawableArea(config: TitleBlockConfig): {
  left: number
  top: number
  width: number
  height: number
} {
  const paper = getPaperSize(config.paperSize)
  const innerOff = BORDER_MARGIN + 4  // small extra padding beyond inner border
  const left = innerOff
  const top = innerOff
  const width = paper.width - 2 * innerOff
  // Subtract title strip height from bottom
  const height = paper.height - 2 * innerOff - TITLE_STRIP_HEIGHT - 4
  return { left, top, width, height }
}
