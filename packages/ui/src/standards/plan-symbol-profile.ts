export type PlanSymbolProfileId = 'open_us_v1'

export type AnnotationDensity = 'minimal' | 'medium' | 'verbose'

export type SymbolLineClass = 'cut' | 'primary' | 'secondary' | 'annotation'

export type SymbolDomain = 'architectural' | 'furniture' | 'plumbing' | 'electrical' | 'annotation' | 'hvac' | 'fire_safety' | 'accessibility'
export type SymbolProfileDomain = 'furniture' | 'plumbing' | 'electrical' | 'doors' | 'windows' | 'hvac' | 'fire_safety' | 'accessibility'

export interface SymbolProvenance {
  source: 'bettercad_clean_room'
  methodology: 'convention_based_original_geometry'
  derived_from_external_library: false
  notes: string
}

export interface SymbolSpec {
  domain: SymbolDomain
  title: string
  lineClass: SymbolLineClass
  allowsLabel: boolean
  provenance?: SymbolProvenance
}

export const PLAN_LINEWEIGHTS_MM: Record<SymbolLineClass, number> = {
  cut: 0.35,
  primary: 0.25,
  secondary: 0.13,
  annotation: 0.09,
}

export const PLAN_VIEW_LINEWIDTH_PX: Record<SymbolLineClass, number> = {
  cut: 2.2,
  primary: 1.6,
  secondary: 1.1,
  annotation: 0.85,
}

export const PLAN_DOMAIN_COLORS: Record<SymbolDomain, string> = {
  architectural: '#334155',
  furniture: '#166534',
  plumbing: '#1d4ed8',
  electrical: '#b91c1c',
  annotation: '#475569',
  hvac: '#7c3aed',
  fire_safety: '#dc2626',
  accessibility: '#0891b2',
}

export const MONOCHROME_PRINT_COLOR = '#222222'

export const PDF_MONOCHROME_DEFAULT = true

export function getPlanSymbolColor(domain: SymbolDomain, monochrome = false): string {
  if (monochrome) return MONOCHROME_PRINT_COLOR
  return PLAN_DOMAIN_COLORS[domain]
}

type SymbolSpecMap = Record<string, SymbolSpec>

const CLEAN_ROOM_DEFAULT_PROVENANCE: SymbolProvenance = {
  source: 'bettercad_clean_room',
  methodology: 'convention_based_original_geometry',
  derived_from_external_library: false,
  notes: 'Drawn from open US drafting conventions; no vendor block geometry copied.',
}

export const SYMBOL_SPECS: Record<PlanSymbolProfileId, {
  furniture: SymbolSpecMap
  plumbing: SymbolSpecMap
  electrical: SymbolSpecMap
  doors: SymbolSpecMap
  windows: SymbolSpecMap
  hvac: SymbolSpecMap
  fire_safety: SymbolSpecMap
  accessibility: SymbolSpecMap
}> = {
  open_us_v1: {
    furniture: {
      desk: { domain: 'furniture', title: 'Desk', lineClass: 'primary', allowsLabel: false },
      chair: { domain: 'furniture', title: 'Chair', lineClass: 'primary', allowsLabel: false },
      table: { domain: 'furniture', title: 'Table', lineClass: 'primary', allowsLabel: false },
      bed: { domain: 'furniture', title: 'Bed', lineClass: 'primary', allowsLabel: false },
      sofa: { domain: 'furniture', title: 'Sofa', lineClass: 'primary', allowsLabel: false },
      dining_table: { domain: 'furniture', title: 'Dining Table', lineClass: 'primary', allowsLabel: false },
      bookshelf: { domain: 'furniture', title: 'Bookshelf', lineClass: 'secondary', allowsLabel: false },
      wardrobe: { domain: 'furniture', title: 'Wardrobe', lineClass: 'secondary', allowsLabel: false },
      toilet_stall: { domain: 'furniture', title: 'Toilet Stall', lineClass: 'secondary', allowsLabel: false },
      reception_desk: { domain: 'furniture', title: 'Reception Desk', lineClass: 'primary', allowsLabel: false },
      conference_table: { domain: 'furniture', title: 'Conference Table', lineClass: 'primary', allowsLabel: false },
      kitchen_island: { domain: 'furniture', title: 'Kitchen Island', lineClass: 'primary', allowsLabel: false },
      refrigerator: { domain: 'furniture', title: 'Refrigerator', lineClass: 'primary', allowsLabel: true },
      stove: { domain: 'furniture', title: 'Range', lineClass: 'primary', allowsLabel: true },
      washer: { domain: 'furniture', title: 'Washer', lineClass: 'primary', allowsLabel: true },
      dryer: { domain: 'furniture', title: 'Dryer', lineClass: 'primary', allowsLabel: true },
      nightstand: { domain: 'furniture', title: 'Nightstand', lineClass: 'secondary', allowsLabel: false },
      coffee_table: { domain: 'furniture', title: 'Coffee Table', lineClass: 'primary', allowsLabel: false },
      tv_console: { domain: 'furniture', title: 'TV Console', lineClass: 'secondary', allowsLabel: false },
      console_table: { domain: 'furniture', title: 'Console Table', lineClass: 'secondary', allowsLabel: false },
      bench: { domain: 'furniture', title: 'Bench', lineClass: 'secondary', allowsLabel: false },
      ottoman: { domain: 'furniture', title: 'Ottoman', lineClass: 'secondary', allowsLabel: false },
      vanity: { domain: 'furniture', title: 'Vanity', lineClass: 'primary', allowsLabel: false },
    },
    plumbing: {
      toilet: { domain: 'plumbing', title: 'Toilet', lineClass: 'primary', allowsLabel: false },
      sink: { domain: 'plumbing', title: 'Sink', lineClass: 'primary', allowsLabel: false },
      bathtub: { domain: 'plumbing', title: 'Bathtub', lineClass: 'primary', allowsLabel: false },
      shower: { domain: 'plumbing', title: 'Shower', lineClass: 'primary', allowsLabel: false },
      water_heater: { domain: 'plumbing', title: 'Water Heater', lineClass: 'primary', allowsLabel: true },
      hose_bib: { domain: 'plumbing', title: 'Hose Bib', lineClass: 'secondary', allowsLabel: false },
      floor_drain: { domain: 'plumbing', title: 'Floor Drain', lineClass: 'secondary', allowsLabel: true },
      dishwasher: { domain: 'plumbing', title: 'Dishwasher', lineClass: 'primary', allowsLabel: true },
      washing_machine: { domain: 'plumbing', title: 'Washing Machine', lineClass: 'primary', allowsLabel: true },
      urinal: { domain: 'plumbing', title: 'Urinal', lineClass: 'primary', allowsLabel: true },
    },
    electrical: {
      outlet: { domain: 'electrical', title: 'Outlet', lineClass: 'primary', allowsLabel: false },
      switch: { domain: 'electrical', title: 'Switch', lineClass: 'primary', allowsLabel: true },
      light_fixture: { domain: 'electrical', title: 'Light Fixture', lineClass: 'primary', allowsLabel: false },
      panel: { domain: 'electrical', title: 'Panel', lineClass: 'primary', allowsLabel: true },
      smoke_detector: { domain: 'electrical', title: 'Smoke Detector', lineClass: 'secondary', allowsLabel: true },
      junction_box: { domain: 'electrical', title: 'Junction Box', lineClass: 'secondary', allowsLabel: true },
      three_way_switch: { domain: 'electrical', title: 'Three Way Switch', lineClass: 'primary', allowsLabel: true },
      dimmer_switch: { domain: 'electrical', title: 'Dimmer Switch', lineClass: 'primary', allowsLabel: true },
      gfci_outlet: { domain: 'electrical', title: 'GFCI Outlet', lineClass: 'primary', allowsLabel: true },
      floor_outlet: { domain: 'electrical', title: 'Floor Outlet', lineClass: 'primary', allowsLabel: true },
      ceiling_fan: { domain: 'electrical', title: 'Ceiling Fan', lineClass: 'primary', allowsLabel: true },
      thermostat: { domain: 'electrical', title: 'Thermostat', lineClass: 'secondary', allowsLabel: true },
    },
    doors: {
      single_swing: { domain: 'architectural', title: 'Single Swing Door', lineClass: 'primary', allowsLabel: true },
      double_swing: { domain: 'architectural', title: 'Double Swing Door', lineClass: 'primary', allowsLabel: true },
      sliding: { domain: 'architectural', title: 'Sliding Door', lineClass: 'primary', allowsLabel: true },
      pocket: { domain: 'architectural', title: 'Pocket Door', lineClass: 'primary', allowsLabel: true },
      bifold: { domain: 'architectural', title: 'Bifold Door', lineClass: 'primary', allowsLabel: true },
      garage: { domain: 'architectural', title: 'Garage Door', lineClass: 'primary', allowsLabel: true },
    },
    windows: {
      fixed: { domain: 'architectural', title: 'Fixed Window', lineClass: 'primary', allowsLabel: true },
      double_hung: { domain: 'architectural', title: 'Double Hung Window', lineClass: 'primary', allowsLabel: true },
      casement: { domain: 'architectural', title: 'Casement Window', lineClass: 'primary', allowsLabel: true },
      sliding: { domain: 'architectural', title: 'Sliding Window', lineClass: 'primary', allowsLabel: true },
      awning: { domain: 'architectural', title: 'Awning Window', lineClass: 'primary', allowsLabel: true },
      bay: { domain: 'architectural', title: 'Bay Window', lineClass: 'primary', allowsLabel: true },
    },
    hvac: {
      supply_vent: { domain: 'hvac', title: 'Supply Vent', lineClass: 'primary', allowsLabel: true },
      return_vent: { domain: 'hvac', title: 'Return Vent', lineClass: 'primary', allowsLabel: true },
      thermostat: { domain: 'hvac', title: 'Thermostat', lineClass: 'secondary', allowsLabel: true },
      exhaust_fan: { domain: 'hvac', title: 'Exhaust Fan', lineClass: 'primary', allowsLabel: true },
      ductwork: { domain: 'hvac', title: 'Ductwork', lineClass: 'secondary', allowsLabel: false },
      mini_split: { domain: 'hvac', title: 'Mini Split', lineClass: 'primary', allowsLabel: true },
    },
    fire_safety: {
      fire_extinguisher: { domain: 'fire_safety', title: 'Fire Extinguisher', lineClass: 'primary', allowsLabel: true },
      sprinkler_head: { domain: 'fire_safety', title: 'Sprinkler Head', lineClass: 'primary', allowsLabel: false },
      exit_sign: { domain: 'fire_safety', title: 'Exit Sign', lineClass: 'primary', allowsLabel: true },
      pull_station: { domain: 'fire_safety', title: 'Pull Station', lineClass: 'primary', allowsLabel: true },
      smoke_alarm: { domain: 'fire_safety', title: 'Smoke Alarm', lineClass: 'secondary', allowsLabel: true },
      fire_alarm_panel: { domain: 'fire_safety', title: 'Fire Alarm Panel', lineClass: 'primary', allowsLabel: true },
    },
    accessibility: {
      wheelchair: { domain: 'accessibility', title: 'Wheelchair Symbol', lineClass: 'primary', allowsLabel: false },
      ramp: { domain: 'accessibility', title: 'Ramp', lineClass: 'primary', allowsLabel: true },
      grab_bar: { domain: 'accessibility', title: 'Grab Bar', lineClass: 'cut', allowsLabel: false },
      accessible_parking: { domain: 'accessibility', title: 'Accessible Parking', lineClass: 'primary', allowsLabel: true },
      tactile_warning: { domain: 'accessibility', title: 'Tactile Warning', lineClass: 'secondary', allowsLabel: false },
    },
  },
}

export function getSymbolSpec(
  profileId: PlanSymbolProfileId,
  domain: SymbolProfileDomain,
  symbolType: string,
): SymbolSpec | null {
  const profile = SYMBOL_SPECS[profileId] ?? SYMBOL_SPECS.open_us_v1
  const domainSpecs = profile[domain]
  const spec = domainSpecs[symbolType]
  if (!spec) return null
  return {
    ...spec,
    provenance: spec.provenance ?? CLEAN_ROOM_DEFAULT_PROVENANCE,
  }
}

export function getDefaultSymbolProvenance(): SymbolProvenance {
  return CLEAN_ROOM_DEFAULT_PROVENANCE
}
