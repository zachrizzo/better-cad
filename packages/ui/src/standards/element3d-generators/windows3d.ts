import type { Element3DSpec, PrimitiveSpec } from '../element3d-specs'
import type { WindowType } from '../../services/kernel-bridge'

export function generateWindow3D(
  windowType: WindowType | undefined,
  width: number,
  height: number,
): Element3DSpec {
  const type = windowType ?? 'fixed'
  const gen = GENERATORS[type]
  if (gen) return gen(width, height)
  return generateFixed(width, height)
}

// ---------------------------------------------------------------------------
// Generator lookup table
// ---------------------------------------------------------------------------

const GENERATORS: Record<WindowType, (w: number, h: number) => Element3DSpec> = {
  fixed: generateFixed,
  double_hung: generateDoubleHung,
  casement: generateCasement,
  sliding: generateSliding,
  awning: generateAwning,
  bay: generateBay,
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Standard window frame: bottom sill, top header, 2 side stiles. Material: wood_light. */
function makeWindowFrame(width: number, height: number): PrimitiveSpec[] {
  const t = 0.03 // frame thickness
  const d = 0.05 // frame depth
  return [
    // Bottom sill
    {
      type: 'box',
      width: width,
      height: t,
      depth: d,
      position: [0, t / 2, 0],
      material: 'wood_light',
    },
    // Top header
    {
      type: 'box',
      width: width,
      height: t,
      depth: d,
      position: [0, height - t / 2, 0],
      material: 'wood_light',
    },
    // Left stile
    {
      type: 'box',
      width: t,
      height: height,
      depth: d,
      position: [-width / 2 + t / 2, height / 2, 0],
      material: 'wood_light',
    },
    // Right stile
    {
      type: 'box',
      width: t,
      height: height,
      depth: d,
      position: [width / 2 - t / 2, height / 2, 0],
      material: 'wood_light',
    },
  ]
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

function generateFixed(width: number, height: number): Element3DSpec {
  const glassW = width - 0.06
  const glassH = height - 0.06
  const primitives: PrimitiveSpec[] = [
    // Glass pane
    {
      type: 'plane',
      width: glassW,
      height: glassH,
      position: [0, height / 2, 0],
      material: 'glass_clear',
    },
    ...makeWindowFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateDoubleHung(width: number, height: number): Element3DSpec {
  const glassW = width - 0.06
  const paneH = height * 0.48
  const primitives: PrimitiveSpec[] = [
    // Upper sash glass
    {
      type: 'plane',
      width: glassW,
      height: paneH,
      position: [0, height * 0.74, 0],
      material: 'glass_clear',
    },
    // Lower sash glass
    {
      type: 'plane',
      width: glassW,
      height: paneH,
      position: [0, height * 0.26, 0],
      material: 'glass_clear',
    },
    // Meeting rail (horizontal divider between sashes)
    {
      type: 'box',
      width: width,
      height: 0.02,
      depth: 0.03,
      position: [0, height * 0.5, 0],
      material: 'wood_light',
    },
    ...makeWindowFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateCasement(width: number, height: number): Element3DSpec {
  const glassW = width - 0.06
  const glassH = height - 0.06
  const primitives: PrimitiveSpec[] = [
    // Glass pane — slightly rotated open around left edge
    {
      type: 'group',
      position: [-width / 2 + 0.03, 0, 0],
      rotation: [0, 0.3, 0],
      children: [
        {
          type: 'plane',
          width: glassW,
          height: glassH,
          position: [glassW / 2, height / 2, 0],
          material: 'glass_clear',
        },
      ],
    },
    // Left hinge — top
    {
      type: 'cylinder',
      radiusTop: 0.008,
      radiusBottom: 0.008,
      height: 0.04,
      segments: 8,
      position: [-width / 2 + 0.015, height * 0.85, 0],
      material: 'metal_chrome',
    },
    // Left hinge — bottom
    {
      type: 'cylinder',
      radiusTop: 0.008,
      radiusBottom: 0.008,
      height: 0.04,
      segments: 8,
      position: [-width / 2 + 0.015, height * 0.15, 0],
      material: 'metal_chrome',
    },
    // Handle (crank)
    {
      type: 'box',
      width: 0.06,
      height: 0.015,
      depth: 0.015,
      position: [width / 2 - 0.08, height * 0.45, 0.02],
      material: 'metal_chrome',
    },
    ...makeWindowFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateSliding(width: number, height: number): Element3DSpec {
  const paneW = width * 0.48
  const glassH = height - 0.06
  const primitives: PrimitiveSpec[] = [
    // Left pane (slightly forward in z)
    {
      type: 'plane',
      width: paneW,
      height: glassH,
      position: [-width * 0.13, height / 2, 0.01],
      material: 'glass_clear',
    },
    // Right pane (slightly back in z)
    {
      type: 'plane',
      width: paneW,
      height: glassH,
      position: [width * 0.13, height / 2, -0.01],
      material: 'glass_clear',
    },
    // Center vertical divider (where panes overlap)
    {
      type: 'box',
      width: 0.02,
      height: height,
      depth: 0.04,
      position: [0, height / 2, 0],
      material: 'wood_light',
    },
    ...makeWindowFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateAwning(width: number, height: number): Element3DSpec {
  const glassW = width - 0.06
  const glassH = height - 0.06
  const primitives: PrimitiveSpec[] = [
    // Glass pane — tilted outward from top hinge (rotation around x)
    {
      type: 'group',
      position: [0, height - 0.03, 0],
      rotation: [0.4, 0, 0],
      children: [
        {
          type: 'plane',
          width: glassW,
          height: glassH,
          position: [0, -glassH / 2, 0],
          material: 'glass_clear',
        },
      ],
    },
    // Top hinge — left
    {
      type: 'cylinder',
      radiusTop: 0.008,
      radiusBottom: 0.008,
      height: 0.04,
      segments: 8,
      position: [-width / 2 + 0.05, height - 0.015, 0],
      rotation: [0, 0, Math.PI / 2],
      material: 'metal_chrome',
    },
    // Top hinge — right
    {
      type: 'cylinder',
      radiusTop: 0.008,
      radiusBottom: 0.008,
      height: 0.04,
      segments: 8,
      position: [width / 2 - 0.05, height - 0.015, 0],
      rotation: [0, 0, Math.PI / 2],
      material: 'metal_chrome',
    },
    ...makeWindowFrame(width, height),
  ]
  return { primitives, defaultHeight: height }
}

function generateBay(width: number, height: number): Element3DSpec {
  const centerW = width * 0.5
  const sideW = width * 0.25
  const glassH = height - 0.06
  const primitives: PrimitiveSpec[] = [
    // Center glass (facing forward)
    {
      type: 'plane',
      width: centerW,
      height: glassH,
      position: [0, height / 2, 0],
      material: 'glass_clear',
    },
    // Left angled side glass
    {
      type: 'group',
      position: [-width * 0.38, height / 2, 0],
      rotation: [0, 0.5, 0],
      children: [
        {
          type: 'plane',
          width: sideW,
          height: glassH,
          position: [0, 0, 0],
          material: 'glass_clear',
        },
      ],
    },
    // Right angled side glass
    {
      type: 'group',
      position: [width * 0.38, height / 2, 0],
      rotation: [0, -0.5, 0],
      children: [
        {
          type: 'plane',
          width: sideW,
          height: glassH,
          position: [0, 0, 0],
          material: 'glass_clear',
        },
      ],
    },
    // Center frame — bottom sill
    {
      type: 'box',
      width: centerW,
      height: 0.03,
      depth: 0.05,
      position: [0, 0.015, 0],
      material: 'wood_light',
    },
    // Center frame — top header
    {
      type: 'box',
      width: centerW,
      height: 0.03,
      depth: 0.05,
      position: [0, height - 0.015, 0],
      material: 'wood_light',
    },
    // Left side frame — bottom sill
    {
      type: 'group',
      position: [-width * 0.38, 0, 0],
      rotation: [0, 0.5, 0],
      children: [
        {
          type: 'box',
          width: sideW,
          height: 0.03,
          depth: 0.05,
          position: [0, 0.015, 0],
          material: 'wood_light',
        },
      ],
    },
    // Left side frame — top header
    {
      type: 'group',
      position: [-width * 0.38, 0, 0],
      rotation: [0, 0.5, 0],
      children: [
        {
          type: 'box',
          width: sideW,
          height: 0.03,
          depth: 0.05,
          position: [0, height - 0.015, 0],
          material: 'wood_light',
        },
      ],
    },
    // Right side frame — bottom sill
    {
      type: 'group',
      position: [width * 0.38, 0, 0],
      rotation: [0, -0.5, 0],
      children: [
        {
          type: 'box',
          width: sideW,
          height: 0.03,
          depth: 0.05,
          position: [0, 0.015, 0],
          material: 'wood_light',
        },
      ],
    },
    // Right side frame — top header
    {
      type: 'group',
      position: [width * 0.38, 0, 0],
      rotation: [0, -0.5, 0],
      children: [
        {
          type: 'box',
          width: sideW,
          height: 0.03,
          depth: 0.05,
          position: [0, height - 0.015, 0],
          material: 'wood_light',
        },
      ],
    },
    // Vertical mullions at transitions between center and side panels
    {
      type: 'box',
      width: 0.03,
      height: height,
      depth: 0.05,
      position: [-centerW / 2, height / 2, 0],
      material: 'wood_light',
    },
    {
      type: 'box',
      width: 0.03,
      height: height,
      depth: 0.05,
      position: [centerW / 2, height / 2, 0],
      material: 'wood_light',
    },
  ]
  return { primitives, defaultHeight: height }
}
