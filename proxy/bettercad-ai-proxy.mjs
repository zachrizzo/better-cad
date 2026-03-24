/**
 * BetterCAD AI Proxy Server
 *
 * Uses @anthropic-ai/claude-agent-sdk which authenticates via Claude Code's
 * OAuth credentials (~/.claude/.credentials.json) — no API key needed.
 *
 * BIM tools are defined as in-process MCP tools. When Claude calls one, the
 * handler sends a `tool_call` message to the browser via WebSocket, waits for
 * the browser to execute it (against the WASM kernel) and send back a
 * `tool_result`, then returns that result to the Agent SDK.
 *
 * Usage:
 *   cd packages/ui/proxy
 *   npm install
 *   npm start
 */

import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const PORT = 3001
const SCREENSHOT_PREFIX = '__SCREENSHOT_BASE64__'

// ── System prompts ────────────────────────────────────────────────────────────

const BIM_SYSTEM = `You are an expert architectural BIM assistant for BetterCAD.
Coordinate system: X = east, Y = north, units = meters.
Origin (0,0) is the project origin.
For all 2D coordinate tool inputs, use exactly two numeric values: [x, y] (no z coordinate).
Use query_scene_summary first for context. Use query_elements for targeted geometry/details. Use query_building only when a full raw dump is explicitly needed.
Use get_level_id when you need to resolve a level ID by name, elevation, index, or active level.
Track scene_revision from query_scene_summary. If unchanged, reuse prior summary context instead of re-querying full state.
CRITICAL: Every physical element (wall, floor, column, stair, roof, beam, foundation, room) MUST have a level_id. Before creating any physical elements, first create levels using create_level, then pass each level's ID as the level_id parameter. If levels already exist (from query_scene_summary/query_elements), reuse them. For multi-story buildings, create one level per story first, then assign elements to the correct level.
Create buildings logically: levels → walls → floors → doors/windows → roof.
For create_roof: omit elevation unless the user explicitly requests a manual offset. By default, the roof should auto-elevate to sit on top of supporting geometry on its level.
Prefer placing roofs on the highest occupied building level; do not invent an extra empty roof level unless the user asks for one.
Standard ceiling height: 3.0m. Standard wall thickness: 0.2m.
For doors: position_along_wall is 0.0–1.0 (fraction along wall length).
When adding multiple doors/windows on the same wall, ensure opening widths do not overlap. Prefer sequential placement and verify with query_elements before adding more openings on that wall.
Never run add_room/create_room_bundle in parallel for adjacent rooms. Create one room at a time, verify, then continue.
When creating a simple room, create 4 connected walls forming a rectangle.
Use add_room when the user asks to create a room: it builds walls + slab + named room + door + windows in one call by default.
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
If any planned task is still incomplete, explicitly say so and continue execution instead of finalizing.
If the user asks for furniture in the model, you MUST place actual furniture elements using place_furniture. A text-only furniture list is not a valid substitute unless the user explicitly asks for conceptual guidance only.
Before finalizing a task that includes furniture, verify with query_elements(kinds:["furniture"]) or query_scene_summary counts and report the actual furniture count. If the count is 0, explicitly state furniture is not yet placed and continue placing it.
Never create rooms to represent furniture. Do not use create_room/add_room as furniture placeholders.
If the user requests a furniture item with no exact symbol_type, map it to the nearest supported place_furniture symbol and state the mapping.
When completing furnishing tasks, ensure room count did not increase during furnishing. If furniture count is unchanged and room count increased, the furnishing task is incomplete.
If a tool_result is marked as an error, treat that call as failed. Do not mark the task complete, and do not call it a warning.
After any tool error: diagnose from the message, inspect scene state with query_scene_summary/query_elements when needed, then retry with corrected parameters or choose a different tool.
Use set_view_mode to switch between '3d', '2d', and 'split' viewports when verification requires a specific view.
Use take_2d_screenshot to verify plan/layout edits, and take_screenshot for 3D perspective checks.
For multi-level buildings, work one level at a time: complete one level, verify it in 2D, then proceed to the next level.
Verification per level is mandatory before continuing: call set_view_mode('2d'), query scene state for that level, take_2d_screenshot, and only then move on.
For standards, code-compliance, and best-practice questions, call research_best_practices.
If jurisdiction is missing for code/compliance questions, ask a concise follow-up first.
Cite returned source URLs and include a short reliability note (government, standards body, or industry source).
For code answers, note that final authority is the local AHJ.
When the user asks to remove elements, use delete_element (single) or delete_elements (bulk by kind/ids).
You can place electrical symbols using place_electrical.
You can place plumbing fixtures using place_plumbing.
You can place furniture using place_furniture.
You can place site elements using place_site_element.
Use connect_switch_to_fixture to draw switching diagram lines from a switch to the fixture it controls.
Confirm what you are creating as you build it.`

const PLAN_MODE_ADDENDUM = `

You are in PLAN MODE. Before calling any building tools (create_wall, create_floor,
create_door, create_window, create_stair, create_roof, create_column, create_room, add_room, create_room_bundle, create_level, place_electrical, place_plumbing, place_furniture, place_site_element),
output a structured text plan that includes:
1) Summary
2) TODO Task List (Markdown checklist using one item per line in this exact format: - [ ] Task)
3) Geometry details (element types, approximate coordinates, dimensions)
4) Layout intent (how circulation and zoning work; include creative choices when requested)
If the user requests creativity, include a "Creative Moves" subsection with at least 2 concrete moves and show how geometry reflects them.
5) Assumptions/risks
If the user requested furniture, include a concrete furniture placement phase that uses place_furniture, then a verification step that reports the resulting furniture count from scene data.
End your plan with the phrase [PLAN READY].
Do NOT call any creation tools until the user approves the plan.
You may call query_scene_summary/query_elements (or query_building as fallback) to inspect current state.`

// ── MCP tool bridge ───────────────────────────────────────────────────────────

function decodeHtmlEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(html) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function extractBingResults(html, limit) {
  const results = []
  const itemRegex = /<li class="b_algo"[\s\S]*?<\/li>/g

  for (const match of html.matchAll(itemRegex)) {
    const block = match[0]
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue

    let url = decodeHtmlEntities(linkMatch[1])
    if (url.startsWith('/')) url = `https://www.bing.com${url}`
    if (!/^https?:\/\//i.test(url)) continue

    const title = stripHtml(linkMatch[2])
    const snippetMatch = block.match(/<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)
      || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]).slice(0, 320) : ''

    results.push({ title, url, snippet })
    if (results.length >= limit) break
  }

  return results
}

async function fetchBingResults(queryText, limit) {
  const queryString = encodeURIComponent(queryText)
  const url = `https://www.bing.com/search?q=${queryString}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BetterCAD-AI-Proxy/1.0',
      },
    })
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`)
    const html = await res.text()
    return extractBingResults(html, limit)
  } finally {
    clearTimeout(timeout)
  }
}

const DISCIPLINE_HINTS = {
  architecture: 'architectural design',
  structure: 'structural engineering',
  mep: 'mechanical electrical plumbing',
  site: 'site civil parking grading',
  fire: 'fire protection life safety',
  sustainability: 'sustainability energy efficiency',
  construction: 'constructability execution QA/QC',
  general: 'building design',
}

const STANDARD_DOMAINS = [
  'ashrae.org',
  'asce.org',
  'nfpa.org',
  'smacna.org',
  'aci-int.org',
  'aisc.org',
  'astm.org',
  'iso.org',
  'buildingSMART.org',
  'usgbc.org',
]

const BEST_PRACTICE_DOMAINS = [
  '.gov',
  'nibs.org',
  'wbdg.org',
  'energy.gov',
  'epa.gov',
  'osha.gov',
  'fema.gov',
  'who.int',
  'usgbc.org',
]

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid']) {
      parsed.searchParams.delete(key)
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function sourceCategory(host) {
  if (!host) return 'unknown'
  if (host.endsWith('.gov')) return 'government'
  if (host === 'codes.iccsafe.org' || host === 'up.codes') return 'code_publisher'
  if (host.endsWith('.edu')) return 'academic'
  if (STANDARD_DOMAINS.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))) {
    return 'standards_body'
  }
  return 'industry'
}

function authorityScore(host) {
  const category = sourceCategory(host)
  if (category === 'government') return 1.0
  if (category === 'code_publisher') return 0.97
  if (category === 'standards_body') return 0.94
  if (category === 'academic') return 0.9
  return 0.75
}

function domainsClause(domains) {
  return domains.map((d) => `site:${d}`).join(' OR ')
}

function buildResearchQueries({ topic, discipline, jurisdiction, occupancy, intent }) {
  const base = [
    topic,
    DISCIPLINE_HINTS[discipline] ?? DISCIPLINE_HINTS.general,
    occupancy,
    jurisdiction,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  const codeQuery = `${base} adopted building code requirements ${domainsClause(['codes.iccsafe.org', 'up.codes', '.gov'])}`.trim()
  const standardQuery = `${base} design standard guideline ${domainsClause(STANDARD_DOMAINS)}`.trim()
  const bestPracticeQuery = `${base} best practice design guide ${domainsClause(BEST_PRACTICE_DOMAINS)}`.trim()
  const broadQuery = `${base} building design standards best practices`

  if (intent === 'code') return [codeQuery, broadQuery]
  if (intent === 'standard') return [standardQuery, broadQuery]
  if (intent === 'best_practice') return [bestPracticeQuery, broadQuery]
  return [codeQuery, standardQuery, bestPracticeQuery, broadQuery]
}

async function runGuidanceSearch(input, override = {}) {
  const topic = input.topic
  const discipline = input.discipline ?? 'general'
  const jurisdiction = input.jurisdiction ?? null
  const occupancy = input.occupancy ?? null
  const intent = override.intent ?? input.intent ?? 'all'
  const limit = override.limit ?? input.limit ?? 6

  const queries = buildResearchQueries({ topic, discipline, jurisdiction, occupancy, intent })
  const raw = []
  const perQueryLimit = Math.min(12, Math.max(6, limit * 2))

  for (const queryText of queries) {
    try {
      const queryResults = await fetchBingResults(queryText, perQueryLimit)
      queryResults.forEach((result, index) => {
        raw.push({
          ...result,
          query: queryText,
          rank_in_query: index + 1,
        })
      })
    } catch {
      // Skip single-query failures and continue with remaining queries.
    }
    if (raw.length >= limit * 4) break
  }

  const byUrl = new Map()
  for (const item of raw) {
    const normalized = normalizeUrl(item.url)
    const host = hostFromUrl(normalized)
    const score = authorityScore(host)
    const category = sourceCategory(host)
    const existing = byUrl.get(normalized)
    const candidate = {
      title: item.title,
      url: normalized,
      snippet: item.snippet,
      source_host: host,
      source_category: category,
      authority_score: Number(score.toFixed(2)),
      matched_query: item.query,
      rank_in_query: item.rank_in_query,
    }
    if (!existing) {
      byUrl.set(normalized, candidate)
      continue
    }
    const replace =
      candidate.authority_score > existing.authority_score
      || (
        candidate.authority_score === existing.authority_score
        && candidate.rank_in_query < existing.rank_in_query
      )
    if (replace) byUrl.set(normalized, candidate)
  }

  const sorted = Array.from(byUrl.values())
    .sort((a, b) => {
      if (b.authority_score !== a.authority_score) return b.authority_score - a.authority_score
      return a.rank_in_query - b.rank_in_query
    })
    .slice(0, limit)

  return {
    topic,
    intent,
    discipline,
    jurisdiction,
    occupancy,
    searched_queries: queries,
    result_count: sorted.length,
    results: sorted,
    disclaimer:
      intent === 'code'
        ? 'Informational research only. Verify final requirements with the adopted code cycle and local AHJ.'
        : 'Informational research only. Confirm applicability with project constraints, adopted codes, and local AHJ.',
  }
}

const RESEARCH_BEST_PRACTICES_TOOL = tool(
  'research_best_practices',
  'Research codes, standards, and best-practice guidance for any AEC topic. Returns source links and reliability metadata.',
  z.object({
    topic: z.string().min(3).describe('Topic to research, e.g. "hospital corridor width", "parking lot layout", "roof drainage"'),
    discipline: z.enum(['architecture', 'structure', 'mep', 'site', 'fire', 'sustainability', 'construction', 'general']).optional(),
    jurisdiction: z.string().optional().describe('Jurisdiction, e.g. "Phoenix AZ" or "California"'),
    occupancy: z.string().optional().describe('Occupancy/use context, e.g. "multifamily", "ambulatory care", "office"'),
    intent: z.enum(['code', 'standard', 'best_practice', 'all']).optional().describe('Type of guidance to prioritize (default: all)'),
    limit: z.number().int().min(1).max(8).optional().describe('Maximum result count (default: 6)'),
  }),
  async (input) => {
    try {
      const payload = await runGuidanceSearch(input)
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: `Guidance search failed: ${message}` }) },
        ],
      }
    }
  },
)

// Backward-compatible alias focused on code compliance.
const SEARCH_BUILDING_CODE_TOOL = tool(
  'search_building_code',
  'Search public web sources for building code requirements and return links/snippets. Use for compliance/code questions.',
  z.object({
    topic: z.string().min(3).describe('Code topic to research, e.g. "residential stair riser height"'),
    jurisdiction: z.string().optional().describe('Jurisdiction, e.g. "Phoenix AZ" or "California"'),
    occupancy: z.string().optional().describe('Building use/occupancy, e.g. "IRC single-family"'),
    limit: z.number().int().min(1).max(8).optional().describe('Maximum result count (default: 5)'),
  }),
  async (input) => {
    try {
      const payload = await runGuidanceSearch(
        { ...input, discipline: 'general', intent: 'code' },
        { intent: 'code', limit: input.limit ?? 5 },
      )
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: `Building code search failed: ${message}` }) },
        ],
      }
    }
  },
)

/**
 * Timeout for browser tool execution (120 seconds).
 * Must exceed the browser-side TOOL_EXEC_TIMEOUT_MS (90s) to let the browser
 * respond with its own timeout error rather than the proxy timing out silently.
 */
const BRIDGE_TOOL_TIMEOUT_MS = 120_000

function makeBridgeTool(ws, pendingCalls, name, description, schema) {
  return tool(name, description, schema, (input) => {
    const asToolText = (value) => {
      if (typeof value === 'string') return value
      try {
        return JSON.stringify(value ?? {})
      } catch {
        return String(value)
      }
    }

    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`[Proxy] tool_call ${name}: browser WS not open (readyState=${ws.readyState})`)
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify({ error: 'Browser disconnected' }) }],
        isError: true,
      })
    }

    return new Promise((resolve) => {
      const callId = randomUUID()

      const timer = setTimeout(() => {
        if (pendingCalls.has(callId)) {
          pendingCalls.delete(callId)
          console.warn(`[Proxy] tool_call ${name} callId=${callId} TIMED OUT after ${BRIDGE_TOOL_TIMEOUT_MS / 1000}s`)
          resolve({
            content: [{ type: 'text', text: JSON.stringify({ error: `Tool ${name} timed out after ${BRIDGE_TOOL_TIMEOUT_MS / 1000}s waiting for browser response` }) }],
            isError: true,
          })
        }
      }, BRIDGE_TOOL_TIMEOUT_MS)

      pendingCalls.set(callId, ({ result, isError }) => {
        clearTimeout(timer)
        pendingCalls.delete(callId)
        const text = asToolText(result)
        console.log(`[Proxy] tool_result ${name} callId=${callId} isError=${isError} len=${text.length}`)
        if (isError) {
          resolve({ content: [{ type: 'text', text }], isError: true })
          return
        }
        if (text.startsWith(SCREENSHOT_PREFIX)) {
          resolve({
            // Agent SDK tool-result transport is text-first; returning mixed image blocks
            // can break downstream parsing. Keep proxy mode stable with text confirmation.
            content: [{ type: 'text', text: 'Screenshot captured successfully. Continue verification using scene queries and screenshot confirmation.' }],
          })
          return
        }
        resolve({ content: [{ type: 'text', text }] })
      })

      console.log(`[Proxy] tool_call ${name} callId=${callId} -> browser`)
      ws.send(JSON.stringify({ type: 'tool_call', callId, name, input }))
    })
  })
}

function createBimMcpTools(ws, pendingCalls, options = {}) {
  const { planMode = false } = options
  const bt = (name, desc, schema) => makeBridgeTool(ws, pendingCalls, name, desc, schema)
  const point2 = z.union([
    z.tuple([z.number(), z.number()]),
    z.object({ x: z.number(), y: z.number() }),
  ])
  const boundary2 = z.array(point2).min(3)
  const bbox2 = z.tuple([z.number(), z.number(), z.number(), z.number()])

  const querySceneSummaryTool = bt(
    'query_scene_summary',
    'Returns compact scene context (counts, levels, bounds, room access) plus scene_revision. Prefer this over query_building.',
    z.object({
      known_revision: z.string().optional().describe('Last known scene_revision. If unchanged, returns unchanged=true with a minimal payload.'),
    }),
  )

  const queryElementsTool = bt(
    'query_elements',
    'Returns targeted elements with optional filters (kind, ids, level, bbox, fields). Use this instead of full-scene dumps.',
    z.object({
      kinds: z.array(z.string()).optional().describe('Optional kinds filter, e.g. ["wall","door","room"]'),
      ids: z.array(z.string()).optional().describe('Optional explicit element IDs'),
      level_id: z.string().optional().describe('Optional level filter'),
      bbox: bbox2.optional().describe('Optional bbox [min_x, min_y, max_x, max_y] in meters'),
      fields: z.array(z.string()).optional().describe('Optional fields to return (e.g. ["meta.id","meta.name","start","end"]). "*" returns full elements.'),
      limit: z.number().int().min(1).max(1000).optional().describe('Max elements to return (default: 200, max: 1000)'),
    }),
  )

  const getLevelIdTool = bt(
    'get_level_id',
    'Resolve a level ID by level name, elevation, level index, or active level. Returns matching level metadata plus a primary level_id.',
    z.object({
      name: z.string().optional().describe('Optional level name to match (case-insensitive). Example: "Ground Floor"'),
      elevation: z.number().optional().describe('Optional target elevation in meters'),
      tolerance: z.number().optional().describe('Elevation tolerance in meters when matching elevation (default: 0.01)'),
      level_index: z.number().int().min(0).optional().describe('Optional 0-based index after sorting levels by elevation ascending'),
      active_only: z.boolean().optional().describe('If true, only return the currently active UI level'),
    }),
  )

  const queryBuildingTool = bt(
    'query_building',
    'Returns all current BIM elements as raw JSON. Expensive in context/tokens; use only when a full dump is explicitly needed.',
    z.object({}),
  )
  const setViewModeTool = bt(
    'set_view_mode',
    'Switch the UI viewport mode to 3D, 2D, or split view.',
    z.object({
      mode: z.enum(['3d', '2d', 'split']).describe('Viewport mode to activate'),
    }),
  )
  const setCameraTool = bt(
    'set_camera',
    'Move the 3D viewport camera to a specific position and target.',
    z.object({
      position: z.tuple([z.number(), z.number(), z.number()]).describe('Camera position [x, y, z]'),
      target: z.tuple([z.number(), z.number(), z.number()]).describe('Camera look-at target [x, y, z]'),
    }),
  )
  const takeScreenshotTool = bt(
    'take_screenshot',
    'Capture a screenshot of the current 3D viewport.',
    z.object({}),
  )
  const take2DScreenshotTool = bt(
    'take_2d_screenshot',
    'Capture a screenshot of the current 2D plan viewport for geometry verification.',
    z.object({}),
  )

  // Hard-enforce plan mode: planning can inspect state but cannot mutate model.
  if (planMode) {
    return [
      querySceneSummaryTool,
      queryElementsTool,
      getLevelIdTool,
      queryBuildingTool,
      setViewModeTool,
      setCameraTool,
      takeScreenshotTool,
      take2DScreenshotTool,
      RESEARCH_BEST_PRACTICES_TOOL,
      SEARCH_BUILDING_CODE_TOOL,
    ]
  }

  const levelIdParam = z.string().optional().describe('ID of the level this element belongs to (from create_level or query_scene_summary/query_elements). If omitted, auto-assigns to first available level.')

  const tools = [
    querySceneSummaryTool,
    queryElementsTool,
    getLevelIdTool,
    queryBuildingTool,
    setViewModeTool,
    setCameraTool,
    takeScreenshotTool,
    take2DScreenshotTool,
    RESEARCH_BEST_PRACTICES_TOOL,
    SEARCH_BUILDING_CODE_TOOL,

    bt('create_level', 'Create a building level (storey) with a name and elevation. Can auto-generate a main shell (perimeter walls + slab).', z.object({
      name: z.string().describe('Level name (e.g., "Ground Floor", "Level 1")'),
      elevation: z.number().describe('Level elevation in meters (e.g., 0.0 for ground, 3.0 for first floor)'),
      boundary: boundary2.optional().describe('Optional footprint boundary [[x,y],...] used for auto shell'),
      generate_shell: z.boolean().optional().describe('Whether to auto-generate main shell walls/slab (default: true)'),
      create_floor: z.boolean().optional().describe('Whether auto shell should create floor slab (default: true)'),
      wall_height: z.number().optional().describe('Auto shell wall height in meters (default: 3.0)'),
      wall_thickness: z.number().optional().describe('Auto shell wall thickness in meters (default: 0.2)'),
      floor_thickness: z.number().optional().describe('Auto shell floor thickness in meters (default: 0.25)'),
      copy_shell_from_level_id: z.string().optional().describe('Optional level ID to copy shell boundary from when boundary is omitted'),
    })),

    bt('create_wall', 'Create a wall segment. Coordinates in meters. Requires level_id.', z.object({
      start: point2.describe('Start point [x, y] in meters'),
      end: point2.describe('End point [x, y] in meters'),
      height: z.number().optional().describe('Wall height in meters (default: 3.0)'),
      thickness: z.number().optional().describe('Wall thickness in meters (default: 0.2)'),
      level_id: levelIdParam,
    })),

    bt('create_floor', 'Create a floor slab with a boundary polygon. Requires level_id.', z.object({
      boundary: boundary2.describe('Boundary polygon [[x,y],...] in meters'),
      thickness: z.number().optional().describe('Floor thickness in meters (default: 0.25)'),
      level_id: levelIdParam,
    })),

    bt('create_column', 'Create a structural column. Requires level_id.', z.object({
      center: point2.describe('Center point [x, y] in meters'),
      width: z.number().optional().describe('Column width in meters (default: 0.3)'),
      depth: z.number().optional().describe('Column depth in meters (default: 0.3)'),
      height: z.number().optional().describe('Column height in meters (default: 3.0)'),
      level_id: levelIdParam,
    })),

    bt('create_stair', 'Create a staircase. Requires level_id.', z.object({
      start: point2.describe('Start point [x, y] in meters'),
      end: point2.describe('End point [x, y] in meters'),
      width: z.number().optional().describe('Stair width in meters (default: 1.1)'),
      risers: z.number().optional().describe('Number of risers (default: 16)'),
      total_height: z.number().optional().describe('Total height in meters (default: 3.0)'),
      level_id: levelIdParam,
    })),

    bt('create_roof', 'Create a roof with a boundary polygon. Requires level_id.', z.object({
      boundary: boundary2.describe('Boundary polygon [[x,y],...] in meters'),
      roof_type: z.enum(['flat', 'gable', 'shed', 'hip']).optional().describe('Roof type (default: flat)'),
      pitch: z.number().optional().describe('Roof pitch in degrees (default: 0)'),
      elevation: z.number().optional().describe('Roof base elevation in meters (default: 3.0)'),
      level_id: levelIdParam,
    })),

    bt('create_room', 'Create only a room label with a boundary polygon (no walls/doors/windows). Requires level_id.', z.object({
      boundary: boundary2.describe('Room boundary [[x,y],...] in meters'),
      name: z.string().describe('Room name (e.g., "Living Room")'),
      level_id: levelIdParam,
    })),
    bt('add_room', 'Create a full room package in one call: perimeter walls + optional slab + room entity + default door + default windows. Requires level_id.', z.object({
      boundary: boundary2.describe('Room boundary [[x,y],...] in meters'),
      name: z.string().describe('Room name (e.g., "Living Room")'),
      level_id: levelIdParam,
      wall_height: z.number().optional().describe('Perimeter wall height in meters (default: 3.0)'),
      wall_thickness: z.number().optional().describe('Perimeter wall thickness in meters (default: 0.2)'),
      create_floor: z.boolean().optional().describe('Whether to create a floor slab from same boundary (default: true)'),
      floor_thickness: z.number().optional().describe('Floor thickness in meters (default: 0.25)'),
      create_default_door: z.boolean().optional().describe('Whether to add one default door on perimeter wall (default: true)'),
      door_wall_index: z.number().int().optional().describe('Optional wall segment index for default door (0-based)'),
      door_position_along_wall: z.number().min(0).max(1).optional().describe('Door position along selected wall (default: 0.5)'),
      door_width: z.number().optional().describe('Door width in meters (default: 0.9)'),
      door_height: z.number().optional().describe('Door height in meters (default: 2.1)'),
      door_swing: z.enum(['left', 'right']).optional().describe('Door swing direction (default: right)'),
      create_default_windows: z.boolean().optional().describe('Whether to place default windows on perimeter walls (default: true)'),
      default_window_count: z.number().int().min(0).optional().describe('How many default windows to create when windows are not explicitly provided (default: 2)'),
      window_wall_indexes: z.array(z.number().int()).optional().describe('Optional perimeter wall indexes (0-based) for default windows'),
      window_position_along_wall: z.number().min(0).max(1).optional().describe('Default window position along selected wall (default: 0.5)'),
      window_width: z.number().optional().describe('Default window width in meters (default: 1.2)'),
      window_height: z.number().optional().describe('Default window height in meters (default: 1.2)'),
      window_sill_height: z.number().optional().describe('Default window sill height from floor in meters (default: 0.9)'),
      windows: z.array(z.object({
        wall_index: z.number().int().describe('Perimeter wall index (0-based; wraps around if out of range)'),
        position_along_wall: z.number().min(0).max(1).optional().describe('Position along wall (default: window_position_along_wall or 0.5)'),
        width: z.number().optional().describe('Window width in meters (default: window_width or 1.2)'),
        height: z.number().optional().describe('Window height in meters (default: window_height or 1.2)'),
        sill_height: z.number().optional().describe('Sill height from floor in meters (default: window_sill_height or 0.9)'),
        name: z.string().optional().describe('Optional custom window name'),
      })).optional().describe('Optional explicit windows list. If provided, these windows are created instead of default windows.'),
    })),
    bt('create_room_bundle', 'Create a full room package in one call: perimeter walls + optional slab + room entity + default door + default windows. Requires level_id.', z.object({
      boundary: boundary2.describe('Room boundary [[x,y],...] in meters'),
      name: z.string().describe('Room name (e.g., "Living Room")'),
      level_id: levelIdParam,
      wall_height: z.number().optional().describe('Perimeter wall height in meters (default: 3.0)'),
      wall_thickness: z.number().optional().describe('Perimeter wall thickness in meters (default: 0.2)'),
      create_floor: z.boolean().optional().describe('Whether to create a floor slab from same boundary (default: true)'),
      floor_thickness: z.number().optional().describe('Floor thickness in meters (default: 0.25)'),
      create_default_door: z.boolean().optional().describe('Whether to add one default door on perimeter wall (default: true)'),
      door_wall_index: z.number().int().optional().describe('Optional wall segment index for default door (0-based)'),
      door_position_along_wall: z.number().min(0).max(1).optional().describe('Door position along selected wall (default: 0.5)'),
      door_width: z.number().optional().describe('Door width in meters (default: 0.9)'),
      door_height: z.number().optional().describe('Door height in meters (default: 2.1)'),
      door_swing: z.enum(['left', 'right']).optional().describe('Door swing direction (default: right)'),
      create_default_windows: z.boolean().optional().describe('Whether to place default windows on perimeter walls (default: true)'),
      default_window_count: z.number().int().min(0).optional().describe('How many default windows to create when windows are not explicitly provided (default: 2)'),
      window_wall_indexes: z.array(z.number().int()).optional().describe('Optional perimeter wall indexes (0-based) for default windows'),
      window_position_along_wall: z.number().min(0).max(1).optional().describe('Default window position along selected wall (default: 0.5)'),
      window_width: z.number().optional().describe('Default window width in meters (default: 1.2)'),
      window_height: z.number().optional().describe('Default window height in meters (default: 1.2)'),
      window_sill_height: z.number().optional().describe('Default window sill height from floor in meters (default: 0.9)'),
      windows: z.array(z.object({
        wall_index: z.number().int().describe('Perimeter wall index (0-based; wraps around if out of range)'),
        position_along_wall: z.number().min(0).max(1).optional().describe('Position along wall (default: window_position_along_wall or 0.5)'),
        width: z.number().optional().describe('Window width in meters (default: window_width or 1.2)'),
        height: z.number().optional().describe('Window height in meters (default: window_height or 1.2)'),
        sill_height: z.number().optional().describe('Sill height from floor in meters (default: window_sill_height or 0.9)'),
        name: z.string().optional().describe('Optional custom window name'),
      })).optional().describe('Optional explicit windows list. If provided, these windows are created instead of default windows.'),
    })),
    bt('clear_building', 'Remove all elements from the building model.', z.object({})),
    bt('place_electrical', 'Place an electrical symbol (outlet, switch, light fixture, panel, etc.) on the plan.', z.object({
      symbol_type: z.enum(['outlet', 'switch', 'light_fixture', 'panel', 'smoke_detector', 'junction_box', 'three_way_switch', 'dimmer_switch', 'gfci_outlet', 'floor_outlet', 'ceiling_fan', 'thermostat']),
      position: point2.describe('Position [x, y] in meters'),
      rotation: z.number().optional().describe('Rotation in radians (default: 0)'),
      circuit_id: z.string().optional().describe('Optional circuit identifier'),
      connected_to: z.string().optional().describe('Optional element_id of the fixture this switch controls'),
    })),
    bt('place_plumbing', 'Place a plumbing fixture symbol (toilet, sink, bathtub, etc.) on the plan.', z.object({
      symbol_type: z.enum(['toilet', 'sink', 'bathtub', 'shower', 'water_heater', 'hose_bib', 'floor_drain', 'dishwasher', 'washing_machine', 'urinal']),
      position: point2.describe('Position [x, y] in meters'),
      rotation: z.number().optional().describe('Rotation in radians (default: 0)'),
    })),
    bt('place_furniture', 'Place a real furniture element in the BIM scene (visible geometry), not just a label.', z.object({
      symbol_type: z.enum(['desk', 'chair', 'table', 'bed', 'sofa', 'dining_table', 'bookshelf', 'wardrobe', 'toilet_stall', 'reception_desk', 'conference_table', 'kitchen_island', 'refrigerator', 'stove', 'washer', 'dryer', 'nightstand', 'coffee_table', 'tv_console', 'console_table', 'bench', 'ottoman', 'vanity']),
      position: point2.describe('Position [x, y] in meters'),
      rotation: z.number().optional().describe('Rotation in radians (default: 0)'),
      width: z.number().optional().describe('Width in meters (optional, type default if omitted)'),
      depth: z.number().optional().describe('Depth in meters (optional, type default if omitted)'),
    })),
    bt('place_site_element', 'Place a site plan element (property line, tree, parking space, compass, etc.).', z.object({
      detail_type: z.enum(['property_line', 'setback', 'tree', 'parking_space', 'sidewalk', 'driveway', 'compass', 'contour_line', 'fence', 'retaining']),
      points: z.array(point2).min(1).describe('Points [[x,y],...] defining the element'),
      radius: z.number().optional().describe('Radius in meters (for trees)'),
      elevation: z.number().optional().describe('Elevation in meters (for contour lines)'),
    })),
    bt('connect_switch_to_fixture', 'Connect a switch to a light fixture so the switching diagram line can be drawn.', z.object({
      switch_id: z.string().describe('Switch element ID'),
      fixture_id: z.string().describe('Fixture element ID'),
    })),
  ]

  tools.push(
    bt('create_door', 'Create a door in an existing wall. Requires a valid wall_id.', z.object({
      wall_id: z.string().describe('ID of the wall to place the door in'),
      position_along_wall: z.number().min(0).max(1).describe('Position along wall 0.0 (start) to 1.0 (end)'),
      width: z.number().optional().describe('Door width in meters (default: 0.9)'),
      height: z.number().optional().describe('Door height in meters (default: 2.1)'),
      swing: z.enum(['left', 'right']).optional().describe('Door swing direction (default: right)'),
    })),
  )
  tools.push(
    bt('create_window', 'Create a window in an existing wall. Requires a valid wall_id.', z.object({
      wall_id: z.string().describe('ID of the wall to place the window in'),
      position_along_wall: z.number().min(0).max(1).describe('Position along wall 0.0 (start) to 1.0 (end)'),
      width: z.number().optional().describe('Window width in meters (default: 1.2)'),
      height: z.number().optional().describe('Window height in meters (default: 1.2)'),
      sill_height: z.number().optional().describe('Sill height from floor in meters (default: 0.9)'),
    })),
  )

  tools.push(
    bt('delete_element', 'Delete a BIM element by its ID.', z.object({
      element_id: z.string().describe('ID of the element to delete'),
    })),
  )
  tools.push(
    bt('delete_elements', 'Delete multiple BIM elements by IDs and/or by kind.', z.object({
      ids: z.array(z.string()).optional().describe('Explicit element IDs to delete'),
      kind: z.enum(['wall', 'door', 'window', 'floor', 'roof', 'stair', 'column', 'beam', 'room', 'dimension', 'text_annotation', 'level', 'electrical', 'plumbing', 'furniture', 'site_detail', 'cabinet', 'hvac', 'fire_safety', 'accessibility']).optional().describe('Delete all elements of this kind'),
    })),
  )

  // ── Additional tools that the browser handles but were missing from the proxy ──

  tools.push(
    bt('create_curved_wall', 'Create a curved (arc) wall defined by center, radius, and sweep angles. Requires level_id.', z.object({
      center: point2.describe('Arc center [x, y] in meters'),
      radius: z.number().describe('Arc radius in meters'),
      start_angle: z.number().describe('Start angle in degrees (0 = east, 90 = north)'),
      end_angle: z.number().describe('End angle in degrees'),
      height: z.number().optional().describe('Wall height in meters (default: 3.0)'),
      thickness: z.number().optional().describe('Wall thickness in meters (default: 0.2)'),
      level_id: levelIdParam,
    })),
    bt('create_circular_column', 'Create a round (circular) column. Requires level_id.', z.object({
      center: point2.describe('Center point [x, y] in meters'),
      diameter: z.number().describe('Column diameter in meters'),
      height: z.number().optional().describe('Column height in meters (default: 3.0)'),
      level_id: levelIdParam,
    })),
    bt('create_beam', 'Create a structural beam between two 3D points. Requires level_id.', z.object({
      start: z.tuple([z.number(), z.number(), z.number()]).describe('Start point [x, y, z] in meters'),
      end: z.tuple([z.number(), z.number(), z.number()]).describe('End point [x, y, z] in meters'),
      width: z.number().optional().describe('Beam width in meters (default: 0.2)'),
      depth: z.number().optional().describe('Beam depth in meters (default: 0.4)'),
      level_id: levelIdParam,
    })),
    bt('create_foundation', 'Create a foundation slab with a boundary polygon. Requires level_id.', z.object({
      boundary: boundary2.describe('Boundary polygon [[x,y],...] in meters'),
      thickness: z.number().optional().describe('Foundation thickness in meters (default: 0.3)'),
      level_id: levelIdParam,
    })),
    bt('cleanup_walls', 'Auto-join wall endpoints that are close together and clean up intersections.', z.object({})),
    bt('focus_element', 'Focus the camera on a specific element by its ID.', z.object({
      element_id: z.string().describe('ID of the element to focus on'),
    })),
    bt('move_element', 'Move an element by a delta in X and Y.', z.object({
      element_id: z.string().describe('ID of the element to move'),
      dx: z.number().describe('Delta X in meters'),
      dy: z.number().describe('Delta Y in meters'),
    })),
    bt('rotate_element', 'Rotate an element around a center point.', z.object({
      element_id: z.string().describe('ID of the element to rotate'),
      angle_degrees: z.number().describe('Rotation angle in degrees (counter-clockwise positive)'),
      center_x: z.number().optional().describe('X coordinate of rotation center (defaults to element centroid)'),
      center_y: z.number().optional().describe('Y coordinate of rotation center (defaults to element centroid)'),
    })),
    bt('copy_element', 'Copy an element with an offset.', z.object({
      element_id: z.string().describe('ID of the element to copy'),
      dx: z.number().optional().describe('X offset for the copy in meters (default: 1)'),
      dy: z.number().optional().describe('Y offset for the copy in meters (default: 0)'),
    })),
    bt('update_element', 'Update properties of an existing element (e.g., change wall height, column width, roof pitch).', z.object({
      element_id: z.string().describe('ID of the element to update'),
      properties: z.record(z.unknown()).describe('Key/value pairs to update (e.g., { "height": 4.0, "thickness": 0.3 })'),
    })),
    bt('undo', 'Undo the last action.', z.object({})),
    bt('redo', 'Redo a previously undone action.', z.object({})),
    bt('create_dimension', 'Create a dimension annotation between two points.', z.object({
      p1: point2.describe('First point [x, y] in meters'),
      p2: point2.describe('Second point [x, y] in meters'),
      offset: z.number().optional().describe('Offset distance from the measured line in meters (default: 0.5)'),
      text_override: z.string().optional().describe('Optional text to display instead of the measured distance'),
    })),
    bt('create_string_dimension', 'Create multiple sequential dimensions along a line (chain/string dimension).', z.object({
      points: z.array(point2).min(3).describe('Array of [x,y] points defining sequential dimension segments (3+ points)'),
      offset: z.number().optional().describe('Offset distance in meters (default: 0.5)'),
    })),
    bt('create_text_annotation', 'Create a text annotation at a given position.', z.object({
      position: point2.describe('Position [x, y] in meters'),
      text: z.string().describe('Text content'),
      font_size: z.number().optional().describe('Font size in points (default: 12)'),
      rotation: z.number().optional().describe('Rotation angle in degrees (default: 0)'),
    })),
    bt('create_leader', 'Create a leader annotation with an arrow and text.', z.object({
      start: point2.describe('Arrow tip point [x, y] in meters'),
      end: point2.describe('Text anchor point [x, y] in meters'),
      text: z.string().describe('Annotation text'),
    })),
    bt('create_keynote', 'Create a keynote symbol (numbered circle) at a position.', z.object({
      position: point2.describe('Position [x, y] in meters'),
      keynote_id: z.string().describe('Keynote number/ID (e.g., "1", "2A")'),
      text: z.string().describe('Keynote description text'),
    })),
    bt('auto_generate_tags', 'Automatically generate room, door, and/or window tags for all existing elements.', z.object({
      tag_types: z.array(z.enum(['room', 'door', 'window'])).optional().describe('Which tag types to generate (default: all)'),
    })),
    bt('set_material', 'Assign a material to an element by material ID.', z.object({
      element_id: z.string().describe('ID of the element'),
      material_id: z.string().nullable().describe('Material ID to assign, or null to clear'),
    })),
    bt('list_materials', 'List all available materials from the material library.', z.object({})),
    bt('export_ifc', 'Export the current building model as an IFC file.', z.object({})),
    bt('export_dxf', 'Export the current building model as a DXF file.', z.object({})),
    bt('export_gltf', 'Export the current building model as a glTF/GLB file.', z.object({})),
    bt('export_pdf', 'Export the current building as a PDF drawing set.', z.object({
      scale: z.enum(['1:50', '1:100', '1:200']).optional().describe('Drawing scale (default: 1:100)'),
    })),
    bt('linear_array', 'Create a linear array of copies of an element.', z.object({
      element_id: z.string().describe('ID of the element to array'),
      count: z.number().int().min(1).describe('Number of copies to create'),
      spacing_x: z.number().optional().describe('X spacing between copies in meters (default: 3)'),
      spacing_y: z.number().optional().describe('Y spacing between copies in meters (default: 0)'),
    })),
    bt('polar_array', 'Create a polar (circular) array of copies of an element.', z.object({
      element_id: z.string().describe('ID of the element to array'),
      count: z.number().int().min(1).describe('Number of copies to create'),
      center_x: z.number().describe('X coordinate of rotation center in meters'),
      center_y: z.number().describe('Y coordinate of rotation center in meters'),
      total_angle: z.number().optional().describe('Total angle in degrees (default: 360)'),
    })),
    bt('place_cabinet', 'Place a kitchen cabinet element.', z.object({
      cabinet_type: z.enum(['base', 'upper', 'tall', 'corner_base', 'corner_upper', 'corner_tall', 'sink_base', 'lazy_susan', 'blind_corner', 'pantry', 'drawer_base', 'appliance_garage']),
      x: z.number().describe('X position in meters'),
      y: z.number().describe('Y position in meters'),
      width: z.number().optional().describe('Width in meters (default: 0.61)'),
      depth: z.number().optional().describe('Depth in meters (default: 0.61)'),
      height: z.number().optional().describe('Height in meters (default: 0.91)'),
      rotation: z.number().optional().describe('Rotation in degrees (default: 0)'),
      door_count: z.number().int().optional().describe('Number of doors (default: 2)'),
      drawer_count: z.number().int().optional().describe('Number of drawers (default: 0)'),
    })),
    bt('place_hvac', 'Place an HVAC element.', z.object({
      symbol_type: z.enum(['supply_vent', 'return_vent', 'thermostat', 'exhaust_fan', 'ductwork', 'mini_split', 'air_handler', 'condensing_unit', 'damper', 'diffuser']),
      x: z.number().describe('X position in meters'),
      y: z.number().describe('Y position in meters'),
      rotation: z.number().optional().describe('Rotation in radians (default: 0)'),
    })),
    bt('place_fire_safety', 'Place a fire safety element.', z.object({
      symbol_type: z.enum(['fire_extinguisher', 'sprinkler_head', 'exit_sign', 'pull_station', 'smoke_alarm', 'fire_alarm_panel', 'fire_hose_cabinet', 'annunciator']),
      x: z.number().describe('X position in meters'),
      y: z.number().describe('Y position in meters'),
      rotation: z.number().optional().describe('Rotation in radians (default: 0)'),
    })),
    bt('place_accessibility', 'Place an accessibility element.', z.object({
      symbol_type: z.enum(['wheelchair', 'ramp', 'grab_bar', 'accessible_parking', 'tactile_warning', 'ada_restroom', 'hearing_loop']),
      x: z.number().describe('X position in meters'),
      y: z.number().describe('Y position in meters'),
      rotation: z.number().optional().describe('Rotation in radians (default: 0)'),
    })),
  )

  return tools
}

function toResultText(value) {
  if (typeof value === 'string') return value
  try {
    const json = JSON.stringify(value ?? {})
    return typeof json === 'string' ? json : ''
  } catch {
    return String(value ?? '')
  }
}

function extractTextDelta(message) {
  if (!message || message.type !== 'stream_event') return null
  const event = message.event
  if (!event || typeof event !== 'object') return null
  if (event.type !== 'content_block_delta') return null
  const delta = event.delta
  if (!delta || typeof delta !== 'object') return null
  if (delta.type !== 'text_delta') return null
  return typeof delta.text === 'string' ? delta.text : null
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('BetterCAD AI Proxy running\n')
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws) => {
  console.log('[Proxy] Browser connected')

  /** Map of callId → resolve({ result, isError }) for pending browser tool calls */
  const pendingCalls = new Map()

  /** Claude Code session ID — reused across turns for conversation context */
  let sessionId = null

  /** Prevent concurrent queries */
  let activeQuery = false
  /** Active query handle for interruption */
  let activeQueryHandle = null
  /** Monotonic turn id to invalidate stale streams after cancellation */
  let turnCounter = 0
  let activeTurnId = 0
  const cancelledTurnIds = new Set()

  ws.on('message', async (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }

    // ── Tool result returned from browser ─────────────────────────────────────
    if (msg.type === 'tool_result') {
      const resolve = pendingCalls.get(msg.callId)
      if (resolve) {
        const resultText = toResultText(msg.result)
        console.log(`[Proxy] recv tool_result callId=${msg.callId} isError=${msg.isError} len=${resultText.length}`)
        resolve({ result: resultText, isError: Boolean(msg.isError) })
      } else {
        console.warn(`[Proxy] recv tool_result callId=${msg.callId} but no pending call found (already timed out?)`)
      }
      return
    }

    // ── Clear chat → reset session ────────────────────────────────────────────
    if (msg.type === 'reset') {
      sessionId = null
      console.log('[Proxy] Session reset')
      return
    }

    // ── Cancel active chat turn ───────────────────────────────────────────────
    if (msg.type === 'cancel') {
      if (!activeQuery) return
      const cancelledTurnId = activeTurnId
      if (cancelledTurnId > 0) cancelledTurnIds.add(cancelledTurnId)
      const handleToInterrupt = activeQueryHandle
      activeQuery = false
      activeQueryHandle = null
      activeTurnId = 0
      console.log('[Proxy] Cancel requested by browser')

      // Unblock any pending tool bridge waits immediately.
      for (const resolve of pendingCalls.values()) {
        resolve({ result: JSON.stringify({ error: 'Cancelled by user' }), isError: true })
      }
      pendingCalls.clear()

      if (handleToInterrupt && typeof handleToInterrupt.interrupt === 'function') {
        try {
          await handleToInterrupt.interrupt()
        } catch (err) {
          console.warn('[Proxy] Cancel interrupt failed:', err?.message ?? String(err))
        }
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'complete' }))
      }
      return
    }

    // ── New chat turn ─────────────────────────────────────────────────────────
    if (msg.type === 'chat') {
      if (activeQuery) {
        ws.send(JSON.stringify({ type: 'error', message: 'Still processing previous request' }))
        return
      }
      const turnId = ++turnCounter
      activeTurnId = turnId
      activeQuery = true

      const prompt = msg.prompt || ''
      const planMode = !!msg.planMode

      console.log(`[Proxy] prompt="${prompt.slice(0, 70)}..." planMode=${planMode} session=${sessionId ?? 'new'}`)

      try {
        const bimTools = createBimMcpTools(ws, pendingCalls, {
          planMode,
        })
        const mcpServer = createSdkMcpServer({ name: 'bim', tools: bimTools })

        const systemPrompt = planMode ? BIM_SYSTEM + PLAN_MODE_ADDENDUM : BIM_SYSTEM

        /** @type {Parameters<typeof query>[0]['options']} */
        const options = {
          systemPrompt,
          mcpServers: { bim: mcpServer },
          maxTurns: 50,
          includePartialMessages: true,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        }

        if (sessionId) options.resume = sessionId

        let resultSent = false
        let streamedText = ''
        const activeQueryResult = query({ prompt, options })
        activeQueryHandle = activeQueryResult

        for await (const message of activeQueryResult) {
          if (turnId !== activeTurnId) break
          if (ws.readyState !== WebSocket.OPEN) break

          // Capture session ID for subsequent turns
          if (message.type === 'system' && message.subtype === 'init') {
            sessionId = message.session_id
            console.log(`[Proxy] Session: ${sessionId}`)
            continue
          }

          // Incremental assistant token streaming
          const partialDelta = extractTextDelta(message)
          if (partialDelta && partialDelta.length > 0) {
            streamedText += partialDelta
            ws.send(JSON.stringify({ type: 'text_delta', delta: partialDelta }))
            continue
          }

          // Final result text
          if (message.type === 'result' && !resultSent) {
            resultSent = true
            const text = toResultText(message.result)

            if (ws.readyState !== WebSocket.OPEN) break

            if (planMode && text.includes('[PLAN READY]')) {
              const planText = text.replace('[PLAN READY]', '').trim()
              ws.send(JSON.stringify({ type: 'plan_ready', planText }))
            } else if (text.trim()) {
              if (streamedText.length === 0) {
                ws.send(JSON.stringify({ type: 'text_delta', delta: text }))
              } else if (text.startsWith(streamedText) && text.length > streamedText.length) {
                ws.send(JSON.stringify({ type: 'text_delta', delta: text.slice(streamedText.length) }))
              }
            }

            ws.send(JSON.stringify({ type: 'complete' }))
          }
        }

        // Ensure complete is always sent
        if (!resultSent && ws.readyState === WebSocket.OPEN && turnId === activeTurnId) {
          ws.send(JSON.stringify({ type: 'complete' }))
        }
      } catch (err) {
        const wasCancelled = cancelledTurnIds.has(turnId)
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
        if (wasCancelled) {
          console.log('[Proxy] Query cancelled')
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'complete' }))
          }
        } else {
          console.error('[Proxy] Error:', message)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message }))
          }
        }
      } finally {
        cancelledTurnIds.delete(turnId)
        if (turnId === activeTurnId) {
          activeQueryHandle = null
          activeQuery = false
          activeTurnId = 0
        }
      }
    }
  })

  ws.on('close', () => {
    console.log('[Proxy] Browser disconnected')
    if (activeQueryHandle && typeof activeQueryHandle.interrupt === 'function') {
      activeQueryHandle.interrupt().catch(() => {})
    }
    // Resolve all pending calls so Claude's loop can unblock
    for (const resolve of pendingCalls.values()) {
      resolve({ result: JSON.stringify({ error: 'WebSocket closed' }), isError: true })
    }
    pendingCalls.clear()
  })

  ws.on('error', (err) => console.error('[Proxy] WS error:', err.message))
})

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log('\n🤖  BetterCAD AI Proxy')
  console.log(`    WebSocket : ws://localhost:${PORT}`)
  console.log('    Auth      : Claude Code OAuth (~/.claude/.credentials.json)')
  console.log('\n    In packages/ui/.env set:')
  console.log('    VITE_AI_PROXY_WS=ws://localhost:3001\n')
})
