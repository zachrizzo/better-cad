import type {
  PrototypeElement,
  FurnitureElement,
  PlumbingElement,
  ElectricalElement,
  HvacElement,
  FireSafetyElement,
  AccessibilityElement,
  CabinetElement,
} from '../../services/kernel-bridge'
import type { Element3DSpec } from '../element3d-specs'
import { generateFurniture3D } from './furniture3d'
import { generatePlumbing3D } from './plumbing3d'
import { generateElectrical3D } from './electrical3d'
import { generateHvac3D } from './hvac3d'
import { generateFireSafety3D } from './fire-safety3d'
import { generateAccessibility3D } from './accessibility3d'
import { generateCabinet3D } from './cabinet3d'

/**
 * Dispatches a PrototypeElement to the appropriate 3D generator based on its kind.
 * Returns null if the element kind has no 3D generator (e.g. structural elements
 * rendered via kernel tessellation, or annotation-only elements).
 */
export function getElement3DSpec(element: PrototypeElement): Element3DSpec | null {
  switch (element.kind) {
    case 'furniture': {
      const el = element as FurnitureElement
      return generateFurniture3D(el.symbol_type, el.width, el.depth)
    }
    case 'plumbing': {
      const el = element as PlumbingElement
      return generatePlumbing3D(el.symbol_type)
    }
    case 'electrical': {
      const el = element as ElectricalElement
      return generateElectrical3D(el.symbol_type)
    }
    case 'hvac': {
      const el = element as HvacElement
      return generateHvac3D(el.symbol_type, el.width, el.depth)
    }
    case 'fire_safety': {
      const el = element as FireSafetyElement
      return generateFireSafety3D(el.symbol_type)
    }
    case 'accessibility': {
      const el = element as AccessibilityElement
      return generateAccessibility3D(el.symbol_type, el.width, el.depth)
    }
    case 'cabinet': {
      const el = element as CabinetElement
      return generateCabinet3D(el.cabinet_type, el.width, el.depth, el.height, el.door_count, el.drawer_count)
    }
    default:
      return null
  }
}
