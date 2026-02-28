import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHistoryStore } from '../../stores/history-store'
import { useDocumentStore } from '../../stores/document-store'
import { useUIStore } from '../../stores/ui-store'
import { useBimStore } from '../../stores/bim-store'
import { useSketchStore } from '../../stores/sketch-store'
import { useKernel } from '../../hooks/useKernel'
import { MaterialPicker } from '../materials/MaterialPicker'
import { extrudeSketchProfile } from '../../utils/sketch-extrude'
import { mapKernelPlanMeshToScene } from '../../utils/mesh-coordinates'

const MIN_DIMENSION = 0.01

interface Dimensions {
  width: number
  height: number
  depth: number
}

function getMeshDimensions(positions: Float32Array): Dimensions | null {
  if (positions.length < 3) return null
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  return {
    width: Math.max(MIN_DIMENSION, maxX - minX),
    height: Math.max(MIN_DIMENSION, maxY - minY),
    depth: Math.max(MIN_DIMENSION, maxZ - minZ),
  }
}

function recomputeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3
    const ib = indices[i + 1] * 3
    const ic = indices[i + 2] * 3

    const ax = positions[ia]
    const ay = positions[ia + 1]
    const az = positions[ia + 2]
    const bx = positions[ib]
    const by = positions[ib + 1]
    const bz = positions[ib + 2]
    const cx = positions[ic]
    const cy = positions[ic + 1]
    const cz = positions[ic + 2]

    const abx = bx - ax
    const aby = by - ay
    const abz = bz - az
    const acx = cx - ax
    const acy = cy - ay
    const acz = cz - az

    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx

    normals[ia] += nx
    normals[ia + 1] += ny
    normals[ia + 2] += nz
    normals[ib] += nx
    normals[ib + 1] += ny
    normals[ib + 2] += nz
    normals[ic] += nx
    normals[ic + 1] += ny
    normals[ic + 2] += nz
  }

  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i]
    const ny = normals[i + 1]
    const nz = normals[i + 2]
    const len = Math.hypot(nx, ny, nz) || 1
    normals[i] = nx / len
    normals[i + 1] = ny / len
    normals[i + 2] = nz / len
  }

  return normals
}

function resizeMeshToDimensions(
  positions: Float32Array,
  indices: Uint32Array,
  target: Dimensions,
): { positions: Float32Array; normals: Float32Array } | null {
  const current = getMeshDimensions(positions)
  if (!current) return null

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2

  const sx = Math.max(MIN_DIMENSION, target.width) / current.width
  const sy = Math.max(MIN_DIMENSION, target.height) / current.height
  const sz = Math.max(MIN_DIMENSION, target.depth) / current.depth

  const resizedPositions = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    resizedPositions[i] = cx + (positions[i] - cx) * sx
    resizedPositions[i + 1] = cy + (positions[i + 1] - cy) * sy
    resizedPositions[i + 2] = cz + (positions[i + 2] - cz) * sz
  }

  return {
    positions: resizedPositions,
    normals: recomputeNormals(resizedPositions, indices),
  }
}

export function PropertyPanel() {
  const boxParams = useHistoryStore((s) => s.boxParams)
  const setHistoryParams = useHistoryStore((s) => s.setBoxParams)
  const setDocParams = useDocumentStore((s) => s.setBoxParams)
  const addCadMesh = useDocumentStore((s) => s.addCadMesh)
  const cadMeshes = useDocumentStore((s) => s.cadMeshes)
  const selectedBodyId = useUIStore((s) => s.selectedBodyId)
  const activeTool = useUIStore((s) => s.activeTool)
  const walls = useBimStore((s) => s.walls)
  const updateWall = useBimStore((s) => s.updateWall)
  const addWall = useBimStore((s) => s.addWall)
  const defaultWallHeight = useBimStore((s) => s.defaultWallHeight)
  const defaultWallThickness = useBimStore((s) => s.defaultWallThickness)
  const autoExtrudeSketch = useBimStore((s) => s.autoExtrudeSketch)
  const sketchExtrudeMode = useBimStore((s) => s.sketchExtrudeMode)
  const setDefaultWallHeight = useBimStore((s) => s.setDefaultWallHeight)
  const setDefaultWallThickness = useBimStore((s) => s.setDefaultWallThickness)
  const setAutoExtrudeSketch = useBimStore((s) => s.setAutoExtrudeSketch)
  const setSketchExtrudeMode = useBimStore((s) => s.setSketchExtrudeMode)
  const profiles = useSketchStore((s) => s.profiles)
  const { kernel, ready } = useKernel()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [extrudingSketch, setExtrudingSketch] = useState(false)

  const selectedMeshId = selectedBodyId && cadMeshes.has(selectedBodyId) ? selectedBodyId : 'box-0'
  const selectedMesh = cadMeshes.get(selectedMeshId)
  const selectedWall = walls.get(selectedMeshId) ?? null
  const sketchProfiles = useMemo(() => Array.from(profiles.values()), [profiles])

  const panelDimensions = useMemo<Dimensions>(() => {
    if (selectedWall) {
      const [sx, sz] = selectedWall.start
      const [ex, ez] = selectedWall.end
      return {
        width: Math.max(MIN_DIMENSION, Math.hypot(ex - sx, ez - sz)),
        height: Math.max(MIN_DIMENSION, selectedWall.height),
        depth: Math.max(MIN_DIMENSION, selectedWall.thickness),
      }
    }

    if (selectedMesh) {
      return getMeshDimensions(selectedMesh.positions) ?? boxParams
    }

    return boxParams
  }, [selectedWall, selectedMesh, boxParams])

  const [inputDims, setInputDims] = useState<Dimensions>(panelDimensions)

  useEffect(() => {
    setInputDims(panelDimensions)
  }, [panelDimensions, selectedMeshId])

  // Clear pending debounce timer on unmount to prevent stale closure firing
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const applyDimensions = useCallback((newParams: Dimensions) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        if (selectedWall) {
          const [sx, sz] = selectedWall.start
          const [ex, ez] = selectedWall.end
          const length = Math.hypot(ex - sx, ez - sz)
          if (length < 1e-8) return

          const dirX = (ex - sx) / length
          const dirZ = (ez - sz) / length
          const nextLength = Math.max(MIN_DIMENSION, newParams.width)
          const nextHeight = Math.max(MIN_DIMENSION, newParams.height)
          const nextThickness = Math.max(MIN_DIMENSION, newParams.depth)
          const nextEnd: [number, number] = [
            sx + dirX * nextLength,
            sz + dirZ * nextLength,
          ]

          updateWall(selectedWall.id, {
            end: nextEnd,
            height: nextHeight,
            thickness: nextThickness,
          })

          if (ready && kernel) {
            const mesh = await kernel.addWall(
              sx,
              -sz,
              nextEnd[0],
              -nextEnd[1],
              nextHeight,
              nextThickness,
            )
            addCadMesh(selectedWall.id, mapKernelPlanMeshToScene(mesh))
          }
          return
        }

        if (selectedMeshId === 'box-0') {
          setHistoryParams(newParams)
          setDocParams(newParams)
          if (ready && kernel) {
            const mesh = await kernel.createAndTessellateBox(
              newParams.width,
              newParams.height,
              newParams.depth,
            )
            addCadMesh('box-0', mesh)
          }
          return
        }

        if (selectedMesh) {
          const resized = resizeMeshToDimensions(selectedMesh.positions, selectedMesh.indices, newParams)
          if (resized) {
            addCadMesh(selectedMeshId, {
              positions: resized.positions,
              normals: resized.normals,
              indices: selectedMesh.indices,
            })
          }
        }
      } catch (e) {
        console.error('Dimension update failed:', e)
      }
    }, 150)
  }, [addCadMesh, kernel, ready, selectedMesh, selectedMeshId, selectedWall, setDocParams, setHistoryParams, updateWall])

  const handleChange = useCallback((field: keyof Dimensions, value: number) => {
    const next = {
      ...inputDims,
      [field]: Math.max(MIN_DIMENSION, value),
    }
    setInputDims(next)
    applyDimensions(next)
  }, [applyDimensions, inputDims])

  const panelTitle = selectedBodyId
    ? `Properties (${selectedBodyId})`
    : 'Box Properties'

  const handleExtrudeSketch = useCallback(async () => {
    if (sketchProfiles.length === 0 || extrudingSketch) return
    setExtrudingSketch(true)
    try {
      for (const profile of sketchProfiles) {
        await extrudeSketchProfile({
          profile,
          mode: sketchExtrudeMode,
          height: defaultWallHeight,
          thickness: defaultWallThickness,
          kernel,
          ready,
          addCadMesh,
          addWall,
        })
      }
    } catch (err) {
      console.error('[BetterCAD] Sketch extrusion failed:', err)
    } finally {
      setExtrudingSketch(false)
    }
  }, [
    addCadMesh,
    addWall,
    defaultWallHeight,
    defaultWallThickness,
    extrudingSketch,
    kernel,
    ready,
    sketchExtrudeMode,
    sketchProfiles,
  ])

  return (
    <div className="property-panel">
      <div className="property-panel-title">{panelTitle}</div>
      {(['width', 'height', 'depth'] as const).map((field) => (
        <div className="property-row" key={field}>
          <label className="property-label">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
          <input
            type="number"
            className="property-input"
            value={inputDims[field]}
            min={0.01}
            step={0.1}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v > 0) handleChange(field, v)
            }}
          />
        </div>
      ))}

      <div className="property-panel-title" style={{ marginTop: 14 }}>
        Sketch / Wall Defaults
      </div>
      <div className="property-row">
        <label className="property-label">Wall H</label>
        <input
          type="number"
          className="property-input"
          value={defaultWallHeight}
          min={0.01}
          step={0.1}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v > 0) setDefaultWallHeight(v)
          }}
        />
      </div>
      <div className="property-row">
        <label className="property-label">Wall T</label>
        <input
          type="number"
          className="property-input"
          value={defaultWallThickness}
          min={0.01}
          step={0.05}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v > 0) setDefaultWallThickness(v)
          }}
        />
      </div>
      <div className="property-row">
        <label className="property-label">Extrude</label>
        <select
          className="property-input"
          value={sketchExtrudeMode}
          onChange={(e) => setSketchExtrudeMode(e.target.value as 'walls' | 'solid')}
        >
          <option value="walls">Walls</option>
          <option value="solid">Solid 3D</option>
        </select>
      </div>
      <div className="property-row">
        <label className="property-label">Auto</label>
        <input
          type="checkbox"
          checked={autoExtrudeSketch}
          onChange={(e) => setAutoExtrudeSketch(e.target.checked)}
        />
      </div>
      <div className="property-row">
        <button
          className="toolbar-btn"
          type="button"
          disabled={sketchProfiles.length === 0 || extrudingSketch}
          onClick={() => { void handleExtrudeSketch() }}
          title={
            sketchProfiles.length === 0
              ? 'Draw at least one sketch rectangle first'
              : `Extrude ${sketchProfiles.length} sketch profile(s)`
          }
        >
          {extrudingSketch ? 'Extruding...' : `Extrude Sketch (${sketchProfiles.length})`}
        </button>
      </div>
      {activeTool === 'sketch' && (
        <div className="property-panel-meta">
          Auto-extrude uses Wall H/Wall T with mode {sketchExtrudeMode.toUpperCase()}.
        </div>
      )}
      <MaterialPicker />
    </div>
  )
}
