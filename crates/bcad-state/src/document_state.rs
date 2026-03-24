//! Document state replacing `entity-store.ts` + `document-store.ts`.
//!
//! Wraps `bcad_domain::PrototypeState` and adds a transaction log,
//! a mesh cache, and box parametric parameters.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use bcad_domain::PrototypeState;

// ---------------------------------------------------------------------------
// DocumentState
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentState {
    /// The authoritative model state (from bcad-domain).
    pub prototype: PrototypeState,
    /// Audit / debugging transaction log (capped at 500 entries).
    pub transaction_log: Vec<TransactionEntry>,
    /// CAD mesh cache: element_id -> mesh data. Not serialized to disk.
    #[serde(skip)]
    pub cad_meshes: HashMap<String, CadMeshData>,
    /// Parametric box params (from document-store / history-store).
    pub box_params: BoxParams,
}

impl Default for DocumentState {
    fn default() -> Self {
        Self {
            prototype: PrototypeState::default(),
            transaction_log: Vec::new(),
            cad_meshes: HashMap::new(),
            box_params: BoxParams::default(),
        }
    }
}

impl DocumentState {
    /// Append a transaction entry, capping the log at 500.
    pub fn append_transaction(&mut self, action: TransactionAction, element_id: &str) {
        let entry = TransactionEntry {
            id: uuid::Uuid::new_v4().to_string(),
            action,
            element_id: element_id.to_string(),
            at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        };
        self.transaction_log.push(entry);
        if self.transaction_log.len() > 500 {
            let excess = self.transaction_log.len() - 500;
            self.transaction_log.drain(0..excess);
        }
    }
}

// ---------------------------------------------------------------------------
// TransactionEntry
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionEntry {
    pub id: String,
    pub action: TransactionAction,
    pub element_id: String,
    /// Epoch milliseconds.
    pub at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionAction {
    Create,
    Update,
    Delete,
    Sync,
}

// ---------------------------------------------------------------------------
// CadMeshData  (runtime-only, not serialized)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct CadMeshData {
    pub positions: Vec<f32>, // flat [x,y,z, x,y,z, ...]
    pub normals: Vec<f32>,   // flat [nx,ny,nz, ...]
    pub indices: Vec<u32>,
}

// ---------------------------------------------------------------------------
// BoxParams
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoxParams {
    pub width: f64,
    pub height: f64,
    pub depth: f64,
}

impl Default for BoxParams {
    fn default() -> Self {
        Self {
            width: 1.0,
            height: 1.0,
            depth: 1.0,
        }
    }
}
