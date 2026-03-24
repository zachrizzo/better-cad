//! GPU-resident mesh with vertex and index buffers.

/// A mesh that has been uploaded to the GPU, ready for draw calls.
pub struct GpuMesh {
    /// Vertex buffer containing interleaved `MeshVertex` data.
    pub vertex_buffer: wgpu::Buffer,
    /// Index buffer (u32 indices).
    pub index_buffer: wgpu::Buffer,
    /// Number of indices (= number of triangles * 3).
    pub index_count: u32,
    /// Number of vertices.
    pub vertex_count: u32,
}

impl GpuMesh {
    /// Draw this mesh using an active render pass.
    ///
    /// The caller is responsible for setting the pipeline and bind groups
    /// before calling this method.
    pub fn draw<'a>(&'a self, render_pass: &mut wgpu::RenderPass<'a>) {
        render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
        render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        render_pass.draw_indexed(0..self.index_count, 0, 0..1);
    }
}
