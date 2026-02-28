//! Wrapper types around Truck Solid/Shell/Face/Edge/Wire/Vertex.
//!
//! This module provides type aliases for the concrete Truck topological
//! entities parameterised by the geometry types from `truck_modeling`.

/// A B-Rep vertex (wraps a 3D point).
pub type Vertex = truck_modeling::topology::Vertex;
/// A B-Rep edge (curve between two vertices).
pub type Edge = truck_modeling::topology::Edge;
/// A B-Rep wire (ordered sequence of edges).
pub type Wire = truck_modeling::topology::Wire;
/// A B-Rep face (surface bounded by wires).
pub type Face = truck_modeling::topology::Face;
/// A B-Rep shell (connected set of faces).
pub type Shell = truck_modeling::topology::Shell;
/// A B-Rep solid (closed shell).
pub type Solid = truck_modeling::topology::Solid;
