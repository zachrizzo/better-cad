// 3D Parametric Element Specifications
// Data-driven primitive descriptions for HomeBuilder-5 style 3D rendering

export interface BoxSpec {
  type: 'box'
  width: number
  height: number
  depth: number
  position: [number, number, number]
  rotation?: [number, number, number]
  material: MaterialId
}

export interface CylinderSpec {
  type: 'cylinder'
  radiusTop: number
  radiusBottom: number
  height: number
  segments?: number
  position: [number, number, number]
  rotation?: [number, number, number]
  material: MaterialId
}

export interface SphereSpec {
  type: 'sphere'
  radius: number
  segments?: number
  position: [number, number, number]
  material: MaterialId
}

export interface PlaneSpec {
  type: 'plane'
  width: number
  height: number
  position: [number, number, number]
  rotation?: [number, number, number]
  material: MaterialId
}

export interface GroupSpec {
  type: 'group'
  position?: [number, number, number]
  rotation?: [number, number, number]
  children: PrimitiveSpec[]
}

export type PrimitiveSpec = BoxSpec | CylinderSpec | SphereSpec | PlaneSpec | GroupSpec

export type MaterialId =
  | 'wood_light' | 'wood_dark' | 'wood_medium'
  | 'metal_chrome' | 'metal_dark' | 'metal_white'
  | 'porcelain_white' | 'ceramic_white'
  | 'glass_clear' | 'glass_frosted'
  | 'fabric_gray' | 'fabric_beige' | 'fabric_dark'
  | 'plastic_white' | 'plastic_gray' | 'plastic_black' | 'plastic_red'
  | 'concrete_gray'
  | 'rubber_black'
  | 'cushion_blue' | 'cushion_beige'
  | 'mattress_white'
  | 'countertop_gray' | 'countertop_white'
  | 'appliance_white' | 'appliance_stainless'
  | 'fire_red'
  | 'green_foliage' | 'brown_soil'
  | 'blue_accent' | 'yellow_warning'
  | 'exit_green'

export interface MaterialProperties {
  color: string
  metalness: number
  roughness: number
  opacity?: number
  transparent?: boolean
}

export interface Element3DSpec {
  primitives: PrimitiveSpec[]
  defaultHeight: number
}
