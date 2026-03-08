import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  intersectPointerWithHorizontalPlane,
  intersectPointerWithPlan,
} from '../intersect-pointer-with-plan'

function createPlanCamera() {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

function createPerspectiveCamera() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(5, 5, 5)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

describe('intersectPointerWithPlan', () => {
  it('maps the screen center to the world origin for the default plan camera', () => {
    const camera = createPlanCamera()

    expect(intersectPointerWithPlan(camera, { x: 0, y: 0 })).toEqual([0, 0])
  })

  it('tracks panned and zoomed orthographic cameras correctly', () => {
    const camera = createPlanCamera()
    camera.position.set(12, -7, 50)
    camera.zoom = 4
    camera.lookAt(12, -7, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)

    expect(intersectPointerWithPlan(camera, { x: 0, y: 0 })).toEqual([12, -7])
  })

  it('returns null when the camera ray is parallel to the plan plane', () => {
    const camera = createPlanCamera()
    camera.lookAt(1, 0, 50)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)

    expect(intersectPointerWithPlan(camera, { x: 0, y: 0 })).toBeNull()
  })
})

describe('intersectPointerWithHorizontalPlane', () => {
  it('maps the screen center to the world origin for the default 3d camera', () => {
    const camera = createPerspectiveCamera()

    expect(intersectPointerWithHorizontalPlane(camera, { x: 0, y: 0 })).toEqual([0, 0, 0])
  })

  it('supports horizontal planes offset from the world origin', () => {
    const camera = createPerspectiveCamera()

    expect(intersectPointerWithHorizontalPlane(camera, { x: 0, y: 0 }, 2)).toEqual([2, 2, 2])
  })

  it('returns null when the camera ray is parallel to the horizontal plane', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(0, 5, 10)
    camera.lookAt(1, 5, 10)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)

    expect(intersectPointerWithHorizontalPlane(camera, { x: 0, y: 0 })).toBeNull()
  })
})
