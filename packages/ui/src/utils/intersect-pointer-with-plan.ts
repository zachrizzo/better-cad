import * as THREE from 'three'

export interface NormalizedDevicePoint {
  x: number
  y: number
}

const RAYCASTER = new THREE.Raycaster()
const TARGET_PLANE = new THREE.Plane()
const INTERSECTION = new THREE.Vector3()
const POINTER = new THREE.Vector2()
const PLANE_NORMAL = new THREE.Vector3(0, 0, 1)
const HORIZONTAL_PLANE_NORMAL = new THREE.Vector3(0, 1, 0)
const PLANE_POINT = new THREE.Vector3()
const PARALLEL_EPSILON = 1e-8

function intersectPointerWithPlane(
  camera: THREE.Camera,
  ndc: NormalizedDevicePoint,
  planeNormal: THREE.Vector3,
  planePoint: THREE.Vector3,
): THREE.Vector3 | null {
  TARGET_PLANE.setFromNormalAndCoplanarPoint(planeNormal, planePoint)
  POINTER.set(ndc.x, ndc.y)
  RAYCASTER.setFromCamera(POINTER, camera)

  if (Math.abs(TARGET_PLANE.normal.dot(RAYCASTER.ray.direction)) <= PARALLEL_EPSILON) {
    return null
  }

  if (!RAYCASTER.ray.intersectPlane(TARGET_PLANE, INTERSECTION)) {
    return null
  }

  return INTERSECTION
}

export function intersectPointerWithPlan(
  camera: THREE.Camera,
  ndc: NormalizedDevicePoint,
  planeZ = 0,
): [number, number] | null {
  PLANE_POINT.set(0, 0, planeZ)
  const intersection = intersectPointerWithPlane(camera, ndc, PLANE_NORMAL, PLANE_POINT)
  if (!intersection) {
    return null
  }

  return [intersection.x, intersection.y]
}

export function intersectPointerWithHorizontalPlane(
  camera: THREE.Camera,
  ndc: NormalizedDevicePoint,
  planeY = 0,
): [number, number, number] | null {
  PLANE_POINT.set(0, planeY, 0)
  const intersection = intersectPointerWithPlane(camera, ndc, HORIZONTAL_PLANE_NORMAL, PLANE_POINT)
  if (!intersection) {
    return null
  }

  return [intersection.x, intersection.y, intersection.z]
}
