# DRY Tool Refactor: One Source of Truth for 2D/3D Tools

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Eliminate all duplicated logic between 2D and 3D tool implementations. Every tool works in both modes from a single hook + single component.

**Architecture:** Create `viewport-helpers.ts` for coordinate mapping, one `useXxxDrawing(mode)` hook per tool containing all logic, and one component per tool that renders in both 2D/3D based on a `mode` prop. Compose with `<XxxTool mode="3d" />` in App.tsx and `<XxxTool mode="2d" />` in Viewport2D.tsx.

**Tech Stack:** React 19, Three.js, @react-three/fiber, @react-three/drei, Zustand

---

## File Structure

### New Files
- `utils/viewport-helpers.ts` — coordinate mapping, position helpers, interaction plane props
- `hooks/useSlabDrawing.ts` — floor/foundation/parking logic
- `hooks/useWallDrawing.ts` — wall logic
- `hooks/useDoorDrawing.ts` — door logic
- `hooks/useWindowDrawing.ts` — window logic
- `hooks/useColumnDrawing.ts` — column logic
- `hooks/useBeamDrawing.ts` — beam logic
- `hooks/useRoofDrawing.ts` — roof logic
- `hooks/useStairDrawing.ts` — stair logic
- `hooks/useMeasureDrawing.ts` — measure logic
- `hooks/usePathMeasureDrawing.ts` — path measure logic
- `hooks/useAreaMeasureDrawing.ts` — area measure logic
- `hooks/useAngleMeasureDrawing.ts` — angle measure logic
- `hooks/useDimensionDrawing.ts` — dimension logic
- `hooks/useSpotElevationDrawing.ts` — spot elevation logic
- `hooks/useSketchDrawing.ts` — sketch logic
- `hooks/useSectionDrawing.ts` — section logic
- `components/tools/SlabTool.tsx` — unified floor/foundation/parking
- `components/tools/WallTool.tsx` — unified wall
- `components/tools/DoorTool.tsx` — unified door
- `components/tools/WindowTool.tsx` — unified window
- `components/tools/ColumnTool.tsx` — unified column
- `components/tools/BeamTool.tsx` — unified beam
- `components/tools/RoofTool.tsx` — unified roof
- `components/tools/StairTool.tsx` — unified stair
- `components/tools/MeasureTool2.tsx` — unified measure (replaces old)
- `components/tools/PathMeasureTool2.tsx` — unified path measure
- `components/tools/AreaMeasureTool2.tsx` — unified area measure
- `components/tools/AngleMeasureTool2.tsx` — unified angle measure
- `components/tools/DimensionTool.tsx` — unified dimension
- `components/tools/SpotElevationTool.tsx` — unified spot elevation
- `components/tools/SketchTool.tsx` — unified sketch
- `components/tools/SectionTool.tsx` — unified section

### Files to Delete (after migration)
- `components/viewport/FloorPlane.tsx`
- `components/viewport/FloorPlane2D.tsx`
- `components/viewport/WallPlane.tsx`
- `components/viewport/DoorPlane.tsx`
- `components/viewport/WindowPlane.tsx`
- `components/viewport/ColumnPlane.tsx`
- `components/viewport/BeamPlane.tsx`
- `components/viewport/RoofPlane.tsx`
- `components/viewport/StairPlane.tsx`
- `components/viewport/SketchPlane.tsx`
- `components/viewport/SectionPlane.tsx`
- `components/viewport/DimensionPlane.tsx`
- `components/viewport/DimensionPlane2D.tsx`
- `components/viewport/SpotElevationPlane.tsx`
- `components/viewport/SpotElevationPlane2D.tsx`
- `components/viewport/MeasurePlane2D.tsx`
- `components/viewport/PathMeasurePlane2D.tsx`
- `components/viewport/AreaMeasurePlane2D.tsx`
- `components/viewport/AngleMeasurePlane2D.tsx`
- `components/tools/MeasureTool.tsx` (old)
- `components/tools/PathMeasureTool.tsx` (old)
- `components/tools/AreaMeasureTool.tsx` (old)
- `components/tools/AngleMeasureTool.tsx` (old)

### Files to Modify
- `App.tsx` — replace old 3D plane imports with unified tool imports
- `components/viewport/Viewport2D.tsx` — replace old 2D plane imports with unified tool imports

---

## Chunk 1: Foundation — viewport-helpers.ts

### viewport-helpers.ts API

```typescript
export type ViewportMode = '2d' | '3d'

// Extract [x, y] plan coordinates from a Three.js pointer event
export function extractPlanPoint(e: ThreeEvent<PointerEvent>, mode: ViewportMode): [number, number]

// Convert plan point to world position for rendering
export function toWorldPosition(pt: [number, number], mode: ViewportMode, elevation: number): [number, number, number]

// Get interaction plane mesh props (position + rotation)
export function interactionPlaneProps(mode: ViewportMode, elevation: number): { position: [number, number, number]; rotation?: [number, number, number] }

// Z-depth for 2D overlays
export const PLANE_2D_Z = 0.05

// Cursor geometry size
export function cursorSize(mode: ViewportMode): number
```

---

## Chunk 2: Template — SlabTool (floor/foundation/parking)

Demonstrates the pattern. All other tools follow this exact structure.

### useSlabDrawing.ts hook
- All state (startCorner, previewCorner, cursorPoint, snapMarker)
- All store subscriptions
- All validation (min dimension, collision)
- Element creation + kernel persistence
- Readout updates
- Takes `mode: ViewportMode` to determine coordinate extraction
- Returns: `{ isActive, startCorner, previewData, cursorPoint, snapMarker, toolColor, cursorColor, slabLabel, handlePointerMove, handleClick, handleCancel, handlePointerLeave }`

### SlabTool.tsx component
- Takes `mode: ViewportMode` prop
- Calls `useSlabDrawing(mode)`
- Renders interaction plane, cursor, snap ring, preview rect, dimension badge
- Uses viewport-helpers for position mapping
- Mode determines: sphereGeometry vs circleGeometry, rotation, Z positions

---

## Chunk 3: Structural tools (wall, door, window, column, beam)

Each follows the SlabTool pattern. Tool-specific notes:

- **WallTool**: Chain drawing, ortho constraint, foundation containment, wall-to-wall snapping
- **DoorTool**: Wall detection, position-along-wall, width preview
- **WindowTool**: Same pattern as door
- **ColumnTool**: Single-click placement, rectangular footprint
- **BeamTool**: Two-point line, support detection (wall/column/beam)

---

## Chunk 4: Complex tools (roof, stair, sketch, section)

- **RoofTool**: Multi-point boundary, pitch, wall-based generation
- **StairTool**: Two-point + config (straight/spiral), risers, width
- **SketchTool**: Freehand multi-point, constraint solving
- **SectionTool**: Two-point cut line

---

## Chunk 5: Measurement tools refactor

- **MeasureTool**: Two-point distance
- **PathMeasureTool**: Multi-click cumulative
- **AreaMeasureTool**: Polygon close + shoelace
- **AngleMeasureTool**: Three-point arc
- **DimensionTool**: Two-point with sub-modes (aligned/horizontal/vertical/chain/baseline/ordinate)
- **SpotElevationTool**: Single-click elevation marker

---

## Chunk 6: Wire up App.tsx + Viewport2D.tsx + cleanup

Replace all old imports, delete old files, verify TypeScript + tests pass.
