//! Constraint solver (Newton-Raphson / Levenberg-Marquardt).
//!
//! Takes a set of sketch entities and constraints, builds a system
//! of equations, and iteratively solves for entity parameters that
//! satisfy all constraints within a specified tolerance.
