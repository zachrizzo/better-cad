import type { Element3DSpec, PrimitiveSpec } from '../element3d-specs'
import type { DoorType } from '../../services/kernel-bridge'

export function generateDoor3D(
  doorType: DoorType | undefined,
  width: number,
  height: number,
): Element3DSpec {
  const type = doorType ?? 'single_swing'
  const gen = GENERATORS[type]
  if (gen) return gen(width, height)
  return generateSingleSwing(width, height)
}

// ---------------------------------------------------------------------------
// Generator lookup table
// ---------------------------------------------------------------------------

const GENERATORS: Record<DoorType, (w: number, h: number) => Element3DSpec> = {
  single_swing: generateSingleSwing,
  double_swing: generateDoubleSwing,
  sliding: generateSliding,
  pocket: generatePocket,
  bifold: generateBifold,
  garage: generateGarage,
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Standard door frame: 2 side jambs + top header. Material: wood_dark. */
function makeDoorFrame(width: number, height: number): PrimitiveSpec[] {
  const jamb = 0.05
  return [
    // Left jamb
    {
      type: 'box',
      width: jamb,
      height: height,
      depth: jamb,
      position: [-width / 2, height / 2, 0],
      material: 'wood_dark',
    },
    // Right jamb
    {
      type: 'box',
      width: jamb,
      height: height,
      depth: jamb,
      position: [width / 2, height / 2, 0],
      material: 'wood_dark',
    },
    // Top header
    {
      type: 'box',
      width: width + 0.1,
      height: jamb,
      depth: jamb,
      position: [0, height, 0],
      material: 'wood_dark',
    },
  ]
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

function generateSingleSwing(width: number, height: number): Element3DSpec {
  const leafThickness = 0.04
  const primitives: PrimitiveSpec[] = [
    // Door leaf — rotated 90 degrees open around left edge.
    // The leaf box is centered at its own origin, so we use a group to
    // position the pivot at the left jamb and rotate from there.
    {
      type: 'group',
      position: [-width / 2, 0, 0],
      rotation: [0, Math.PI / 2, 0],
      children: [
        {
          type: 'box',
          width: width,
          height: height,
          depth: leafThickness,
          position: [width / 2, height / 2, 0],
          material: 'wood_light',
        },
      ],
    },
    // Door handle (knob) on the leaf — positioned in open state
    {
      type: 'sphere',
      radius: 0.02,
      segments: 12,
      position: [-width / 2 + 0.05, height * 0.48, width * 0.85],
      material: 'metal_chrome',
    },
    ...makeDoorFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateDoubleSwing(width: number, height: number): Element3DSpec {
  const leafThickness = 0.04
  const halfW = width / 2
  const primitives: PrimitiveSpec[] = [
    // Left leaf — rotated +80 degrees open (outward left)
    {
      type: 'group',
      position: [-halfW, 0, 0],
      rotation: [0, 80 * (Math.PI / 180), 0],
      children: [
        {
          type: 'box',
          width: halfW,
          height: height,
          depth: leafThickness,
          position: [halfW / 2, height / 2, 0],
          material: 'wood_light',
        },
      ],
    },
    // Right leaf — rotated -80 degrees open (outward right)
    {
      type: 'group',
      position: [halfW, 0, 0],
      rotation: [0, -80 * (Math.PI / 180), 0],
      children: [
        {
          type: 'box',
          width: halfW,
          height: height,
          depth: leafThickness,
          position: [-halfW / 2, height / 2, 0],
          material: 'wood_light',
        },
      ],
    },
    ...makeDoorFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateSliding(width: number, height: number): Element3DSpec {
  const leafThickness = 0.04
  const panelW = width * 0.5
  const primitives: PrimitiveSpec[] = [
    // Panel A — front track
    {
      type: 'box',
      width: panelW,
      height: height,
      depth: leafThickness,
      position: [-width * 0.1, height / 2, 0.02],
      material: 'wood_light',
    },
    // Panel B — back track (offset in z)
    {
      type: 'box',
      width: panelW,
      height: height,
      depth: leafThickness,
      position: [width * 0.1, height / 2, -0.02],
      material: 'wood_medium',
    },
    // Top track rail
    {
      type: 'box',
      width: width,
      height: 0.03,
      depth: 0.05,
      position: [0, height + 0.015, 0],
      material: 'metal_dark',
    },
    ...makeDoorFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generatePocket(width: number, height: number): Element3DSpec {
  const leafThickness = 0.04
  const primitives: PrimitiveSpec[] = [
    // Panel — half receded into pocket (shifted toward +x)
    {
      type: 'box',
      width: width,
      height: height,
      depth: leafThickness,
      position: [width / 4, height / 2, 0],
      material: 'wood_light',
    },
    // Top track rail
    {
      type: 'box',
      width: width,
      height: 0.03,
      depth: 0.05,
      position: [0, height + 0.015, 0],
      material: 'metal_dark',
    },
    ...makeDoorFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateBifold(width: number, height: number): Element3DSpec {
  const leafThickness = 0.04
  const panelW = width * 0.25
  // Two narrow panels angled in a V shape, hinged from the left side
  const primitives: PrimitiveSpec[] = [
    // Left panel of V — angled outward
    {
      type: 'group',
      position: [-width / 2, 0, 0],
      rotation: [0, 0.6, 0],
      children: [
        {
          type: 'box',
          width: panelW,
          height: height,
          depth: leafThickness,
          position: [panelW / 2, height / 2, 0],
          material: 'wood_light',
        },
      ],
    },
    // Right panel of V — angled inward from the end of the left panel
    {
      type: 'group',
      position: [-width / 4, 0, 0],
      rotation: [0, -0.6, 0],
      children: [
        {
          type: 'box',
          width: panelW,
          height: height,
          depth: leafThickness,
          position: [panelW / 2, height / 2, 0],
          material: 'wood_light',
        },
      ],
    },
    // Top track rail
    {
      type: 'box',
      width: width,
      height: 0.03,
      depth: 0.05,
      position: [0, height + 0.015, 0],
      material: 'metal_dark',
    },
    ...makeDoorFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateGarage(width: number, height: number): Element3DSpec {
  const panelThickness = 0.04
  const grooveHeight = 0.008
  const grooveDepth = 0.005
  const primitives: PrimitiveSpec[] = [
    // Main panel
    {
      type: 'box',
      width: width,
      height: height,
      depth: panelThickness,
      position: [0, height / 2, 0],
      material: 'metal_white',
    },
    // Horizontal groove lines (4 evenly spaced)
    ...([0.2, 0.4, 0.6, 0.8] as const).map(
      (frac): PrimitiveSpec => ({
        type: 'box',
        width: width - 0.04,
        height: grooveHeight,
        depth: panelThickness + grooveDepth,
        position: [0, height * frac, 0],
        material: 'metal_dark',
      }),
    ),
    ...makeDoorFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}
