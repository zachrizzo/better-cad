import type {
  PrototypeElement,
  WallElement,
  DoorElement,
  WindowElement,
  FloorElement,
  StairElement,
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

// --- Utility ---

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
  // Rooms are not yet implemented in the kernel-bridge types
  // but Floor elements can serve as a proxy for area/perimeter
  const rows: RoomScheduleRow[] = []
  for (const el of elements.values()) {
    if (!isFloor(el)) continue
    rows.push({
      id: el.meta.id,
      name: el.meta.name,
      area: polygonArea(el.boundary),
      perimeter: polygonPerimeter(el.boundary),
      level: el.meta.level_id ?? '-',
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
  const buckets = new Map<string, { count: number; totalArea: number; totalVolume: number }>()

  for (const el of elements.values()) {
    const kind = el.kind
    if (kind === 'level') continue // skip level meta-elements

    let bucket = buckets.get(kind)
    if (!bucket) {
      bucket = { count: 0, totalArea: 0, totalVolume: 0 }
      buckets.set(kind, bucket)
    }
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
  for (const [elementType, data] of buckets) {
    rows.push({ elementType, ...data })
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
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlobAsFile(blob, filename)
}
