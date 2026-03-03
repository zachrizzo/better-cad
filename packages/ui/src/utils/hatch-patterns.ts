/**
 * SVG hatch pattern definitions for architectural materials.
 *
 * Each pattern is specified as a tile that repeats via SVG <pattern>.
 * Lines describe simple strokes within the tile; dot-based patterns
 * (concrete, gravel) are rendered with <circle> elements instead of lines.
 */

export interface HatchPatternDef {
  id: string
  name: string
  lines: { x1: number; y1: number; x2: number; y2: number }[]
  tileWidth: number
  tileHeight: number
  strokeWidth: number
  color: string
}

export const HATCH_PATTERNS: Record<string, HatchPatternDef> = {
  concrete: {
    id: 'hatch-concrete',
    name: 'Concrete',
    lines: [],
    tileWidth: 8,
    tileHeight: 8,
    strokeWidth: 0.5,
    color: '#666',
  },
  insulation: {
    id: 'hatch-insulation',
    name: 'Insulation',
    lines: [
      // Wavy scallop approximation – two arcs per tile
      { x1: 0, y1: 6, x2: 3, y2: 3 },
      { x1: 3, y1: 3, x2: 6, y2: 6 },
      { x1: 6, y1: 6, x2: 9, y2: 9 },
      { x1: 9, y1: 9, x2: 12, y2: 6 },
    ],
    tileWidth: 12,
    tileHeight: 12,
    strokeWidth: 0.3,
    color: '#999',
  },
  earth: {
    id: 'hatch-earth',
    name: 'Earth',
    lines: [{ x1: 0, y1: 0, x2: 8, y2: 8 }],
    tileWidth: 8,
    tileHeight: 8,
    strokeWidth: 0.3,
    color: '#8B7355',
  },
  wood: {
    id: 'hatch-wood',
    name: 'Wood',
    lines: [
      { x1: 0, y1: 2, x2: 10, y2: 2 },
      { x1: 0, y1: 6, x2: 10, y2: 6 },
    ],
    tileWidth: 10,
    tileHeight: 8,
    strokeWidth: 0.3,
    color: '#8B6914',
  },
  brick: {
    id: 'hatch-brick',
    name: 'Brick',
    lines: [
      { x1: 0, y1: 0, x2: 12, y2: 0 },
      { x1: 0, y1: 4, x2: 12, y2: 4 },
      { x1: 0, y1: 0, x2: 0, y2: 4 },
      { x1: 6, y1: 4, x2: 6, y2: 8 },
    ],
    tileWidth: 12,
    tileHeight: 8,
    strokeWidth: 0.3,
    color: '#8B4513',
  },
  steel: {
    id: 'hatch-steel',
    name: 'Steel',
    lines: [
      { x1: 0, y1: 0, x2: 8, y2: 8 },
      { x1: 8, y1: 0, x2: 0, y2: 8 },
    ],
    tileWidth: 8,
    tileHeight: 8,
    strokeWidth: 0.3,
    color: '#4682B4',
  },
  gravel: {
    id: 'hatch-gravel',
    name: 'Gravel',
    lines: [],
    tileWidth: 10,
    tileHeight: 10,
    strokeWidth: 0.5,
    color: '#A0A0A0',
  },
  glass: {
    id: 'hatch-glass',
    name: 'Glass',
    lines: [{ x1: 0, y1: 0, x2: 16, y2: 16 }],
    tileWidth: 16,
    tileHeight: 16,
    strokeWidth: 0.2,
    color: '#87CEEB',
  },
}

/**
 * Build an SVG `<defs>` string containing `<pattern>` definitions for every
 * registered hatch pattern.  Concrete and gravel use dot/circle fills;
 * all others use the line arrays from their definitions.
 */
export function generateSvgPatternDefs(): string {
  const patterns: string[] = []

  for (const [key, pat] of Object.entries(HATCH_PATTERNS)) {
    let content = ''

    if (key === 'concrete') {
      // Triangular dot pattern
      const r = 0.6
      content = [
        `<circle cx="2" cy="2" r="${r}" fill="${pat.color}" />`,
        `<circle cx="6" cy="6" r="${r}" fill="${pat.color}" />`,
        `<circle cx="2" cy="6" r="${r}" fill="${pat.color}" />`,
        `<circle cx="6" cy="2" r="${r}" fill="${pat.color}" />`,
        `<circle cx="4" cy="4" r="${r}" fill="${pat.color}" />`,
      ].join('')
    } else if (key === 'gravel') {
      // Pseudo-random fixed dots
      const r = 0.7
      content = [
        `<circle cx="1" cy="3" r="${r}" fill="${pat.color}" />`,
        `<circle cx="4" cy="1" r="${r}" fill="${pat.color}" />`,
        `<circle cx="7" cy="5" r="${r}" fill="${pat.color}" />`,
        `<circle cx="3" cy="8" r="${r}" fill="${pat.color}" />`,
        `<circle cx="9" cy="2" r="${r}" fill="${pat.color}" />`,
        `<circle cx="6" cy="9" r="${r}" fill="${pat.color}" />`,
      ].join('')
    } else {
      content = pat.lines
        .map(
          (l) =>
            `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${pat.color}" stroke-width="${pat.strokeWidth}" />`,
        )
        .join('')
    }

    patterns.push(
      `<pattern id="${pat.id}" patternUnits="userSpaceOnUse" width="${pat.tileWidth}" height="${pat.tileHeight}">${content}</pattern>`,
    )
  }

  return `<defs>${patterns.join('')}</defs>`
}

/**
 * Map an element kind string to the appropriate hatch pattern id.
 */
export function getHatchForElementKind(kind: string): string {
  switch (kind) {
    case 'wall':
      return HATCH_PATTERNS.concrete.id
    case 'insulation':
      return HATCH_PATTERNS.insulation.id
    case 'floor':
    case 'foundation':
      return HATCH_PATTERNS.earth.id
    case 'roof':
      return HATCH_PATTERNS.wood.id
    case 'column':
      return HATCH_PATTERNS.steel.id
    case 'beam':
      return HATCH_PATTERNS.steel.id
    case 'door':
    case 'window':
      return HATCH_PATTERNS.glass.id
    default:
      return HATCH_PATTERNS.concrete.id
  }
}
