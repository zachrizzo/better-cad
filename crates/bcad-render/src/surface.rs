//! Render surface management: swapchain, depth buffer, and MSAA textures.

use crate::gpu::GpuContext;

/// Depth texture format used throughout the renderer.
pub const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;

/// MSAA sample count.
pub const MSAA_SAMPLES: u32 = 4;

/// A render surface tied to a native window. Manages the swapchain,
/// depth buffer, and MSAA resolve textures.
pub struct RenderSurface {
    pub surface: wgpu::Surface<'static>,
    pub config: wgpu::SurfaceConfiguration,
    pub depth_texture: wgpu::Texture,
    pub depth_view: wgpu::TextureView,
    pub msaa_texture: wgpu::Texture,
    pub msaa_view: wgpu::TextureView,
    pub width: u32,
    pub height: u32,
}

impl RenderSurface {
    /// Create a new render surface from a window handle.
    ///
    /// # Safety
    /// The `surface` must remain valid for the `'static` lifetime.
    /// The caller must ensure the window outlives this surface.
    pub fn new(gpu: &GpuContext, surface: wgpu::Surface<'static>, width: u32, height: u32) -> Self {
        let caps = surface.get_capabilities(&gpu.adapter);

        // Prefer sRGB formats for correct gamma handling.
        let format = caps
            .formats
            .iter()
            .find(|f| f.is_srgb())
            .copied()
            .unwrap_or(caps.formats[0]);

        let present_mode = if caps.present_modes.contains(&wgpu::PresentMode::Mailbox) {
            wgpu::PresentMode::Mailbox
        } else {
            wgpu::PresentMode::Fifo
        };

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width,
            height,
            present_mode,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&gpu.device, &config);

        let (depth_texture, depth_view) = create_depth_texture(&gpu.device, width, height);
        let (msaa_texture, msaa_view) = create_msaa_texture(&gpu.device, format, width, height);

        Self {
            surface,
            config,
            depth_texture,
            depth_view,
            msaa_texture,
            msaa_view,
            width,
            height,
        }
    }

    /// Recreate swapchain, depth, and MSAA textures on window resize.
    pub fn resize(&mut self, gpu: &GpuContext, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }

        self.width = width;
        self.height = height;
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&gpu.device, &self.config);

        let (depth_texture, depth_view) = create_depth_texture(&gpu.device, width, height);
        self.depth_texture = depth_texture;
        self.depth_view = depth_view;

        let (msaa_texture, msaa_view) =
            create_msaa_texture(&gpu.device, self.config.format, width, height);
        self.msaa_texture = msaa_texture;
        self.msaa_view = msaa_view;
    }

    /// Get the surface texture format.
    pub fn format(&self) -> wgpu::TextureFormat {
        self.config.format
    }
}

/// Create a depth texture with MSAA support.
fn create_depth_texture(
    device: &wgpu::Device,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("depth_texture"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: MSAA_SAMPLES,
        dimension: wgpu::TextureDimension::D2,
        format: DEPTH_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

/// Create an MSAA color texture for multi-sample resolve.
fn create_msaa_texture(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("msaa_texture"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: MSAA_SAMPLES,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}
