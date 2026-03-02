import Anthropic from '@anthropic-ai/sdk'
import type { KernelBackend, PrototypeElement } from './kernel-bridge'
import { syncEntitiesAndRegenerateMeshes } from './entity-regeneration'
import { isWallElement } from '../stores/entity-store'

// ── Types ──────────────────────────────────────────────────────────────────

export type UiChatMessage =
  | { id: string; role: 'user'; content: string }
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
Always call query_building first to understand the current state before creating elements.
Create buildings logically: walls → floors → doors/windows → roof.
Standard ceiling height: 3.0m. Standard wall thickness: 0.2m.
For doors: position_along_wall is 0.0–1.0 (fraction along wall length).
When creating a simple room, create 4 connected walls forming a rectangle.
Confirm what you are creating as you build it.`

const PLAN_MODE_ADDENDUM = `

You are in PLAN MODE. Before calling any building tools (create_wall, create_floor, create_door, create_window, create_stair, create_roof, create_column, create_room), output a structured text plan that includes:
1) Summary
2) TODO Task List (Markdown checklist using one item per line in this exact format: - [ ] Task)
3) Geometry details (element types, approximate coordinates, dimensions)
4) Assumptions/risks
End your plan with the phrase [PLAN READY]. Do NOT call any creation tools until the user approves the plan. You may call query_building to inspect current state.`

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

const BIM_TOOLS_BASE: Anthropic.Tool[] = [
  {
    name: 'query_building',
    description: 'Returns all current BIM elements as JSON. Always call this first to understand the current state.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_wall',
    description: 'Create a wall segment. Coordinates are in meters.',
    input_schema: {
      type: 'object',
      properties: {
        start: POINT2_SCHEMA,
        end: POINT2_SCHEMA,
        height: { type: 'number', description: 'Wall height in meters (default: 3.0)' },
        thickness: { type: 'number', description: 'Wall thickness in meters (default: 0.2)' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'create_floor',
    description: 'Create a floor slab with a boundary polygon.',
    input_schema: {
      type: 'object',
      properties: {
        boundary: POLYGON2_SCHEMA,
        thickness: { type: 'number', description: 'Floor thickness in meters (default: 0.25)' },
      },
      required: ['boundary'],
    },
  },
  {
    name: 'create_column',
    description: 'Create a structural column.',
    input_schema: {
      type: 'object',
      properties: {
        center: POINT2_SCHEMA,
        width: { type: 'number', description: 'Column width in meters (default: 0.3)' },
        depth: { type: 'number', description: 'Column depth in meters (default: 0.3)' },
        height: { type: 'number', description: 'Column height in meters (default: 3.0)' },
      },
      required: ['center'],
    },
  },
  {
    name: 'create_stair',
    description: 'Create a staircase.',
    input_schema: {
      type: 'object',
      properties: {
        start: POINT2_SCHEMA,
        end: POINT2_SCHEMA,
        width: { type: 'number', description: 'Stair width in meters (default: 1.1)' },
        risers: { type: 'number', description: 'Number of risers (default: 16)' },
        total_height: { type: 'number', description: 'Total height in meters (default: 3.0)' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'create_roof',
    description: 'Create a roof with a boundary polygon.',
    input_schema: {
      type: 'object',
      properties: {
        boundary: POLYGON2_SCHEMA,
        roof_type: {
          type: 'string',
          enum: ['flat', 'gable', 'shed', 'hip'],
          description: 'Roof type (default: flat)',
        },
        pitch: { type: 'number', description: 'Roof pitch in degrees (default: 0)' },
        elevation: { type: 'number', description: 'Roof base elevation in meters (default: 3.0)' },
      },
      required: ['boundary'],
    },
  },
  {
    name: 'create_room',
    description: 'Create a room label with a boundary polygon.',
    input_schema: {
      type: 'object',
      properties: {
        boundary: POLYGON2_SCHEMA,
        name: { type: 'string', description: 'Room name (e.g., "Living Room")' },
      },
      required: ['boundary', 'name'],
    },
  },
  {
    name: 'clear_building',
    description: 'Remove all elements from the building model.',
    input_schema: { type: 'object', properties: {}, required: [] },
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
        enum: ['wall', 'door', 'window', 'floor', 'roof', 'stair', 'column', 'beam', 'room', 'dimension', 'text_annotation', 'level'],
        description: 'Delete all elements of this kind',
      },
    },
    required: [],
  },
}

export function getAvailableTools(elements: PrototypeElement[], planMode = false): Anthropic.Tool[] {
  if (planMode) {
    return BIM_TOOLS_BASE.filter((t) => t.name === 'query_building')
  }
  const tools = [...BIM_TOOLS_BASE]
  const hasWalls = elements.some(isWallElement)
  if (hasWalls) {
    tools.push(DOOR_TOOL)
    tools.push(WINDOW_TOOL)
  }
  tools.push(DELETE_TOOL)
  tools.push(DELETE_ELEMENTS_TOOL)
  return tools
}

// ── Tool execution ─────────────────────────────────────────────────────────

type ToolInput = Record<string, unknown>

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

async function executeTool(name: string, input: ToolInput, kernel: KernelBackend): Promise<string> {
  switch (name) {
    case 'query_building': {
      const elements = await kernel.queryElements()
      return JSON.stringify(elements, null, 2)
    }

    case 'create_wall': {
      const start = parsePoint2(input.start, 'start')
      const end = parsePoint2(input.end, 'end')
      const height = parseOptionalFiniteNumber(input.height, 3.0, 'height')
      const thickness = parseOptionalFiniteNumber(input.thickness, 0.2, 'thickness')
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-8) {
        throw new Error('Invalid wall: start and end points are identical')
      }
      const id = await kernel.createElement({
        kind: 'wall',
        meta: { id: crypto.randomUUID(), name: 'Wall' },
        start,
        end,
        height,
        thickness,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Wall created from [${start}] to [${end}]` })
    }

    case 'create_floor': {
      const boundary = parseBoundary2(input.boundary, 'boundary')
      const thickness = parseOptionalFiniteNumber(input.thickness, 0.25, 'thickness')
      const id = await kernel.createElement({
        kind: 'floor',
        meta: { id: crypto.randomUUID(), name: 'Floor' },
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
      const id = await kernel.createElement({
        kind: 'column',
        meta: { id: crypto.randomUUID(), name: 'Column' },
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
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-8) {
        throw new Error('Invalid stair: start and end points are identical')
      }
      if (risers < 1) {
        throw new Error('Invalid risers: must be at least 1')
      }
      const id = await kernel.createElement({
        kind: 'stair',
        meta: { id: crypto.randomUUID(), name: 'Stair' },
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
      const roof_type = (input.roof_type as 'flat' | 'gable' | 'shed' | 'hip' | undefined) ?? 'flat'
      const pitch = parseOptionalFiniteNumber(input.pitch, 0, 'pitch')
      const elevation = parseOptionalFiniteNumber(input.elevation, 3.0, 'elevation')
      const id = await kernel.createElement({
        kind: 'roof',
        meta: { id: crypto.randomUUID(), name: 'Roof' },
        boundary,
        thickness: 0.3,
        elevation,
        auto_elevation: false,
        roof_type,
        pitch_degrees: pitch,
        ridge_angle_degrees: 0,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `${roof_type} roof created` })
    }

    case 'create_room': {
      const boundary = parseBoundary2(input.boundary, 'boundary')
      const roomName = input.name as string
      if (typeof roomName !== 'string' || roomName.trim().length === 0) {
        throw new Error('Invalid name: expected a non-empty room name')
      }
      const id = await kernel.createElement({
        kind: 'room',
        meta: { id: crypto.randomUUID(), name: roomName },
        boundary,
        name: roomName,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, id, message: `Room "${roomName}" created` })
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
      const id = await kernel.createElement({
        kind: 'door',
        meta: { id: crypto.randomUUID(), name: 'Door', host_id: wall_id },
        wall_id,
        position_along_wall,
        width,
        height,
        sill_height: 0,
        swing,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
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
      const id = await kernel.createElement({
        kind: 'window',
        meta: { id: crypto.randomUUID(), name: 'Window', host_id: wall_id },
        wall_id,
        position_along_wall,
        width,
        height,
        sill_height,
      })
      await syncEntitiesAndRegenerateMeshes(kernel)
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

    case 'clear_building': {
      await kernel.resetProject('BetterCAD Project', 'metric')
      await syncEntitiesAndRegenerateMeshes(kernel)
      return JSON.stringify({ success: true, message: 'Building cleared' })
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
): AsyncGenerator<StreamEvent> {
  const client = getClient()
  const tools = getAvailableTools(elements, planMode)
  const systemPrompt = planMode ? SYSTEM_PROMPT + PLAN_MODE_ADDENDUM : SYSTEM_PROMPT

  let messages: Anthropic.MessageParam[] = [...apiMessages]
  let accumulatedText = ''

  while (true) {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: systemPrompt,
      tools,
      messages,
    })

    for await (const event of stream) {
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
      const input = toolBlock.input as ToolInput
      yield { type: 'tool_call', id: toolBlock.id, name: toolBlock.name, input }

      try {
        const result = await executeTool(toolBlock.name, input, kernel)
        yield { type: 'tool_result', id: toolBlock.id, result, isError: false }
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result })
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
  ws.addEventListener('message', onMessage)
  ws.addEventListener('close', onClose)
  ws.addEventListener('error', onClose)

  const nextMsg = (): Promise<unknown> => {
    if (queue.length > 0) return Promise.resolve(queue.shift()!)
    if (closed) return Promise.resolve(null)
    return new Promise<unknown>((r) => { waiting = r })
  }

  const cleanup = () => {
    ws.removeEventListener('message', onMessage)
    ws.removeEventListener('close', onClose)
    ws.removeEventListener('error', onClose)
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

  // ── Send chat request ─────────────────────────────────────────────────────
  ws.send(
    JSON.stringify({
      type: 'chat',
      prompt,
      planMode,
      hasWalls: elements.some(isWallElement),
      elementCount: elements.length,
    }),
  )

  // ── Event loop ────────────────────────────────────────────────────────────
  try {
    while (true) {
      const msg = (await nextMsg()) as Record<string, unknown> | null
      if (!msg) break

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
          yield { type: 'tool_result', id: callId, result, isError: false }
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
): AsyncGenerator<StreamEvent> {
  if (import.meta.env.VITE_AI_PROXY_WS) {
    yield* streamBimChatViaProxy(apiMessages, elements, kernel, planMode)
  } else {
    yield* streamBimChatDirect(apiMessages, elements, kernel, planMode)
  }
}
