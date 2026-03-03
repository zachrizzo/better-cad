import Anthropic from '@anthropic-ai/sdk'
import type { KernelBackend, PrototypeElement, WallElement } from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'
import { linearArray, polarArray, isArrayableElement } from './array-tools'
import { isWallElement } from '../stores/entity-store'

// ── Types ──────────────────────────────────────────────────────────────────

export type UiChatMessage =
  | { id: string; role: 'user'; content: string; images?: string[] }
  | { id: string; role: 'assistant'; content: string; streaming?: boolean }
  | { id: string; role: 'tool_call'; name: string; input: unknown; status: 'pending' | 'done' | 'error'; result?: string }
  | { id: string; role: 'plan'; content: string; status: 'pending' | 'approved' | 'revised' }

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; result: string; isError: boolean }
  | { type: 'plan_ready'; planText: string }
  | { type: 'complete'; apiMessages: Anthropic.MessageParam[] }

// ── Prompts ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert architectural BIM assistant for BetterCAD.
Coordinate system: X = east, Y = north, units = meters.
Origin (0,0) is the project origin.
For all 2D coordinate tool inputs, use exactly two numeric values: [x, y] (no z coordinate).
For standards/code/best-practice questions, ask for jurisdiction when missing and remind the user to verify with the local AHJ.
If a web-research tool is available, use it and cite sources.
When the user asks to remove elements, use delete_element (single) or delete_elements (bulk by kind/ids).
Use query_scene_summary first for context. Use query_elements for targeted geometry/details. Use query_building only when the user explicitly asks for a full raw dump.
Use get_level_id when you need to resolve a level ID by name, elevation, index, or active level.
Track scene_revision from query_scene_summary. If unchanged, reuse prior summary context instead of re-querying full state.
CRITICAL: Every physical element (wall, floor, column, stair, roof, beam, foundation, room) MUST have a level_id. Before creating any physical elements, first create a level using create_level, then pass that level's ID as the level_id parameter. If levels already exist (from query_scene_summary/query_elements), reuse them. For multi-story buildings, create one level per story first, then assign elements to the correct level.
Create buildings logically: levels → walls → floors → doors/windows → roof.
For create_roof: omit elevation unless the user explicitly requests a manual offset. By default, the roof should auto-elevate to sit on top of supporting geometry on its level.
Unless the user asks for a flat roof, default to roof_type="gable" with pitch around 30 degrees.
Prefer placing roofs on the highest occupied building level; do not invent an extra empty roof level unless the user asks for one.
Standard ceiling height: 3.0m. Standard wall thickness: 0.2m.
For doors: position_along_wall is 0.0–1.0 (fraction along wall length).
When adding multiple doors/windows on the same wall, ensure opening widths do not overlap. Prefer sequential placement and verify with query_elements before adding more openings on that wall.
Never run add_room/create_room_bundle in parallel for adjacent rooms. Create one room at a time, verify, then continue.
When creating a simple room, create 4 connected walls forming a rectangle.
Use add_room when the user asks to create a room: it builds walls + slab + named room + door + windows in one call by default, and can reuse existing collinear walls from the boundary.
Use create_room only for label-only/space-definition tasks where walls/door/windows already exist.
You may be creative with room planning when the user allows it: vary room proportions, use non-rectangular room boundaries, and create stronger zoning (public/private/service) with clear circulation.
Avoid monotonous room grids unless the user asks for it.
For house/home design requests, do not default to a plain rectangle unless the user explicitly asks for a box/simple layout.
When creativity is requested, include at least two design moves from this list: articulated footprint (L/T/U shape, inset, bay, courtyard), varied room sizes, asymmetrical circulation spine, angled or curved wall segment, double-height/focal space, indoor-outdoor transition.
For creative house layouts, make at least one of these true unless user constraints forbid it: (a) outer boundary has 6+ vertices, (b) at least one non-rectangular room, (c) at least two rooms have meaningfully different area (>=30% difference).
Keep layouts practical while being creative: maintain reasonable circulation paths and ensure each room can be accessed.
For room layouts, ensure every room has at least one door to a hall, adjacent room, or exterior unless the user explicitly requests sealed/service spaces.
After room creation or wall edits, verify room access using query_scene_summary (room_access) and add missing doors before finalizing.
Do not claim elements were created unless the corresponding creation tools actually succeeded. If you provide design/code guidance that is not modeled, label it clearly as guidance only.
When a build plan is approved, treat its TODO tasks as a contract. Before claiming completion, reconcile each planned task against scene state and completed tool calls.
If any planned task is still incomplete, explicitly say so (for example: "I planned to add furniture but have not placed furniture elements yet. I'll do that now.") and continue execution instead of finalizing.
If the user asks for furniture in the model, you MUST place actual furniture elements using place_furniture. A text-only furniture list is not a valid substitute unless the user explicitly asks for conceptual guidance only.
Before finalizing a task that includes furniture, verify with query_elements(kinds:["furniture"]) or query_scene_summary counts and report the actual furniture count. If the count is 0, explicitly state furniture is not yet placed and continue placing it.
Never create rooms to represent furniture. Do not use create_room/add_room as furniture placeholders.
If the user requests a furniture item with no exact symbol_type, map it to the nearest supported place_furniture symbol and state the mapping.
When completing furnishing tasks, ensure room count did not increase during furnishing. If furniture count is unchanged and room count increased, the furnishing task is incomplete.
If a tool_result is marked as an error, treat that call as failed. Do not mark the task complete, and do not call it a warning.
After any tool error: diagnose the cause from the message, inspect state with query_scene_summary/query_elements when needed, then retry with corrected parameters or choose a different tool.
Confirm what you are creating as you build it.
Use set_view_mode to switch between '3d', '2d', and 'split' viewports when verification requires a specific view.
Use take_2d_screenshot to verify plan/layout edits, and take_screenshot for 3D perspective checks.
After geometric edits, prefer a 2D screenshot verification pass before finalizing.
For multi-level buildings, work one level at a time: complete one level, verify it in 2D, then proceed to the next level.
Verification per level is mandatory before continuing: call set_view_mode('2d'), query scene state for that level, take_2d_screenshot, and only then move on.
When a user uploads a reference image, analyze it to understand the building they want and recreate it.
Use linear_array to create grids of columns or repetitive wall patterns efficiently.
Use polar_array to arrange elements in circular patterns (e.g., columns around a rotunda).
You can move, rotate, copy, and modify existing elements.
You can undo/redo actions.
You can export to IFC, DXF, and glTF formats.
You can create building levels, dimensions, and text annotations.
You can create dimensions (create_dimension, create_string_dimension), leader annotations, keynotes, and auto-generate room/door/window tags.
You can assign materials to elements using set_material, and list available materials with list_materials.
You can place electrical symbols (outlets, switches, light fixtures, panels, smoke detectors, GFCI outlets, three-way switches, dimmer switches, ceiling fans, thermostats) using place_electrical.
You can place plumbing fixtures (toilets, sinks, bathtubs, showers, water heaters, hose bibs) using place_plumbing.
You can place furniture (desks, chairs, tables, beds, sofas, dining tables, bookshelves, wardrobes, kitchen islands, refrigerators, stoves, nightstands, coffee tables, TV consoles, console tables, benches, ottomans, vanities) using place_furniture.
You can place site elements (property lines, setbacks, trees, parking spaces, sidewalks, driveways, compass, contour lines, fences) using place_site_element.
Use connect_switch_to_fixture to draw switching diagram lines from a switch to the light fixture it controls.`

const PLAN_MODE_ADDENDUM = `

You are in PLAN MODE. Before calling any building tools (create_wall, create_floor, create_door, create_window, create_stair, create_roof, create_column, create_room, add_room, create_room_bundle, create_beam, create_foundation, create_level, create_dimension, create_text_annotation, place_electrical, place_plumbing, place_furniture, place_site_element), output a structured text plan that includes:
1) Summary
2) TODO Task List (Markdown checklist using one item per line in this exact format: - [ ] Task)
3) Geometry details (element types, approximate coordinates, dimensions)
4) Layout intent (how circulation and zoning work; include creative choices when requested)
If the user requests creativity, include a "Creative Moves" subsection with at least 2 concrete moves and show how geometry reflects them.
5) Assumptions/risks
If the user requested furniture, include a concrete furniture placement phase that uses place_furniture, then a verification step that reports the resulting furniture count from scene data.
End your plan with the phrase [PLAN READY]. Do NOT call any creation tools until the user approves the plan. You may call query_scene_summary/query_elements (or query_building as fallback) to inspect current state.`

// ── Tool definitions ───────────────────────────────────────────────────────

const POINT2_SCHEMA = {
  type: 'array',
  items: { type: 'number' },
  minItems: 2,
  maxItems: 2,
  description: 'Point [x, y] in meters',
} as const

const POLYGON2_SCHEMA = {
  type: 'array',
  minItems: 3,
  items: {
    type: 'array',
    items: { type: 'number' },
    minItems: 2,
    maxItems: 2,
  },
  description: 'Boundary polygon as [[x,y],...] in meters',
} as const

const BBOX2_SCHEMA = {
  type: 'array',
  items: { type: 'number' },
  minItems: 4,
  maxItems: 4,
  description: 'Axis-aligned bbox [min_x, min_y, max_x, max_y] in meters',
} as const

const ROOM_BUNDLE_WINDOW_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    wall_index: { type: 'number', description: 'Perimeter wall index (0-based; wraps around if out of range)' },
    position_along_wall: { type: 'number', description: 'Position along wall, 0.0-1.0 (default: window_position_along_wall or 0.5)' },
    width: { type: 'number', description: 'Window width in meters (default: window_width or 1.2)' },
    height: { type: 'number', description: 'Window height in meters (default: window_height or 1.2)' },
    sill_height: { type: 'number', description: 'Sill height from floor in meters (default: window_sill_height or 0.9)' },
    name: { type: 'string', description: 'Optional custom window name' },
  },
  required: ['wall_index'],
} as const

const ROOM_BUNDLE_INPUT_PROPERTIES = {
  boundary: POLYGON2_SCHEMA,
  name: { type: 'string', description: 'Room name (e.g., "Living Room")' },
  level_id: { type: 'string', description: 'ID of the level this room belongs to' },
  wall_height: { type: 'number', description: 'Perimeter wall height in meters (default: 3.0)' },
  wall_thickness: { type: 'number', description: 'Perimeter wall thickness in meters (default: 0.2)' },
  create_floor: { type: 'boolean', description: 'Whether to create a floor slab using the same boundary (default: true)' },
  floor_thickness: { type: 'number', description: 'Floor thickness in meters (default: 0.25)' },
  create_default_door: { type: 'boolean', description: 'Whether to place one default door on a perimeter wall (default: true)' },
  door_wall_index: { type: 'number', description: 'Optional wall segment index for the default door (0-based)' },
  door_position_along_wall: { type: 'number', description: 'Door position along selected wall, 0.0-1.0 (default: 0.5)' },
  door_width: { type: 'number', description: 'Door width in meters (default: 0.9)' },
  door_height: { type: 'number', description: 'Door height in meters (default: 2.1)' },
  door_swing: { type: 'string', enum: ['left', 'right'], description: 'Door swing direction (default: right)' },
  create_default_windows: { type: 'boolean', description: 'Whether to place default windows on perimeter walls (default: true)' },
  default_window_count: { type: 'number', description: 'How many default windows to create when windows are not explicitly provided (default: 2)' },
  window_wall_indexes: {
    type: 'array',
    items: { type: 'number' },
    description: 'Optional perimeter wall indexes for default windows (0-based). Creates one window per listed wall.',
  },
  window_position_along_wall: { type: 'number', description: 'Default window position along selected wall, 0.0-1.0 (default: 0.5)' },
  window_width: { type: 'number', description: 'Default window width in meters (default: 1.2)' },
  window_height: { type: 'number', description: 'Default window height in meters (default: 1.2)' },
  window_sill_height: { type: 'number', description: 'Default window sill height from floor in meters (default: 0.9)' },
  windows: {
    type: 'array',
    description: 'Optional explicit windows list. If present, these windows are created instead of default windows.',
    items: ROOM_BUNDLE_WINDOW_ITEM_SCHEMA,
  },
} as const

const ROOM_BUNDLE_REQUIRED_FIELDS = ['boundary', 'name', 'level_id']

const BIM_TOOLS_BASE: Anthropic.Tool[] = [
  {
    name: 'query_scene_summary',
    description: 'Returns compact scene context (counts, levels, bounds, room access) plus scene_revision. Prefer this over query_building.',
    input_schema: {
      type: 'object',
      properties: {
        known_revision: {
          type: 'string',
          description: 'Last known scene_revision. If unchanged, returns unchanged=true with a minimal payload.',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_elements',
    description: 'Returns targeted elements with optional filters (kind, ids, level, bbox, fields). Use this instead of full-scene dumps.',
    input_schema: {
      type: 'object',
      properties: {
        kinds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional kinds filter (e.g., ["wall","door","room"])',
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional explicit element IDs',
        },
        level_id: {
          type: 'string',
          description: 'Optional level filter',
        },
        bbox: BBOX2_SCHEMA,
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional fields to return (e.g., ["meta.id","meta.name","start","end"]). "*" returns full elements.',
        },
        limit: {
          type: 'number',
          description: 'Max elements to return (default: 200, max: 1000)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_level_id',
    description: 'Resolve a level ID by level name, elevation, level index, or active level. Returns matching level metadata plus a primary level_id.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Optional level name to match (case-insensitive). Example: "Ground Floor".',
        },
        elevation: {
          type: 'number',
          description: 'Optional target elevation in meters.',
        },
        tolerance: {
          type: 'number',
          description: 'Elevation tolerance in meters when matching elevation (default: 0.01).',
        },
        level_index: {
          type: 'number',
          description: 'Optional 0-based index after sorting levels by elevation ascending.',
        },
        active_only: {
          type: 'boolean',
          description: 'If true, only return the currently active UI level.',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_building',
    description: 'Returns all current BIM elements as raw JSON. Expensive in context/tokens; use only when full dump is explicitly needed.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_wall',
    description: 'Create a wall segment. Coordinates are in meters. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        start: POINT2_SCHEMA,
        end: POINT2_SCHEMA,
        height: { type: 'number', description: 'Wall height in meters (default: 3.0)' },
        thickness: { type: 'number', description: 'Wall thickness in meters (default: 0.2)' },
        level_id: { type: 'string', description: 'ID of the level this wall belongs to (from create_level)' },
      },
      required: ['start', 'end', 'level_id'],
    },
  },
  {
    name: 'create_floor',
    description: 'Create a floor slab with a boundary polygon. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        boundary: POLYGON2_SCHEMA,
        thickness: { type: 'number', description: 'Floor thickness in meters (default: 0.25)' },
        level_id: { type: 'string', description: 'ID of the level this floor belongs to' },
      },
      required: ['boundary', 'level_id'],
    },
  },
  {
    name: 'create_column',
    description: 'Create a structural column. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        center: POINT2_SCHEMA,
        width: { type: 'number', description: 'Column width in meters (default: 0.3)' },
        depth: { type: 'number', description: 'Column depth in meters (default: 0.3)' },
        height: { type: 'number', description: 'Column height in meters (default: 3.0)' },
        level_id: { type: 'string', description: 'ID of the level this column belongs to' },
      },
      required: ['center', 'level_id'],
    },
  },
  {
    name: 'create_stair',
    description: 'Create a staircase. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        start: POINT2_SCHEMA,
        end: POINT2_SCHEMA,
        width: { type: 'number', description: 'Stair width in meters (default: 1.1)' },
        risers: { type: 'number', description: 'Number of risers (default: 16)' },
        total_height: { type: 'number', description: 'Total height in meters (default: 3.0)' },
        level_id: { type: 'string', description: 'ID of the level this stair belongs to' },
      },
      required: ['start', 'end', 'level_id'],
    },
  },
  {
    name: 'create_roof',
    description: 'Create a roof with a boundary polygon. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        boundary: POLYGON2_SCHEMA,
        roof_type: {
          type: 'string',
          enum: ['flat', 'gable', 'shed', 'hip'],
          description: 'Roof type (default: gable)',
        },
        pitch: { type: 'number', description: 'Roof pitch in degrees (default: 30 for pitched roofs, 0 for flat)' },
        elevation: {
          type: 'number',
          description: 'Optional manual roof offset above the level elevation in meters. Omit to auto-place roof at top support on that level.',
        },
        level_id: { type: 'string', description: 'ID of the level this roof belongs to (typically the top level)' },
      },
      required: ['boundary', 'level_id'],
    },
  },
  {
    name: 'create_room',
    description: 'Create only a room label with a boundary polygon (no walls/doors/windows). Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        boundary: POLYGON2_SCHEMA,
        name: { type: 'string', description: 'Room name (e.g., "Living Room")' },
        level_id: { type: 'string', description: 'ID of the level this room belongs to' },
      },
      required: ['boundary', 'name', 'level_id'],
    },
  },
  {
    name: 'add_room',
    description: 'Create a full room package from a boundary in one call: perimeter walls + optional slab + room entity + default door + default windows. Reuses existing collinear walls where possible and creates only missing spans. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: ROOM_BUNDLE_INPUT_PROPERTIES,
      required: ROOM_BUNDLE_REQUIRED_FIELDS,
    },
  },
  {
    name: 'create_room_bundle',
    description: 'Legacy alias of add_room. Create a full room package in one call: perimeter walls + optional slab + room entity + default door + default windows. Reuses existing collinear walls where possible and creates only missing spans. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: ROOM_BUNDLE_INPUT_PROPERTIES,
      required: ROOM_BUNDLE_REQUIRED_FIELDS,
    },
  },
  {
    name: 'clear_building',
    description: 'Remove all elements from the building model.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_beam',
    description: 'Create a structural beam between two 3D points. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        start: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Start point [x, y, z] in meters' },
        end: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'End point [x, y, z] in meters' },
        width: { type: 'number', description: 'Beam width in meters (default: 0.2)' },
        depth: { type: 'number', description: 'Beam depth in meters (default: 0.4)' },
        level_id: { type: 'string', description: 'ID of the level this beam belongs to' },
      },
      required: ['start', 'end', 'level_id'],
    },
  },
  {
    name: 'create_foundation',
    description: 'Create a foundation slab with a boundary polygon. Requires level_id.',
    input_schema: {
      type: 'object',
      properties: {
        boundary: POLYGON2_SCHEMA,
        thickness: { type: 'number', description: 'Foundation thickness in meters (default: 0.3)' },
        level_id: { type: 'string', description: 'ID of the level this foundation belongs to' },
      },
      required: ['boundary', 'level_id'],
    },
  },
  {
    name: 'set_view_mode',
    description: 'Switch the UI viewport mode to 3D, 2D, or split view. Use this before taking screenshots for verification.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['3d', '2d', 'split'],
          description: 'Viewport mode to activate',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'set_camera',
    description: 'Move the 3D viewport camera to a specific position and target. Use this to inspect your work from different angles.',
    input_schema: {
      type: 'object',
      properties: {
        position: {
          type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3,
          description: 'Camera position [x, y, z] in meters',
        },
        target: {
          type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3,
          description: 'Camera look-at target [x, y, z] in meters',
        },
      },
      required: ['position', 'target'],
    },
  },
  {
    name: 'take_screenshot',
    description: 'Capture a screenshot of the current 3D viewport. The screenshot will be returned as base64 PNG image data that you can analyze to verify your work.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'take_2d_screenshot',
    description: 'Capture a screenshot of the current 2D plan viewport for geometry verification. Returns base64 PNG image data.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'focus_element',
    description: 'Focus the camera on a specific element by its ID, zooming to show it clearly.',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'ID of the element to focus on' },
      },
      required: ['element_id'],
    },
  },
  {
    name: 'move_element',
    description: 'Move an element by a delta in X and Y. Does not apply to doors/windows (wall-hosted).',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'ID of the element to move' },
        dx: { type: 'number', description: 'Delta X in meters' },
        dy: { type: 'number', description: 'Delta Y in meters' },
      },
      required: ['element_id', 'dx', 'dy'],
    },
  },
  {
    name: 'rotate_element',
    description: 'Rotate an element around a center point. If no center is given, uses the element centroid. Does not apply to doors/windows (wall-hosted).',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'ID of the element to rotate' },
        angle_degrees: { type: 'number', description: 'Rotation angle in degrees (counter-clockwise positive)' },
        center_x: { type: 'number', description: 'X coordinate of rotation center (optional, defaults to element centroid)' },
        center_y: { type: 'number', description: 'Y coordinate of rotation center (optional, defaults to element centroid)' },
      },
      required: ['element_id', 'angle_degrees'],
    },
  },
  {
    name: 'copy_element',
    description: 'Copy an element with an offset. Does not apply to doors/windows (wall-hosted).',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'ID of the element to copy' },
        dx: { type: 'number', description: 'X offset for the copy in meters (default: 1)' },
        dy: { type: 'number', description: 'Y offset for the copy in meters (default: 0)' },
      },
      required: ['element_id'],
    },
  },
  {
    name: 'update_element',
    description: 'Update properties of an existing element (e.g., change wall height, column width, roof pitch). Cannot change element kind or meta.id.',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'ID of the element to update' },
        properties: {
          type: 'object',
          description: 'Key/value pairs to update (e.g., { "height": 4.0, "thickness": 0.3 }). Use "name" to update meta.name.',
        },
      },
      required: ['element_id', 'properties'],
    },
  },
  {
    name: 'undo',
    description: 'Undo the last action.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'redo',
    description: 'Redo a previously undone action.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_level',
    description: 'Create a building level (storey) with a name and elevation. Can also auto-generate a main shell (perimeter walls + slab).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Level name (e.g., "Ground Floor", "Level 1")' },
        elevation: { type: 'number', description: 'Level elevation in meters (e.g., 0.0 for ground, 3.0 for first floor)' },
        boundary: { ...POLYGON2_SCHEMA, description: 'Optional footprint boundary for auto shell [[x,y],...]. If omitted, shell can copy from a lower level.' },
        generate_shell: { type: 'boolean', description: 'Whether to create perimeter walls and optionally a slab for this level (default: true)' },
        create_floor: { type: 'boolean', description: 'Whether auto shell should create a floor slab (default: true)' },
        wall_height: { type: 'number', description: 'Auto shell wall height in meters (default: 3.0)' },
        wall_thickness: { type: 'number', description: 'Auto shell wall thickness in meters (default: 0.2)' },
        floor_thickness: { type: 'number', description: 'Auto shell floor thickness in meters (default: 0.25)' },
        copy_shell_from_level_id: { type: 'string', description: 'Optional level ID to copy shell boundary from when boundary is not provided.' },
      },
      required: ['name', 'elevation'],
    },
  },
  {
    name: 'create_dimension',
    description: 'Create a dimension annotation between two points.',
    input_schema: {
      type: 'object',
      properties: {
        p1: POINT2_SCHEMA,
        p2: POINT2_SCHEMA,
        offset: { type: 'number', description: 'Offset distance from the measured line in meters (default: 0.5)' },
        text_override: { type: 'string', description: 'Optional text to display instead of the measured distance' },
      },
      required: ['p1', 'p2'],
    },
  },
  {
    name: 'create_text_annotation',
    description: 'Create a text annotation at a given position.',
    input_schema: {
      type: 'object',
      properties: {
        position: POINT2_SCHEMA,
        text: { type: 'string', description: 'Text content' },
        font_size: { type: 'number', description: 'Font size in points (default: 12)' },
        rotation: { type: 'number', description: 'Rotation angle in degrees (default: 0)' },
      },
      required: ['position', 'text'],
    },
  },
  {
    name: 'set_material',
    description: 'Assign a material to an element by material ID. Pass null to clear the material.',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'ID of the element' },
        material_id: { type: ['string', 'null'], description: 'Material ID to assign, or null to clear' },
      },
      required: ['element_id', 'material_id'],
    },
  },
  {
    name: 'list_materials',
    description: 'List all available materials from the material library.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'export_ifc',
    description: 'Export the current building model as an IFC file and trigger download.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'export_dxf',
    description: 'Export the current building model as a DXF file and trigger download.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'export_gltf',
    description: 'Export the current building model as a glTF/GLB file and trigger download.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'place_electrical',
    description: 'Place an electrical symbol (outlet, switch, light fixture, panel, etc.) on the plan.',
    input_schema: {
      type: 'object',
      properties: {
        symbol_type: {
          type: 'string',
          enum: ['outlet', 'switch', 'light_fixture', 'panel', 'smoke_detector', 'junction_box', 'three_way_switch', 'dimmer_switch', 'gfci_outlet', 'floor_outlet', 'ceiling_fan', 'thermostat'],
          description: 'Type of electrical symbol',
        },
        position: POINT2_SCHEMA,
        rotation: { type: 'number', description: 'Rotation in radians (default: 0)' },
        level_id: { type: 'string', description: 'Optional level ID. Auto-resolved to the first level if omitted.' },
        circuit_id: { type: 'string', description: 'Optional circuit identifier' },
        connected_to: { type: 'string', description: 'Optional element_id of the fixture this switch controls (for switching diagrams)' },
      },
      required: ['symbol_type', 'position'],
    },
  },
  {
    name: 'place_plumbing',
    description: 'Place a plumbing fixture symbol (toilet, sink, bathtub, etc.) on the plan.',
    input_schema: {
      type: 'object',
      properties: {
        symbol_type: {
          type: 'string',
          enum: ['toilet', 'sink', 'bathtub', 'shower', 'water_heater', 'hose_bib', 'floor_drain', 'dishwasher', 'washing_machine', 'urinal'],
          description: 'Type of plumbing symbol',
        },
        position: POINT2_SCHEMA,
        rotation: { type: 'number', description: 'Rotation in radians (default: 0)' },
        level_id: { type: 'string', description: 'Optional level ID. Auto-resolved to the first level if omitted.' },
      },
      required: ['symbol_type', 'position'],
    },
  },
  {
    name: 'place_furniture',
    description: 'Place a real furniture element in the BIM scene (visible geometry), not just a label. Includes residential and commercial symbols (e.g., desk, bed, sofa, nightstand, coffee_table, tv_console, vanity).',
    input_schema: {
      type: 'object',
      properties: {
        symbol_type: {
          type: 'string',
          enum: ['desk', 'chair', 'table', 'bed', 'sofa', 'dining_table', 'bookshelf', 'wardrobe', 'toilet_stall', 'reception_desk', 'conference_table', 'kitchen_island', 'refrigerator', 'stove', 'washer', 'dryer', 'nightstand', 'coffee_table', 'tv_console', 'console_table', 'bench', 'ottoman', 'vanity'],
          description: 'Type of furniture',
        },
        position: POINT2_SCHEMA,
        rotation: { type: 'number', description: 'Rotation in radians (default: 0)' },
        level_id: { type: 'string', description: 'Optional level ID. Auto-resolved to the first level if omitted.' },
        width: { type: 'number', description: 'Width in meters (optional, uses default for type)' },
        depth: { type: 'number', description: 'Depth in meters (optional, uses default for type)' },
      },
      required: ['symbol_type', 'position'],
    },
  },
  {
    name: 'place_site_element',
    description: 'Place a site plan element (property line, tree, parking space, compass, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        detail_type: {
          type: 'string',
          enum: ['property_line', 'setback', 'tree', 'parking_space', 'sidewalk', 'driveway', 'compass', 'contour_line', 'fence', 'retaining'],
          description: 'Type of site element',
        },
        points: {
          type: 'array',
          items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
          minItems: 1,
          description: 'Points [[x,y],...] defining the element position/shape',
        },
        radius: { type: 'number', description: 'Radius in meters (for trees)' },
        elevation: { type: 'number', description: 'Elevation in meters (for contour lines)' },
      },
      required: ['detail_type', 'points'],
    },
  },
  {
    name: 'connect_switch_to_fixture',
    description: 'Connect a switch to a light fixture to draw a switching diagram line.',
    input_schema: {
      type: 'object',
      properties: {
        switch_id: { type: 'string', description: 'ID of the switch element' },
        fixture_id: { type: 'string', description: 'ID of the fixture element the switch controls' },
      },
      required: ['switch_id', 'fixture_id'],
    },
  },
]

const DOOR_TOOL: Anthropic.Tool = {
  name: 'create_door',
  description: 'Create a door in an existing wall. Requires at least one wall to exist.',
  input_schema: {
    type: 'object',
    properties: {
      wall_id: { type: 'string', description: 'ID of the wall to place the door in' },
      position_along_wall: { type: 'number', description: 'Position along wall 0.0 (start) to 1.0 (end)' },
      width: { type: 'number', description: 'Door width in meters (default: 0.9)' },
      height: { type: 'number', description: 'Door height in meters (default: 2.1)' },
      swing: { type: 'string', enum: ['left', 'right'], description: 'Door swing direction (default: right)' },
    },
    required: ['wall_id', 'position_along_wall'],
  },
}

const WINDOW_TOOL: Anthropic.Tool = {
  name: 'create_window',
  description: 'Create a window in an existing wall. Requires at least one wall to exist.',
  input_schema: {
    type: 'object',
    properties: {
      wall_id: { type: 'string', description: 'ID of the wall to place the window in' },
      position_along_wall: { type: 'number', description: 'Position along wall 0.0 (start) to 1.0 (end)' },
      width: { type: 'number', description: 'Window width in meters (default: 1.2)' },
      height: { type: 'number', description: 'Window height in meters (default: 1.2)' },
      sill_height: { type: 'number', description: 'Sill height from floor in meters (default: 0.9)' },
    },
    required: ['wall_id', 'position_along_wall'],
  },
}

const CLEANUP_WALLS_TOOL: Anthropic.Tool = {
  name: 'cleanup_walls',
  description: 'Auto-join wall endpoints that are close together and clean up wall intersections (T-junctions, L-junctions, overlaps).',
  input_schema: { type: 'object', properties: {}, required: [] },
}

const DELETE_TOOL: Anthropic.Tool = {
  name: 'delete_element',
  description: 'Delete a BIM element by its ID.',
  input_schema: {
    type: 'object',
    properties: {
      element_id: { type: 'string', description: 'ID of the element to delete' },
    },
    required: ['element_id'],
  },
}

const DELETE_ELEMENTS_TOOL: Anthropic.Tool = {
  name: 'delete_elements',
  description: 'Delete multiple BIM elements by IDs and/or by element kind.',
  input_schema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Explicit element IDs to delete',
      },
      kind: {
        type: 'string',
        enum: ['wall', 'door', 'window', 'floor', 'roof', 'stair', 'column', 'beam', 'room', 'dimension', 'text_annotation', 'level', 'electrical', 'plumbing', 'furniture', 'site_detail'],
        description: 'Delete all elements of this kind',
      },
    },
    required: [],
  },
}

const EXPORT_PDF_TOOL: Anthropic.Tool = {
  name: 'export_pdf',
  description: 'Export the current building as a PDF drawing set with plan view, schedules, and title block.',
  input_schema: {
    type: 'object',
    properties: {
      scale: { type: 'string', enum: ['1:50', '1:100', '1:200'], description: 'Drawing scale (default: 1:100)' },
    },
    required: [],
  },
}

const LINEAR_ARRAY_TOOL: Anthropic.Tool = {
  name: 'linear_array',
  description: 'Create a linear array of copies of an element. Great for column grids, repetitive walls, etc.',
  input_schema: {
    type: 'object',
    properties: {
      element_id: { type: 'string', description: 'ID of the element to array' },
      count: { type: 'number', description: 'Number of copies to create' },
      spacing_x: { type: 'number', description: 'X spacing between copies in meters (default: 3)' },
      spacing_y: { type: 'number', description: 'Y spacing between copies in meters (default: 0)' },
    },
    required: ['element_id', 'count'],
  },
}

const POLAR_ARRAY_TOOL: Anthropic.Tool = {
  name: 'polar_array',
  description: 'Create a polar (circular) array of copies of an element around a center point.',
  input_schema: {
    type: 'object',
    properties: {
      element_id: { type: 'string', description: 'ID of the element to array' },
      count: { type: 'number', description: 'Number of copies to create' },
      center_x: { type: 'number', description: 'X coordinate of rotation center in meters' },
      center_y: { type: 'number', description: 'Y coordinate of rotation center in meters' },
      total_angle: { type: 'number', description: 'Total angle in degrees (default: 360 for full circle)' },
    },
    required: ['element_id', 'count', 'center_x', 'center_y'],
  },
}

const STRING_DIMENSION_TOOL: Anthropic.Tool = {
  name: 'create_string_dimension',
  description: 'Create multiple sequential dimensions along a line (chain/string dimension). Requires 3+ points.',
  input_schema: {
    type: 'object',
    properties: {
      points: {
        type: 'array',
        minItems: 3,
        items: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
        description: 'Array of [x,y] points defining sequential dimension segments (3+ points)',
      },
      offset: { type: 'number', description: 'Offset distance from the measured line in meters (default: 0.5)' },
    },
    required: ['points'],
  },
}

const LEADER_TOOL: Anthropic.Tool = {
  name: 'create_leader',
  description: 'Create a leader annotation with an arrow pointing to a feature and text at the other end.',
  input_schema: {
    type: 'object',
    properties: {
      start: POINT2_SCHEMA,
      end: POINT2_SCHEMA,
      text: { type: 'string', description: 'Annotation text to display' },
    },
    required: ['start', 'end', 'text'],
  },
}

const KEYNOTE_TOOL: Anthropic.Tool = {
  name: 'create_keynote',
  description: 'Create a keynote symbol (numbered circle) at a position with descriptive text.',
  input_schema: {
    type: 'object',
    properties: {
      position: POINT2_SCHEMA,
      keynote_id: { type: 'string', description: 'Keynote number/ID (e.g., "1", "2A")' },
      text: { type: 'string', description: 'Keynote description text' },
    },
    required: ['position', 'keynote_id', 'text'],
  },
}

const AUTO_GENERATE_TAGS_TOOL: Anthropic.Tool = {
  name: 'auto_generate_tags',
  description: 'Automatically generate room, door, and/or window tags for all existing elements.',
  input_schema: {
    type: 'object',
    properties: {
      tag_types: {
        type: 'array',
        items: { type: 'string', enum: ['room', 'door', 'window'] },
        description: 'Which tag types to generate (default: all)',
      },
    },
    required: [],
  },
}

export function getAvailableTools(elements: PrototypeElement[], planMode = false): Anthropic.Tool[] {
  if (planMode) {
    const planTools = new Set([
      'query_scene_summary',
      'query_elements',
      'get_level_id',
      'query_building',
      'set_view_mode',
      'set_camera',
      'take_screenshot',
      'take_2d_screenshot',
    ])
    return BIM_TOOLS_BASE.filter((t) => planTools.has(t.name))
  }
  const tools = [...BIM_TOOLS_BASE]
  // Keep these tools always visible so the model can plan/edit consistently across turns.
  // Tool execution validates required prerequisites (e.g., host wall existence).
  tools.push(DOOR_TOOL)
  tools.push(WINDOW_TOOL)
  tools.push(CLEANUP_WALLS_TOOL)
  tools.push(DELETE_TOOL)
  tools.push(DELETE_ELEMENTS_TOOL)
  tools.push(EXPORT_PDF_TOOL)
  tools.push(LINEAR_ARRAY_TOOL)
  tools.push(POLAR_ARRAY_TOOL)
  tools.push(STRING_DIMENSION_TOOL)
  tools.push(LEADER_TOOL)
  tools.push(KEYNOTE_TOOL)
  tools.push(AUTO_GENERATE_TAGS_TOOL)
  return tools
}

// ── Tool execution ─────────────────────────────────────────────────────────

type ToolInput = Record<string, unknown>
type Point2 = [number, number]
type Bbox2 = [number, number, number, number]

type SceneRevisionCache = {
  signature: string
  revision: string
  summary: Record<string, unknown>
}

const WALL_INTERSECTION_EPS = 1e-6
const WALL_ENDPOINT_PARAM_EPS = 1e-3
const ROOM_DOOR_MATCH_TOLERANCE = 0.35
const QUERY_ELEMENTS_DEFAULT_LIMIT = 200
const QUERY_ELEMENTS_MAX_LIMIT = 1000
const OPENING_OVERLAP_EPS = 1e-8
const OPENING_DUPLICATE_POSITION_EPS = 1e-4
const OPENING_DUPLICATE_WIDTH_EPS = 1e-3

let sceneRevisionCounter = 0
let sceneCache: SceneRevisionCache | null = null

type SegmentIntersection =
  | { kind: 'none' }
  | { kind: 'point'; t: number; u: number }
  | { kind: 'overlap'; tStart: number; tEnd: number }

type WallPlacementConflict =
  | {
    kind: 'cross'
    wallId: string
    intersection: Point2
    t: number
    u: number
  }
  | {
    kind: 'overlap'
    wallId: string
    overlapLength: number
    tStart: number
    tEnd: number
  }

function parseFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field}: expected a finite number`)
  }
  return value
}

function parseOptionalFiniteNumber(value: unknown, defaultValue: number, field: string): number {
  if (value === undefined || value === null) return defaultValue
  return parseFiniteNumber(value, field)
}

function parsePoint2(value: unknown, field: string): [number, number] {
  if (Array.isArray(value)) {
    if (value.length !== 2) {
      throw new Error(`Invalid ${field}: expected [x, y] with exactly 2 numbers`)
    }
    return [
      parseFiniteNumber(value[0], `${field}[0]`),
      parseFiniteNumber(value[1], `${field}[1]`),
    ]
  }

  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    if ('x' in candidate && 'y' in candidate) {
      return [
        parseFiniteNumber(candidate.x, `${field}.x`),
        parseFiniteNumber(candidate.y, `${field}.y`),
      ]
    }
  }

  throw new Error(`Invalid ${field}: expected [x, y] or {x, y}`)
}

function parseBoundary2(value: unknown, field: string): [number, number][] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${field}: expected an array of points`)
  }
  const boundary = value.map((point, i) => parsePoint2(point, `${field}[${i}]`))
  if (boundary.length < 3) {
    throw new Error(`Invalid ${field}: expected at least 3 points`)
  }
  return boundary
}

function parseBoundedNumber(
  value: unknown,
  defaultValue: number,
  field: string,
  min: number,
  max: number,
): number {
  const n = parseOptionalFiniteNumber(value, defaultValue, field)
  if (n < min || n > max) {
    throw new Error(`Invalid ${field}: expected a number between ${min} and ${max}`)
  }
  return n
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}

function isEndpointParam(t: number): boolean {
  return t <= WALL_ENDPOINT_PARAM_EPS || t >= 1 - WALL_ENDPOINT_PARAM_EPS
}

function segmentIntersection(startA: Point2, endA: Point2, startB: Point2, endB: Point2): SegmentIntersection {
  const rX = endA[0] - startA[0]
  const rY = endA[1] - startA[1]
  const sX = endB[0] - startB[0]
  const sY = endB[1] - startB[1]
  const denom = cross2(rX, rY, sX, sY)
  const qpx = startB[0] - startA[0]
  const qpy = startB[1] - startA[1]
  const qpxr = cross2(qpx, qpy, rX, rY)

  if (Math.abs(denom) < WALL_INTERSECTION_EPS) {
    if (Math.abs(qpxr) >= WALL_INTERSECTION_EPS) {
      return { kind: 'none' }
    }

    const rLenSq = rX * rX + rY * rY
    if (rLenSq < WALL_INTERSECTION_EPS) return { kind: 'none' }
    const t0 = ((startB[0] - startA[0]) * rX + (startB[1] - startA[1]) * rY) / rLenSq
    const t1 = ((endB[0] - startA[0]) * rX + (endB[1] - startA[1]) * rY) / rLenSq
    const tMin = Math.max(0, Math.min(t0, t1))
    const tMax = Math.min(1, Math.max(t0, t1))
    if (tMax < tMin - WALL_INTERSECTION_EPS) return { kind: 'none' }
    return { kind: 'overlap', tStart: tMin, tEnd: tMax }
  }

  const t = cross2(qpx, qpy, sX, sY) / denom
  const u = cross2(qpx, qpy, rX, rY) / denom
  const tOnSeg = t >= -WALL_INTERSECTION_EPS && t <= 1 + WALL_INTERSECTION_EPS
  const uOnSeg = u >= -WALL_INTERSECTION_EPS && u <= 1 + WALL_INTERSECTION_EPS
  if (!tOnSeg || !uOnSeg) return { kind: 'none' }
  return { kind: 'point', t: clamp(t, 0, 1), u: clamp(u, 0, 1) }
}

function findWallPlacementConflict(start: Point2, end: Point2, walls: WallElement[]): WallPlacementConflict | null {
  const newLen = Math.hypot(end[0] - start[0], end[1] - start[1])
  for (const wall of walls) {
    const hit = segmentIntersection(start, end, wall.start, wall.end)
    if (hit.kind === 'none') continue

    if (hit.kind === 'point') {
      if (isEndpointParam(hit.t) || isEndpointParam(hit.u)) continue
      return {
        kind: 'cross',
        wallId: wall.meta.id,
        intersection: [
          start[0] + (end[0] - start[0]) * hit.t,
          start[1] + (end[1] - start[1]) * hit.t,
        ],
        t: hit.t,
        u: hit.u,
      }
    }

    if (hit.tEnd - hit.tStart > WALL_ENDPOINT_PARAM_EPS) {
      return {
        kind: 'overlap',
        wallId: wall.meta.id,
        overlapLength: Math.max(0, hit.tEnd - hit.tStart) * newLen,
        tStart: hit.tStart,
        tEnd: hit.tEnd,
      }
    }
  }
  return null
}

function formatPoint(point: Point2): string {
  return `[${point[0].toFixed(3)}, ${point[1].toFixed(3)}]`
}

// ── Coordinate transform helpers ──────────────────────────────────────────

function shiftElementCoords(el: PrototypeElement, dx: number, dy: number): PrototypeElement {
  const clone = JSON.parse(JSON.stringify(el)) as PrototypeElement
  switch (clone.kind) {
    case 'wall':
    case 'stair':
      (clone as any).start = [(clone as any).start[0] + dx, (clone as any).start[1] + dy]
      ;(clone as any).end = [(clone as any).end[0] + dx, (clone as any).end[1] + dy]
      break
    case 'column':
      (clone as any).center = [(clone as any).center[0] + dx, (clone as any).center[1] + dy]
      break
    case 'floor':
    case 'roof':
    case 'foundation':
    case 'room':
      (clone as any).boundary = (clone as any).boundary.map((p: number[]) => [p[0] + dx, p[1] + dy])
      break
    case 'beam':
      (clone as any).start = [(clone as any).start[0] + dx, (clone as any).start[1] + dy, (clone as any).start[2]]
      ;(clone as any).end = [(clone as any).end[0] + dx, (clone as any).end[1] + dy, (clone as any).end[2]]
      break
    case 'electrical':
    case 'plumbing':
    case 'furniture':
      (clone as any).position = [(clone as any).position[0] + dx, (clone as any).position[1] + dy]
      break
    case 'site_detail':
      (clone as any).points = (clone as any).points.map((p: number[]) => [p[0] + dx, p[1] + dy])
      break
    // door/window are wall-hosted, skip
  }
  return clone
}

function rotatePoint(px: number, py: number, cx: number, cy: number, angleDeg: number): [number, number] {
  const rad = angleDeg * Math.PI / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const dx = px - cx, dy = py - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

function computeElementCentroid(el: PrototypeElement): [number, number] {
  switch (el.kind) {
    case 'wall':
    case 'stair': {
      const s = (el as any).start as number[]
      const e = (el as any).end as number[]
      return [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2]
    }
    case 'column':
      return [(el as any).center[0], (el as any).center[1]]
    case 'floor':
    case 'roof':
    case 'foundation':
    case 'room': {
      const b = (el as any).boundary as number[][]
      const cx = b.reduce((s: number, p: number[]) => s + p[0], 0) / b.length
      const cy = b.reduce((s: number, p: number[]) => s + p[1], 0) / b.length
      return [cx, cy]
    }
    case 'beam': {
      const s = (el as any).start as number[]
      const e = (el as any).end as number[]
      return [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2]
    }
    case 'electrical':
    case 'plumbing':
    case 'furniture':
      return [(el as any).position[0], (el as any).position[1]]
    case 'site_detail': {
      const pts = (el as any).points as number[][]
      if (pts.length === 0) return [0, 0]
      const sx = pts.reduce((s: number, p: number[]) => s + p[0], 0) / pts.length
      const sy = pts.reduce((s: number, p: number[]) => s + p[1], 0) / pts.length
      return [sx, sy]
    }
    default:
      return [0, 0]
  }
}

function rotateElementCoords(el: PrototypeElement, angleDeg: number, cx: number, cy: number): PrototypeElement {
  const clone = JSON.parse(JSON.stringify(el)) as PrototypeElement
  switch (clone.kind) {
    case 'wall':
    case 'stair': {
      const s = (clone as any).start as number[]
      const e = (clone as any).end as number[]
      ;(clone as any).start = rotatePoint(s[0], s[1], cx, cy, angleDeg)
      ;(clone as any).end = rotatePoint(e[0], e[1], cx, cy, angleDeg)
      break
    }
    case 'column': {
      const c = (clone as any).center as number[]
      ;(clone as any).center = rotatePoint(c[0], c[1], cx, cy, angleDeg)
      break
    }
    case 'floor':
    case 'roof':
    case 'foundation':
    case 'room':
      (clone as any).boundary = (clone as any).boundary.map((p: number[]) => rotatePoint(p[0], p[1], cx, cy, angleDeg))
      break
    case 'beam': {
      const s = (clone as any).start as number[]
      const e = (clone as any).end as number[]
      const rs = rotatePoint(s[0], s[1], cx, cy, angleDeg)
      const re = rotatePoint(e[0], e[1], cx, cy, angleDeg)
      ;(clone as any).start = [rs[0], rs[1], s[2]]
      ;(clone as any).end = [re[0], re[1], e[2]]
      break
    }
    case 'electrical':
    case 'plumbing':
    case 'furniture': {
      const p = (clone as any).position as number[]
      ;(clone as any).position = rotatePoint(p[0], p[1], cx, cy, angleDeg)
      ;(clone as any).rotation = ((clone as any).rotation || 0) + angleDeg * Math.PI / 180
      break
    }
    case 'site_detail':
      (clone as any).points = (clone as any).points.map((p: number[]) => rotatePoint(p[0], p[1], cx, cy, angleDeg))
      break
    // door/window are wall-hosted, skip
  }
  return clone
}

function hashStringFnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function getSceneSignature(elements: PrototypeElement[]): string {
  return hashStringFnv1a(JSON.stringify(elements))
}

function wallPointAt(wall: WallElement, t: number): Point2 {
  const clamped = clamp(t, 0, 1)
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * clamped,
    wall.start[1] + (wall.end[1] - wall.start[1]) * clamped,
  ]
}

function parsePositionAlongWallSafe(value: unknown, defaultValue = 0.5): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue
  return clamp(value, 0, 1)
}

function getHostWallId(element: PrototypeElement): string | null {
  const wallId = (element as any).wall_id
  if (typeof wallId === 'string' && wallId.trim().length > 0) return wallId
  const hostId = element.meta.host_id
  if (typeof hostId === 'string' && hostId.trim().length > 0) return hostId
  return null
}

type WallHostedOpening = {
  id: string
  kind: 'door' | 'window'
  wall_id: string
  position_along_wall: number
  width: number
  start: number
  end: number
}

function getWallLength(wall: WallElement): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}

function openingIntervalOnWall(
  wallLength: number,
  positionAlongWall: number,
  openingWidth: number,
): { start: number; end: number } | null {
  if (!Number.isFinite(wallLength) || wallLength <= OPENING_OVERLAP_EPS) return null
  if (!Number.isFinite(openingWidth) || openingWidth <= 0) return null
  const center = clamp(positionAlongWall, 0, 1) * wallLength
  const half = openingWidth * 0.5
  const start = Math.max(0, center - half)
  const end = Math.min(wallLength, center + half)
  if (end - start <= OPENING_OVERLAP_EPS) return null
  return { start, end }
}

function collectOpeningsOnWall(
  elements: PrototypeElement[],
  wallId: string,
  wallLength: number,
  excludeId?: string,
): WallHostedOpening[] {
  const openings: WallHostedOpening[] = []
  for (const element of elements) {
    if (element.meta.id === excludeId) continue
    if (element.kind !== 'door' && element.kind !== 'window') continue
    const hostWallId = getHostWallId(element)
    if (hostWallId !== wallId) continue
    const positionAlongWall = parsePositionAlongWallSafe((element as any).position_along_wall, 0.5)
    const width = typeof (element as any).width === 'number' ? (element as any).width : NaN
    const interval = openingIntervalOnWall(wallLength, positionAlongWall, width)
    if (!interval) continue
    openings.push({
      id: element.meta.id,
      kind: element.kind,
      wall_id: wallId,
      position_along_wall: positionAlongWall,
      width,
      start: interval.start,
      end: interval.end,
    })
  }
  openings.sort((a, b) => a.start - b.start)
  return openings
}

function findFirstOverlappingOpeningPair(
  openings: WallHostedOpening[],
): [WallHostedOpening, WallHostedOpening] | null {
  for (let i = 0; i < openings.length - 1; i += 1) {
    const current = openings[i]
    const next = openings[i + 1]
    if (next.start < current.end - OPENING_OVERLAP_EPS) {
      return [current, next]
    }
  }
  return null
}

function findOpeningOverlap(
  candidate: { start: number; end: number },
  openings: WallHostedOpening[],
): WallHostedOpening | null {
  return openings.find((opening) => (
    candidate.end > opening.start + OPENING_OVERLAP_EPS &&
    opening.end > candidate.start + OPENING_OVERLAP_EPS
  )) ?? null
}

function findDuplicateOpeningOfKind(
  kind: 'door' | 'window',
  positionAlongWall: number,
  width: number,
  openings: WallHostedOpening[],
): WallHostedOpening | null {
  return openings.find((opening) => (
    opening.kind === kind &&
    Math.abs(opening.position_along_wall - positionAlongWall) <= OPENING_DUPLICATE_POSITION_EPS &&
    Math.abs(opening.width - width) <= OPENING_DUPLICATE_WIDTH_EPS
  )) ?? null
}

function getElementLevelId(element: PrototypeElement, wallById: Map<string, WallElement>): string | null {
  if (typeof element.meta.level_id === 'string' && element.meta.level_id.trim().length > 0) {
    return element.meta.level_id
  }
  if (element.kind === 'door' || element.kind === 'window') {
    const hostWallId = getHostWallId(element)
    if (!hostWallId) return null
    return wallById.get(hostWallId)?.meta.level_id ?? null
  }
  return null
}

function getElementPoints2D(element: PrototypeElement, wallById: Map<string, WallElement>): Point2[] {
  switch (element.kind) {
    case 'wall': {
      const wall = element as any
      return [wall.start, wall.end]
    }
    case 'stair': {
      const stair = element as any
      return [stair.start, stair.end]
    }
    case 'column':
      if (Array.isArray((element as any).center) && (element as any).center.length >= 2) {
        return [[(element as any).center[0], (element as any).center[1]]]
      }
      return []
    case 'floor':
    case 'roof':
    case 'foundation':
    case 'room':
      return Array.isArray((element as any).boundary) ? (element as any).boundary : []
    case 'beam': {
      const beam = element as any
      return [
        [beam.start[0], beam.start[1]],
        [beam.end[0], beam.end[1]],
      ]
    }
    case 'electrical':
    case 'plumbing':
    case 'furniture':
    case 'dimension':
    case 'text_annotation':
    case 'leader_annotation':
    case 'keynote':
    case 'tag': {
      const position = (element as any).position
      if (Array.isArray(position) && position.length >= 2) {
        return [[position[0], position[1]]]
      }
      if (element.kind === 'dimension') {
        const p1 = (element as any).p1
        const p2 = (element as any).p2
        if (Array.isArray(p1) && p1.length >= 2 && Array.isArray(p2) && p2.length >= 2) {
          return [
            [p1[0], p1[1]],
            [p2[0], p2[1]],
          ]
        }
      }
      if (element.kind === 'leader_annotation') {
        const start = (element as any).start
        const end = (element as any).end
        if (Array.isArray(start) && start.length >= 2 && Array.isArray(end) && end.length >= 2) {
          return [
            [start[0], start[1]],
            [end[0], end[1]],
          ]
        }
      }
      return []
    }
    case 'site_detail':
      return Array.isArray((element as any).points) ? (element as any).points : []
    case 'door':
    case 'window': {
      const hostWallId = getHostWallId(element)
      if (!hostWallId) return []
      const hostWall = wallById.get(hostWallId)
      if (!hostWall) return []
      const t = parsePositionAlongWallSafe((element as any).position_along_wall, 0.5)
      return [wallPointAt(hostWall, t)]
    }
    default:
      return []
  }
}

function pointsBounds(points: Point2[]): Bbox2 | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX)) return null
  return [minX, minY, maxX, maxY]
}

function bboxesOverlap(a: Bbox2, b: Bbox2): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])
}

function parseOptionalBbox(value: unknown): Bbox2 | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('Invalid bbox: expected [min_x, min_y, max_x, max_y]')
  }
  const minX = parseFiniteNumber(value[0], 'bbox[0]')
  const minY = parseFiniteNumber(value[1], 'bbox[1]')
  const maxX = parseFiniteNumber(value[2], 'bbox[2]')
  const maxY = parseFiniteNumber(value[3], 'bbox[3]')
  return [
    Math.min(minX, maxX),
    Math.min(minY, maxY),
    Math.max(minX, maxX),
    Math.max(minY, maxY),
  ]
}

function distancePointToSegment(point: Point2, start: Point2, end: Point2): number {
  const vx = end[0] - start[0]
  const vy = end[1] - start[1]
  const wx = point[0] - start[0]
  const wy = point[1] - start[1]
  const lenSq = vx * vx + vy * vy
  if (lenSq < 1e-12) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const t = clamp((wx * vx + wy * vy) / lenSq, 0, 1)
  const projX = start[0] + vx * t
  const projY = start[1] + vy * t
  return Math.hypot(point[0] - projX, point[1] - projY)
}

function pointNearPolygonBoundary(point: Point2, boundary: Point2[], tolerance: number): boolean {
  if (!Array.isArray(boundary) || boundary.length < 2) return false
  for (let i = 0; i < boundary.length; i += 1) {
    const a = boundary[i]
    const b = boundary[(i + 1) % boundary.length]
    if (!Array.isArray(a) || !Array.isArray(b)) continue
    if (distancePointToSegment(point, a, b) <= tolerance) return true
  }
  return false
}

function buildRoomAccessSummary(elements: PrototypeElement[], wallById: Map<string, WallElement>): Record<string, unknown> {
  const rooms = elements.filter((element) => element.kind === 'room')
  const doorAnchors = elements
    .filter((element) => element.kind === 'door')
    .map((door) => {
      const hostWallId = getHostWallId(door)
      if (!hostWallId) return null
      const hostWall = wallById.get(hostWallId)
      if (!hostWall) return null
      const point = wallPointAt(hostWall, parsePositionAlongWallSafe((door as any).position_along_wall, 0.5))
      return {
        door_id: door.meta.id,
        level_id: getElementLevelId(door, wallById),
        point,
      }
    })
    .filter((anchor): anchor is { door_id: string; level_id: string | null; point: Point2 } => Boolean(anchor))

  const roomsSummary = rooms.map((room) => {
    const levelId = getElementLevelId(room, wallById)
    const boundary = Array.isArray((room as any).boundary) ? (room as any).boundary as Point2[] : []
    let doorCount = 0
    const matchedDoorIds: string[] = []
    for (const anchor of doorAnchors) {
      if (levelId && anchor.level_id && anchor.level_id !== levelId) continue
      if (!pointNearPolygonBoundary(anchor.point, boundary, ROOM_DOOR_MATCH_TOLERANCE)) continue
      doorCount += 1
      matchedDoorIds.push(anchor.door_id)
    }
    return {
      room_id: room.meta.id,
      name: room.meta.name,
      level_id: levelId,
      door_count: doorCount,
      door_ids: matchedDoorIds,
    }
  })

  const roomsWithoutDoors = roomsSummary
    .filter((room) => room.door_count === 0)
    .map((room) => ({ room_id: room.room_id, name: room.name, level_id: room.level_id }))

  return {
    room_count: roomsSummary.length,
    rooms_with_doors: roomsSummary.filter((room) => room.door_count > 0).length,
    rooms_without_doors: roomsWithoutDoors,
    rooms: roomsSummary,
  }
}

function getNestedValue(source: unknown, path: string[]): unknown {
  let cursor = source as any
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || !(key in cursor)) return undefined
    cursor = cursor[key]
  }
  return cursor
}

function cloneJsonValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]
    const existing = cursor[key]
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[path[path.length - 1]] = value
}

function projectElementFields(element: PrototypeElement, fields: string[]): Record<string, unknown> | PrototypeElement {
  if (fields.includes('*')) return cloneJsonValue(element)

  const projected: Record<string, unknown> = {
    kind: element.kind,
    meta: { id: element.meta.id },
  }

  for (const rawField of fields) {
    const field = rawField.trim()
    if (!field) continue
    if (field === 'kind') {
      projected.kind = element.kind
      continue
    }
    if (field === 'meta') {
      projected.meta = cloneJsonValue(element.meta)
      continue
    }
    const path = field.split('.').map((segment) => segment.trim()).filter(Boolean)
    if (path.length === 0) continue
    const value = getNestedValue(element, path)
    if (value === undefined) continue
    setNestedValue(projected, path, cloneJsonValue(value))
  }

  if (typeof element.meta.level_id === 'string') {
    const meta = projected.meta as Record<string, unknown>
    if (!('level_id' in meta)) meta.level_id = element.meta.level_id
  }
  return projected
}

function buildSceneSummary(elements: PrototypeElement[], revision: string): Record<string, unknown> {
  const wallById = new Map(
    elements
      .filter((element): element is WallElement => isWallElement(element))
      .map((wall) => [wall.meta.id, wall]),
  )

  const countsByKind: Record<string, number> = {}
  const elementCountByLevel = new Map<string, number>()
  for (const element of elements) {
    countsByKind[element.kind] = (countsByKind[element.kind] ?? 0) + 1
    if (element.kind === 'level') continue
    const levelId = getElementLevelId(element, wallById)
    if (!levelId) continue
    elementCountByLevel.set(levelId, (elementCountByLevel.get(levelId) ?? 0) + 1)
  }

  const levels = elements
    .filter((element) => element.kind === 'level')
    .map((level) => ({
      id: level.meta.id,
      name: level.meta.name,
      elevation: (level as any).elevation,
      element_count: elementCountByLevel.get(level.meta.id) ?? 0,
    }))
    .sort((a, b) => a.elevation - b.elevation)

  let bounds: Bbox2 | null = null
  for (const element of elements) {
    const elementBounds = pointsBounds(getElementPoints2D(element, wallById))
    if (!elementBounds) continue
    if (!bounds) {
      bounds = elementBounds
      continue
    }
    bounds = [
      Math.min(bounds[0], elementBounds[0]),
      Math.min(bounds[1], elementBounds[1]),
      Math.max(bounds[2], elementBounds[2]),
      Math.max(bounds[3], elementBounds[3]),
    ]
  }

  return {
    scene_revision: revision,
    element_count: elements.length,
    level_count: levels.length,
    counts_by_kind: countsByKind,
    levels,
    bounds: bounds
      ? {
          min_x: Number(bounds[0].toFixed(4)),
          min_y: Number(bounds[1].toFixed(4)),
          max_x: Number(bounds[2].toFixed(4)),
          max_y: Number(bounds[3].toFixed(4)),
        }
      : null,
    room_access: buildRoomAccessSummary(elements, wallById),
  }
}

function getSceneSnapshot(elements: PrototypeElement[]): { revision: string; summary: Record<string, unknown>; unchanged: boolean } {
  const signature = getSceneSignature(elements)
  if (sceneCache && sceneCache.signature === signature) {
    return { revision: sceneCache.revision, summary: sceneCache.summary, unchanged: true }
  }
  sceneRevisionCounter += 1
  const revision = `rev-${sceneRevisionCounter}-${signature}`
  const summary = buildSceneSummary(elements, revision)
  sceneCache = {
    signature,
    revision,
    summary,
  }
  return { revision, summary, unchanged: false }
}

function normalizeBoundaryLoop(boundary: Point2[]): Point2[] {
  if (boundary.length === 0) return boundary
  const normalized = [...boundary]
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  if (Math.abs(first[0] - last[0]) < 1e-8 && Math.abs(first[1] - last[1]) < 1e-8) {
    normalized.pop()
  }
  return normalized
}

function polygonAreaAbs(boundary: Point2[]): number {
  if (boundary.length < 3) return 0
  let sum = 0
  for (let i = 0; i < boundary.length; i += 1) {
    const a = boundary[i]
    const b = boundary[(i + 1) % boundary.length]
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(sum * 0.5)
}

function getFootprintBoundaryForLevel(elements: PrototypeElement[], levelId: string): Point2[] | null {
  const candidates = elements
    .filter((element) => {
      if (element.meta.level_id !== levelId) return false
      return element.kind === 'floor' || element.kind === 'foundation'
    })
    .map((element) => normalizeBoundaryLoop((element as any).boundary as Point2[]))
    .filter((boundary) => boundary.length >= 3)

  if (candidates.length > 0) {
    const best = [...candidates].sort((a, b) => polygonAreaAbs(b) - polygonAreaAbs(a))[0]
    return best
  }

  const walls = elements.filter(
    (element): element is WallElement =>
      isWallElement(element) && (element.meta.level_id === levelId || (!element.meta.level_id && levelId.length > 0)),
  )
  if (walls.length < 2) return null
  const points: Point2[] = []
  for (const wall of walls) {
    points.push([wall.start[0], wall.start[1]], [wall.end[0], wall.end[1]])
  }
  const bbox = pointsBounds(points)
  if (!bbox) return null
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[2], bbox[3]],
    [bbox[0], bbox[3]],
  ]
}

function getLevelElevationMap(elements: PrototypeElement[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const element of elements) {
    if (element.kind !== 'level') continue
    map.set(element.meta.id, (element as any).elevation as number)
  }
  return map
}

function findBoundaryForNewLevelShell(
  elements: PrototypeElement[],
  newLevelElevation: number,
  copyFromLevelId?: string,
): Point2[] | null {
  if (copyFromLevelId) {
    const explicit = getFootprintBoundaryForLevel(elements, copyFromLevelId)
    if (explicit) return explicit
  }

  const levelElevation = getLevelElevationMap(elements)
  const lowerLevels = Array.from(levelElevation.entries())
    .filter(([, elevation]) => elevation < newLevelElevation)
    .sort((a, b) => b[1] - a[1])

  for (const [levelId] of lowerLevels) {
    const boundary = getFootprintBoundaryForLevel(elements, levelId)
    if (boundary) return boundary
  }

  return null
}

/** Resolve level_id from input or auto-find the first existing level */
async function resolveLevelId(input: ToolInput, kernel: KernelBackend): Promise<string> {
  if (typeof input.level_id === 'string' && input.level_id.trim().length > 0) {
    return input.level_id
  }
  // Auto-find the first level
  const elements = await kernel.queryElements()
  const level = elements.find((e) => e.kind === 'level')
  if (level) return level.meta.id
  // No levels exist — auto-create a default one
  const defaultLevelId = crypto.randomUUID()
  await kernel.createElement({
    kind: 'level',
    meta: { id: defaultLevelId, name: 'Level 1' },
    elevation: 0,
  } as any)
  return defaultLevelId
}

async function executeTool(name: string, input: ToolInput, kernel: KernelBackend): Promise<string> {
  switch (name) {
    case 'query_scene_summary': {
      const elements = await kernel.queryElements()
      const snapshot = getSceneSnapshot(elements)
      const knownRevision = typeof input.known_revision === 'string' ? input.known_revision : null

      if (knownRevision && knownRevision === snapshot.revision) {
        return JSON.stringify({
          scene_revision: snapshot.revision,
          unchanged: true,
          message: 'Scene unchanged. Reuse your prior query_scene_summary result.',
        })
      }

      return JSON.stringify({
        ...snapshot.summary,
        unchanged: false,
      })
    }

    case 'query_elements': {
      const elements = await kernel.queryElements()
      const snapshot = getSceneSnapshot(elements)
      const wallById = new Map(
        elements
          .filter((element): element is WallElement => isWallElement(element))
          .map((wall) => [wall.meta.id, wall]),
      )

      const kinds = Array.isArray(input.kinds)
        ? Array.from(new Set(input.kinds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
        : []
      const ids = Array.isArray(input.ids)
        ? Array.from(new Set(input.ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
        : []
      const levelId = typeof input.level_id === 'string' && input.level_id.trim().length > 0
        ? input.level_id
        : null
      const bbox = parseOptionalBbox(input.bbox)
      const fields = Array.isArray(input.fields)
        ? Array.from(new Set(input.fields.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
        : []
      const limit = Math.min(
        QUERY_ELEMENTS_MAX_LIMIT,
        Math.max(1, Math.round(parseOptionalFiniteNumber(input.limit, QUERY_ELEMENTS_DEFAULT_LIMIT, 'limit'))),
      )

      let filtered = elements
      if (kinds.length > 0) {
        const kindSet = new Set(kinds)
        filtered = filtered.filter((element) => kindSet.has(element.kind))
      }
      if (ids.length > 0) {
        const idSet = new Set(ids)
        filtered = filtered.filter((element) => idSet.has(element.meta.id))
      }
      if (levelId) {
        filtered = filtered.filter((element) => getElementLevelId(element, wallById) === levelId)
      }
      if (bbox) {
        filtered = filtered.filter((element) => {
          const elementBounds = pointsBounds(getElementPoints2D(element, wallById))
          if (!elementBounds) return false
          return bboxesOverlap(elementBounds, bbox)
        })
      }

      filtered = [...filtered].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
        return a.meta.id.localeCompare(b.meta.id)
      })

      const totalMatching = filtered.length
      const resultElements = filtered.slice(0, limit).map((element) => {
        if (fields.length === 0) return element
        return projectElementFields(element, fields)
      })

      return JSON.stringify({
        scene_revision: snapshot.revision,
        total_matching: totalMatching,
        returned: resultElements.length,
        truncated: totalMatching > resultElements.length,
        elements: resultElements,
      })
    }

    case 'get_level_id': {
      const levels = (await kernel.queryElements())
        .filter((element): element is PrototypeElement => element.kind === 'level')
        .map((element) => {
          const elevation = parseOptionalFiniteNumber((element as any).elevation, 0, 'level.elevation')
          return {
            id: element.meta.id,
            name: element.meta.name ?? 'Level',
            elevation,
          }
        })
        .sort((a, b) => {
          if (a.elevation !== b.elevation) return a.elevation - b.elevation
          return a.name.localeCompare(b.name)
        })
        .map((level, index) => ({ ...level, level_index: index }))

      const targetName = typeof input.name === 'string' ? input.name.trim().toLowerCase() : null
      const hasElevation = typeof input.elevation === 'number' && Number.isFinite(input.elevation)
      const targetElevation = hasElevation ? (input.elevation as number) : null
      const tolerance = Math.max(0, parseOptionalFiniteNumber(input.tolerance, 0.01, 'tolerance'))
      const hasLevelIndex = typeof input.level_index === 'number' && Number.isFinite(input.level_index)
      const targetLevelIndex = hasLevelIndex ? Math.max(0, Math.floor(input.level_index as number)) : null
      const activeOnly = Boolean(input.active_only)

      const { useLevelStore } = await import('../stores/level-store')
      const activeLevelId = useLevelStore.getState().activeLevelId

      let matches = [...levels]

      if (activeOnly) {
        matches = matches.filter((level) => level.id === activeLevelId)
      }

      if (targetName && targetName.length > 0) {
        const exact = matches.filter((level) => level.name.toLowerCase() === targetName)
        const partial = matches.filter((level) => level.name.toLowerCase().includes(targetName))
        matches = exact.length > 0 ? exact : partial
      }

      if (targetElevation !== null) {
        matches = matches.filter((level) => Math.abs(level.elevation - targetElevation) <= tolerance)
      }

      if (targetLevelIndex !== null) {
        matches = matches.filter((level) => level.level_index === targetLevelIndex)
      }

      const primary = matches[0] ?? null

      return JSON.stringify({
        success: true,
        level_id: primary?.id ?? null,
        active_level_id: activeLevelId ?? null,
        match_count: matches.length,
        matches,
        levels,
        message: primary
          ? `Resolved level_id ${primary.id}${matches.length > 1 ? ` (${matches.length} matches)` : ''}`
          : 'No matching level found',
      })
    }

    case 'query_building': {
      const elements = await kernel.queryElements()
      getSceneSnapshot(elements)
      return JSON.stringify(elements)
    }

    case 'create_wall': {
      const start = parsePoint2(input.start, 'start')
      const end = parsePoint2(input.end, 'end')
      const height = parseOptionalFiniteNumber(input.height, 3.0, 'height')
      const thickness = parseOptionalFiniteNumber(input.thickness, 0.2, 'thickness')
      const levelId = await resolveLevelId(input, kernel)
      console.info('[BetterCAD AI][create_wall] request', {
        start,
        end,
        height,
        thickness,
        levelId,
      })
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-8) {
        throw new Error('Invalid wall: start and end points are identical')
      }

      const elements = await kernel.queryElements()
      const wallsOnLevel = elements.filter(
        (el): el is WallElement => isWallElement(el) && (!el.meta.level_id || el.meta.level_id === levelId),
      )
      const conflict = findWallPlacementConflict(start, end, wallsOnLevel)
      if (conflict) {
        const reason = conflict.kind === 'overlap'
          ? `overlaps wall ${conflict.wallId} by ${conflict.overlapLength.toFixed(3)}m`
          : `crosses wall ${conflict.wallId} at ${formatPoint(conflict.intersection)}`
        console.warn('[BetterCAD AI][create_wall] blocked', {
          start,
          end,
          levelId,
          wallsOnLevel: wallsOnLevel.length,
          conflict,
        })
        throw new Error(`Wall blocked: ${reason}. Connect at endpoints instead of crossing/overlapping.`)
      }

      const wallId = `wall-${crypto.randomUUID()}`
      const id = await kernel.createElement({
        kind: 'wall',
        meta: { id: wallId, name: 'Wall', level_id: levelId },
        start,
        end,
        height,
        thickness,
      })
      const { autoJoinNearbyWalls } = await import('./wall-cleanup')
      const autoJoinChanges = await autoJoinNearbyWalls(kernel, wallId, levelId)
      if (autoJoinChanges === 0) {
        await syncEntitiesAndRegenerateMeshes(kernel)
      }
      console.info('[BetterCAD AI][create_wall] created', {
        id,
        start,
        end,
        levelId,
        autoJoinChanges,
      })
      return JSON.stringify({
        success: true,
        id,
        message: `Wall created from [${start}] to [${end}]`,
        auto_join_changes: autoJoinChanges,
      })
    }

    case 'create_floor': {
      const boundary = parseBoundary2(input.boundary, 'boundary')
      const thickness = parseOptionalFiniteNumber(input.thickness, 0.25, 'thickness')
      const levelId = await resolveLevelId(input, kernel)
      const id = await kernel.createElement({
        kind: 'floor',
        meta: { id: crypto.randomUUID(), name: 'Floor', level_id: levelId },
        boundary,
        thickness,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: 'Floor created' })
    }

    case 'create_column': {
      const center = parsePoint2(input.center, 'center')
      const width = parseOptionalFiniteNumber(input.width, 0.3, 'width')
      const depth = parseOptionalFiniteNumber(input.depth, 0.3, 'depth')
      const height = parseOptionalFiniteNumber(input.height, 3.0, 'height')
      const levelId = await resolveLevelId(input, kernel)
      const id = await kernel.createElement({
        kind: 'column',
        meta: { id: crypto.randomUUID(), name: 'Column', level_id: levelId },
        center,
        width,
        depth,
        height,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Column created at [${center}]` })
    }

    case 'create_stair': {
      const start = parsePoint2(input.start, 'start')
      const end = parsePoint2(input.end, 'end')
      const width = parseOptionalFiniteNumber(input.width, 1.1, 'width')
      const risers = Math.round(parseOptionalFiniteNumber(input.risers, 16, 'risers'))
      const total_height = parseOptionalFiniteNumber(input.total_height, 3.0, 'total_height')
      const levelId = await resolveLevelId(input, kernel)
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-8) {
        throw new Error('Invalid stair: start and end points are identical')
      }
      if (risers < 1) {
        throw new Error('Invalid risers: must be at least 1')
      }
      const id = await kernel.createElement({
        kind: 'stair',
        meta: { id: crypto.randomUUID(), name: 'Stair', level_id: levelId },
        start,
        end,
        width,
        risers,
        total_height,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: 'Stair created' })
    }

    case 'create_roof': {
      const boundary = parseBoundary2(input.boundary, 'boundary')
      const roof_type = (input.roof_type as 'flat' | 'gable' | 'shed' | 'hip' | undefined) ?? 'gable'
      const defaultPitch = roof_type === 'flat' ? 0 : 30
      const pitchRaw = parseOptionalFiniteNumber(input.pitch, defaultPitch, 'pitch')
      const pitch = Math.max(0, Math.min(75, pitchRaw))
      const hasManualElevation = input.elevation !== undefined && input.elevation !== null
      const elevation = hasManualElevation
        ? parseOptionalFiniteNumber(input.elevation, 0, 'elevation')
        : 0
      const levelId = await resolveLevelId(input, kernel)
      const id = await kernel.createElement({
        kind: 'roof',
        meta: { id: crypto.randomUUID(), name: 'Roof', level_id: levelId },
        boundary,
        thickness: 0.3,
        elevation,
        auto_elevation: !hasManualElevation,
        roof_type,
        pitch_degrees: pitch,
        ridge_angle_degrees: 0,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({
        success: true,
        id,
        message: `${roof_type} roof created (${hasManualElevation ? 'manual elevation' : 'auto elevation'})`,
      })
    }

    case 'create_room': {
      const boundary = parseBoundary2(input.boundary, 'boundary')
      const roomName = input.name as string
      const levelId = await resolveLevelId(input, kernel)
      if (typeof roomName !== 'string' || roomName.trim().length === 0) {
        throw new Error('Invalid name: expected a non-empty room name')
      }
      const id = await kernel.createElement({
        kind: 'room',
        meta: { id: crypto.randomUUID(), name: roomName, level_id: levelId },
        boundary,
        name: roomName,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Room "${roomName}" created` })
    }

    case 'add_room':
    case 'create_room_bundle': {
      const rawBoundary = parseBoundary2(input.boundary, 'boundary')
      const boundary = normalizeBoundaryLoop(rawBoundary)
      if (boundary.length < 3) {
        throw new Error('Invalid boundary: expected at least 3 unique points')
      }
      const roomName = input.name as string
      if (typeof roomName !== 'string' || roomName.trim().length === 0) {
        throw new Error('Invalid name: expected a non-empty room name')
      }
      const levelId = await resolveLevelId(input, kernel)
      const wall_height = parseOptionalFiniteNumber(input.wall_height, 3.0, 'wall_height')
      const wall_thickness = parseOptionalFiniteNumber(input.wall_thickness, 0.2, 'wall_thickness')
      const create_floor = input.create_floor === undefined ? true : Boolean(input.create_floor)
      const floor_thickness = parseOptionalFiniteNumber(input.floor_thickness, 0.25, 'floor_thickness')
      const create_default_door = input.create_default_door === undefined ? true : Boolean(input.create_default_door)
      const door_position_along_wall = parseBoundedNumber(input.door_position_along_wall, 0.5, 'door_position_along_wall', 0, 1)
      const door_width = parseOptionalFiniteNumber(input.door_width, 0.9, 'door_width')
      const door_height = parseOptionalFiniteNumber(input.door_height, 2.1, 'door_height')
      const door_swing = (input.door_swing as 'left' | 'right' | undefined) ?? 'right'
      const create_default_windows = input.create_default_windows === undefined ? true : Boolean(input.create_default_windows)
      const default_window_count = Math.max(0, Math.round(parseOptionalFiniteNumber(input.default_window_count, 2, 'default_window_count')))
      const window_position_along_wall = parseBoundedNumber(input.window_position_along_wall, 0.5, 'window_position_along_wall', 0, 1)
      const window_width = parseOptionalFiniteNumber(input.window_width, 1.2, 'window_width')
      const window_height = parseOptionalFiniteNumber(input.window_height, 1.2, 'window_height')
      const window_sill_height = parseOptionalFiniteNumber(input.window_sill_height, 0.9, 'window_sill_height')
      const window_wall_indexes = Array.isArray(input.window_wall_indexes)
        ? input.window_wall_indexes.map((value, idx) => Math.round(parseFiniteNumber(value, `window_wall_indexes[${idx}]`)))
        : []

      type ExplicitWindowSpec = {
        wall_index: number
        position_along_wall: number
        width: number
        height: number
        sill_height: number
        name?: string
      }

      const explicitWindows: ExplicitWindowSpec[] = Array.isArray(input.windows)
        ? input.windows.map((entry, idx) => {
            if (!entry || typeof entry !== 'object') {
              throw new Error(`Invalid windows[${idx}]: expected an object`)
            }
            const win = entry as Record<string, unknown>
            const name = typeof win.name === 'string' && win.name.trim().length > 0 ? win.name.trim() : undefined
            return {
              wall_index: Math.round(parseFiniteNumber(win.wall_index, `windows[${idx}].wall_index`)),
              position_along_wall: parseBoundedNumber(win.position_along_wall, window_position_along_wall, `windows[${idx}].position_along_wall`, 0, 1),
              width: parseOptionalFiniteNumber(win.width, window_width, `windows[${idx}].width`),
              height: parseOptionalFiniteNumber(win.height, window_height, `windows[${idx}].height`),
              sill_height: parseOptionalFiniteNumber(win.sill_height, window_sill_height, `windows[${idx}].sill_height`),
              name,
            }
          })
        : []

      type PerimeterWall = {
        id: string
        start: Point2
        end: Point2
        length: number
        isNew: boolean
        hostParamStart: number
        hostParamEnd: number
      }
      type OverlapInterval = { tStart: number; tEnd: number; wall: WallElement }
      type BoundaryPiece =
        | { kind: 'reuse'; tStart: number; tEnd: number; wall: WallElement }
        | { kind: 'new'; tStart: number; tEnd: number }
      const elementsAtStart = await kernel.queryElements()
      const wallsOnLevel: WallElement[] = elementsAtStart.filter(
        (el): el is WallElement => isWallElement(el) && (!el.meta.level_id || el.meta.level_id === levelId),
      )
      const openingCountsByWall = new Map<string, number>()
      for (const el of elementsAtStart) {
        if (el.kind !== 'door' && el.kind !== 'window') continue
        const hostWallId = getHostWallId(el)
        if (!hostWallId) continue
        openingCountsByWall.set(hostWallId, (openingCountsByWall.get(hostWallId) ?? 0) + 1)
      }
      const hasOpenings = (wallId: string): boolean => (openingCountsByWall.get(wallId) ?? 0) > 0
      const markOpening = (wallId: string): void => {
        openingCountsByWall.set(wallId, (openingCountsByWall.get(wallId) ?? 0) + 1)
      }
      const pointAtParam = (segStart: Point2, segEnd: Point2, t: number): Point2 => [
        segStart[0] + (segEnd[0] - segStart[0]) * t,
        segStart[1] + (segEnd[1] - segStart[1]) * t,
      ]
      const projectPointParamOnWall = (point: Point2, wall: WallElement): number | null => {
        const wallDx = wall.end[0] - wall.start[0]
        const wallDy = wall.end[1] - wall.start[1]
        const wallLenSq = wallDx * wallDx + wallDy * wallDy
        if (wallLenSq < 1e-12) return null
        const vx = point[0] - wall.start[0]
        const vy = point[1] - wall.start[1]
        if (Math.abs(cross2(wallDx, wallDy, vx, vy)) > 1e-6) return null
        const t = (vx * wallDx + vy * wallDy) / wallLenSq
        if (t < -WALL_ENDPOINT_PARAM_EPS || t > 1 + WALL_ENDPOINT_PARAM_EPS) return null
        return clamp(t, 0, 1)
      }
      const buildBoundaryPieces = (start: Point2, end: Point2): BoundaryPiece[] => {
        const overlaps: OverlapInterval[] = []
        for (const wall of wallsOnLevel) {
          const hit = segmentIntersection(start, end, wall.start, wall.end)
          if (hit.kind !== 'overlap') continue
          const tStart = clamp(hit.tStart, 0, 1)
          const tEnd = clamp(hit.tEnd, 0, 1)
          if (tEnd - tStart <= WALL_ENDPOINT_PARAM_EPS) continue
          overlaps.push({ tStart, tEnd, wall })
        }

        if (overlaps.length === 0) {
          return [{ kind: 'new', tStart: 0, tEnd: 1 }]
        }

        const rawBreakpoints = [0, 1, ...overlaps.flatMap((o) => [o.tStart, o.tEnd])]
          .sort((a, b) => a - b)
        const breakpoints: number[] = []
        for (const t of rawBreakpoints) {
          const last = breakpoints[breakpoints.length - 1]
          if (last === undefined || Math.abs(t - last) > WALL_ENDPOINT_PARAM_EPS) {
            breakpoints.push(t)
          }
        }
        if (breakpoints[0] > 0) breakpoints.unshift(0)
        if (breakpoints[breakpoints.length - 1] < 1) breakpoints.push(1)

        const pieces: BoundaryPiece[] = []
        for (let i = 0; i < breakpoints.length - 1; i += 1) {
          const tStart = breakpoints[i]
          const tEnd = breakpoints[i + 1]
          if (tEnd - tStart <= WALL_ENDPOINT_PARAM_EPS) continue
          const covering = overlaps.filter(
            (interval) =>
              interval.tStart <= tStart + WALL_ENDPOINT_PARAM_EPS
              && interval.tEnd >= tEnd - WALL_ENDPOINT_PARAM_EPS,
          )
          if (covering.length === 0) {
            pieces.push({ kind: 'new', tStart, tEnd })
            continue
          }
          const chosen = covering.reduce((best, candidate) =>
            (candidate.tEnd - candidate.tStart) > (best.tEnd - best.tStart) ? candidate : best,
          )
          pieces.push({ kind: 'reuse', tStart, tEnd, wall: chosen.wall })
        }

        const mergedPieces: BoundaryPiece[] = []
        for (const piece of pieces) {
          const prev = mergedPieces[mergedPieces.length - 1]
          if (!prev) {
            mergedPieces.push(piece)
            continue
          }
          const contiguous = Math.abs(prev.tEnd - piece.tStart) <= WALL_ENDPOINT_PARAM_EPS
          if (!contiguous) {
            mergedPieces.push(piece)
            continue
          }
          if (prev.kind === 'new' && piece.kind === 'new') {
            prev.tEnd = piece.tEnd
            continue
          }
          if (prev.kind === 'reuse' && piece.kind === 'reuse' && prev.wall.meta.id === piece.wall.meta.id) {
            prev.tEnd = piece.tEnd
            continue
          }
          mergedPieces.push(piece)
        }

        return mergedPieces.length > 0 ? mergedPieces : [{ kind: 'new', tStart: 0, tEnd: 1 }]
      }
      const perimeterWalls: PerimeterWall[] = []
      for (let i = 0; i < boundary.length; i += 1) {
        const start = boundary[i]
        const end = boundary[(i + 1) % boundary.length]
        const fullSegmentLength = Math.hypot(end[0] - start[0], end[1] - start[1])
        if (fullSegmentLength < 1e-8) continue

        const pieces = buildBoundaryPieces(start, end)
        for (const piece of pieces) {
          const pieceStart = pointAtParam(start, end, piece.tStart)
          const pieceEnd = pointAtParam(start, end, piece.tEnd)
          const pieceLength = Math.hypot(pieceEnd[0] - pieceStart[0], pieceEnd[1] - pieceStart[1])
          if (pieceLength < 1e-8) continue

          if (piece.kind === 'reuse') {
            const hostParamStart = projectPointParamOnWall(pieceStart, piece.wall)
            const hostParamEnd = projectPointParamOnWall(pieceEnd, piece.wall)
            if (hostParamStart === null || hostParamEnd === null) {
              throw new Error(
                `Room wall blocked: could not map reused wall ${piece.wall.meta.id} to boundary segment. Adjust the boundary.`,
              )
            }
            perimeterWalls.push({
              id: piece.wall.meta.id,
              start: pieceStart,
              end: pieceEnd,
              length: pieceLength,
              isNew: false,
              hostParamStart,
              hostParamEnd,
            })
            continue
          }

          const conflict = findWallPlacementConflict(pieceStart, pieceEnd, wallsOnLevel)
          if (conflict) {
            const reason = conflict.kind === 'overlap'
              ? `overlaps wall ${conflict.wallId} by ${conflict.overlapLength.toFixed(3)}m`
              : `crosses wall ${conflict.wallId} at ${formatPoint(conflict.intersection)}`
            throw new Error(`Room wall blocked: ${reason}. Adjust the room boundary to connect at endpoints.`)
          }
          const wallId = `wall-${crypto.randomUUID()}`
          await kernel.createElement({
            kind: 'wall',
            meta: { id: wallId, name: `Room Wall (${roomName})`, level_id: levelId },
            start: pieceStart,
            end: pieceEnd,
            height: wall_height,
            thickness: wall_thickness,
          })
          wallsOnLevel.push({
            kind: 'wall',
            meta: { id: wallId, name: `Room Wall (${roomName})`, level_id: levelId },
            start: pieceStart,
            end: pieceEnd,
            height: wall_height,
            thickness: wall_thickness,
          })
          perimeterWalls.push({
            id: wallId,
            start: pieceStart,
            end: pieceEnd,
            length: pieceLength,
            isNew: true,
            hostParamStart: 0,
            hostParamEnd: 1,
          })
        }
      }

      if (perimeterWalls.length < 3) {
        throw new Error('Failed to create room walls: boundary must form at least 3 non-zero-length segments')
      }
      const wallIds = perimeterWalls.map((wall) => wall.id)

      let floorId: string | null = null
      if (create_floor) {
        floorId = await kernel.createElement({
          kind: 'floor',
          meta: { id: crypto.randomUUID(), name: `Room Floor (${roomName})`, level_id: levelId },
          boundary,
          thickness: floor_thickness,
        })
      }

      const roomId = await kernel.createElement({
        kind: 'room',
        meta: { id: crypto.randomUUID(), name: roomName, level_id: levelId },
        boundary,
        name: roomName,
      })

      const warnings: string[] = []
      const mapPositionAlongHostWall = (wall: PerimeterWall, localPosition: number): number =>
        clamp(wall.hostParamStart + (wall.hostParamEnd - wall.hostParamStart) * localPosition, 0, 1)
      const wrapWallIndex = (index: number): number =>
        ((index % perimeterWalls.length) + perimeterWalls.length) % perimeterWalls.length

      let doorId: string | null = null
      let doorWallIndexUsed: number | null = null
      if (create_default_door && perimeterWalls.length > 0) {
        const minDoorSpan = Math.max(door_width + 0.2, 1.0)
        const explicitDoorWallIndex = input.door_wall_index !== undefined
          ? Math.round(parseFiniteNumber(input.door_wall_index, 'door_wall_index'))
          : null
        let selectedWallIndex = 0
        if (explicitDoorWallIndex !== null && Number.isFinite(explicitDoorWallIndex)) {
          selectedWallIndex = wrapWallIndex(explicitDoorWallIndex)
        } else {
          const rankedCandidates = perimeterWalls
            .map((wall, index) => ({ wall, index }))
            .filter(({ wall }) => wall.length >= minDoorSpan)
            .sort((a, b) => Number(b.wall.isNew) - Number(a.wall.isNew))
          const candidateWithoutOpenings = rankedCandidates.find(({ wall }) => !hasOpenings(wall.id))
          const chosenCandidate = candidateWithoutOpenings ?? rankedCandidates[0]
          if (chosenCandidate) {
            selectedWallIndex = chosenCandidate.index
          }
        }

        const selectedDoorWall = perimeterWalls[selectedWallIndex]
        if (selectedDoorWall.length < minDoorSpan) {
          warnings.push(`Skipped default door: selected wall ${selectedWallIndex} is too short for door width ${door_width.toFixed(2)}m`)
        } else if (hasOpenings(selectedDoorWall.id)) {
          warnings.push(`Skipped default door: selected wall ${selectedWallIndex} already has openings`)
        } else {
          doorWallIndexUsed = selectedWallIndex
          try {
            doorId = await kernel.createElement({
              kind: 'door',
              meta: { id: crypto.randomUUID(), name: `Room Door (${roomName})`, host_id: selectedDoorWall.id, level_id: levelId },
              wall_id: selectedDoorWall.id,
              position_along_wall: mapPositionAlongHostWall(selectedDoorWall, door_position_along_wall),
              width: door_width,
              height: door_height,
              sill_height: 0,
              swing: door_swing,
            })
            markOpening(selectedDoorWall.id)
          } catch (error) {
            const warningMessage = error instanceof Error ? error.message : String(error)
            warnings.push(`Skipped default door: ${warningMessage}`)
          }
        }
      }

      const windowIds: string[] = []
      const createWindowOnWall = async (
        wall: PerimeterWall,
        positionAlongWall: number,
        width: number,
        height: number,
        sillHeight: number,
        name?: string,
        allowOnOccupiedWall = false,
      ): Promise<void> => {
        const minWindowSpan = Math.max(width + 0.2, 0.8)
        if (wall.length < minWindowSpan) {
          warnings.push(`Skipped window on wall ${wall.id}: wall too short for width ${width.toFixed(2)}m`)
          return
        }
        if (!allowOnOccupiedWall && hasOpenings(wall.id)) {
          warnings.push(`Skipped window on wall ${wall.id}: wall already has openings`)
          return
        }
        const label = typeof name === 'string' && name.trim().length > 0
          ? name.trim()
          : `Room Window (${roomName}) ${windowIds.length + 1}`
        try {
          const windowId = await kernel.createElement({
            kind: 'window',
            meta: { id: crypto.randomUUID(), name: label, host_id: wall.id, level_id: levelId },
            wall_id: wall.id,
            position_along_wall: mapPositionAlongHostWall(wall, positionAlongWall),
            width,
            height,
            sill_height: sillHeight,
          })
          windowIds.push(windowId)
          markOpening(wall.id)
        } catch (error) {
          const warningMessage = error instanceof Error ? error.message : String(error)
          warnings.push(`Skipped window on wall ${wall.id}: ${warningMessage}`)
        }
      }

      if (explicitWindows.length > 0) {
        for (const spec of explicitWindows) {
          const wall = perimeterWalls[wrapWallIndex(spec.wall_index)]
          await createWindowOnWall(
            wall,
            spec.position_along_wall,
            spec.width,
            spec.height,
            spec.sill_height,
            spec.name,
            true,
          )
        }
      } else if (create_default_windows) {
        let windowWallIndexesToUse: number[] = []

        if (window_wall_indexes.length > 0) {
          windowWallIndexesToUse = Array.from(
            new Set(window_wall_indexes.map((wallIndex) => wrapWallIndex(wallIndex))),
          )
        } else {
          const minDefaultWindowSpan = Math.max(window_width + 0.2, 0.8)
          const eligibleWalls = perimeterWalls
            .map((wall, index) => ({ wall, index }))
            .filter(({ wall }) => wall.length >= minDefaultWindowSpan)
          const eligibleWithoutOpenings = eligibleWalls.filter(({ wall }) => !hasOpenings(wall.id))
          const prioritizedEligible = eligibleWithoutOpenings.length > 0 ? eligibleWithoutOpenings : eligibleWalls

          const eligibleWithoutDoor =
            doorWallIndexUsed !== null && prioritizedEligible.length > 1
              ? prioritizedEligible.filter(({ index }) => index !== doorWallIndexUsed)
              : prioritizedEligible

          const source = eligibleWithoutDoor.length > 0 ? eligibleWithoutDoor : prioritizedEligible
          const count = Math.min(default_window_count, source.length)
          windowWallIndexesToUse = source
            .sort((a, b) => b.wall.length - a.wall.length)
            .slice(0, count)
            .map(({ index }) => index)
        }

        for (const wallIndex of windowWallIndexesToUse) {
          await createWindowOnWall(
            perimeterWalls[wallIndex],
            window_position_along_wall,
            window_width,
            window_height,
            window_sill_height,
          )
        }
      }

      const autoJoinChanges = 0

      try {
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (error) {
        const warningMessage = error instanceof Error ? error.message : String(error)
        warnings.push(`Mesh regeneration warning: ${warningMessage}`)
      }

      return JSON.stringify({
        success: true,
        room_id: roomId,
        wall_ids: wallIds,
        floor_id: floorId,
        door_id: doorId,
        window_ids: windowIds,
        auto_join_changes: autoJoinChanges,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `Room bundle "${roomName}" created (${wallIds.length} walls${create_floor ? ', floor' : ''}${doorId ? ', door' : ''}${windowIds.length > 0 ? `, ${windowIds.length} windows` : ''})`,
      })
    }

    case 'create_door': {
      const wall_id = input.wall_id as string
      const position_along_wall = parseBoundedNumber(input.position_along_wall, 0.5, 'position_along_wall', 0, 1)
      const width = parseOptionalFiniteNumber(input.width, 0.9, 'width')
      const height = parseOptionalFiniteNumber(input.height, 2.1, 'height')
      const swing = (input.swing as 'left' | 'right' | undefined) ?? 'right'
      if (typeof wall_id !== 'string' || wall_id.trim().length === 0) {
        throw new Error('Invalid wall_id: expected a non-empty string')
      }
      if (width <= 0) {
        throw new Error('Invalid width: expected a number greater than 0')
      }
      if (height <= 0) {
        throw new Error('Invalid height: expected a number greater than 0')
      }
      const elements = await kernel.queryElements()
      const hostWall = elements.find((element): element is WallElement => isWallElement(element) && element.meta.id === wall_id)
      if (!hostWall) {
        throw new Error(`Invalid wall_id: wall "${wall_id}" was not found`)
      }
      const hostWallLength = getWallLength(hostWall)
      if (hostWallLength <= OPENING_OVERLAP_EPS) {
        throw new Error(`Invalid wall_id: wall "${wall_id}" has zero length`)
      }
      const candidateInterval = openingIntervalOnWall(hostWallLength, position_along_wall, width)
      if (!candidateInterval) {
        throw new Error(`Invalid door placement: width ${width.toFixed(3)}m does not fit wall "${wall_id}"`)
      }
      const wallOpenings = collectOpeningsOnWall(elements, wall_id, hostWallLength)
      const existingOverlapPair = findFirstOverlappingOpeningPair(wallOpenings)
      if (existingOverlapPair) {
        const [a, b] = existingOverlapPair
        throw new Error(
          `Wall "${wall_id}" already has overlapping openings (${a.kind} ${a.id} and ${b.kind} ${b.id}). Remove/reposition one opening first.`,
        )
      }
      const duplicate = findDuplicateOpeningOfKind('door', position_along_wall, width, wallOpenings)
      if (duplicate) {
        return JSON.stringify({
          success: true,
          id: duplicate.id,
          message: `Door already exists on wall ${wall_id} at position ${position_along_wall.toFixed(3)}`,
        })
      }
      const overlap = findOpeningOverlap(candidateInterval, wallOpenings)
      if (overlap) {
        throw new Error(
          `Door opening overlaps existing ${overlap.kind} ${overlap.id} on wall "${wall_id}". Adjust position_along_wall or width.`,
        )
      }
      // Inherit level_id from host wall if not provided
      let levelId = typeof input.level_id === 'string' ? input.level_id : undefined
      if (!levelId) {
        levelId = hostWall.meta.level_id ?? (await resolveLevelId(input, kernel))
      }
      let id: string
      try {
        id = await kernel.createElement({
          kind: 'door',
          meta: { id: crypto.randomUUID(), name: 'Door', host_id: wall_id, level_id: levelId },
          wall_id,
          position_along_wall,
          width,
          height,
          sill_height: 0,
          swing,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const afterElements = await kernel.queryElements()
        const afterOpenings = collectOpeningsOnWall(afterElements, wall_id, hostWallLength)
        const partiallyCreated = findDuplicateOpeningOfKind('door', position_along_wall, width, afterOpenings)
        if (partiallyCreated) {
          try {
            await kernel.deleteElement(partiallyCreated.id)
            await syncEntitiesAndRegenerateMeshes(kernel)
          } catch {
            // Best effort rollback only.
          }
        }
        throw new Error(`Door creation failed: ${message}${partiallyCreated ? ' (rolled back partial opening)' : ''}`)
      }
      try {
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        let rolledBack = false
        try {
          await kernel.deleteElement(id)
          rolledBack = true
        } catch {
          rolledBack = false
        }
        if (rolledBack) {
          try {
            await syncEntitiesAndRegenerateMeshes(kernel)
          } catch {
            // Best effort rollback sync; preserve original failure message
          }
        }
        throw new Error(`Door creation failed: ${message}${rolledBack ? ' (rolled back)' : ''}`)
      }
      return JSON.stringify({ success: true, id, message: 'Door created' })
    }

    case 'create_window': {
      const wall_id = input.wall_id as string
      const position_along_wall = parseBoundedNumber(input.position_along_wall, 0.5, 'position_along_wall', 0, 1)
      const width = parseOptionalFiniteNumber(input.width, 1.2, 'width')
      const height = parseOptionalFiniteNumber(input.height, 1.2, 'height')
      const sill_height = parseOptionalFiniteNumber(input.sill_height, 0.9, 'sill_height')
      if (typeof wall_id !== 'string' || wall_id.trim().length === 0) {
        throw new Error('Invalid wall_id: expected a non-empty string')
      }
      if (width <= 0) {
        throw new Error('Invalid width: expected a number greater than 0')
      }
      if (height <= 0) {
        throw new Error('Invalid height: expected a number greater than 0')
      }
      const elements = await kernel.queryElements()
      const hostWall = elements.find((element): element is WallElement => isWallElement(element) && element.meta.id === wall_id)
      if (!hostWall) {
        throw new Error(`Invalid wall_id: wall "${wall_id}" was not found`)
      }
      const hostWallLength = getWallLength(hostWall)
      if (hostWallLength <= OPENING_OVERLAP_EPS) {
        throw new Error(`Invalid wall_id: wall "${wall_id}" has zero length`)
      }
      const candidateInterval = openingIntervalOnWall(hostWallLength, position_along_wall, width)
      if (!candidateInterval) {
        throw new Error(`Invalid window placement: width ${width.toFixed(3)}m does not fit wall "${wall_id}"`)
      }
      const wallOpenings = collectOpeningsOnWall(elements, wall_id, hostWallLength)
      const existingOverlapPair = findFirstOverlappingOpeningPair(wallOpenings)
      if (existingOverlapPair) {
        const [a, b] = existingOverlapPair
        throw new Error(
          `Wall "${wall_id}" already has overlapping openings (${a.kind} ${a.id} and ${b.kind} ${b.id}). Remove/reposition one opening first.`,
        )
      }
      const duplicate = findDuplicateOpeningOfKind('window', position_along_wall, width, wallOpenings)
      if (duplicate) {
        return JSON.stringify({
          success: true,
          id: duplicate.id,
          message: `Window already exists on wall ${wall_id} at position ${position_along_wall.toFixed(3)}`,
        })
      }
      const overlap = findOpeningOverlap(candidateInterval, wallOpenings)
      if (overlap) {
        throw new Error(
          `Window opening overlaps existing ${overlap.kind} ${overlap.id} on wall "${wall_id}". Adjust position_along_wall or width.`,
        )
      }
      // Inherit level_id from host wall if not provided
      let winLevelId = typeof input.level_id === 'string' ? input.level_id : undefined
      if (!winLevelId) {
        winLevelId = hostWall.meta.level_id ?? (await resolveLevelId(input, kernel))
      }
      let id: string
      try {
        id = await kernel.createElement({
          kind: 'window',
          meta: { id: crypto.randomUUID(), name: 'Window', host_id: wall_id, level_id: winLevelId },
          wall_id,
          position_along_wall,
          width,
          height,
          sill_height,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const afterElements = await kernel.queryElements()
        const afterOpenings = collectOpeningsOnWall(afterElements, wall_id, hostWallLength)
        const partiallyCreated = findDuplicateOpeningOfKind('window', position_along_wall, width, afterOpenings)
        if (partiallyCreated) {
          try {
            await kernel.deleteElement(partiallyCreated.id)
            await syncEntitiesAndRegenerateMeshes(kernel)
          } catch {
            // Best effort rollback only.
          }
        }
        throw new Error(`Window creation failed: ${message}${partiallyCreated ? ' (rolled back partial opening)' : ''}`)
      }
      try {
        await syncEntitiesAndRegenerateMeshes(kernel)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        let rolledBack = false
        try {
          await kernel.deleteElement(id)
          rolledBack = true
        } catch {
          rolledBack = false
        }
        if (rolledBack) {
          try {
            await syncEntitiesAndRegenerateMeshes(kernel)
          } catch {
            // Best effort rollback sync; preserve original failure message
          }
        }
        throw new Error(`Window creation failed: ${message}${rolledBack ? ' (rolled back)' : ''}`)
      }
      return JSON.stringify({ success: true, id, message: 'Window created' })
    }

    case 'delete_element': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || element_id.trim().length === 0) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      await kernel.deleteElement(element_id)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: `Element ${element_id} deleted` })
    }

    case 'delete_elements': {
      const idsFromInput = Array.isArray(input.ids)
        ? input.ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : []
      const kind = typeof input.kind === 'string' ? input.kind : null

      if (idsFromInput.length === 0 && !kind) {
        throw new Error('delete_elements requires ids and/or kind')
      }

      const elements = await kernel.queryElements()
      const idsByKind = kind
        ? elements.filter((el) => el.kind === kind).map((el) => el.meta.id)
        : []
      const targetIds = Array.from(new Set([...idsFromInput, ...idsByKind]))

      if (targetIds.length === 0) {
        return JSON.stringify({ success: true, deleted: 0, message: 'No matching elements found' })
      }

      for (const id of targetIds) {
        await kernel.deleteElement(id)
      }

      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({
        success: true,
        deleted: targetIds.length,
        ids: targetIds,
        message: `Deleted ${targetIds.length} element(s)`,
      })
    }

    case 'cleanup_walls': {
      const { autoJoinWalls } = await import('./wall-cleanup')
      const count = await autoJoinWalls(kernel)
      return JSON.stringify({ success: true, message: `${count} wall joints cleaned up` })
    }

    case 'clear_building': {
      await kernel.resetProject('BetterCAD Project', 'metric')
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: 'Building cleared' })
    }

    case 'create_beam': {
      const start = input.start as [number, number, number]
      const end = input.end as [number, number, number]
      if (!Array.isArray(start) || start.length !== 3) throw new Error('Invalid start: expected [x, y, z]')
      if (!Array.isArray(end) || end.length !== 3) throw new Error('Invalid end: expected [x, y, z]')
      const width = parseOptionalFiniteNumber(input.width, 0.2, 'width')
      const depth = parseOptionalFiniteNumber(input.depth, 0.4, 'depth')
      const beamLevelId = await resolveLevelId(input, kernel)
      const id = await kernel.createElement({
        kind: 'beam',
        meta: { id: crypto.randomUUID(), name: 'Beam', level_id: beamLevelId },
        start, end, width, depth,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: 'Beam created' })
    }

    case 'create_foundation': {
      const boundary = parseBoundary2(input.boundary, 'boundary')
      const thickness = parseOptionalFiniteNumber(input.thickness, 0.3, 'thickness')
      const fndLevelId = await resolveLevelId(input, kernel)
      const id = await kernel.createElement({
        kind: 'foundation',
        meta: { id: crypto.randomUUID(), name: 'Foundation', level_id: fndLevelId },
        boundary, thickness,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: 'Foundation created' })
    }

    case 'set_view_mode': {
      const mode = input.mode as string
      if (mode !== '3d' && mode !== '2d' && mode !== 'split') {
        throw new Error("Invalid mode: expected one of '3d', '2d', or 'split'")
      }
      const { useUIStore } = await import('../stores/ui-store')
      useUIStore.getState().setViewMode(mode)
      return JSON.stringify({ success: true, message: `View mode set to ${mode}` })
    }

    case 'set_camera': {
      const position = input.position as [number, number, number]
      const target = input.target as [number, number, number]
      if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
        throw new Error('Invalid position: expected [x, y, z] with 3 finite numbers')
      }
      if (!Array.isArray(target) || target.length !== 3 || !target.every(Number.isFinite)) {
        throw new Error('Invalid target: expected [x, y, z] with 3 finite numbers')
      }
      const { useCameraStore } = await import('../stores/camera-store')
      useCameraStore.getState().setCamera(position, target)
      return JSON.stringify({ success: true, message: `Camera moved to position [${position}] looking at [${target}]` })
    }

    case 'take_screenshot': {
      const captureFn = (window as any).__bettercad_capture_screenshot
      if (typeof captureFn !== 'function') {
        throw new Error("3D screenshot unavailable. Switch view with set_view_mode('3d' or 'split') and retry.")
      }
      const base64 = captureFn() as string
      return `__SCREENSHOT_BASE64__${base64}`
    }

    case 'take_2d_screenshot': {
      const captureFn = (window as any).__bettercad_capture_2d_screenshot
      if (typeof captureFn !== 'function') {
        throw new Error("2D screenshot unavailable. Switch view with set_view_mode('2d' or 'split') and retry.")
      }
      const base64 = captureFn() as string
      return `__SCREENSHOT_BASE64__${base64}`
    }

    case 'focus_element': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const elements = await kernel.queryElements()
      const el = elements.find((e: any) => e.meta.id === element_id)
      if (!el) throw new Error(`Element ${element_id} not found`)

      // Compute center based on element kind
      let cx = 0, cy = 0, cz = 1.5
      if ('start' in el && 'end' in el) {
        const s = el.start as number[]
        const e = el.end as number[]
        cx = (s[0] + e[0]) / 2
        cy = (s[1] + e[1]) / 2
        cz = ('height' in el ? (el.height as number) / 2 : 1.5)
      } else if ('center' in el) {
        const c = el.center as number[]
        cx = c[0]
        cy = c[1]
        cz = ('height' in el ? (el.height as number) / 2 : 1.5)
      } else if ('boundary' in el) {
        const b = el.boundary as number[][]
        cx = b.reduce((s, p) => s + p[0], 0) / b.length
        cy = b.reduce((s, p) => s + p[1], 0) / b.length
        cz = 1.5
      }

      // Position camera offset from element center
      // R3F Y-up: domain_x -> R3F_x, domain_y -> R3F_z, elevation -> R3F_y
      const dist = 8
      const camPos: [number, number, number] = [cx + dist * 0.7, cz + dist * 0.5, cy + dist * 0.7]
      const camTarget: [number, number, number] = [cx, cz, cy]

      const { useCameraStore } = await import('../stores/camera-store')
      useCameraStore.getState().setCamera(camPos, camTarget)
      return JSON.stringify({ success: true, message: `Camera focused on element ${element_id}` })
    }

    case 'export_pdf': {
      return JSON.stringify({ success: true, message: 'PDF export is available in the Export dialog. Select PDF format and choose your scale.' })
    }

    case 'linear_array': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const count = Math.round(parseOptionalFiniteNumber(input.count, 1, 'count'))
      if (count < 1 || count > 100) throw new Error('count must be between 1 and 100')
      const spacing_x = parseOptionalFiniteNumber(input.spacing_x, 3, 'spacing_x')
      const spacing_y = parseOptionalFiniteNumber(input.spacing_y, 0, 'spacing_y')

      const elements = await kernel.queryElements()
      const sourceEl = elements.find((e) => e.meta.id === element_id)
      if (!sourceEl) throw new Error(`Element ${element_id} not found`)
      if (!isArrayableElement(sourceEl)) throw new Error(`Element kind "${sourceEl.kind}" cannot be arrayed`)

      const ids = await linearArray(sourceEl, { count, spacingX: spacing_x, spacingY: spacing_y }, kernel)
      return JSON.stringify({ success: true, ids, message: `Created ${ids.length} copies in a linear array` })
    }

    case 'polar_array': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const count = Math.round(parseOptionalFiniteNumber(input.count, 1, 'count'))
      if (count < 1 || count > 100) throw new Error('count must be between 1 and 100')
      const center_x = parseFiniteNumber(input.center_x, 'center_x')
      const center_y = parseFiniteNumber(input.center_y, 'center_y')
      const total_angle = parseOptionalFiniteNumber(input.total_angle, 360, 'total_angle')

      const elements = await kernel.queryElements()
      const sourceEl = elements.find((e) => e.meta.id === element_id)
      if (!sourceEl) throw new Error(`Element ${element_id} not found`)
      if (!isArrayableElement(sourceEl)) throw new Error(`Element kind "${sourceEl.kind}" cannot be arrayed`)

      const ids = await polarArray(sourceEl, { count, centerX: center_x, centerY: center_y, totalAngleDeg: total_angle }, kernel)
      return JSON.stringify({ success: true, ids, message: `Created ${ids.length} copies in a polar array` })
    }

    case 'move_element': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const dx = parseFiniteNumber(input.dx, 'dx')
      const dy = parseFiniteNumber(input.dy, 'dy')
      const elements = await kernel.queryElements()
      const el = elements.find((e) => e.meta.id === element_id)
      if (!el) throw new Error(`Element ${element_id} not found`)
      if (el.kind === 'door' || el.kind === 'window') {
        throw new Error(`Cannot move a ${el.kind} — it is wall-hosted. Move the parent wall instead.`)
      }
      const moved = shiftElementCoords(el, dx, dy)
      await kernel.updateElement(element_id, moved)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: `Element ${element_id} moved by (${dx}, ${dy})` })
    }

    case 'rotate_element': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const angle_degrees = parseFiniteNumber(input.angle_degrees, 'angle_degrees')
      const elements = await kernel.queryElements()
      const el = elements.find((e) => e.meta.id === element_id)
      if (!el) throw new Error(`Element ${element_id} not found`)
      if (el.kind === 'door' || el.kind === 'window') {
        throw new Error(`Cannot rotate a ${el.kind} — it is wall-hosted. Rotate the parent wall instead.`)
      }
      const centroid = computeElementCentroid(el)
      const cx = input.center_x !== undefined && input.center_x !== null
        ? parseFiniteNumber(input.center_x, 'center_x')
        : centroid[0]
      const cy = input.center_y !== undefined && input.center_y !== null
        ? parseFiniteNumber(input.center_y, 'center_y')
        : centroid[1]
      const rotated = rotateElementCoords(el, angle_degrees, cx, cy)
      await kernel.updateElement(element_id, rotated)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: `Element ${element_id} rotated by ${angle_degrees}° around (${cx}, ${cy})` })
    }

    case 'copy_element': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const dx = parseOptionalFiniteNumber(input.dx, 1, 'dx')
      const dy = parseOptionalFiniteNumber(input.dy, 0, 'dy')
      const elements = await kernel.queryElements()
      const el = elements.find((e) => e.meta.id === element_id)
      if (!el) throw new Error(`Element ${element_id} not found`)
      if (el.kind === 'door' || el.kind === 'window') {
        throw new Error(`Cannot copy a ${el.kind} — it is wall-hosted.`)
      }
      const clone = shiftElementCoords(el, dx, dy)
      clone.meta.id = crypto.randomUUID()
      const id = await kernel.createElement(clone)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Element copied with offset (${dx}, ${dy})` })
    }

    case 'update_element': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const properties = input.properties as Record<string, unknown>
      if (!properties || typeof properties !== 'object') {
        throw new Error('Invalid properties: expected an object with key/value pairs')
      }
      const elements = await kernel.queryElements()
      const el = elements.find((e) => e.meta.id === element_id)
      if (!el) throw new Error(`Element ${element_id} not found`)

      const updated = JSON.parse(JSON.stringify(el)) as any
      for (const [key, value] of Object.entries(properties)) {
        if (key === 'kind' || key === 'meta.id') continue
        if (key === 'name') {
          updated.meta.name = value
        } else if (key === 'meta') {
          // Don't allow wholesale meta replacement
          continue
        } else {
          updated[key] = value
        }
      }
      await kernel.updateElement(element_id, updated as PrototypeElement)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: `Element ${element_id} updated`, properties: Object.keys(properties) })
    }

    case 'undo': {
      const { useEntityStore } = await import('../stores/entity-store')
      const result = useEntityStore.getState().undo()
      if (!result) return JSON.stringify({ success: false, message: 'Nothing to undo' })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: 'Undone' })
    }

    case 'redo': {
      const { useEntityStore } = await import('../stores/entity-store')
      const result = useEntityStore.getState().redo()
      if (!result) return JSON.stringify({ success: false, message: 'Nothing to redo' })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: 'Redone' })
    }

    case 'create_level': {
      const levelName = input.name as string
      if (typeof levelName !== 'string' || levelName.trim().length === 0) {
        throw new Error('Invalid name: expected a non-empty level name')
      }
      const elevation = parseFiniteNumber(input.elevation, 'elevation')
      const generateShell = input.generate_shell === undefined ? true : Boolean(input.generate_shell)
      const createFloorForShell = input.create_floor === undefined ? true : Boolean(input.create_floor)
      const wallHeight = parseOptionalFiniteNumber(input.wall_height, 3.0, 'wall_height')
      const wallThickness = parseOptionalFiniteNumber(input.wall_thickness, 0.2, 'wall_thickness')
      const floorThickness = parseOptionalFiniteNumber(input.floor_thickness, 0.25, 'floor_thickness')
      const copyShellFromLevelId = typeof input.copy_shell_from_level_id === 'string' && input.copy_shell_from_level_id.trim().length > 0
        ? input.copy_shell_from_level_id
        : undefined

      const id = await kernel.createElement({
        kind: 'level',
        meta: { id: crypto.randomUUID(), name: levelName },
        elevation,
      } as any)

      let shellBoundary: Point2[] | null = null
      let shellSource: 'input' | 'copied' | 'none' = 'none'
      if (generateShell) {
        if (input.boundary !== undefined && input.boundary !== null) {
          shellBoundary = normalizeBoundaryLoop(parseBoundary2(input.boundary, 'boundary'))
          shellSource = 'input'
        } else {
          const elements = await kernel.queryElements()
          shellBoundary = findBoundaryForNewLevelShell(elements, elevation, copyShellFromLevelId)
          if (shellBoundary) shellSource = 'copied'
        }
      }

      const wallIds: string[] = []
      let floorId: string | null = null
      if (generateShell && shellBoundary && shellBoundary.length >= 3) {
        for (let i = 0; i < shellBoundary.length; i += 1) {
          const start = shellBoundary[i]
          const end = shellBoundary[(i + 1) % shellBoundary.length]
          if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-8) continue
          const wallId = `wall-${crypto.randomUUID()}`
          await kernel.createElement({
            kind: 'wall',
            meta: { id: wallId, name: `Main Wall (${levelName})`, level_id: id },
            start,
            end,
            height: wallHeight,
            thickness: wallThickness,
          })
          wallIds.push(wallId)
        }
        if (createFloorForShell) {
          floorId = await kernel.createElement({
            kind: 'floor',
            meta: { id: crypto.randomUUID(), name: `Main Floor (${levelName})`, level_id: id },
            boundary: shellBoundary,
            thickness: floorThickness,
          })
        }
      }

      if (wallIds.length > 0) {
        const { autoJoinWalls } = await import('./wall-cleanup')
        await autoJoinWalls(kernel)
      }

      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({
        success: true,
        id,
        shell_created: wallIds.length > 0 || Boolean(floorId),
        shell_source: shellSource,
        wall_ids: wallIds,
        floor_id: floorId,
        message: `Level "${levelName}" created at elevation ${elevation}m`,
      })
    }

    case 'create_dimension': {
      const p1 = parsePoint2(input.p1, 'p1')
      const p2 = parsePoint2(input.p2, 'p2')
      const offset = parseOptionalFiniteNumber(input.offset, 0.5, 'offset')
      const text_override = typeof input.text_override === 'string' ? input.text_override : undefined
      const dimEl: any = {
        kind: 'dimension',
        meta: { id: crypto.randomUUID(), name: 'Dimension' },
        p1,
        p2,
        offset,
      }
      if (text_override !== undefined) dimEl.text_override = text_override
      const id = await kernel.createElement(dimEl)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Dimension created from [${p1}] to [${p2}]` })
    }

    case 'create_text_annotation': {
      const position = parsePoint2(input.position, 'position')
      const text = input.text as string
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid text: expected a non-empty string')
      }
      const font_size = parseOptionalFiniteNumber(input.font_size, 12, 'font_size')
      const rotation = parseOptionalFiniteNumber(input.rotation, 0, 'rotation')
      const id = await kernel.createElement({
        kind: 'text_annotation',
        meta: { id: crypto.randomUUID(), name: 'Text' },
        position,
        text,
        font_size,
        rotation,
      } as any)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Text annotation created: "${text}"` })
    }

    case 'set_material': {
      const element_id = input.element_id as string
      if (typeof element_id !== 'string' || !element_id.trim()) {
        throw new Error('Invalid element_id: expected a non-empty string')
      }
      const material_id = input.material_id as string | null
      const elements = await kernel.queryElements()
      const el = elements.find((e) => e.meta.id === element_id)
      if (!el) throw new Error(`Element ${element_id} not found`)
      const updated = JSON.parse(JSON.stringify(el)) as PrototypeElement
      ;(updated.meta as any).material_id = material_id
      await kernel.updateElement(element_id, updated)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: material_id ? `Material ${material_id} assigned to element ${element_id}` : `Material cleared from element ${element_id}` })
    }

    case 'list_materials': {
      const materials = await kernel.getMaterialLibrary()
      return JSON.stringify(materials, null, 2)
    }

    case 'export_ifc': {
      const data = await kernel.exportModel('ifc')
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bettercad-export.ifc'
      a.click()
      URL.revokeObjectURL(url)
      return JSON.stringify({ success: true, message: 'IFC file exported and download triggered' })
    }

    case 'export_dxf': {
      const data = await kernel.exportModel('dxf')
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bettercad-export.dxf'
      a.click()
      URL.revokeObjectURL(url)
      return JSON.stringify({ success: true, message: 'DXF file exported and download triggered' })
    }

    case 'export_gltf': {
      const data = await kernel.exportModel('gltf')
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bettercad-export.glb'
      a.click()
      URL.revokeObjectURL(url)
      return JSON.stringify({ success: true, message: 'glTF file exported and download triggered' })
    }

    case 'create_string_dimension': {
      const pointsRaw = input.points
      if (!Array.isArray(pointsRaw) || pointsRaw.length < 3) {
        throw new Error('create_string_dimension requires at least 3 points')
      }
      const points = pointsRaw.map((p: unknown, i: number) => parsePoint2(p, `points[${i}]`))
      const offset = parseOptionalFiniteNumber(input.offset, 0.5, 'offset')
      const { createStringDimension } = await import('./annotation-tools')
      const ids = await createStringDimension(kernel, points, offset)
      return JSON.stringify({ success: true, ids, message: `Created ${ids.length} chain dimensions` })
    }

    case 'create_leader': {
      const start = parsePoint2(input.start, 'start')
      const end = parsePoint2(input.end, 'end')
      const text = input.text as string
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid text: expected a non-empty string')
      }
      const { createLeaderAnnotation } = await import('./annotation-tools')
      const id = await createLeaderAnnotation(kernel, start, end, text)
      return JSON.stringify({ success: true, id, message: `Leader annotation created: "${text}"` })
    }

    case 'create_keynote': {
      const position = parsePoint2(input.position, 'position')
      const keynote_id = input.keynote_id as string
      if (typeof keynote_id !== 'string' || keynote_id.trim().length === 0) {
        throw new Error('Invalid keynote_id: expected a non-empty string')
      }
      const text = input.text as string
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid text: expected a non-empty string')
      }
      const { createKeynote } = await import('./annotation-tools')
      const id = await createKeynote(kernel, position, keynote_id, text)
      return JSON.stringify({ success: true, id, message: `Keynote "${keynote_id}" created` })
    }

    case 'auto_generate_tags': {
      const tagTypesRaw = Array.isArray(input.tag_types) ? input.tag_types : ['room', 'door', 'window']
      const tagTypes = tagTypesRaw.filter((t): t is string => typeof t === 'string')
      const { generateRoomTags, generateDoorTags, generateWindowTags } = await import('./tag-generator')
      const elements = await kernel.queryElements()

      const result: { rooms: string[]; doors: string[]; windows: string[] } = {
        rooms: [],
        doors: [],
        windows: [],
      }

      if (tagTypes.includes('room')) {
        result.rooms = await generateRoomTags(kernel, elements)
      }
      if (tagTypes.includes('door')) {
        const currentElements = await kernel.queryElements()
        result.doors = await generateDoorTags(kernel, currentElements)
      }
      if (tagTypes.includes('window')) {
        const currentElements = await kernel.queryElements()
        result.windows = await generateWindowTags(kernel, currentElements)
      }

      const total = result.rooms.length + result.doors.length + result.windows.length
      return JSON.stringify({
        success: true,
        ...result,
        message: `Generated ${total} tags (${result.rooms.length} room, ${result.doors.length} door, ${result.windows.length} window)`,
      })
    }

    case 'place_electrical': {
      const symbol_type = input.symbol_type as string
      const validTypes = ['outlet', 'switch', 'light_fixture', 'panel', 'smoke_detector', 'junction_box', 'three_way_switch', 'dimmer_switch', 'gfci_outlet', 'floor_outlet', 'ceiling_fan', 'thermostat']
      if (!validTypes.includes(symbol_type)) {
        throw new Error(`Invalid symbol_type: expected one of ${validTypes.join(', ')}`)
      }
      const position = parsePoint2(input.position, 'position')
      const rotation = parseOptionalFiniteNumber(input.rotation, 0, 'rotation')
      const elecLevelId = await resolveLevelId(input, kernel)
      const circuit_id = typeof input.circuit_id === 'string' ? input.circuit_id : undefined
      const connected_to = typeof input.connected_to === 'string' ? input.connected_to : undefined
      const elDef: any = {
        kind: 'electrical',
        meta: { id: crypto.randomUUID(), name: `Electrical (${symbol_type})`, level_id: elecLevelId },
        symbol_type,
        position,
        rotation,
      }
      if (circuit_id) elDef.circuit_id = circuit_id
      if (connected_to) elDef.connected_to = connected_to
      const id = await kernel.createElement(elDef)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Electrical ${symbol_type} placed at [${position}]` })
    }

    case 'place_plumbing': {
      const symbol_type = input.symbol_type as string
      const validTypes = ['toilet', 'sink', 'bathtub', 'shower', 'water_heater', 'hose_bib', 'floor_drain', 'dishwasher', 'washing_machine', 'urinal']
      if (!validTypes.includes(symbol_type)) {
        throw new Error(`Invalid symbol_type: expected one of ${validTypes.join(', ')}`)
      }
      const position = parsePoint2(input.position, 'position')
      const rotation = parseOptionalFiniteNumber(input.rotation, 0, 'rotation')
      const plumbLevelId = await resolveLevelId(input, kernel)
      const id = await kernel.createElement({
        kind: 'plumbing',
        meta: { id: crypto.randomUUID(), name: `Plumbing (${symbol_type})`, level_id: plumbLevelId },
        symbol_type,
        position,
        rotation,
      } as any)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Plumbing ${symbol_type} placed at [${position}]` })
    }

    case 'place_furniture': {
      const symbol_type = input.symbol_type as string
      const validTypes = ['desk', 'chair', 'table', 'bed', 'sofa', 'dining_table', 'bookshelf', 'wardrobe', 'toilet_stall', 'reception_desk', 'conference_table', 'kitchen_island', 'refrigerator', 'stove', 'washer', 'dryer', 'nightstand', 'coffee_table', 'tv_console', 'console_table', 'bench', 'ottoman', 'vanity']
      if (!validTypes.includes(symbol_type)) {
        throw new Error(`Invalid symbol_type: expected one of ${validTypes.join(', ')}`)
      }
      const position = parsePoint2(input.position, 'position')
      const rotation = parseOptionalFiniteNumber(input.rotation, 0, 'rotation')

      // Default sizes by furniture type
      const defaultSizes: Record<string, [number, number]> = {
        desk: [1.5, 0.75],
        chair: [0.5, 0.5],
        table: [1.2, 0.8],
        bed: [2.0, 1.5],
        sofa: [2.2, 0.9],
        dining_table: [1.8, 0.9],
        bookshelf: [1.0, 0.3],
        wardrobe: [1.2, 0.6],
        toilet_stall: [0.9, 1.5],
        reception_desk: [2.4, 0.8],
        conference_table: [3.0, 1.2],
        kitchen_island: [2.0, 1.0],
        refrigerator: [0.7, 0.7],
        stove: [0.76, 0.65],
        washer: [0.6, 0.6],
        dryer: [0.6, 0.6],
        nightstand: [0.5, 0.45],
        coffee_table: [1.2, 0.6],
        tv_console: [1.8, 0.45],
        console_table: [1.4, 0.4],
        bench: [1.5, 0.45],
        ottoman: [0.7, 0.7],
        vanity: [1.2, 0.55],
      }
      const [defaultWidth, defaultDepth] = defaultSizes[symbol_type] || [1.0, 1.0]
      const width = parseOptionalFiniteNumber(input.width, defaultWidth, 'width')
      const depth = parseOptionalFiniteNumber(input.depth, defaultDepth, 'depth')

      const furnLevelId = await resolveLevelId(input, kernel)
      const id = await kernel.createElement({
        kind: 'furniture',
        meta: { id: crypto.randomUUID(), name: `Furniture (${symbol_type})`, level_id: furnLevelId },
        symbol_type,
        position,
        rotation,
        width,
        depth,
      } as any)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Furniture ${symbol_type} (${width}m x ${depth}m) placed at [${position}]` })
    }

    case 'place_site_element': {
      const detail_type = input.detail_type as string
      const validTypes = ['property_line', 'setback', 'tree', 'parking_space', 'sidewalk', 'driveway', 'compass', 'contour_line', 'fence', 'retaining']
      if (!validTypes.includes(detail_type)) {
        throw new Error(`Invalid detail_type: expected one of ${validTypes.join(', ')}`)
      }
      if (!Array.isArray(input.points) || input.points.length < 1) {
        throw new Error('Invalid points: expected at least one [x,y] point')
      }
      const points = (input.points as unknown[]).map((p, i) => parsePoint2(p, `points[${i}]`))
      const radius = input.radius !== undefined ? parseOptionalFiniteNumber(input.radius, 1.5, 'radius') : undefined
      const elevation = input.elevation !== undefined ? parseOptionalFiniteNumber(input.elevation, 0, 'elevation') : undefined

      const elDef: any = {
        kind: 'site_detail',
        meta: { id: crypto.randomUUID(), name: `Site (${detail_type})` },
        detail_type,
        points,
      }
      if (radius !== undefined) elDef.radius = radius
      if (elevation !== undefined) elDef.elevation = elevation

      const id = await kernel.createElement(elDef)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Site element ${detail_type} placed` })
    }

    case 'connect_switch_to_fixture': {
      const switch_id = input.switch_id as string
      const fixture_id = input.fixture_id as string
      if (typeof switch_id !== 'string' || !switch_id.trim()) {
        throw new Error('Invalid switch_id: expected a non-empty string')
      }
      if (typeof fixture_id !== 'string' || !fixture_id.trim()) {
        throw new Error('Invalid fixture_id: expected a non-empty string')
      }
      const elements = await kernel.queryElements()
      const switchEl = elements.find((e) => e.meta.id === switch_id)
      if (!switchEl) throw new Error(`Switch element ${switch_id} not found`)
      if (switchEl.kind !== 'electrical') throw new Error(`Element ${switch_id} is not an electrical element`)
      const fixtureEl = elements.find((e) => e.meta.id === fixture_id)
      if (!fixtureEl) throw new Error(`Fixture element ${fixture_id} not found`)

      const updated = JSON.parse(JSON.stringify(switchEl)) as any
      updated.connected_to = fixture_id
      await kernel.updateElement(switch_id, updated)
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: `Switch ${switch_id} connected to fixture ${fixture_id}` })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

// ── Direct Anthropic API (requires VITE_ANTHROPIC_API_KEY) ─────────────────

function getClient(): Anthropic {
  const token = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!token) throw new Error('VITE_ANTHROPIC_API_KEY not set in .env')
  return new Anthropic({ apiKey: token, dangerouslyAllowBrowser: true })
}

async function* streamBimChatDirect(
  apiMessages: Anthropic.MessageParam[],
  elements: PrototypeElement[],
  kernel: KernelBackend,
  planMode: boolean,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const client = getClient()
  const tools = getAvailableTools(elements, planMode)
  const systemPrompt = planMode ? SYSTEM_PROMPT + PLAN_MODE_ADDENDUM : SYSTEM_PROMPT

  let messages: Anthropic.MessageParam[] = [...apiMessages]
  let accumulatedText = ''

  while (true) {
    if (signal?.aborted) return

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: systemPrompt,
      tools,
      messages,
    })

    // Abort the HTTP stream when signal fires
    if (signal) {
      const onAbort = () => stream.abort()
      signal.addEventListener('abort', onAbort, { once: true })
    }

    for await (const event of stream) {
      if (signal?.aborted) {
        stream.abort()
        return
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const delta = event.delta.text
        accumulatedText += delta
        yield { type: 'text_delta', delta }

        if (planMode && accumulatedText.includes('[PLAN READY]')) {
          const planText = accumulatedText.replace('[PLAN READY]', '').trim()
          const message = await stream.finalMessage()
          messages.push({ role: 'assistant', content: message.content })
          yield { type: 'plan_ready', planText }
          yield { type: 'complete', apiMessages: messages }
          return
        }
      }
    }

    if (signal?.aborted) return

    const message = await stream.finalMessage()
    messages.push({ role: 'assistant', content: message.content })

    if (message.stop_reason !== 'tool_use') {
      yield { type: 'complete', apiMessages: messages }
      break
    }

    const toolUseBlocks = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolBlock of toolUseBlocks) {
      if (signal?.aborted) return

      const input = toolBlock.input as ToolInput
      yield { type: 'tool_call', id: toolBlock.id, name: toolBlock.name, input }

      try {
        const result = await executeTool(toolBlock.name, input, kernel)
        yield { type: 'tool_result', id: toolBlock.id, result: result.startsWith('__SCREENSHOT_BASE64__') ? 'Screenshot captured' : result, isError: false }

        if (result.startsWith('__SCREENSHOT_BASE64__')) {
          const base64Data = result.slice('__SCREENSHOT_BASE64__'.length)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: [
              { type: 'text', text: 'Here is the current viewport screenshot:' },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Data } },
            ] as any,
          })
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        yield { type: 'tool_result', id: toolBlock.id, result: errorMsg, isError: true }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: `Error: ${errorMsg}`,
          is_error: true,
        })
      }
    }

    messages.push({ role: 'user', content: toolResults })
  }
}

// ── WebSocket proxy transport (uses Agent SDK OAuth via local proxy) ─────────

/** Module-level WebSocket singleton — reused across turns for session continuity */
let _proxyWs: WebSocket | null = null

async function getProxyWs(): Promise<WebSocket> {
  const url = import.meta.env.VITE_AI_PROXY_WS
  if (!url) throw new Error('VITE_AI_PROXY_WS not set in .env')

  if (_proxyWs && _proxyWs.readyState === WebSocket.OPEN) return _proxyWs

  _proxyWs = new WebSocket(url)

  await new Promise<void>((resolve, reject) => {
    _proxyWs!.onopen = () => resolve()
    _proxyWs!.onerror = () =>
      reject(
        new Error(
          `Cannot connect to AI proxy at ${url}\n` +
            'Run:  cd packages/ui/proxy && npm install && npm start',
        ),
      )
  })

  _proxyWs.addEventListener('close', () => { _proxyWs = null })
  return _proxyWs
}

/** Reset the proxy session (call when chat is cleared) */
export function resetProxySession(): void {
  if (_proxyWs?.readyState === WebSocket.OPEN) {
    _proxyWs.send(JSON.stringify({ type: 'reset' }))
  }
}

async function* streamBimChatViaProxy(
  apiMessages: Anthropic.MessageParam[],
  elements: PrototypeElement[],
  kernel: KernelBackend,
  planMode: boolean,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const ws = await getProxyWs()
  let assistantText = ''

  // ── Incoming message queue ────────────────────────────────────────────────
  const queue: unknown[] = []
  let waiting: ((v: unknown) => void) | null = null
  let closed = false

  const onMessage = (event: MessageEvent) => {
    const msg: unknown = JSON.parse(event.data as string)
    if (waiting) { const r = waiting; waiting = null; r(msg) }
    else queue.push(msg)
  }
  const onClose = () => {
    closed = true
    if (waiting) { const r = waiting; waiting = null; r(null) }
  }
  const onAbort = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel' }))
    }
    closed = true
    if (waiting) { const r = waiting; waiting = null; r(null) }
  }
  ws.addEventListener('message', onMessage)
  ws.addEventListener('close', onClose)
  ws.addEventListener('error', onClose)
  signal?.addEventListener('abort', onAbort, { once: true })

  const nextMsg = (): Promise<unknown> => {
    if (queue.length > 0) return Promise.resolve(queue.shift()!)
    if (closed) return Promise.resolve(null)
    return new Promise<unknown>((r) => { waiting = r })
  }

  const cleanup = () => {
    ws.removeEventListener('message', onMessage)
    ws.removeEventListener('close', onClose)
    ws.removeEventListener('error', onClose)
    signal?.removeEventListener('abort', onAbort)
  }

  // ── Extract latest user prompt ────────────────────────────────────────────
  const lastUser = [...apiMessages].reverse().find((m) => m.role === 'user')
  const prompt =
    typeof lastUser?.content === 'string'
      ? lastUser.content
      : Array.isArray(lastUser?.content)
        ? (lastUser.content as Array<{ type: string; text?: string }>)
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('')
        : ''

  if (signal?.aborted) {
    cleanup()
    return
  }

  // ── Send chat request ─────────────────────────────────────────────────────
  ws.send(
    JSON.stringify({
      type: 'chat',
      prompt,
      planMode,
    }),
  )

  // ── Event loop ────────────────────────────────────────────────────────────
  try {
    while (true) {
      if (signal?.aborted) break

      const msg = (await nextMsg()) as Record<string, unknown> | null
      if (!msg) break

      if (signal?.aborted) break

      if (msg.type === 'text_delta') {
        const delta = msg.delta as string
        assistantText += delta
        yield { type: 'text_delta', delta }
      } else if (msg.type === 'tool_call') {
        const { callId, name, input } = msg as {
          callId: string
          name: string
          input: ToolInput
        }
        yield { type: 'tool_call', id: callId, name, input }

        try {
          const result = await executeTool(name, input, kernel)
          const displayResult = result.startsWith('__SCREENSHOT_BASE64__') ? 'Screenshot captured' : result
          yield { type: 'tool_result', id: callId, result: displayResult, isError: false }
          ws.send(JSON.stringify({ type: 'tool_result', callId, result, isError: false }))
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          yield { type: 'tool_result', id: callId, result: errorMsg, isError: true }
          ws.send(JSON.stringify({ type: 'tool_result', callId, result: errorMsg, isError: true }))
        }
      } else if (msg.type === 'plan_ready') {
        const planText = msg.planText as string
        const assistantMsg: Anthropic.MessageParam = { role: 'assistant', content: planText }
        const nextApiMessages =
          planText.trim().length > 0
            ? [...apiMessages, assistantMsg]
            : apiMessages

        yield { type: 'plan_ready', planText }
        yield { type: 'complete', apiMessages: nextApiMessages }
        return
      } else if (msg.type === 'complete') {
        const assistantMsg: Anthropic.MessageParam = { role: 'assistant', content: assistantText }
        const nextApiMessages =
          assistantText.trim().length > 0
            ? [...apiMessages, assistantMsg]
            : apiMessages
        yield { type: 'complete', apiMessages: nextApiMessages }
        break
      } else if (msg.type === 'error') {
        throw new Error(msg.message as string)
      }
    }
  } finally {
    cleanup()
  }
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Streams a BIM chat turn with tool-use agentic loop.
 *
 * Routes through the local Agent SDK proxy (VITE_AI_PROXY_WS) when set,
 * otherwise falls back to the direct Anthropic API (VITE_ANTHROPIC_API_KEY).
 */
export async function* streamBimChat(
  apiMessages: Anthropic.MessageParam[],
  elements: PrototypeElement[],
  kernel: KernelBackend,
  planMode: boolean,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  if (import.meta.env.VITE_AI_PROXY_WS) {
    yield* streamBimChatViaProxy(apiMessages, elements, kernel, planMode, signal)
  } else {
    yield* streamBimChatDirect(apiMessages, elements, kernel, planMode, signal)
  }
}
