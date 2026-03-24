//! GPU context: wgpu instance, adapter, device, and queue.

/// Holds the core wgpu handles shared across all rendering operations.
/// Created once at startup.
pub struct GpuContext {
    pub instance: wgpu::Instance,
    pub adapter: wgpu::Adapter,
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
}

impl GpuContext {
    /// Create a new GPU context. Requests a high-performance adapter with
    /// reasonable limits for CAD workloads.
    pub async fn new() -> Result<Self, GpuError> {
        Self::create(None).await
    }

    /// Create a GPU context that is compatible with a given surface.
    /// Use this when you already have a window/surface to render into.
    pub async fn new_with_surface(surface: &wgpu::Surface<'_>) -> Result<Self, GpuError> {
        Self::create(Some(surface)).await
    }

    /// Shared creation logic for both headless and surface-bound contexts.
    async fn create(compatible_surface: Option<&wgpu::Surface<'_>>) -> Result<Self, GpuError> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface,
                force_fallback_adapter: false,
            })
            .await
            .ok_or(GpuError::NoAdapter)?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("bcad_render_device"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits {
                        max_buffer_size: 256 * 1024 * 1024, // 256 MB
                        max_texture_dimension_2d: 8192,
                        ..wgpu::Limits::default()
                    },
                    memory_hints: wgpu::MemoryHints::Performance,
                },
                None,
            )
            .await
            .map_err(|e| GpuError::DeviceRequest(e.to_string()))?;

        Ok(Self {
            instance,
            adapter,
            device,
            queue,
        })
    }
}

/// Errors that can occur during GPU context creation.
#[derive(Debug)]
pub enum GpuError {
    /// No suitable GPU adapter was found.
    NoAdapter,
    /// Failed to create a device from the adapter.
    DeviceRequest(String),
}

impl std::fmt::Display for GpuError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GpuError::NoAdapter => write!(f, "No suitable GPU adapter found"),
            GpuError::DeviceRequest(msg) => write!(f, "Failed to request GPU device: {msg}"),
        }
    }
}

impl std::error::Error for GpuError {}
