import { useState, useMemo, useCallback } from 'react'
import { useEntityStore } from '../../stores/entity-store'
import { useSettingsStore } from '../../stores/settings-store'
import { formatLength } from '../../utils/units'
import {
  getDoorSchedule,
  getWindowSchedule,
  getRoomSchedule,
  getWallQuantities,
  getWallSchedule,
  getMaterialTakeoff,
  toCsv,
  downloadCsv,
  type DoorScheduleRow,
  type WindowScheduleRow,
  type RoomScheduleRow,
  type MaterialTakeoffRow,
} from '../../services/quantity-takeoff'

type Tab = 'doors' | 'windows' | 'rooms' | 'walls' | 'takeoff'
type SortDir = 'asc' | 'desc'

interface SortState {
  column: string
  dir: SortDir
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortRows<T>(rows: T[], sort: SortState | null): T[] {
  if (!sort) return rows
  return [...rows].sort((a, b) => {
    const av = (a as any)[sort.column]
    const bv = (b as any)[sort.column]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sort.dir === 'asc' ? av - bv : bv - av
    }
    const as = String(av ?? '')
    const bs = String(bv ?? '')
    return sort.dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
  })
}

function SortableHeader({ label, column, sort, onSort }: {
  label: string
  column: string
  sort: SortState | null
  onSort: (col: string) => void
}) {
  const arrow = sort?.column === column ? (sort.dir === 'asc' ? ' ^' : ' v') : ''
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => onSort(column)}
    >
      {label}{arrow}
    </th>
  )
}

export function SchedulePanel({ onClose }: { onClose: () => void }) {
  const elements = useEntityStore((s) => s.elements)
  const lengthUnit = useSettingsStore((s) => s.lengthUnit)
  const [tab, setTab] = useState<Tab>('doors')
  const [sort, setSort] = useState<SortState | null>(null)

  const toggleSort = useCallback((column: string) => {
    setSort((prev) => {
      if (prev?.column === column) {
        return prev.dir === 'asc' ? { column, dir: 'desc' } : null
      }
      return { column, dir: 'asc' }
    })
  }, [])

  // Reset sort when switching tabs
  const switchTab = useCallback((t: Tab) => {
    setTab(t)
    setSort(null)
  }, [])

  const doorRows = useMemo(() => getDoorSchedule(elements), [elements])
  const windowRows = useMemo(() => getWindowSchedule(elements), [elements])
  const roomRows = useMemo(() => getRoomSchedule(elements), [elements])
  const wallQty = useMemo(() => getWallQuantities(elements), [elements])
  const wallScheduleRows = useMemo(() => getWallSchedule(elements), [elements])
  const takeoffRows = useMemo(() => getMaterialTakeoff(elements), [elements])

  const fmt = useCallback((m: number) => formatLength(m, lengthUnit), [lengthUnit])
  const fmtArea = useCallback((m2: number) => `${m2.toFixed(3)} m\u00B2`, [])
  const fmtVol = useCallback((m3: number) => `${m3.toFixed(4)} m\u00B3`, [])

  const handleDownload = useCallback(() => {
    if (tab === 'doors') {
      const sorted = sortRows(doorRows, sort)
      const csv = toCsv(
        ['ID', 'Name', 'Width', 'Height', 'Sill Height', 'Swing', 'Host Wall', 'Host Wall ID'],
        sorted.map((r) => [r.id, r.name, fmt(r.width), fmt(r.height), fmt(r.sillHeight), r.swing, r.hostWall, r.hostWallId]),
      )
      downloadCsv('door-schedule.csv', csv)
    } else if (tab === 'windows') {
      const sorted = sortRows(windowRows, sort)
      const csv = toCsv(
        ['ID', 'Name', 'Width', 'Height', 'Sill Height', 'Host Wall'],
        sorted.map((r) => [r.id, r.name, fmt(r.width), fmt(r.height), fmt(r.sillHeight), r.hostWall]),
      )
      downloadCsv('window-schedule.csv', csv)
    } else if (tab === 'rooms') {
      const sorted = sortRows(roomRows, sort)
      const csv = toCsv(
        ['ID', 'Name', 'Area (m\u00B2)', 'Perimeter', 'Level', 'Source'],
        sorted.map((r) => [r.id, r.name, fmtArea(r.area), fmt(r.perimeter), r.level, r.source]),
      )
      downloadCsv('room-schedule.csv', csv)
    } else if (tab === 'walls') {
      const sorted = sortRows(wallScheduleRows, sort)
      const csv = toCsv(
        ['id', 'name', 'length', 'height', 'thickness', 'gross_area', 'net_area', 'opening_area', 'level_name', 'material_id'],
        sorted.map((r) => [r.id, r.name, r.length.toFixed(3), r.height.toFixed(3), r.thickness.toFixed(3), fmtArea(r.grossArea), fmtArea(r.netArea), fmtArea(r.openingArea), r.levelName, r.materialId]),
      )
      downloadCsv('wall-schedule.csv', csv)
    } else if (tab === 'takeoff') {
      const sorted = sortRows(takeoffRows, sort)
      const csv = toCsv(
        ['Element Type', 'Material', 'Count', 'Total Area (m\u00B2)', 'Total Volume (m\u00B3)'],
        sorted.map((r) => [r.elementType, r.materialName, r.count, fmtArea(r.totalArea), fmtVol(r.totalVolume)]),
      )
      downloadCsv('material-takeoff.csv', csv)
    }
  }, [tab, sort, doorRows, windowRows, roomRows, wallQty, wallScheduleRows, takeoffRows, fmt, fmtArea, fmtVol])

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="schedule-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          minWidth: 700,
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--accent)' }}>Schedules &amp; Quantities</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 18,
              padding: '2px 6px',
            }}
          >
            X
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            ['doors', 'Doors'],
            ['windows', 'Windows'],
            ['rooms', 'Rooms/Floors'],
            ['walls', 'Wall Quantities'],
            ['takeoff', 'Material Takeoff'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`toolbar-btn${tab === key ? ' active' : ''}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>
          {tab === 'doors' && <DoorTable rows={doorRows} sort={sort} onSort={toggleSort} fmt={fmt} />}
          {tab === 'windows' && <WindowTable rows={windowRows} sort={sort} onSort={toggleSort} fmt={fmt} />}
          {tab === 'rooms' && <RoomTable rows={roomRows} sort={sort} onSort={toggleSort} fmt={fmt} fmtArea={fmtArea} />}
          {tab === 'walls' && <WallQuantitiesView qty={wallQty} fmt={fmt} fmtArea={fmtArea} fmtVol={fmtVol} />}
          {tab === 'takeoff' && <TakeoffTable rows={takeoffRows} sort={sort} onSort={toggleSort} fmtArea={fmtArea} fmtVol={fmtVol} />}
        </div>

        {/* Download */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="toolbar-btn" onClick={handleDownload} style={{ fontSize: 12 }}>
            Download CSV
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Sub-tables ---

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
}

const cellStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const headerStyle: React.CSSProperties = {
  ...cellStyle,
  textAlign: 'left',
  color: 'var(--text-muted)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

function EmptyMessage({ kind }: { kind: string }) {
  return (
    <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
      No {kind} in the project yet.
    </p>
  )
}

function DoorTable({ rows, sort, onSort, fmt }: {
  rows: DoorScheduleRow[]
  sort: SortState | null
  onSort: (c: string) => void
  fmt: (m: number) => string
}) {
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])
  if (rows.length === 0) return <EmptyMessage kind="doors" />
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={headerStyle}>
          <SortableHeader label="ID" column="id" sort={sort} onSort={onSort} />
          <SortableHeader label="Name" column="name" sort={sort} onSort={onSort} />
          <SortableHeader label="Width" column="width" sort={sort} onSort={onSort} />
          <SortableHeader label="Height" column="height" sort={sort} onSort={onSort} />
          <SortableHeader label="Sill H" column="sillHeight" sort={sort} onSort={onSort} />
          <SortableHeader label="Swing" column="swing" sort={sort} onSort={onSort} />
          <SortableHeader label="Host Wall" column="hostWall" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td style={cellStyle} title={r.id}>{r.id.slice(0, 8)}...</td>
            <td style={cellStyle}>{r.name}</td>
            <td style={cellStyle}>{fmt(r.width)}</td>
            <td style={cellStyle}>{fmt(r.height)}</td>
            <td style={cellStyle}>{fmt(r.sillHeight)}</td>
            <td style={cellStyle}>{r.swing}</td>
            <td style={cellStyle} title={r.hostWall}>{r.hostWall.length > 12 ? r.hostWall.slice(0, 12) + '...' : r.hostWall}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WindowTable({ rows, sort, onSort, fmt }: {
  rows: WindowScheduleRow[]
  sort: SortState | null
  onSort: (c: string) => void
  fmt: (m: number) => string
}) {
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])
  if (rows.length === 0) return <EmptyMessage kind="windows" />
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={headerStyle}>
          <SortableHeader label="ID" column="id" sort={sort} onSort={onSort} />
          <SortableHeader label="Name" column="name" sort={sort} onSort={onSort} />
          <SortableHeader label="Width" column="width" sort={sort} onSort={onSort} />
          <SortableHeader label="Height" column="height" sort={sort} onSort={onSort} />
          <SortableHeader label="Sill H" column="sillHeight" sort={sort} onSort={onSort} />
          <SortableHeader label="Host Wall" column="hostWall" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td style={cellStyle} title={r.id}>{r.id.slice(0, 8)}...</td>
            <td style={cellStyle}>{r.name}</td>
            <td style={cellStyle}>{fmt(r.width)}</td>
            <td style={cellStyle}>{fmt(r.height)}</td>
            <td style={cellStyle}>{fmt(r.sillHeight)}</td>
            <td style={cellStyle} title={r.hostWall}>{r.hostWall.length > 12 ? r.hostWall.slice(0, 12) + '...' : r.hostWall}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RoomTable({ rows, sort, onSort, fmt, fmtArea }: {
  rows: RoomScheduleRow[]
  sort: SortState | null
  onSort: (c: string) => void
  fmt: (m: number) => string
  fmtArea: (m2: number) => string
}) {
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])
  if (rows.length === 0) return <EmptyMessage kind="rooms/floors" />
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={headerStyle}>
          <SortableHeader label="ID" column="id" sort={sort} onSort={onSort} />
          <SortableHeader label="Name" column="name" sort={sort} onSort={onSort} />
          <SortableHeader label="Area" column="area" sort={sort} onSort={onSort} />
          <SortableHeader label="Perimeter" column="perimeter" sort={sort} onSort={onSort} />
          <SortableHeader label="Level" column="level" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td style={cellStyle} title={r.id}>{r.id.slice(0, 8)}...</td>
            <td style={cellStyle}>{r.name}</td>
            <td style={cellStyle}>{fmtArea(r.area)}</td>
            <td style={cellStyle}>{fmt(r.perimeter)}</td>
            <td style={cellStyle}>{r.level}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WallQuantitiesView({ qty, fmt, fmtArea, fmtVol }: {
  qty: ReturnType<typeof getWallQuantities>
  fmt: (m: number) => string
  fmtArea: (m2: number) => string
  fmtVol: (m3: number) => string
}) {
  if (qty.count === 0) return <EmptyMessage kind="walls" />
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={headerStyle}>
          <th>Metric</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style={cellStyle}>Wall Count</td><td style={cellStyle}>{qty.count}</td></tr>
        <tr><td style={cellStyle}>Total Length</td><td style={cellStyle}>{fmt(qty.totalLength)}</td></tr>
        <tr><td style={cellStyle}>Total Area</td><td style={cellStyle}>{fmtArea(qty.totalArea)}</td></tr>
        <tr><td style={cellStyle}>Total Volume</td><td style={cellStyle}>{fmtVol(qty.totalVolume)}</td></tr>
      </tbody>
    </table>
  )
}

function TakeoffTable({ rows, sort, onSort, fmtArea, fmtVol }: {
  rows: MaterialTakeoffRow[]
  sort: SortState | null
  onSort: (c: string) => void
  fmtArea: (m2: number) => string
  fmtVol: (m3: number) => string
}) {
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])
  if (rows.length === 0) return <EmptyMessage kind="elements" />
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={headerStyle}>
          <SortableHeader label="Element Type" column="elementType" sort={sort} onSort={onSort} />
          <SortableHeader label="Material" column="materialName" sort={sort} onSort={onSort} />
          <SortableHeader label="Count" column="count" sort={sort} onSort={onSort} />
          <SortableHeader label="Total Area" column="totalArea" sort={sort} onSort={onSort} />
          <SortableHeader label="Total Volume" column="totalVolume" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={`${r.elementType}-${r.materialName}-${i}`}>
            <td style={{ ...cellStyle, textTransform: 'capitalize' }}>{r.elementType}</td>
            <td style={cellStyle}>{r.materialName}</td>
            <td style={cellStyle}>{r.count}</td>
            <td style={cellStyle}>{fmtArea(r.totalArea)}</td>
            <td style={cellStyle}>{fmtVol(r.totalVolume)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
