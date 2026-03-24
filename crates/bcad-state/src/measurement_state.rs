//! Measurement state replacing `measurement-store.ts`.
//!
//! Cursor position, tool readout text, and reset counter.

#[derive(Debug, Clone, Default)]
pub struct MeasurementState {
    /// Current 3D cursor position (world coordinates).
    pub cursor: Option<[f64; 3]>,
    /// Formatted measurement readout string for the active tool.
    pub tool_readout: Option<String>,
    /// Incremented each time a measurement reset is requested.
    pub reset_counter: u64,
}
