# Open US v1 Clean-Room Policy

This profile is intended to be a legally clean, standards-inspired symbol set for US plan drafting.

## Policy
- Symbols are authored from scratch as geometric primitives (`Polyline`, `Arc`, `Circle`, `Text`).
- Geometry is based on public drafting conventions and internal design rules.
- No direct copying, tracing, or block-to-block conversion from proprietary vendor libraries.
- No redistribution of third-party symbol packs unless explicit redistribution rights are documented.

## Provenance Contract
- Source: `bettercad_clean_room`
- Method: `convention_based_original_geometry`
- Derived from external library: `false`

These fields are enforced by the symbol profile resolver and tested in unit tests.

## Allowed Reference Inputs
- Public standards structure and guidance (NCS-inspired conventions).
- BuildingSMART/IFC naming vocabularies for semantic type alignment.
- Internal QA screenshots for readability and consistency.

## Disallowed Inputs
- Importing proprietary DWG/DXF/SVG symbols and modifying them slightly.
- Reusing vendor block geometry with renamed layers/symbol IDs.
- "Near-copy" edits intended to evade license restrictions.

## Review Checklist (Before Release)
- Unit tests pass for provenance + geometry validity.
- Viewport/PDF parity tests pass.
- Annotation density defaults verified (`minimal`).
- Spot-check plan readability in dense residential and commercial layouts.
