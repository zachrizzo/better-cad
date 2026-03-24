//! `bcad-2d` -- 2D plan-view symbol primitives and generators for BetterCAD.
//!
//! This crate provides the core data types and pure symbol-generation functions
//! used to produce 2D plan view drawings.  The output is a list of
//! [`StyledPrimitive`] values that a renderer (wgpu, PDF, SVG, etc.) can
//! consume -- this crate intentionally has *no* rendering dependencies.

pub mod dimension;
pub mod primitives;
pub mod style;
pub mod symbols;
pub mod wall_outline;

// Re-export the most commonly used types at the crate root.
pub use primitives::{SymbolPrimitive, TextAnchor};
pub use style::{
    DomainColor, DrawingScale, LineType, PenWeight, StyledPrimitive, SymbolLineClass, TextRole,
};
