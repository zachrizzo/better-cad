import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useMeasurementStore } from '../../stores/measurement-store'
import { intersectPointerWithHorizontalPlane } from '../../utils/intersect-pointer-with-plan'

interface Viewport3DInteractionLayerProps {
  enabled: boolean
  planeY: number
}

export function Viewport3DInteractionLayer({
  enabled,
  planeY,
}: Viewport3DInteractionLayerProps) {
  const { gl, camera } = useThree()
  const setMeasurementCursor = useMeasurementStore((s) => s.setCursor)

  useEffect(() => {
    if (!enabled) return

    const canvas = gl.domElement

    const clearCursor = () => {
      setMeasurementCursor(null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      }
      const point = intersectPointerWithHorizontalPlane(camera, ndc, planeY)
      if (!point) {
        clearCursor()
        return
      }
      setMeasurementCursor(point)
    }

    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', clearCursor)
    canvas.addEventListener('pointercancel', clearCursor)

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', clearCursor)
      canvas.removeEventListener('pointercancel', clearCursor)
      clearCursor()
    }
  }, [camera, enabled, gl, planeY, setMeasurementCursor])

  return null
}
