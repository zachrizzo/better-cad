//! Error types for the BetterCAD kernel.

use thiserror::Error;

/// Errors that can occur in the CAD kernel.
#[derive(Debug, Error)]
pub enum KernelError {
    /// A topological operation failed (e.g. invalid edge loop).
    #[error("topology error: {0}")]
    TopologyError(String),

    /// Tessellation of a B-Rep solid failed.
    #[error("tessellation error: {0}")]
    TessellationError(String),

    /// A Boolean operation (union/intersection/difference) failed.
    #[error("boolean operation error: {0}")]
    BooleanError(String),

    /// An I/O error occurred.
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
}
