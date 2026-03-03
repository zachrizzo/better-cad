# Full Architectural Production Platform Design
**Date:** 2026-03-01
**Goal:** Close all remaining gaps so BetterCAD can produce a complete building permit set

## 6 Parallel Tracks

### Track A: Domain Model — New Element Types + Layer System
New Rust structs in `bcad-domain/src/lib.rs`:
- `ElectricalElement` { meta, symbol_type (outlet|switch|light_fixture|panel|smoke_detector|junction_box), position: [f64;2], rotation: f64, circuit_id: Option<String>, connected_to: Option<String> }
- `PlumbingElement` { meta, symbol_type (toilet|sink|bathtub|shower|water_heater|hose_bib|floor_drain), position: [f64;2], rotation: f64 }
- `FurnitureElement` { meta, symbol_type (desk|chair|table|bed|sofa|dining_table|bookshelf|wardrobe|toilet_stall|reception_desk|conference_table|kitchen_island), position: [f64;2], rotation: f64, width: f64, depth: f64 }
- `SiteDetailElement` { meta, detail_type (property_line|setback|tree|parking_space|sidewalk|driveway|compass|contour_line), points: Vec<[f64;2]>, radius: Option<f64>, elevation: Option<f64> }
- `LeaderAnnotationElement` { meta, start: [f64;2], end: [f64;2], text: String, arrow_type: String }
- `KeynoteElement` { meta, position: [f64;2], keynote_id: String, text: String }
- `TagElement` { meta, position: [f64;2], target_element_id: String, tag_type (room|door|window|wall), auto_text: bool }
- `HatchPatternDef` enum: Concrete, Insulation, Earth, Wood, Brick, Steel, Gravel, Glass
- Add `layer: Option<String>` field to `ElementMeta` with #[serde(default)]
- Standard layers: A-WALL, A-DOOR, A-WIND, A-FLOR, A-ROOF, A-STRS, A-CLNG, E-POWR, E-LITE, E-PANL, P-FIXT, P-EQPM, S-GRID, S-COLS, F-FURN, L-SITE, L-TREE, G-ANNO, G-DIMS, G-TTLB

Files: bcad-domain/src/lib.rs (new structs, Element enum variants), kernel-bridge.ts (TS interfaces), entity-store.ts (type guards)

### Track B: MEP Symbol Placement
- SVG-based 2D symbol components for each electrical/plumbing type
- Plan view rendering via `Viewport2D` or plan view component
- Switching diagram: dashed arc from switch to connected fixture
- Toolbar buttons: Electrical tool dropdown, Plumbing tool dropdown
- AI tools: place_electrical, place_plumbing, connect_switch_to_fixture
- Symbols follow standard architectural conventions (duplex outlet = two parallel lines, switch = S, etc.)

Files: New MepSymbols2D.tsx, toolbar additions in App.tsx, ai-service.ts new tools

### Track C: Construction Document Output
- PDF: multi-sheet with sheet index, architectural scales (1/8"=1'-0" through 1"=1'-0"), lineweight mapping (walls=0.5mm, dimensions=0.18mm, hidden=0.13mm), font sizing relative to scale
- Title block: configurable (project name, address, architect, date, sheet number, revision table), rendered as PDF template
- DXF: export with proper layers, DIMENSION entities, HATCH entities matching material patterns, TEXT entities for annotations
- Layer visibility panel: checkboxes per layer, layer presets (Architectural Plan, Electrical Plan, Plumbing Plan, Reflected Ceiling Plan, Site Plan)

Files: pdf-export.ts (major rewrite), New title-block.ts, dxf_io.rs (enhancements), New LayerPanel.tsx, layer-store.ts

### Track D: Enhanced View Generation
- Elevations: auto-generate North/South/East/West from model, material indication patterns, window/door outlines, ground line, grade marks, dimension annotations
- Sections: floor-to-floor height dims, ceiling line, roof structure outline, hatch patterns at cut materials, foundation below grade
- Reflected ceiling plan: generate from model, mirror X axis, dashed wall outlines, show light fixtures/diffusers above, ceiling height annotations
- Hatch patterns: SVG pattern fills for concrete (dots), insulation (cloud), earth (diagonal lines), wood (grain), brick (stagger), steel (cross-hatch)

Files: section_cut.rs (enhancements), plan_view.rs (RCP mode), New hatch-patterns.ts, ElevationViewport2D.tsx & SectionViewport2D.tsx (enhancements)

### Track E: Annotations & Dimensioning
- Dimension types: linear (horizontal/vertical/aligned), angular, string/chain (multiple sequential), radius, diameter
- Architectural format: feet-inches (4'-6"), metric (1350mm), tick marks vs arrows option
- Leader annotations: arrow + polyline + text block
- Keynotes: circled number at position, links to keynote schedule table
- Auto-tags: room tag (name + area), door tag (D01...), window tag (W01...), wall type tag
- Tag placement: auto-center in room boundary, auto-place near door/window, adjustable
- Dimension styling: extension lines, dimension line, text above line, tick or arrow terminators

Files: New DimensionRenderer2D.tsx, New annotation-tools.ts, New tag-generator.ts, ai-service.ts additions

### Track F: Site Plan & Furniture
- Property lines: polyline with bearing/distance labels (N45d30'E 150.0')
- Setback lines: dashed offset from property lines
- North arrow: SVG compass rose symbol, rotatable
- Trees: circle with X (plan view convention), configurable radius
- Parking: rectangle with diagonal line (handicap variant with symbol)
- Furniture library: 12+ SVG symbols scaled to real dimensions, rotatable, snappable
- Site plan view: separate from floor plan, shows building footprint, property, setbacks, site elements

Files: New SitePlan2D.tsx, New FurnitureSymbols2D.tsx, New site-tools.ts, New furniture-library.ts

## Integration Points
- All new elements go through createElement/updateElement/deleteElement pipeline
- All new elements serialize to .bcad project files via existing save/load
- Layer visibility filters which elements appear in each view type
- AI assistant gets tools for every new element type
- PDF export respects layer visibility when generating sheets
- DXF export maps layers to DXF layer names

## Version Bump
- PROTOTYPE_VERSION: 4 -> 5 (new element types)
- All new fields use #[serde(default)] for backward compatibility
