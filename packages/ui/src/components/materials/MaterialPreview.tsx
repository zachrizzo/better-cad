import type { PbrMaterial } from '../../stores/material-store'

interface MaterialPreviewProps {
  material: PbrMaterial
}

// CSS-based swatch instead of a WebGL canvas to avoid the browser's
// hard limit of ~8-16 simultaneous WebGL contexts when many materials
// are displayed in the picker grid at once.
export function MaterialPreview({ material }: MaterialPreviewProps) {
  const [r, g, b, a] = material.base_color
  const color = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`

  // For metallic materials, add a subtle radial gradient to simulate specularity
  const isMetallic = material.metallic > 0.5
  const background = isMetallic
    ? `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), ${color} 60%)`
    : color

  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background,
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}
    />
  )
}
