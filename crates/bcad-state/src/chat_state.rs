//! Chat / AI state replacing `chat-store.ts`.
//!
//! Multiple concurrent chats, streaming state, and message types.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role", rename_all = "snake_case")]
pub enum UiChatMessage {
    User {
        id: String,
        content: String,
        #[serde(default)]
        images: Vec<String>,
    },
    Assistant {
        id: String,
        content: String,
        #[serde(default)]
        streaming: bool,
    },
    ToolCall {
        id: String,
        name: String,
        input: serde_json::Value,
        status: ToolCallStatus,
        result: Option<String>,
    },
    Plan {
        id: String,
        content: String,
        status: PlanStatus,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Pending,
    Done,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    Pending,
    Approved,
    Revised,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiMessage {
    pub role: String,
    pub content: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub ui_messages: Vec<UiChatMessage>,
    pub api_messages: Vec<ApiMessage>,
    pub plan_mode: bool,
    /// Epoch milliseconds.
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// ChatState
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ChatState {
    pub chats: HashMap<String, Chat>,
    pub active_chat_id: Option<String>,
    pub is_streaming: bool,
    pub streaming_assistant_id: Option<String>,
}

impl Default for ChatState {
    fn default() -> Self {
        let initial = new_chat();
        let id = initial.id.clone();
        let mut chats = HashMap::new();
        chats.insert(id.clone(), initial);
        Self {
            chats,
            active_chat_id: Some(id),
            is_streaming: false,
            streaming_assistant_id: None,
        }
    }
}

impl ChatState {
    /// Returns a mutable reference to the currently active chat, if any.
    pub fn active_chat_mut(&mut self) -> Option<&mut Chat> {
        let id = self.active_chat_id.as_ref()?;
        self.chats.get_mut(id)
    }
}

/// Create a new chat with the default welcome message.
pub fn new_chat() -> Chat {
    let welcome = UiChatMessage::Assistant {
        id: "welcome".to_string(),
        content: "Hello! I'm your AI BIM assistant. Describe what you want to build \
                  and I'll create it for you. Try: \"Create a small house with 4 walls, \
                  a door, and 2 windows\""
            .to_string(),
        streaming: false,
    };
    Chat {
        id: uuid::Uuid::new_v4().to_string(),
        title: "New Chat".to_string(),
        ui_messages: vec![welcome],
        api_messages: Vec::new(),
        plan_mode: true,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    }
}
