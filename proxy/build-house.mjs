/**
 * Build script for L-shaped family home.
 *
 * Connects to the BetterCAD AI Proxy WebSocket and sends a structured
 * build prompt. The proxy's Claude agent uses bridge tools to create
 * elements in the browser's WASM kernel.
 *
 * Usage: node build-house.mjs
 */

import WebSocket from 'ws'

const PROXY_URL = 'ws://localhost:3001'

const BUILD_PROMPT = `You MUST build the following L-shaped family home. Execute ALL creation tool calls — do NOT output a plan, do NOT wait for confirmation. Just call the tools in order.

EXISTING STATE: Level 1 already exists with id="level-d015fc3c-8449-4864-87f6-25a37ec66062" at elevation=0. Do NOT create Level 1 again.

LEVEL_ID for all elements: "level-d015fc3c-8449-4864-87f6-25a37ec66062"

Execute these steps IN THIS EXACT ORDER. Call the tools directly — no planning, no confirmation needed.

## STEP 1: Create Level 2
Call create_level with name="Level 2", elevation=3.0. Do NOT set generate_shell or boundary — just the name and elevation.

## STEP 2: Create 6 Exterior Walls
All walls use level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062", height=3.0, thickness=0.2.

Create these walls in order:
1. create_wall: start=[0,0], end=[14,0]   (South wall)
2. create_wall: start=[14,0], end=[14,10]  (East wall main block)
3. create_wall: start=[14,10], end=[8,10]  (Step wall at L-junction)
4. create_wall: start=[8,10], end=[8,16]   (East wall bedroom wing)
5. create_wall: start=[8,16], end=[0,16]   (North wall)
6. create_wall: start=[0,16], end=[0,0]    (West wall)

## STEP 3: Create 8 Interior Walls
Same level_id, height=3.0, thickness=0.2.

7.  create_wall: start=[6,0], end=[6,6]       (Living | Kitchen divider)
8.  create_wall: start=[0,6], end=[14,6]       (South hallway wall)
9.  create_wall: start=[0,7.5], end=[14,7.5]   (North hallway wall)
10. create_wall: start=[5,7.5], end=[5,10]     (Master BR | Master Bath)
11. create_wall: start=[8,7.5], end=[8,10]     (Master Bath | Laundry — interior wall at x=8 between y=7.5 and y=10)
12. create_wall: start=[11,7.5], end=[11,10]   (Laundry | Bath 2)
13. create_wall: start=[0,10], end=[8,10]      (Service rooms | Bedrooms boundary)
14. create_wall: start=[4,10], end=[4,16]      (Bedroom 2 | Bedroom 3)

## STEP 4: Create 2 Floor Slabs
Both use level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062", thickness=0.25.

1. create_floor: boundary=[[0,0],[14,0],[14,10],[0,10]] (Main block slab)
2. create_floor: boundary=[[0,10],[8,10],[8,16],[0,16]] (Bedroom wing slab)

## STEP 5: Create Doors
After walls exist, use the wall IDs from step 2 and 3 results. For each door, use create_door with the wall_id of the wall it's placed in.

IMPORTANT: Use the actual wall IDs returned from the create_wall calls above. Match walls by their start/end coordinates.

Create these doors (use position_along_wall as a 0-1 fraction):
1. Front entry door: on south wall ([0,0]->[14,0]), position_along_wall=0.25, width=1.0, height=2.1
2. Kitchen patio door: on east main wall ([14,0]->[14,10]), position_along_wall=0.3, width=1.8, height=2.1
3. Living->Hallway: on south hallway wall ([0,6]->[14,6]), position_along_wall=0.15, width=0.9, height=2.1
4. Kitchen->Hallway: on south hallway wall ([0,6]->[14,6]), position_along_wall=0.5, width=0.9, height=2.1
5. Master BR->Hallway: on north hallway wall ([0,7.5]->[14,7.5]), position_along_wall=0.15, width=0.9, height=2.1
6. Master Bath access: on Master BR|Bath wall ([5,7.5]->[5,10]), position_along_wall=0.5, width=0.8, height=2.1
7. Laundry->Hallway: on north hallway wall ([0,7.5]->[14,7.5]), position_along_wall=0.65, width=0.8, height=2.1
8. Bath 2->Hallway: on north hallway wall ([0,7.5]->[14,7.5]), position_along_wall=0.85, width=0.8, height=2.1
9. Bedroom 2 access: on service/bedroom boundary wall ([0,10]->[8,10]), position_along_wall=0.2, width=0.9, height=2.1
10. Bedroom 3 access: on service/bedroom boundary wall ([0,10]->[8,10]), position_along_wall=0.7, width=0.9, height=2.1

## STEP 6: Create Windows
Use the wall IDs from step 2 (exterior walls only).

1. Living south window 1: on south wall ([0,0]->[14,0]), position_along_wall=0.1, width=1.5, height=1.4, sill_height=0.9
2. Living south window 2: on south wall ([0,0]->[14,0]), position_along_wall=0.25, width=1.5, height=1.4, sill_height=0.9
3. Kitchen south window: on south wall ([0,0]->[14,0]), position_along_wall=0.65, width=1.5, height=1.4, sill_height=0.9
4. Kitchen south window 2: on south wall ([0,0]->[14,0]), position_along_wall=0.85, width=1.5, height=1.4, sill_height=0.9
5. Kitchen east window: on east main wall ([14,0]->[14,10]), position_along_wall=0.6, width=1.2, height=1.2, sill_height=0.9
6. Master BR west window: on west wall ([0,16]->[0,0]), position_along_wall=0.45, width=1.2, height=1.2, sill_height=0.9
7. Bedroom 2 west window: on west wall ([0,16]->[0,0]), position_along_wall=0.12, width=1.2, height=1.2, sill_height=0.9
8. Bedroom 2 north window: on north wall ([8,16]->[0,16]), position_along_wall=0.7, width=1.2, height=1.2, sill_height=0.9
9. Bedroom 3 north window: on north wall ([8,16]->[0,16]), position_along_wall=0.25, width=1.2, height=1.2, sill_height=0.9
10. Bedroom 3 east window: on east wing wall ([8,10]->[8,16]), position_along_wall=0.5, width=1.2, height=1.2, sill_height=0.9
11. Laundry east window: on step wall ([14,10]->[8,10]), position_along_wall=0.6, width=0.8, height=0.8, sill_height=1.2
12. Bath 2 east window: on step wall ([14,10]->[8,10]), position_along_wall=0.2, width=0.8, height=0.8, sill_height=1.2

## STEP 7: Create Roof
create_roof with boundary=[[0,0],[14,0],[14,10],[8,10],[8,16],[0,16]], roof_type="hip", pitch=25, elevation=3.0, level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"

## STEP 8: Create Room Labels
Use create_room (label only) for each room:
1. create_room: name="Living Room", boundary=[[0,0],[6,0],[6,6],[0,6]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
2. create_room: name="Kitchen / Dining", boundary=[[6,0],[14,0],[14,6],[6,6]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
3. create_room: name="Hallway", boundary=[[0,6],[14,6],[14,7.5],[0,7.5]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
4. create_room: name="Master Bedroom", boundary=[[0,7.5],[5,7.5],[5,10],[0,10]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
5. create_room: name="Master Bath", boundary=[[5,7.5],[8,7.5],[8,10],[5,10]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
6. create_room: name="Laundry", boundary=[[8,7.5],[11,7.5],[11,10],[8,10]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
7. create_room: name="Bathroom 2", boundary=[[11,7.5],[14,7.5],[14,10],[11,10]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
8. create_room: name="Bedroom 2", boundary=[[0,10],[4,10],[4,16],[0,16]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"
9. create_room: name="Bedroom 3", boundary=[[4,10],[8,10],[8,16],[4,16]], level_id="level-d015fc3c-8449-4864-87f6-25a37ec66062"

EXECUTE ALL STEPS NOW. Call every tool. Do not stop until all 8 steps are complete. Do not ask for confirmation. Do not output a plan. Just call the tools.`

function connectAndBuild() {
  return new Promise((resolve, reject) => {
    console.log(`Connecting to proxy at ${PROXY_URL}...`)
    const ws = new WebSocket(PROXY_URL)

    let output = ''
    let toolCalls = 0
    let toolResults = 0
    let complete = false

    ws.on('open', () => {
      console.log('Connected. Sending build prompt...')
      ws.send(JSON.stringify({
        type: 'chat',
        prompt: BUILD_PROMPT,
        planMode: false,
      }))
    })

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'text_delta') {
        process.stdout.write(msg.delta)
        output += msg.delta
      } else if (msg.type === 'tool_call') {
        toolCalls++
        console.log(`\n[TOOL CALL #${toolCalls}] ${msg.name}(${JSON.stringify(msg.input).slice(0, 120)}...)`)
      } else if (msg.type === 'tool_result') {
        toolResults++
        const preview = typeof msg.result === 'string' ? msg.result.slice(0, 100) : JSON.stringify(msg.result).slice(0, 100)
        console.log(`[TOOL RESULT #${toolResults}] ${preview}...`)
      } else if (msg.type === 'complete') {
        complete = true
        console.log(`\n\n=== BUILD COMPLETE ===`)
        console.log(`Tool calls: ${toolCalls}, Tool results: ${toolResults}`)
        ws.close()
        resolve({ output, toolCalls, toolResults })
      } else if (msg.type === 'error') {
        console.error(`[ERROR] ${msg.message}`)
        ws.close()
        reject(new Error(msg.message))
      }
    })

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message)
      reject(err)
    })

    ws.on('close', () => {
      if (!complete) {
        console.log('Connection closed before completion')
        resolve({ output, toolCalls, toolResults })
      }
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!complete) {
        console.log('Timeout reached')
        ws.close()
        resolve({ output, toolCalls, toolResults })
      }
    }, 300_000)
  })
}

try {
  const result = await connectAndBuild()
  console.log('\nDone.', result)
} catch (err) {
  console.error('Failed:', err.message)
  process.exit(1)
}
