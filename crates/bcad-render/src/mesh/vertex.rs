//! Mesh vertex definition with GPU buffer layout.

/// A single mesh vertex: position + normal + padding.
///
/// Total size: 32 bytes (position 12 + normal 12 + pad 8).
/// The padding can be repurposed for UVs in the future.
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct MeshVertex {
    /// World-space position (x, y, z).
    pub position: [f32; 3],
    /// Surface normal (nx, ny, nz).
    pub normal: [f32; 3],
    /// Padding for 32-byte alignment (reserved for future UV coords).
    pub pad: [f32; 2],
}

impl MeshVertex {
    /// The wgpu vertex buffer layout descriptor for this vertex type.
    pub const LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
        array_stride: std::mem::size_of::<MeshVertex>() as u64, // 32 bytes
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[
            // @location(0) position: vec3<f32>
            wgpu::VertexAttribute {
                offset: 0,
                shader_location: 0,
                format: wgpu::VertexFormat::Float32x3,
            },
            // @location(1) normal: vec3<f32>
            wgpu::VertexAttribute {
                offset: 12,
                shader_location: 1,
                format: wgpu::VertexFormat::Float32x3,
            },
        ],
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vertex_size_is_32_bytes() {
        assert_eq!(std::mem::size_of::<MeshVertex>(), 32);
    }

    #[test]
    fn test_vertex_is_pod() {
        // This test ensures Pod + Zeroable traits are correctly derived.
        let v = MeshVertex {
            position: [1.0, 2.0, 3.0],
            normal: [0.0, 1.0, 0.0],
            pad: [0.0, 0.0],
        };
        let bytes: &[u8] = bytemuck::bytes_of(&v);
        assert_eq!(bytes.len(), 32);
    }
}
