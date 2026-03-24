//! Upload `TessellatedMesh` data from bcad-kernel to the GPU.

use bcad_kernel::tessellation::TessellatedMesh;
use wgpu::util::DeviceExt;

use super::gpu_mesh::GpuMesh;
use super::vertex::MeshVertex;

/// Convert a `TessellatedMesh` (flat position/normal arrays) into interleaved
/// `MeshVertex` data and upload to GPU vertex + index buffers.
pub fn upload_tessellated_mesh(
    device: &wgpu::Device,
    _queue: &wgpu::Queue,
    mesh: &TessellatedMesh,
) -> GpuMesh {
    let vertex_count = mesh.positions.len() / 3;
    let mut vertices = Vec::with_capacity(vertex_count);

    for i in 0..vertex_count {
        let pi = i * 3;
        vertices.push(MeshVertex {
            position: [
                mesh.positions[pi],
                mesh.positions[pi + 1],
                mesh.positions[pi + 2],
            ],
            normal: [mesh.normals[pi], mesh.normals[pi + 1], mesh.normals[pi + 2]],
            pad: [0.0, 0.0],
        });
    }

    let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("mesh_vertex_buffer"),
        contents: bytemuck::cast_slice(&vertices),
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
    });

    let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("mesh_index_buffer"),
        contents: bytemuck::cast_slice(&mesh.indices),
        usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
    });

    GpuMesh {
        vertex_buffer,
        index_buffer,
        index_count: mesh.indices.len() as u32,
        vertex_count: vertex_count as u32,
    }
}
