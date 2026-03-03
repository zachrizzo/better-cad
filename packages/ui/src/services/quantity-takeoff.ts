import type {
  PrototypeElement,
  WallElement,
  DoorElement,
  WindowElement,
  FloorElement,
  RoomElement,
  StairElement,
  ColumnElement,
  BeamElement,
  RoofElement,
  LevelElement,
} from './kernel-bridge'
import { downloadBlobAsFile } from '../utils/file-download'

// --- Schedule row interfaces ---

export interface DoorScheduleRow {
  id: string
  name: string
  width: number
  height: number
  sillHeight: number
  swing: string
  hostWall: string
  hostWallId: string
}

export interface WindowScheduleRow {
  id: string
  name: string
  width: number
  height: number
  sillHeight: number
  hostWall: string
}

export interface RoomScheduleRow {
  id: string
  name: string
  area: number
  perimeter: number
  level: string
  source: 'room' | 'floor_proxy'
}

export interface WallScheduleRow {
  id: string
  name: string
  length: number
  height: number
  thickness: number
  grossArea: number
  netArea: number
  openingArea: number
  levelName: string
  materialId: string
}

export interface WallQuantities {
  count: number
  totalLength: number
  totalArea: number
  totalVolume: number
}

export interface MaterialTakeoffRow {
  elementType: string
  count: number
  totalArea: number
  totalVolume: number
  materialName: string
}

// --- Type guards ---

function isWall(el: PrototypeElement): el is WallElement {
  return el.kind === 'wall'
}

function isDoor(el: PrototypeElement): el is DoorElement {
  return el.kind === 'door'
}

function isWindow(el: PrototypeElement): el is WindowElement {
  return el.kind === 'window'
}

function isFloor(el: PrototypeElement): el is FloorElement {
  return el.kind === 'floor'
}

function isStair(el: PrototypeElement): el is StairElement {
  return el.kind === 'stair'
}

function isRoom(el: PrototypeElement): el is RoomElement {
  return el.kind === 'room'
}

function isColumn(el: PrototypeElement): el is ColumnElement {
  return el.kind === 'column'
}

function isBeam(el: PrototypeElement): el is BeamElement {
  return el.kind === 'beam'
}

function isRoof(el: PrototypeElement): el is RoofElement {
  return el.kind === 'roof'
}

function isLevel(el: PrototypeElement): el is LevelElement {
  return el.kind === 'level'
}

// --- Utility ---

function buildLevelMap(elements: Map<string, PrototypeElement>): Map<string, string> {
  const map = new Map<string, string>()
  for (const el of elements.values()) {
    if (isLevel(el)) {
      map.set(el.meta.id, el.meta.name)
    }
  }
  return map
}

function buildMaterialMap(elements: Map<string, PrototypeElement>): Map<string, string> {
  const map = new Map<string, string>()
  for (const el of elements.values()) {
    if (el.kind === 'material') {
      map.set(el.meta.id, el.meta.name)
    }
  }
  return map
}

function wallLength(w: WallElement): number {
  return Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
}

function polygonArea(boundary: [number, number][]): number {
  // Shoelace formula
  let area = 0
  const n = boundary.length
  for (let i = 0; i < n; i++) {
    const [x1, y1] = boundary[i]
    const [x2, y2] = boundary[(i + 1) % n]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area) / 2
}

function polygonPerimeter(boundary: [number, number][]): number {
  let perimeter = 0
  const n = boundary.length
  for (let i = 0; i < n; i++) {
    const [x1, y1] = boundary[i]
    const [x2, y2] = boundary[(i + 1) % n]
    perimeter += Math.hypot(x2 - x1, y2 - y1)
  }
  return perimeter
}

// --- Schedule functions ---

export function getDoorSchedule(elements: Map<string, PrototypeElement>): DoorScheduleRow[] {
  const rows: DoorScheduleRow[] = []
  for (const el of elements.values()) {
    if (!isDoor(el)) continue
    const hostWall = el.wall_id ? elements.get(el.wall_id) : undefined
    rows.push({
      id: el.meta.id,
      name: el.meta.name,
      width: el.width,
      height: el.height,
      sillHeight: el.sill_height,
      swing: el.swing,
      hostWall: hostWall?.meta.name ?? el.wall_id ?? '-',
      hostWallId: el.wall_id ?? '-',
    })
  }
  return rows
}

export function getWindowSchedule(elements: Map<string, PrototypeElement>): WindowScheduleRow[] {
  const rows: WindowScheduleRow[] = []
  for (const el of elements.values()) {
    if (!isWindow(el)) continue
    const hostWall = el.wall_id ? elements.get(el.wall_id) : undefined
    rows.push({
      id: el.meta.id,
      name: el.meta.name,
      width: el.width,
      height: el.height,
      sillHeight: el.sill_height,
      hostWall: hostWall?.meta.name ?? el.wall_id ?? '-',
    })
  }
  return rows
}

export function getRoomSchedule(elements: Map<string, PrototypeElement>): RoomScheduleRow[] {
  const levelMap = buildLevelMap(elements)
  const rows: RoomScheduleRow[] = []

  // Collect room rows
  const roomLevelIds = new Set<string>()
  for (const el of elements.values()) {
    if (!isRoom(el)) continue
    const levelId = el.meta.level_id ?? undefined
    if (levelId) roomLevelIds.add(levelId)
    rows.push({
      id: el.meta.id,
      name: el.name || el.meta.name,
      area: polygonArea(el.boundary),
      perimeter: polygonPerimeter(el.boundary),
      level: levelId ? (levelMap.get(levelId) ?? 'Unassigned') : 'Unassigned',
      source: 'room',
    })
  }

  // Floor proxy fallback: for floors that have no corresponding room on the same level
  for (const el of elements.values()) {
    if (!isFloor(el)) continue
    const floorLevelId = el.meta.level_id ?? undefined
    if (floorLevelId && roomLevelIds.has(floorLevelId)) continue
    rows.push({
      id: el.meta.id,
      name: el.meta.name + ' (proxy)',
      area: polygonArea(el.boundary),
      perimeter: polygonPerimeter(el.boundary),
      level: floorLevelId ? (levelMap.get(floorLevelId) ?? 'Unassigned') : 'Unassigned',
      source: 'floor_proxy',
    })
  }

  return rows
}

export function getWallSchedule(elements: Map<string, PrototypeElement>): WallScheduleRow[] {
  const levelMap = buildLevelMap(elements)
  const rows: WallScheduleRow[] = []

  // Pre-compute opening areas per wall
  const wallOpeningAreas = new Map<string, number>()
  for (const el of elements.values()) {
    if (isDoor(el) && el.wall_id) {
      const prev = wallOpeningAreas.get(el.wall_id) ?? 0
      wallOpeningAreas.set(el.wall_id, prev + el.width * el.height)
    } else if (isWindow(el) && el.wall_id) {
      const prev = wallOpeningAreas.get(el.wall_id) ?? 0
      wallOpeningAreas.set(el.wall_id, prev + el.width * el.height)
    }
  }

  for (const el of elements.values()) {
    if (!isWall(el)) continue
    const len = wallLength(el)
    const grossArea = len * el.height
    const openingArea = wallOpeningAreas.get(el.meta.id) ?? 0
    const netArea = Math.max(0, grossArea - openingArea)
    const levelId = el.meta.level_id ?? undefined
    rows.push({
      id: el.meta.id,
      name: el.meta.name,
      length: len,
      height: el.height,
      thickness: el.thickness,
      grossArea,
      netArea,
      openingArea,
      levelName: levelId ? (levelMap.get(levelId) ?? 'Unassigned') : 'Unassigned',
      materialId: el.meta.material_id ?? '-',
    })
  }
  return rows
}

export function getWallQuantities(elements: Map<string, PrototypeElement>): WallQuantities {
  let count = 0
  let totalLength = 0
  let totalArea = 0
  let totalVolume = 0
  for (const el of elements.values()) {
    if (!isWall(el)) continue
    count++
    const len = wallLength(el)
    totalLength += len
    totalArea += len * el.height
    totalVolume += len * el.height * el.thickness
  }
  return { count, totalLength, totalArea, totalVolume }
}

export function getMaterialTakeoff(elements: Map<string, PrototypeElement>): MaterialTakeoffRow[] {
  const materialMap = buildMaterialMap(elements)

  // Bucket key = "kind|material_id" to separate by material
  const buckets = new Map<string, { elementType: string; count: number; totalArea: number; totalVolume: number; materialName: string }>()

  function getBucket(kind: string, materialId: string | null | undefined) {
    const matId = materialId ?? ''
    const key = `${kind}|${matId}`
    let bucket = buckets.get(key)
    if (!bucket) {
      const materialName = matId ? (materialMap.get(matId) ?? matId) : '-'
      bucket = { elementType: kind, count: 0, totalArea: 0, totalVolume: 0, materialName }
      buckets.set(key, bucket)
    }
    return bucket
  }

  for (const el of elements.values()) {
    const kind = el.kind
    if (kind === 'level' || kind === 'material' || kind === 'dimension' || kind === 'text_annotation') continue

    const bucket = getBucket(kind, el.meta.material_id)
    bucket.count++

    if (isWall(el)) {
      const len = wallLength(el)
      bucket.totalArea += len * el.height
      bucket.totalVolume += len * el.height * el.thickness
    } else if (isFloor(el)) {
      const area = polygonArea(el.boundary)
      bucket.totalArea += area
      bucket.totalVolume += area * el.thickness
    } else if (isDoor(el)) {
      bucket.totalArea += el.width * el.height
    } else if (isWindow(el)) {
      bucket.totalArea += el.width * el.height
    } else if (isColumn(el)) {
      bucket.totalArea += (el.width + el.depth) * 2 * el.height
      bucket.totalVolume += el.width * el.depth * el.height
    } else if (isBeam(el)) {
      const len = Math.sqrt(
        (el.end[0] - el.start[0]) ** 2 +
        (el.end[1] - el.start[1]) ** 2 +
        (el.end[2] - el.start[2]) ** 2,
      )
      bucket.totalArea += (el.width + el.depth) * 2 * len
      bucket.totalVolume += el.width * el.depth * len
    } else if (isRoof(el)) {
      const area = polygonArea(el.boundary)
      bucket.totalArea += area
      bucket.totalVolume += area * el.thickness
    } else if (isStair(el)) {
      const runLen = (() => {
        if ((el.stair_type ?? 'straight') !== 'spiral') {
          return Math.hypot(el.end[0] - el.start[0], el.end[1] - el.start[1])
        }
        const outerRadius = Math.hypot(el.end[0] - el.start[0], el.end[1] - el.start[1])
        const centerRadius = Math.max(0.05, outerRadius - el.width * 0.5)
        const turns = (() => {
          const raw = el.spiral_turns ?? 1
          const clamped = Math.max(-5, Math.min(5, raw))
          if (Math.abs(clamped) < 0.1) return clamped < 0 ? -0.1 : 0.1
          return clamped
        })()
        return Math.abs(turns) * Math.PI * 2 * centerRadius
      })()
      bucket.totalArea += runLen * el.width
    }
  }

  const rows: MaterialTakeoffRow[] = []
  for (const data of buckets.values()) {
    rows.push(data)
  }
  rows.sort((a, b) => a.elementType.localeCompare(b.elementType))
  return rows
}

// --- CSV export ---

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number): string => {
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = ['# BetterCAD Export v1', headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlobAsFile(blob, filename)
}
