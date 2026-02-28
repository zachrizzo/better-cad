//! glTF 2.0 export for 3D model interchange and web viewing.
//!
//! Converts tessellated meshes and PBR materials to GLB (binary glTF) format.

use bcad_kernel::materials::PbrMaterial;
use bcad_kernel::tessellation::TessellatedMesh;

/// Export meshes with materials as a GLB (binary glTF 2.0) file.
///
/// Each tuple pairs a tessellated mesh with its PBR material. The result
/// is a self-contained GLB byte vector with embedded binary buffer.
pub fn export_gltf(
    meshes: &[(&TessellatedMesh, &PbrMaterial)],
) -> Result<Vec<u8>, crate::IoError> {
    use serde_json::{json, Value};

    if meshes.is_empty() {
        return Err(crate::IoError::FormatError(
            "no meshes provided for glTF export".into(),
        ));
    }

    // Build the binary buffer: for each mesh, write positions, normals, indices
    let mut bin_data: Vec<u8> = Vec::new();
    let mut accessors: Vec<Value> = Vec::new();
    let mut buffer_views: Vec<Value> = Vec::new();
    let mut gltf_meshes: Vec<Value> = Vec::new();
    let mut gltf_materials: Vec<Value> = Vec::new();
    let mut nodes: Vec<Value> = Vec::new();

    for (mesh_idx, (mesh, material)) in meshes.iter().enumerate() {
        let mat_idx = mesh_idx;

        // Material
        let bc = &material.base_color;
        let alpha_mode = if bc[3] < 1.0 { "BLEND" } else { "OPAQUE" };
        gltf_materials.push(json!({
            "name": material.name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [bc[0], bc[1], bc[2], bc[3]],
                "metallicFactor": material.metallic,
                "roughnessFactor": material.roughness
            },
            "alphaMode": alpha_mode
        }));

        // Positions buffer view
        let pos_offset = bin_data.len();
        let mut pos_min = [f32::MAX; 3];
        let mut pos_max = [f32::MIN; 3];
        for chunk in mesh.positions.chunks_exact(3) {
            for i in 0..3 {
                pos_min[i] = pos_min[i].min(chunk[i]);
                pos_max[i] = pos_max[i].max(chunk[i]);
            }
            for &v in chunk {
                bin_data.extend_from_slice(&v.to_le_bytes());
            }
        }
        let pos_byte_len = bin_data.len() - pos_offset;
        let pos_bv_idx = buffer_views.len();
        buffer_views.push(json!({
            "buffer": 0,
            "byteOffset": pos_offset,
            "byteLength": pos_byte_len,
            "target": 34962 // ARRAY_BUFFER
        }));
        let pos_acc_idx = accessors.len();
        accessors.push(json!({
            "bufferView": pos_bv_idx,
            "componentType": 5126, // FLOAT
            "count": mesh.positions.len() / 3,
            "type": "VEC3",
            "min": [pos_min[0], pos_min[1], pos_min[2]],
            "max": [pos_max[0], pos_max[1], pos_max[2]]
        }));

        // Normals buffer view
        let nor_offset = bin_data.len();
        for &v in &mesh.normals {
            bin_data.extend_from_slice(&v.to_le_bytes());
        }
        let nor_byte_len = bin_data.len() - nor_offset;
        let nor_bv_idx = buffer_views.len();
        buffer_views.push(json!({
            "buffer": 0,
            "byteOffset": nor_offset,
            "byteLength": nor_byte_len,
            "target": 34962
        }));
        let nor_acc_idx = accessors.len();
        accessors.push(json!({
            "bufferView": nor_bv_idx,
            "componentType": 5126,
            "count": mesh.normals.len() / 3,
            "type": "VEC3"
        }));

        // Indices buffer view
        let idx_offset = bin_data.len();
        for &idx in &mesh.indices {
            bin_data.extend_from_slice(&idx.to_le_bytes());
        }
        let idx_byte_len = bin_data.len() - idx_offset;
        let idx_bv_idx = buffer_views.len();
        buffer_views.push(json!({
            "buffer": 0,
            "byteOffset": idx_offset,
            "byteLength": idx_byte_len,
            "target": 34963 // ELEMENT_ARRAY_BUFFER
        }));
        let idx_acc_idx = accessors.len();
        accessors.push(json!({
            "bufferView": idx_bv_idx,
            "componentType": 5125, // UNSIGNED_INT
            "count": mesh.indices.len(),
            "type": "SCALAR"
        }));

        // Mesh primitive
        gltf_meshes.push(json!({
            "primitives": [{
                "attributes": {
                    "POSITION": pos_acc_idx,
                    "NORMAL": nor_acc_idx
                },
                "indices": idx_acc_idx,
                "material": mat_idx
            }]
        }));

        // Node
        nodes.push(json!({ "mesh": mesh_idx }));
    }

    let node_indices: Vec<usize> = (0..nodes.len()).collect();

    // Pad binary buffer to 4-byte alignment
    while bin_data.len() % 4 != 0 {
        bin_data.push(0);
    }

    let gltf_json = json!({
        "asset": { "version": "2.0", "generator": "BetterCAD" },
        "scene": 0,
        "scenes": [{ "nodes": node_indices }],
        "nodes": nodes,
        "meshes": gltf_meshes,
        "materials": gltf_materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{ "byteLength": bin_data.len() }]
    });

    let json_bytes = serde_json::to_vec(&gltf_json)
        .map_err(|e| crate::IoError::FormatError(e.to_string()))?;

    // Pad JSON chunk to 4-byte alignment with spaces
    let mut json_chunk = json_bytes;
    while json_chunk.len() % 4 != 0 {
        json_chunk.push(b' ');
    }

    // Build GLB: 12-byte header + JSON chunk (8-byte header + data) + BIN chunk (8-byte header + data)
    let total_len = 12 + 8 + json_chunk.len() + 8 + bin_data.len();
    if total_len > u32::MAX as usize {
        return Err(crate::IoError::FormatError("GLB exceeds 4 GiB limit".into()));
    }
    let mut glb = Vec::with_capacity(total_len);

    // GLB header
    glb.extend_from_slice(b"glTF"); // magic
    glb.extend_from_slice(&2u32.to_le_bytes()); // version
    glb.extend_from_slice(&(total_len as u32).to_le_bytes()); // total length

    // JSON chunk
    glb.extend_from_slice(&(json_chunk.len() as u32).to_le_bytes()); // chunk length
    glb.extend_from_slice(&0x4E4F534Au32.to_le_bytes()); // chunk type: JSON
    glb.extend_from_slice(&json_chunk);

    // BIN chunk
    glb.extend_from_slice(&(bin_data.len() as u32).to_le_bytes()); // chunk length
    glb.extend_from_slice(&0x004E4942u32.to_le_bytes()); // chunk type: BIN
    glb.extend_from_slice(&bin_data);

    Ok(glb)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_mesh() -> TessellatedMesh {
        TessellatedMesh {
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            normals: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
            indices: vec![0, 1, 2],
        }
    }

    #[test]
    fn test_export_gltf_produces_valid_glb_header() {
        let mesh = test_mesh();
        let mat = PbrMaterial::new("Test", [1.0, 0.0, 0.0, 1.0], 0.0, 0.5);
        let glb = export_gltf(&[(&mesh, &mat)]).expect("export should succeed");

        // Check GLB magic
        assert_eq!(&glb[0..4], b"glTF");
        // Check version
        let version = u32::from_le_bytes([glb[4], glb[5], glb[6], glb[7]]);
        assert_eq!(version, 2);
        // Total length should match actual data
        let total_len = u32::from_le_bytes([glb[8], glb[9], glb[10], glb[11]]);
        assert_eq!(total_len as usize, glb.len());
    }

    #[test]
    fn test_export_gltf_empty_input() {
        let result = export_gltf(&[]);
        assert!(result.is_err());
    }
}
