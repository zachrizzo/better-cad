import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SavedView } from '../../stores/view-store'

/**
 * ElevationCamera switches the active camera to an orthographic projection
 * looking from the specified cardinal direction. Must be rendered inside <Canvas>.
 */
interface ElevationCameraProps {
  view: SavedView
}

export function ElevationCamera({ view }: ElevationCameraProps) {
  const { camera, size } = useThree()
  const prevState = useRef<{
    position: THREE.Vector3
    rotation: THREE.Euler
    fov?: number
    zoom?: number
    isOrtho: boolean
  } | null>(null)

  useEffect(() => {
    // Save previous camera state
    prevState.current = {
      position: camera.position.clone(),
      rotation: camera.rotation.clone(),
      fov: (camera as THREE.PerspectiveCamera).fov,
      zoom: camera.zoom,
      isOrtho: camera instanceof THREE.OrthographicCamera,
    }

    // Apply the elevation camera settings
    const [px, py, pz] = view.cameraPosition
    const [tx, ty, tz] = view.cameraTarget

    camera.position.set(px, py, pz)
    camera.lookAt(tx, ty, tz)

    // Switch to orthographic-like by setting a very small FOV (if perspective camera)
    // or adjust zoom for ortho
    if (camera instanceof THREE.PerspectiveCamera) {
      // Use a very narrow FOV to approximate orthographic from far away
      camera.fov = 2
      camera.updateProjectionMatrix()
    } else if (camera instanceof THREE.OrthographicCamera) {
      const aspect = size.width / size.height
      const frustumSize = 15
      camera.left = (-frustumSize * aspect) / 2
      camera.right = (frustumSize * aspect) / 2
      camera.top = frustumSize / 2
      camera.bottom = -frustumSize / 2
      camera.zoom = 1
      camera.updateProjectionMatrix()
    }

    return () => {
      // Restore previous camera state
      if (prevState.current) {
        camera.position.copy(prevState.current.position)
        camera.rotation.copy(prevState.current.rotation)
        if (
          camera instanceof THREE.PerspectiveCamera &&
          prevState.current.fov != null
        ) {
          camera.fov = prevState.current.fov
          camera.updateProjectionMatrix()
        }
        if (prevState.current.zoom != null) {
          camera.zoom = prevState.current.zoom
          camera.updateProjectionMatrix()
        }
      }
    }
  }, [camera, view, size])

  return null
}
