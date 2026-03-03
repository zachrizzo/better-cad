import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { useCameraStore } from '../../stores/camera-store'

/**
 * Syncs the camera-store's programmatic camera position with the R3F camera
 * and captures viewport screenshots on demand.
 *
 * Must be rendered inside a <Canvas>.
 */
export function CameraSync() {
  const { camera, gl, scene } = useThree()
  const lastRevision = useRef(0)

  // Respond to programmatic camera updates from the store
  useEffect(() => {
    const unsub = useCameraStore.subscribe((state) => {
      if (state.revision !== lastRevision.current) {
        lastRevision.current = state.revision
        camera.position.set(...state.position)
        camera.lookAt(...state.target)
        camera.updateProjectionMatrix()
      }
    })
    return unsub
  }, [camera])

  // Expose a screenshot capture function via a global callback
  // This is called by the AI service's take_screenshot tool
  useEffect(() => {
    ;(window as any).__bettercad_capture_screenshot = (): string => {
      // Force-render the current scene so the buffer is fresh
      gl.render(scene, camera)
      const dataUrl = gl.domElement.toDataURL('image/png')
      // Strip the data:image/png;base64, prefix
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      useCameraStore.getState().setScreenshot(base64)
      return base64
    }
    return () => {
      delete (window as any).__bettercad_capture_screenshot
    }
  }, [gl, camera, scene])

  return null
}
