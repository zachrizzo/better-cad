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

// ── System prompts ────────────────────────────────────────────────────────────

const BIM_SYSTEM = `You are an expert architectural BIM assistant for BetterCAD.
Coordinate system: X = east, Y = north, units = meters.
Origin (0,0) is the project origin.
For all 2D coordinate tool inputs, use exactly two numeric values: [x, y] (no z coordinate).
Always call query_building first to understand the current state before creating elements.
Create buildings logically: walls → floors → doors/windows → roof.
Standard ceiling height: 3.0m. Standard wall thickness: 0.2m.
For doors: position_along_wall is 0.0–1.0 (fraction along wall length).
When creating a simple room, create 4 connected walls forming a rectangle.
For standards, code-compliance, and best-practice questions, call research_best_practices.
If jurisdiction is missing for code/compliance questions, ask a concise follow-up first.
Cite returned source URLs and include a short reliability note (government, standards body, or industry source).
For code answers, note that final authority is the local AHJ.
When the user asks to remove elements, use delete_element (single) or delete_elements (bulk by kind/ids).
Confirm what you are creating as you build it.`

const PLAN_MODE_ADDENDUM = `

You are in PLAN MODE. Before calling any building tools (create_wall, create_floor,
create_door, create_window, create_stair, create_roof, create_column, create_room),
output a structured text plan that includes:
1) Summary
2) TODO Task List (Markdown checklist using one item per line in this exact format: - [ ] Task)
3) Geometry details (element types, approximate coordinates, dimensions)
4) Assumptions/risks
End your plan with the phrase [PLAN READY].
Do NOT call any creation tools until the user approves the plan.
You may call query_building to inspect current state.`

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
 * Creates a BIM MCP tool that delegates execution to the connected browser.
 * The async handler sends `tool_call` over WebSocket, then awaits `tool_result`.
 */
function makeBridgeTool(ws, pendingCalls, name, description, schema) {
  return tool(name, description, schema, (input) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify({ error: 'Browser disconnected' }) }],
      })
    }

    return new Promise((resolve) => {
      const callId = randomUUID()

      const timer = setTimeout(() => {
        if (pendingCalls.has(callId)) {
          pendingCalls.delete(callId)
          resolve({
            content: [{ type: 'text', text: JSON.stringify({ error: `Tool ${name} timed out` }) }],
          })
        }
      }, 60_000)

      pendingCalls.set(callId, (result) => {
        clearTimeout(timer)
        pendingCalls.delete(callId)
        resolve({ content: [{ type: 'text', text: result }] })
      })

      ws.send(JSON.stringify({ type: 'tool_call', callId, name, input }))
    })
  })
}

function createBimMcpTools(ws, pendingCalls, options = {}) {
  const { planMode = false, hasWalls = false, elementCount = 0 } = options
  const bt = (name, desc, schema) => makeBridgeTool(ws, pendingCalls, name, desc, schema)
  const point2 = z.union([
    z.tuple([z.number(), z.number()]),
    z.object({ x: z.number(), y: z.number() }),
  ])
  const boundary2 = z.array(point2).min(3)

  const queryBuildingTool = bt(
    'query_building',
    'Returns all current BIM elements as JSON. Always call this first to understand the current state.',
    z.object({}),
  )

  // Hard-enforce plan mode: planning can inspect state but cannot mutate model.
  if (planMode) return [queryBuildingTool, RESEARCH_BEST_PRACTICES_TOOL, SEARCH_BUILDING_CODE_TOOL]

  const tools = [
    queryBuildingTool,
    RESEARCH_BEST_PRACTICES_TOOL,
    SEARCH_BUILDING_CODE_TOOL,
    bt('create_wall', 'Create a wall segment. Coordinates in meters.', z.object({
      start: point2.describe('Start point [x, y] in meters'),
      end: point2.describe('End point [x, y] in meters'),
      height: z.number().optional().describe('Wall height in meters (default: 3.0)'),
      thickness: z.number().optional().describe('Wall thickness in meters (default: 0.2)'),
    })),

    bt('create_floor', 'Create a floor slab with a boundary polygon.', z.object({
      boundary: boundary2.describe('Boundary polygon [[x,y],...] in meters'),
      thickness: z.number().optional().describe('Floor thickness in meters (default: 0.25)'),
    })),

    bt('create_column', 'Create a structural column.', z.object({
      center: point2.describe('Center point [x, y] in meters'),
      width: z.number().optional().describe('Column width in meters (default: 0.3)'),
      depth: z.number().optional().describe('Column depth in meters (default: 0.3)'),
      height: z.number().optional().describe('Column height in meters (default: 3.0)'),
    })),

    bt('create_stair', 'Create a staircase.', z.object({
      start: point2.describe('Start point [x, y] in meters'),
      end: point2.describe('End point [x, y] in meters'),
      width: z.number().optional().describe('Stair width in meters (default: 1.1)'),
      risers: z.number().optional().describe('Number of risers (default: 16)'),
      total_height: z.number().optional().describe('Total height in meters (default: 3.0)'),
    })),

    bt('create_roof', 'Create a roof with a boundary polygon.', z.object({
      boundary: boundary2.describe('Boundary polygon [[x,y],...] in meters'),
      roof_type: z.enum(['flat', 'gable', 'shed', 'hip']).optional().describe('Roof type (default: flat)'),
      pitch: z.number().optional().describe('Roof pitch in degrees (default: 0)'),
      elevation: z.number().optional().describe('Roof base elevation in meters (default: 3.0)'),
    })),

    bt('create_room', 'Create a room label with a boundary polygon.', z.object({
      boundary: boundary2.describe('Room boundary [[x,y],...] in meters'),
      name: z.string().describe('Room name (e.g., "Living Room")'),
    })),
    bt('clear_building', 'Remove all elements from the building model.', z.object({})),
  ]

  if (hasWalls) {
    tools.push(
      bt('create_door', 'Create a door in an existing wall. Requires at least one wall to exist.', z.object({
        wall_id: z.string().describe('ID of the wall to place the door in'),
        position_along_wall: z.number().min(0).max(1).describe('Position along wall 0.0 (start) to 1.0 (end)'),
        width: z.number().optional().describe('Door width in meters (default: 0.9)'),
        height: z.number().optional().describe('Door height in meters (default: 2.1)'),
        swing: z.enum(['left', 'right']).optional().describe('Door swing direction (default: right)'),
      })),
    )
    tools.push(
      bt('create_window', 'Create a window in an existing wall. Requires at least one wall to exist.', z.object({
        wall_id: z.string().describe('ID of the wall to place the window in'),
        position_along_wall: z.number().min(0).max(1).describe('Position along wall 0.0 (start) to 1.0 (end)'),
        width: z.number().optional().describe('Window width in meters (default: 1.2)'),
        height: z.number().optional().describe('Window height in meters (default: 1.2)'),
        sill_height: z.number().optional().describe('Sill height from floor in meters (default: 0.9)'),
      })),
    )
  }

  tools.push(
    bt('delete_element', 'Delete a BIM element by its ID.', z.object({
      element_id: z.string().describe('ID of the element to delete'),
    })),
  )
  tools.push(
    bt('delete_elements', 'Delete multiple BIM elements by IDs and/or by kind.', z.object({
      ids: z.array(z.string()).optional().describe('Explicit element IDs to delete'),
      kind: z.enum(['wall', 'door', 'window', 'floor', 'roof', 'stair', 'column', 'beam', 'room', 'dimension', 'text_annotation', 'level']).optional().describe('Delete all elements of this kind'),
    })),
  )

  return tools
}

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('BetterCAD AI Proxy running\n')
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws) => {
  console.log('[Proxy] Browser connected')

  /** Map of callId → resolve(resultString) for pending browser tool calls */
  const pendingCalls = new Map()

  /** Claude Code session ID — reused across turns for conversation context */
  let sessionId = null

  /** Prevent concurrent queries */
  let activeQuery = false

  ws.on('message', async (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }

    // ── Tool result returned from browser ─────────────────────────────────────
    if (msg.type === 'tool_result') {
      const resolve = pendingCalls.get(msg.callId)
      if (resolve) resolve(msg.result ?? '{}')
      return
    }

    // ── Clear chat → reset session ────────────────────────────────────────────
    if (msg.type === 'reset') {
      sessionId = null
      console.log('[Proxy] Session reset')
      return
    }

    // ── New chat turn ─────────────────────────────────────────────────────────
    if (msg.type === 'chat') {
      if (activeQuery) {
        ws.send(JSON.stringify({ type: 'error', message: 'Still processing previous request' }))
        return
      }
      activeQuery = true

      const prompt = msg.prompt || ''
      const planMode = !!msg.planMode
      const hasWalls = !!msg.hasWalls
      const elementCount = Number.isFinite(msg.elementCount) ? Number(msg.elementCount) : 0

      console.log(`[Proxy] prompt="${prompt.slice(0, 70)}..." planMode=${planMode} session=${sessionId ?? 'new'}`)

      try {
        const bimTools = createBimMcpTools(ws, pendingCalls, {
          planMode,
          hasWalls,
          elementCount,
        })
        const mcpServer = createSdkMcpServer({ name: 'bim', tools: bimTools })

        const systemPrompt = planMode ? BIM_SYSTEM + PLAN_MODE_ADDENDUM : BIM_SYSTEM

        /** @type {Parameters<typeof query>[0]['options']} */
        const options = {
          systemPrompt,
          mcpServers: { bim: mcpServer },
          maxTurns: 50,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        }

        if (sessionId) options.resume = sessionId

        let resultSent = false

        for await (const message of query({ prompt, options })) {
          if (ws.readyState !== WebSocket.OPEN) break

          // Capture session ID for subsequent turns
          if (message.type === 'system' && message.subtype === 'init') {
            sessionId = message.session_id
            console.log(`[Proxy] Session: ${sessionId}`)
            continue
          }

          // Final result text
          if ('result' in message && !resultSent) {
            resultSent = true
            const text = typeof message.result === 'string' ? message.result : JSON.stringify(message.result)

            if (ws.readyState !== WebSocket.OPEN) break

            if (planMode && text.includes('[PLAN READY]')) {
              const planText = text.replace('[PLAN READY]', '').trim()
              ws.send(JSON.stringify({ type: 'plan_ready', planText }))
            } else if (text.trim()) {
              ws.send(JSON.stringify({ type: 'text_delta', delta: text }))
            }

            ws.send(JSON.stringify({ type: 'complete' }))
          }
        }

        // Ensure complete is always sent
        if (!resultSent && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'complete' }))
        }
      } catch (err) {
        console.error('[Proxy] Error:', err.message)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }))
        }
      } finally {
        activeQuery = false
      }
    }
  })

  ws.on('close', () => {
    console.log('[Proxy] Browser disconnected')
    // Resolve all pending calls so Claude's loop can unblock
    for (const resolve of pendingCalls.values()) {
      resolve(JSON.stringify({ error: 'WebSocket closed' }))
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
