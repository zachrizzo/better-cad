import { useMaterialStore } from '../../stores/material-store'
import { useUIStore } from '../../stores/ui-store'
import { MaterialPreview } from './MaterialPreview'

export function MaterialPicker() {
  const materials = useMaterialStore((s) => s.materials)
  const bodyMaterials = useMaterialStore((s) => s.bodyMaterials)
  const selectedMaterialId = useMaterialStore((s) => s.selectedMaterialId)
  const selectMaterial = useMaterialStore((s) => s.selectMaterial)
  const setBodyMaterial = useMaterialStore((s) => s.setBodyMaterial)
  const selectedBodyId = useUIStore((s) => s.selectedBodyId)
  const highlightedMaterialId = selectedBodyId ? bodyMaterials.get(selectedBodyId) ?? null : selectedMaterialId

  const handleMaterialClick = (materialId: string) => {
    selectMaterial(materialId)
    if (selectedBodyId) {
      setBodyMaterial(selectedBodyId, materialId)
    }
  }

  return (
    <div className="material-picker">
      <div className="property-panel-title">Materials</div>
      <div className="material-grid">
        {Array.from(materials.values()).map((mat) => (
          <div
            key={mat.id}
            className={`material-item ${highlightedMaterialId === mat.id ? 'selected' : ''}`}
            onClick={() => handleMaterialClick(mat.id)}
            title={`${mat.name}\nMetallic: ${mat.metallic.toFixed(2)}\nRoughness: ${mat.roughness.toFixed(2)}`}
          >
            <MaterialPreview material={mat} />
            <span className="material-name">{mat.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
