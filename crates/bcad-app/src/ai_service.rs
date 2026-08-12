//! AI chat service: streams responses from Anthropic's Claude API.
//!
//! Supports two transports (matching the old React app):
//! 1. **Local WebSocket proxy** at `ws://localhost:3001` — persistent connection
//! 2. **Direct Anthropic API** via `ANTHROPIC_API_KEY` env var
//!
//! The proxy connection is kept alive across messages so it maintains
//! conversation history (session state lives on the proxy side).
//!
//! Tool execution: when the proxy sends `tool_call` events, we execute them
//! locally (creating elements, querying the scene, etc.) and send back
//! `tool_result` so the AI can continue its build loop.

use std::collections::HashMap;
use std::io::{BufRead, Read as _, Write as _};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};

use bcad_domain::{
    ColumnElement, DoorElement, ElectricalElement, Element, ElementMeta, FloorElement,
    FurnitureElement, LevelElement, PlumbingElement, RoofElement, StairElement, WallElement,
    WindowElement,
};
use bcad_state::chat_state::{ApiMessage, Chat, UiChatMessage};

const DEFAULT_PROXY_HOST: &str = "localhost:3001";
const DEFAULT_PROXY_WS_PATH: &str = "/";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

pub struct AiConfig {
    pub api_key: String,
    pub model: String,
}

impl AiConfig {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())
            .or_else(|| {
                std::env::var("VITE_ANTHROPIC_API_KEY")
                    .ok()
                    .filter(|k| !k.is_empty())
            })?;
        Some(Self {
            api_key,
            model: "claude-sonnet-4-20250514".to_string(),
        })
    }
}

// ---------------------------------------------------------------------------
// Stream chunks
// ---------------------------------------------------------------------------

pub enum StreamChunk {
    TextDelta(String),
    /// A tool was called and executed; `status` is a short human-readable message.
    ToolCall {
        name: String,
        status: String,
    },
    /// The tool execution produced an element to be created on the main thread.
    CreateElement(Element),
    /// The tool execution requests deletion of an element.
    DeleteElement(String),
    /// The tool requested a view mode change.
    SetViewMode(String),
    Done,
    Error(String),
}

const SYSTEM_PROMPT: &str = "\
You are an expert architectural BIM assistant for BetterCAD.\n\
Coordinate system: X = east, Y = north, units = meters.\n\
Origin (0,0) is the project origin.\n\
Standard ceiling height: 3.0m. Standard wall thickness: 0.2m.\n\
Help users design buildings by describing what to create.\n\
When the user asks you to create building elements, describe the geometry \
(element types, approximate coordinates, dimensions) clearly so they can \
be modeled.";

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum Transport {
    Proxy,
    Direct { api_key: String, model: String },
}

fn detect_transport(config: &Option<AiConfig>) -> Option<Transport> {
    use std::net::ToSocketAddrs;
    let proxy_reachable = DEFAULT_PROXY_HOST
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| {
            addrs
                .any(|addr| {
                    TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(200)).is_ok()
                })
                .then_some(())
        })
        .is_some();

    if proxy_reachable {
        log::info!("AI service: proxy detected at {}", DEFAULT_PROXY_HOST);
        return Some(Transport::Proxy);
    }

    if let Some(cfg) = config {
        log::info!("AI service: using direct Anthropic API");
        return Some(Transport::Direct {
            api_key: cfg.api_key.clone(),
            model: cfg.model.clone(),
        });
    }

    None
}

// ---------------------------------------------------------------------------
// Persistent WebSocket connection
// ---------------------------------------------------------------------------

/// A persistent WebSocket connection to the proxy.
/// Kept alive across messages so the proxy maintains session/conversation state.
struct ProxyConnection {
    stream: TcpStream,
}

impl ProxyConnection {
    fn connect() -> Result<Self, String> {
        let mut stream = TcpStream::connect(DEFAULT_PROXY_HOST)
            .map_err(|e| format!("Proxy connect failed: {e}"))?;

        // WebSocket upgrade handshake
        let key = base64_encode(b"bettercad-rs-key");
        let handshake = format!(
            "GET {} HTTP/1.1\r\n\
             Host: {}\r\n\
             Upgrade: websocket\r\n\
             Connection: Upgrade\r\n\
             Sec-WebSocket-Key: {}\r\n\
             Sec-WebSocket-Version: 13\r\n\
             \r\n",
            DEFAULT_PROXY_WS_PATH, DEFAULT_PROXY_HOST, key
        );
        stream
            .write_all(handshake.as_bytes())
            .map_err(|e| format!("WS handshake write failed: {e}"))?;

        // Read handshake response
        let mut response = Vec::new();
        let mut buf = [0u8; 1];
        loop {
            match stream.read(&mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    response.push(buf[0]);
                    if response.len() >= 4 && response[response.len() - 4..] == *b"\r\n\r\n" {
                        break;
                    }
                }
                Err(e) => return Err(format!("WS handshake read failed: {e}")),
            }
        }

        let response_str = String::from_utf8_lossy(&response);
        if !response_str.contains("101") {
            return Err(format!("WS handshake rejected: {}", response_str.trim()));
        }

        log::info!("AI proxy WebSocket connected (persistent session)");
        Ok(Self { stream })
    }

    fn send_chat(&mut self, prompt: &str, plan_mode: bool) -> Result<(), String> {
        let msg = serde_json::json!({
            "type": "chat",
            "prompt": prompt,
            "planMode": plan_mode,
        });
        ws_send_text(&mut self.stream, &msg.to_string().into_bytes())
            .map_err(|e| format!("WS send failed: {e}"))
    }

    /// Read frames until a "complete" or "done" event, pushing chunks.
    /// When a `tool_call` event arrives, execute the tool locally and send
    /// the result back to the proxy before continuing to read.
    fn read_response(
        &mut self,
        buffer: &Arc<Mutex<Vec<StreamChunk>>>,
        elements: &[Element],
        active_level_id: &str,
    ) {
        // We keep a mutable snapshot so that elements created by tools are
        // visible to subsequent tool calls within the same response.
        let mut elements_snapshot: Vec<Element> = elements.to_vec();

        loop {
            match ws_read_frame(&mut self.stream) {
                Ok(Some(text)) => {
                    log::debug!(
                        "AI WS frame: {}",
                        if text.len() > 200 {
                            &text[..200]
                        } else {
                            &text
                        }
                    );
                    let event: serde_json::Value = match serde_json::from_str(&text) {
                        Ok(v) => v,
                        Err(e) => {
                            log::warn!("AI WS: failed to parse JSON: {}", e);
                            continue;
                        }
                    };
                    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    match event_type {
                        "text_delta" => {
                            if let Some(delta) = event.get("delta").and_then(|d| d.as_str()) {
                                push_chunk(buffer, StreamChunk::TextDelta(delta.to_string()));
                            }
                        }
                        "tool_call" => {
                            let call_id = event
                                .get("callId")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let name = event
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let input = event
                                .get("input")
                                .cloned()
                                .unwrap_or(serde_json::Value::Null);

                            log::info!("AI tool_call: {} (callId={})", name, call_id);

                            // Execute the tool
                            let result =
                                execute_tool(&name, &input, &elements_snapshot, active_level_id);

                            // Push created elements / deletions / view mode changes
                            // to the main thread via StreamChunk, and update our local
                            // snapshot so later tool calls see the new state.
                            for elem in &result.created_elements {
                                elements_snapshot.push(elem.clone());
                                push_chunk(buffer, StreamChunk::CreateElement(elem.clone()));
                            }
                            for del_id in &result.deleted_element_ids {
                                elements_snapshot.retain(|e| e.id() != del_id.as_str());
                                push_chunk(buffer, StreamChunk::DeleteElement(del_id.clone()));
                            }
                            if let Some(ref mode) = result.set_view_mode {
                                push_chunk(buffer, StreamChunk::SetViewMode(mode.clone()));
                            }

                            // Send result back to proxy
                            let result_msg = serde_json::json!({
                                "type": "tool_result",
                                "callId": call_id,
                                "result": result.result_json,
                                "isError": result.is_error,
                            });
                            if let Err(e) =
                                ws_send_text(&mut self.stream, &result_msg.to_string().into_bytes())
                            {
                                log::error!("Failed to send tool_result: {}", e);
                                push_chunk(
                                    buffer,
                                    StreamChunk::Error(format!("Failed to send tool_result: {e}")),
                                );
                                break;
                            }

                            // Notify UI about the tool call
                            let status = if result.is_error {
                                format!("{}: error", name)
                            } else {
                                format!("{}: ok", name)
                            };
                            push_chunk(
                                buffer,
                                StreamChunk::ToolCall {
                                    name: name.clone(),
                                    status,
                                },
                            );
                        }
                        "complete" | "done" => break,
                        "error" => {
                            let msg = event
                                .get("message")
                                .and_then(|m| m.as_str())
                                .unwrap_or("Proxy error");
                            push_chunk(buffer, StreamChunk::Error(msg.to_string()));
                            break;
                        }
                        _ => {} // plan_ready, etc.
                    }
                }
                Ok(None) => break, // connection closed
                Err(e) => {
                    push_chunk(buffer, StreamChunk::Error(format!("WS read error: {e}")));
                    break;
                }
            }
        }
        push_chunk(buffer, StreamChunk::Done);
    }

    fn is_alive(&self) -> bool {
        // Peek to check if connection is still open
        let mut clone = self.stream.try_clone().ok();
        if let Some(ref mut s) = clone {
            s.set_nonblocking(true).ok();
            let mut buf = [0u8; 1];
            let result = s.peek(&mut buf);
            s.set_nonblocking(false).ok();
            // WouldBlock means alive but no data; Ok(0) means closed
            match result {
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => true,
                Ok(n) if n > 0 => true,
                _ => false,
            }
        } else {
            false
        }
    }
}

// ---------------------------------------------------------------------------
// AiService
// ---------------------------------------------------------------------------

pub struct AiService {
    config: Option<AiConfig>,
    response_buffer: Arc<Mutex<Vec<StreamChunk>>>,
    pub is_streaming: bool,
    /// Persistent proxy connection (kept alive across messages)
    proxy_conn: Arc<Mutex<Option<ProxyConnection>>>,
}

impl AiService {
    pub fn new() -> Self {
        let config = AiConfig::from_env();
        Self {
            config,
            response_buffer: Arc::new(Mutex::new(Vec::new())),
            is_streaming: false,
            proxy_conn: Arc::new(Mutex::new(None)),
        }
    }

    #[allow(dead_code)]
    pub fn has_api_key(&self) -> bool {
        self.config.is_some()
    }

    /// Send a chat message. `elements` is the current scene snapshot and
    /// `active_level_id` is the current level so tool calls can resolve
    /// level references.
    pub fn send_message(
        &mut self,
        chat: &mut Chat,
        user_content: &str,
        elements: &[Element],
        active_level_id: &str,
    ) {
        let transport = detect_transport(&self.config);

        if transport.is_none() {
            chat.ui_messages.push(UiChatMessage::Assistant {
                id: uuid::Uuid::new_v4().to_string(),
                content: "AI is not configured.\n\n\
                    Option 1: Start the local proxy server:\n\
                    \u{00a0}\u{00a0}cd proxy && npm start\n\n\
                    Option 2: Set ANTHROPIC_API_KEY in a .env file at the project root."
                    .to_string(),
                streaming: false,
            });
            return;
        }

        if self.is_streaming {
            log::warn!("AI service: ignoring send_message – already streaming");
            return;
        }

        // Add user message
        chat.ui_messages.push(UiChatMessage::User {
            id: uuid::Uuid::new_v4().to_string(),
            content: user_content.to_string(),
            images: Vec::new(),
        });
        chat.api_messages.push(ApiMessage {
            role: "user".to_string(),
            content: serde_json::Value::String(user_content.to_string()),
        });

        // Add assistant placeholder
        chat.ui_messages.push(UiChatMessage::Assistant {
            id: uuid::Uuid::new_v4().to_string(),
            content: String::new(),
            streaming: true,
        });

        self.is_streaming = true;

        let transport = transport.unwrap();
        let api_messages = chat.api_messages.clone();
        let prompt = user_content.to_string();
        let plan_mode = chat.plan_mode;
        let buffer = Arc::clone(&self.response_buffer);
        let proxy_conn = Arc::clone(&self.proxy_conn);
        let elements_clone = elements.to_vec();
        let level_id = active_level_id.to_string();

        std::thread::spawn(move || match transport {
            Transport::Proxy => {
                stream_via_persistent_proxy(
                    &prompt,
                    plan_mode,
                    &buffer,
                    &proxy_conn,
                    &elements_clone,
                    &level_id,
                );
            }
            Transport::Direct { api_key, model } => {
                stream_direct(&api_key, &model, &api_messages, &buffer);
            }
        });
    }

    pub fn poll_chunks(&mut self) -> Vec<StreamChunk> {
        let mut buf = self.response_buffer.lock().unwrap();
        buf.drain(..).collect()
    }
}

// ---------------------------------------------------------------------------
// Persistent proxy streaming
// ---------------------------------------------------------------------------

fn stream_via_persistent_proxy(
    prompt: &str,
    plan_mode: bool,
    buffer: &Arc<Mutex<Vec<StreamChunk>>>,
    proxy_conn: &Arc<Mutex<Option<ProxyConnection>>>,
    elements: &[Element],
    active_level_id: &str,
) {
    let mut conn_guard = proxy_conn.lock().unwrap();

    // Ensure we have a live connection (connect or reconnect)
    let needs_connect = match conn_guard.as_ref() {
        None => true,
        Some(conn) => !conn.is_alive(),
    };

    if needs_connect {
        log::info!("AI proxy: connecting (new or reconnecting)...");
        match ProxyConnection::connect() {
            Ok(conn) => {
                *conn_guard = Some(conn);
            }
            Err(e) => {
                push_chunk(buffer, StreamChunk::Error(e));
                push_chunk(buffer, StreamChunk::Done);
                return;
            }
        }
    }

    let conn = conn_guard.as_mut().unwrap();

    // Send the chat message
    if let Err(e) = conn.send_chat(prompt, plan_mode) {
        push_chunk(buffer, StreamChunk::Error(e));
        push_chunk(buffer, StreamChunk::Done);
        *conn_guard = None; // connection is dead
        return;
    }

    // Read the streaming response (this blocks until complete/error)
    conn.read_response(buffer, elements, active_level_id);
}

// ---------------------------------------------------------------------------
// Direct Anthropic API transport
// ---------------------------------------------------------------------------

fn stream_direct(
    api_key: &str,
    model: &str,
    api_messages: &[ApiMessage],
    buffer: &Arc<Mutex<Vec<StreamChunk>>>,
) {
    let client = reqwest::blocking::Client::new();
    let messages: Vec<serde_json::Value> = api_messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "stream": true,
        "system": SYSTEM_PROMPT,
        "messages": messages,
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .body(body.to_string())
        .send();

    let response = match response {
        Ok(r) => r,
        Err(e) => {
            push_chunk(buffer, StreamChunk::Error(format!("Request failed: {e}")));
            push_chunk(buffer, StreamChunk::Done);
            return;
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().unwrap_or_default();
        push_chunk(
            buffer,
            StreamChunk::Error(format!("API error {status}: {body_text}")),
        );
        push_chunk(buffer, StreamChunk::Done);
        return;
    }

    let reader = std::io::BufReader::new(response);
    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(e) => {
                push_chunk(buffer, StreamChunk::Error(format!("Read error: {e}")));
                break;
            }
        };
        if !line.starts_with("data: ") {
            continue;
        }
        let data = &line["data: ".len()..];
        if data.trim() == "[DONE]" {
            break;
        }
        let event: serde_json::Value = match serde_json::from_str(data) {
            Ok(v) => v,
            Err(_) => continue,
        };
        match event.get("type").and_then(|t| t.as_str()).unwrap_or("") {
            "content_block_delta" => {
                if let Some(text) = event
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(|t| t.as_str())
                {
                    push_chunk(buffer, StreamChunk::TextDelta(text.to_string()));
                }
            }
            "message_stop" => break,
            "error" => {
                let msg = event
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown API error");
                push_chunk(buffer, StreamChunk::Error(msg.to_string()));
                break;
            }
            _ => {}
        }
    }
    push_chunk(buffer, StreamChunk::Done);
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

struct ToolResult {
    result_json: String,
    is_error: bool,
    created_elements: Vec<Element>,
    deleted_element_ids: Vec<String>,
    set_view_mode: Option<String>,
}

impl ToolResult {
    fn ok(result_json: String) -> Self {
        Self {
            result_json,
            is_error: false,
            created_elements: Vec::new(),
            deleted_element_ids: Vec::new(),
            set_view_mode: None,
        }
    }

    fn err(message: String) -> Self {
        Self {
            result_json: serde_json::json!({ "error": message }).to_string(),
            is_error: true,
            created_elements: Vec::new(),
            deleted_element_ids: Vec::new(),
            set_view_mode: None,
        }
    }
}

/// Execute a tool call locally against the elements snapshot.
fn execute_tool(
    name: &str,
    input: &serde_json::Value,
    elements: &[Element],
    active_level_id: &str,
) -> ToolResult {
    match name {
        "query_scene_summary" => tool_query_scene_summary(elements),
        "query_elements" => tool_query_elements(input, elements),
        "query_building" => tool_query_building(elements),
        "get_level_id" => tool_get_level_id(input, elements, active_level_id),
        "create_level" => tool_create_level(input),
        "create_wall" => tool_create_wall(input, elements, active_level_id),
        "create_door" => tool_create_door(input, elements, active_level_id),
        "create_window" => tool_create_window(input, elements, active_level_id),
        "create_floor" => tool_create_floor(input, active_level_id),
        "create_roof" => tool_create_roof(input, active_level_id),
        "create_column" => tool_create_column(input, active_level_id),
        "create_stair" => tool_create_stair(input, active_level_id),
        "create_beam" => tool_create_beam(input, active_level_id),
        "create_foundation" => tool_create_foundation(input, active_level_id),
        "create_room" | "add_room" | "create_room_bundle" => {
            tool_create_room(input, elements, active_level_id)
        }
        "place_furniture" => tool_place_furniture(input, active_level_id),
        "place_electrical" => tool_place_electrical(input, active_level_id),
        "place_plumbing" => tool_place_plumbing(input, active_level_id),
        "delete_element" => tool_delete_element(input, elements),
        "delete_elements" => tool_delete_elements(input, elements),
        "set_view_mode" => tool_set_view_mode(input),
        "clear_building" => tool_clear_building(elements),
        _ => {
            log::warn!("Unknown tool: {}", name);
            ToolResult::err(format!("Unknown tool: {}", name))
        }
    }
}

// ---------------------------------------------------------------------------
// Helper: resolve level_id from input or use active
// ---------------------------------------------------------------------------

fn resolve_level_id(
    input: &serde_json::Value,
    elements: &[Element],
    active_level_id: &str,
) -> String {
    // If input has an explicit level_id, use it
    if let Some(lid) = input.get("level_id").and_then(|v| v.as_str()) {
        if !lid.trim().is_empty() {
            return lid.to_string();
        }
    }
    // If input has a level_name, try to find it
    if let Some(lname) = input.get("level_name").and_then(|v| v.as_str()) {
        let lower = lname.to_lowercase();
        for el in elements {
            if let Element::Level(lev) = el {
                if lev.meta.name.to_lowercase() == lower {
                    return lev.meta.id.clone();
                }
            }
        }
    }
    // Fall back to active level
    active_level_id.to_string()
}

fn json_f64(v: &serde_json::Value, key: &str, default: f64) -> f64 {
    v.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
}

fn json_u32(v: &serde_json::Value, key: &str, default: u32) -> u32 {
    v.get(key)
        .and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .unwrap_or(default)
}

fn json_str<'a>(v: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(|v| v.as_str())
}

fn json_point2(v: &serde_json::Value, key: &str) -> Option<[f64; 2]> {
    let arr = v.get(key)?.as_array()?;
    if arr.len() >= 2 {
        Some([arr[0].as_f64()?, arr[1].as_f64()?])
    } else {
        None
    }
}

fn json_point3(v: &serde_json::Value, key: &str) -> Option<[f64; 3]> {
    let arr = v.get(key)?.as_array()?;
    if arr.len() >= 3 {
        Some([arr[0].as_f64()?, arr[1].as_f64()?, arr[2].as_f64()?])
    } else {
        None
    }
}

fn json_boundary(v: &serde_json::Value, key: &str) -> Option<Vec<[f64; 2]>> {
    let arr = v.get(key)?.as_array()?;
    let mut pts = Vec::new();
    for item in arr {
        let pt = item.as_array()?;
        if pt.len() >= 2 {
            pts.push([pt[0].as_f64()?, pt[1].as_f64()?]);
        }
    }
    if pts.len() >= 3 {
        Some(pts)
    } else {
        None
    }
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn meta(name: &str, level_id: Option<&str>) -> ElementMeta {
    ElementMeta {
        id: new_id(),
        name: name.to_string(),
        level_id: level_id.map(|s| s.to_string().into()),
        host_id: None,
        type_id: None,
        parent_id: None,
        material_id: None,
        ifc_guid: None,
        classification: None,
        layer: None,
    }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

fn tool_query_scene_summary(elements: &[Element]) -> ToolResult {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for el in elements {
        *counts.entry(el.kind_name()).or_insert(0) += 1;
    }

    let levels: Vec<serde_json::Value> = elements
        .iter()
        .filter_map(|el| {
            if let Element::Level(lev) = el {
                Some(serde_json::json!({
                    "id": lev.meta.id,
                    "name": lev.meta.name,
                    "elevation": lev.elevation,
                }))
            } else {
                None
            }
        })
        .collect();

    let result = serde_json::json!({
        "total_elements": elements.len(),
        "element_counts": counts,
        "levels": levels,
        "unchanged": false,
    });
    ToolResult::ok(result.to_string())
}

fn tool_query_elements(input: &serde_json::Value, elements: &[Element]) -> ToolResult {
    let kinds: Vec<String> = input
        .get("kinds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let ids: Vec<String> = input
        .get("ids")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let level_id = input.get("level_id").and_then(|v| v.as_str());

    let limit = input
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(50)
        .min(200) as usize;

    let mut filtered: Vec<&Element> = elements.iter().collect();

    if !kinds.is_empty() {
        filtered.retain(|el| kinds.iter().any(|k| k == el.kind_name()));
    }
    if !ids.is_empty() {
        filtered.retain(|el| ids.iter().any(|id| id == el.id()));
    }
    if let Some(lid) = level_id {
        filtered.retain(|el| {
            el.meta()
                .level_id
                .as_ref()
                .map(|l| l.as_ref() == lid)
                .unwrap_or(false)
        });
    }

    let total = filtered.len();
    let result_elements: Vec<serde_json::Value> = filtered
        .iter()
        .take(limit)
        .filter_map(|el| serde_json::to_value(el).ok())
        .collect();

    let result = serde_json::json!({
        "total_matching": total,
        "returned": result_elements.len(),
        "truncated": total > result_elements.len(),
        "elements": result_elements,
    });
    ToolResult::ok(result.to_string())
}

fn tool_query_building(elements: &[Element]) -> ToolResult {
    let json_elements: Vec<serde_json::Value> = elements
        .iter()
        .filter_map(|el| serde_json::to_value(el).ok())
        .collect();
    ToolResult::ok(serde_json::json!(json_elements).to_string())
}

fn tool_get_level_id(
    input: &serde_json::Value,
    elements: &[Element],
    active_level_id: &str,
) -> ToolResult {
    let mut levels: Vec<serde_json::Value> = elements
        .iter()
        .filter_map(|el| {
            if let Element::Level(lev) = el {
                Some(serde_json::json!({
                    "id": lev.meta.id,
                    "name": lev.meta.name,
                    "elevation": lev.elevation,
                }))
            } else {
                None
            }
        })
        .collect();
    levels.sort_by(|a, b| {
        let ea = a.get("elevation").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let eb = b.get("elevation").and_then(|v| v.as_f64()).unwrap_or(0.0);
        ea.partial_cmp(&eb).unwrap_or(std::cmp::Ordering::Equal)
    });

    let target_name = json_str(input, "name").map(|s| s.to_lowercase());
    let target_elevation = input.get("elevation").and_then(|v| v.as_f64());
    let tolerance = json_f64(input, "tolerance", 0.01);
    let active_only = input
        .get("active_only")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut matches: Vec<&serde_json::Value> = levels.iter().collect();

    if active_only {
        matches.retain(|l| {
            l.get("id")
                .and_then(|v| v.as_str())
                .map(|id| id == active_level_id)
                .unwrap_or(false)
        });
    }
    if let Some(ref tname) = target_name {
        let exact: Vec<&serde_json::Value> = matches
            .iter()
            .copied()
            .filter(|l| {
                l.get("name")
                    .and_then(|v| v.as_str())
                    .map(|n| n.to_lowercase() == *tname)
                    .unwrap_or(false)
            })
            .collect();
        if !exact.is_empty() {
            matches = exact;
        } else {
            matches.retain(|l| {
                l.get("name")
                    .and_then(|v| v.as_str())
                    .map(|n| n.to_lowercase().contains(tname.as_str()))
                    .unwrap_or(false)
            });
        }
    }
    if let Some(te) = target_elevation {
        matches.retain(|l| {
            let e = l.get("elevation").and_then(|v| v.as_f64()).unwrap_or(0.0);
            (e - te).abs() <= tolerance
        });
    }

    let primary = matches.first().cloned();
    let primary_id = primary
        .and_then(|l| l.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let result = serde_json::json!({
        "success": true,
        "level_id": if primary_id.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(primary_id.to_string()) },
        "active_level_id": active_level_id,
        "match_count": matches.len(),
        "levels": levels,
        "message": if !primary_id.is_empty() {
            format!("Resolved level_id {}", primary_id)
        } else {
            "No matching level found".to_string()
        },
    });
    ToolResult::ok(result.to_string())
}

fn tool_create_level(input: &serde_json::Value) -> ToolResult {
    let name = json_str(input, "name").unwrap_or("New Level");
    let elevation = json_f64(input, "elevation", 0.0);

    let mut m = meta(name, None);
    let id = m.id.clone();
    m.level_id = None; // Levels don't have a level_id

    let elem = Element::Level(LevelElement { meta: m, elevation });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": format!("Level '{}' created at elevation {}m", name, elevation),
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_wall(
    input: &serde_json::Value,
    elements: &[Element],
    active_level_id: &str,
) -> ToolResult {
    let start = match json_point2(input, "start") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'start' point".to_string()),
    };
    let end = match json_point2(input, "end") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'end' point".to_string()),
    };
    let height = json_f64(input, "height", 3.0);
    let thickness = json_f64(input, "thickness", 0.2);
    let level_id = resolve_level_id(input, elements, active_level_id);

    let len = ((end[0] - start[0]).powi(2) + (end[1] - start[1]).powi(2)).sqrt();
    if len < 1e-6 {
        return ToolResult::err("Wall start and end points are identical".to_string());
    }

    let m = meta("Wall", Some(&level_id));
    let id = m.id.clone();

    let elem = Element::Wall(WallElement {
        meta: m,
        start,
        end,
        height,
        thickness,
        arc: None,
        arc_segments: 24,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": format!("Wall created from [{}, {}] to [{}, {}]", start[0], start[1], end[0], end[1]),
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_door(
    input: &serde_json::Value,
    elements: &[Element],
    active_level_id: &str,
) -> ToolResult {
    let wall_id = match json_str(input, "wall_id") {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => return ToolResult::err("Missing or invalid 'wall_id'".to_string()),
    };
    let position_along_wall = json_f64(input, "position_along_wall", 0.5).clamp(0.0, 1.0);
    let width = json_f64(input, "width", 0.9);
    let height = json_f64(input, "height", 2.1);

    // Verify wall exists
    let wall = elements.iter().find(|e| e.id() == wall_id);
    if wall.is_none() {
        return ToolResult::err(format!("Wall '{}' not found", wall_id));
    }

    // Get level from host wall or input
    let level_id = if let Some(lid) = json_str(input, "level_id") {
        lid.to_string()
    } else if let Some(Element::Wall(w)) = wall {
        w.meta
            .level_id
            .as_ref()
            .map(|l| l.0.clone())
            .unwrap_or_else(|| active_level_id.to_string())
    } else {
        active_level_id.to_string()
    };

    let mut m = meta("Door", Some(&level_id));
    m.host_id = Some(wall_id.clone().into());
    let id = m.id.clone();

    let elem = Element::Door(DoorElement {
        meta: m,
        wall_id,
        position_along_wall,
        width,
        height,
        sill_height: 0.0,
        swing: bcad_domain::DoorSwing::OutRight,
        hardware_type: bcad_domain::DoorHardwareType::Lever,
        style: bcad_domain::DoorStyle::Flush,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": "Door created",
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_window(
    input: &serde_json::Value,
    elements: &[Element],
    active_level_id: &str,
) -> ToolResult {
    let wall_id = match json_str(input, "wall_id") {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => return ToolResult::err("Missing or invalid 'wall_id'".to_string()),
    };
    let position_along_wall = json_f64(input, "position_along_wall", 0.5).clamp(0.0, 1.0);
    let width = json_f64(input, "width", 1.2);
    let height = json_f64(input, "height", 1.2);
    let sill_height = json_f64(input, "sill_height", 0.9);

    // Verify wall exists
    let wall = elements.iter().find(|e| e.id() == wall_id);
    if wall.is_none() {
        return ToolResult::err(format!("Wall '{}' not found", wall_id));
    }

    let level_id = if let Some(lid) = json_str(input, "level_id") {
        lid.to_string()
    } else if let Some(Element::Wall(w)) = wall {
        w.meta
            .level_id
            .as_ref()
            .map(|l| l.0.clone())
            .unwrap_or_else(|| active_level_id.to_string())
    } else {
        active_level_id.to_string()
    };

    let mut m = meta("Window", Some(&level_id));
    m.host_id = Some(wall_id.clone().into());
    let id = m.id.clone();

    let elem = Element::Window(WindowElement {
        meta: m,
        wall_id,
        position_along_wall,
        width,
        height,
        sill_height,
        hardware_type: bcad_domain::WindowHardwareType::Latch,
        style: bcad_domain::WindowStyle::Picture,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": "Window created",
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_floor(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let boundary = match json_boundary(input, "boundary") {
        Some(b) => b,
        None => {
            return ToolResult::err(
                "Missing or invalid 'boundary' (need array of 3+ [x,y] points)".to_string(),
            )
        }
    };
    let thickness = json_f64(input, "thickness", 0.25);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta("Floor", Some(level_id));
    let id = m.id.clone();

    let elem = Element::Floor(FloorElement {
        meta: m,
        boundary,
        thickness,
        boundary_segments: Vec::new(),
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": "Floor created",
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_roof(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let boundary = match json_boundary(input, "boundary") {
        Some(b) => b,
        None => {
            return ToolResult::err(
                "Missing or invalid 'boundary' (need array of 3+ [x,y] points)".to_string(),
            )
        }
    };
    let roof_type_str = json_str(input, "roof_type").unwrap_or("gable");
    let roof_type = match roof_type_str {
        "flat" => bcad_domain::RoofType::Flat,
        "shed" => bcad_domain::RoofType::Shed,
        "gable" => bcad_domain::RoofType::Gable,
        "hip" => bcad_domain::RoofType::Hip,
        _ => bcad_domain::RoofType::Gable,
    };
    let default_pitch = if matches!(roof_type, bcad_domain::RoofType::Flat) {
        0.0
    } else {
        30.0
    };
    let pitch = json_f64(input, "pitch", default_pitch).clamp(0.0, 75.0);
    let has_manual_elevation = input.get("elevation").and_then(|v| v.as_f64()).is_some();
    let elevation = json_f64(input, "elevation", 0.0);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta("Roof", Some(level_id));
    let id = m.id.clone();

    let elem = Element::Roof(RoofElement {
        meta: m,
        boundary,
        thickness: 0.3,
        elevation,
        auto_elevation: !has_manual_elevation,
        roof_type,
        pitch_degrees: pitch,
        ridge_angle_degrees: 0.0,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": format!("{} roof created", roof_type_str),
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_column(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let center = match json_point2(input, "center") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'center' point".to_string()),
    };
    let width = json_f64(input, "width", 0.3);
    let depth = json_f64(input, "depth", 0.3);
    let height = json_f64(input, "height", 3.0);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta("Column", Some(level_id));
    let id = m.id.clone();

    let elem = Element::Column(ColumnElement {
        meta: m,
        center,
        width,
        depth,
        height,
        diameter: None,
        column_segments: 24,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": format!("Column created at [{}, {}]", center[0], center[1]),
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_stair(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let start = match json_point2(input, "start") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'start' point".to_string()),
    };
    let end = match json_point2(input, "end") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'end' point".to_string()),
    };
    let width = json_f64(input, "width", 1.1);
    let risers = json_u32(input, "risers", 16);
    let total_height = json_f64(input, "total_height", 3.0);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta("Stair", Some(level_id));
    let id = m.id.clone();

    let elem = Element::Stair(StairElement {
        meta: m,
        start,
        end,
        width,
        risers,
        total_height,
        stair_type: bcad_domain::StairType::Straight,
        spiral_turns: 1.0,
        side_wall_thickness: 0.12,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": "Stair created",
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_beam(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let start = match json_point3(input, "start") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'start' [x,y,z] point".to_string()),
    };
    let end = match json_point3(input, "end") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'end' [x,y,z] point".to_string()),
    };
    let width = json_f64(input, "width", 0.2);
    let depth = json_f64(input, "depth", 0.4);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta("Beam", Some(level_id));
    let id = m.id.clone();

    let elem = Element::Beam(bcad_domain::BeamElement {
        meta: m,
        start,
        end,
        width,
        depth,
        arc: None,
        arc_segments: 24,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": "Beam created",
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_foundation(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let boundary = match json_boundary(input, "boundary") {
        Some(b) => b,
        None => {
            return ToolResult::err(
                "Missing or invalid 'boundary' (need array of 3+ [x,y] points)".to_string(),
            )
        }
    };
    let thickness = json_f64(input, "thickness", 0.3);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta("Foundation", Some(level_id));
    let id = m.id.clone();

    let elem = Element::Foundation(bcad_domain::FoundationElement {
        meta: m,
        boundary,
        thickness,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": "Foundation created",
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_create_room(
    input: &serde_json::Value,
    elements: &[Element],
    active_level_id: &str,
) -> ToolResult {
    let boundary = match json_boundary(input, "boundary") {
        Some(b) => b,
        None => {
            return ToolResult::err(
                "Missing or invalid 'boundary' (need array of 3+ [x,y] points)".to_string(),
            )
        }
    };
    let room_name = json_str(input, "name").unwrap_or("Room");
    let level_id = resolve_level_id(input, elements, active_level_id);
    let wall_height = json_f64(input, "wall_height", 3.0);
    let wall_thickness = json_f64(input, "wall_thickness", 0.2);
    let create_floor = input
        .get("create_floor")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let floor_thickness = json_f64(input, "floor_thickness", 0.25);

    let mut result = ToolResult::ok(String::new()); // we'll set result_json at the end
    let mut wall_ids = Vec::new();

    // Create walls for each edge of the boundary
    for i in 0..boundary.len() {
        let start = boundary[i];
        let end = boundary[(i + 1) % boundary.len()];
        let seg_len = ((end[0] - start[0]).powi(2) + (end[1] - start[1]).powi(2)).sqrt();
        if seg_len < 1e-6 {
            continue;
        }

        let m = meta(&format!("Room Wall ({})", room_name), Some(&level_id));
        let wid = m.id.clone();
        wall_ids.push(wid.clone());

        result.created_elements.push(Element::Wall(WallElement {
            meta: m,
            start,
            end,
            height: wall_height,
            thickness: wall_thickness,
            arc: None,
            arc_segments: 24,
        }));
    }

    // Create floor
    let mut floor_id: Option<String> = None;
    if create_floor {
        let m = meta(&format!("Room Floor ({})", room_name), Some(&level_id));
        let fid = m.id.clone();
        floor_id = Some(fid);
        result.created_elements.push(Element::Floor(FloorElement {
            meta: m,
            boundary: boundary.clone(),
            thickness: floor_thickness,
            boundary_segments: Vec::new(),
        }));
    }

    // Create room element
    let rm = meta(room_name, Some(&level_id));
    let room_id = rm.id.clone();
    result
        .created_elements
        .push(Element::Room(bcad_domain::RoomElement {
            meta: rm,
            boundary,
            boundary_segments: Vec::new(),
        }));

    result.result_json = serde_json::json!({
        "success": true,
        "room_id": room_id,
        "wall_ids": wall_ids,
        "floor_id": floor_id,
        "message": format!("Room '{}' created with {} walls", room_name, wall_ids.len()),
    })
    .to_string();

    result
}

fn tool_place_furniture(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let position = match json_point2(input, "position") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'position' point".to_string()),
    };
    let symbol_type = json_str(input, "type")
        .or_else(|| json_str(input, "symbol_type"))
        .unwrap_or("desk");
    let rotation = json_f64(input, "rotation", 0.0);
    let width = json_f64(input, "width", 0.6);
    let depth = json_f64(input, "depth", 0.6);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta(&format!("Furniture ({})", symbol_type), Some(level_id));
    let id = m.id.clone();

    let elem = Element::Furniture(FurnitureElement {
        meta: m,
        symbol_type: symbol_type.to_string(),
        position,
        rotation,
        width,
        depth,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": format!("Furniture ({}) placed", symbol_type),
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_place_electrical(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let position = match json_point2(input, "position") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'position' point".to_string()),
    };
    let symbol_type = json_str(input, "type")
        .or_else(|| json_str(input, "symbol_type"))
        .unwrap_or("outlet");
    let rotation = json_f64(input, "rotation", 0.0);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta(&format!("Electrical ({})", symbol_type), Some(level_id));
    let id = m.id.clone();

    let elem = Element::Electrical(ElectricalElement {
        meta: m,
        symbol_type: symbol_type.to_string(),
        position,
        rotation,
        circuit_id: None,
        connected_to: None,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": format!("Electrical ({}) placed", symbol_type),
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_place_plumbing(input: &serde_json::Value, active_level_id: &str) -> ToolResult {
    let position = match json_point2(input, "position") {
        Some(p) => p,
        None => return ToolResult::err("Missing or invalid 'position' point".to_string()),
    };
    let symbol_type = json_str(input, "type")
        .or_else(|| json_str(input, "symbol_type"))
        .unwrap_or("toilet");
    let rotation = json_f64(input, "rotation", 0.0);
    let level_id = input
        .get("level_id")
        .and_then(|v| v.as_str())
        .unwrap_or(active_level_id);

    let m = meta(&format!("Plumbing ({})", symbol_type), Some(level_id));
    let id = m.id.clone();

    let elem = Element::Plumbing(PlumbingElement {
        meta: m,
        symbol_type: symbol_type.to_string(),
        position,
        rotation,
    });

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "id": id,
            "message": format!("Plumbing ({}) placed", symbol_type),
        })
        .to_string(),
    );
    result.created_elements.push(elem);
    result
}

fn tool_delete_element(input: &serde_json::Value, elements: &[Element]) -> ToolResult {
    let element_id = match json_str(input, "element_id") {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => return ToolResult::err("Missing or invalid 'element_id'".to_string()),
    };

    // Verify element exists
    if !elements.iter().any(|e| e.id() == element_id) {
        return ToolResult::err(format!("Element '{}' not found", element_id));
    }

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "message": format!("Element {} deleted", element_id),
        })
        .to_string(),
    );
    result.deleted_element_ids.push(element_id);
    result
}

fn tool_delete_elements(input: &serde_json::Value, elements: &[Element]) -> ToolResult {
    let ids_from_input: Vec<String> = input
        .get("ids")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let kind = json_str(input, "kind");
    let ids_by_kind: Vec<String> = if let Some(k) = kind {
        elements
            .iter()
            .filter(|e| e.kind_name() == k)
            .map(|e| e.id().to_string())
            .collect()
    } else {
        Vec::new()
    };

    let mut target_ids: Vec<String> = ids_from_input;
    for id in ids_by_kind {
        if !target_ids.contains(&id) {
            target_ids.push(id);
        }
    }

    // Filter to only existing elements
    target_ids.retain(|id| elements.iter().any(|e| e.id() == id.as_str()));

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "deleted": target_ids.len(),
            "ids": target_ids,
            "message": format!("Deleted {} element(s)", target_ids.len()),
        })
        .to_string(),
    );
    result.deleted_element_ids = target_ids;
    result
}

fn tool_set_view_mode(input: &serde_json::Value) -> ToolResult {
    let mode = json_str(input, "mode").unwrap_or("2d");
    if mode != "2d" && mode != "3d" && mode != "split" {
        return ToolResult::err("Invalid mode: expected one of '2d', '3d', or 'split'".to_string());
    }

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "message": format!("View mode set to {}", mode),
        })
        .to_string(),
    );
    result.set_view_mode = Some(mode.to_string());
    result
}

fn tool_clear_building(elements: &[Element]) -> ToolResult {
    let ids: Vec<String> = elements.iter().map(|e| e.id().to_string()).collect();
    let count = ids.len();

    let mut result = ToolResult::ok(
        serde_json::json!({
            "success": true,
            "message": format!("Building cleared ({} elements removed)", count),
        })
        .to_string(),
    );
    result.deleted_element_ids = ids;
    result
}

// ---------------------------------------------------------------------------
// WebSocket frame helpers
// ---------------------------------------------------------------------------

fn ws_send_text(stream: &mut TcpStream, payload: &[u8]) -> std::io::Result<()> {
    let len = payload.len();
    let mask_key: [u8; 4] = [0x12, 0x34, 0x56, 0x78];
    if len < 126 {
        stream.write_all(&[0x81, (len as u8) | 0x80])?;
    } else if len < 65536 {
        stream.write_all(&[0x81, 126 | 0x80])?;
        stream.write_all(&(len as u16).to_be_bytes())?;
    } else {
        stream.write_all(&[0x81, 127 | 0x80])?;
        stream.write_all(&(len as u64).to_be_bytes())?;
    }
    stream.write_all(&mask_key)?;
    let masked: Vec<u8> = payload
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ mask_key[i % 4])
        .collect();
    stream.write_all(&masked)?;
    stream.flush()
}

fn ws_read_frame(stream: &mut TcpStream) -> std::io::Result<Option<String>> {
    let mut header = [0u8; 2];
    if stream.read_exact(&mut header).is_err() {
        return Ok(None);
    }
    let opcode = header[0] & 0x0F;
    let masked = header[1] & 0x80 != 0;
    let mut len = (header[1] & 0x7F) as u64;
    if len == 126 {
        let mut buf = [0u8; 2];
        stream.read_exact(&mut buf)?;
        len = u16::from_be_bytes(buf) as u64;
    } else if len == 127 {
        let mut buf = [0u8; 8];
        stream.read_exact(&mut buf)?;
        len = u64::from_be_bytes(buf);
    }
    let mask_key = if masked {
        let mut buf = [0u8; 4];
        stream.read_exact(&mut buf)?;
        Some(buf)
    } else {
        None
    };
    let mut payload = vec![0u8; len as usize];
    stream.read_exact(&mut payload)?;
    if let Some(mask) = mask_key {
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= mask[i % 4];
        }
    }
    match opcode {
        0x01 => Ok(Some(String::from_utf8_lossy(&payload).to_string())),
        0x08 => Ok(None),
        0x09 => {
            let _ = stream.write_all(&[0x8A, 0x00]);
            ws_read_frame(stream)
        }
        _ => ws_read_frame(stream),
    }
}

fn base64_encode(input: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn push_chunk(buffer: &Arc<Mutex<Vec<StreamChunk>>>, chunk: StreamChunk) {
    if let Ok(mut buf) = buffer.lock() {
        buf.push(chunk);
    }
}
