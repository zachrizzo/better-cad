//! Frame rendering: orchestrates the 3D scene render pass and egui overlay.
//!
//! Each frame:
//! 1. Acquire the surface texture
//! 2. Create a command encoder
//! 3. Render 3D scene via SceneRenderer (ViewMode-aware: 2D, 3D, or split)
//! 4. Render egui overlay
//! 5. Submit and present

use bcad_render::camera::CameraState as RenderCameraState;
use bcad_render::gpu::GpuContext;
use bcad_render::surface::RenderSurface;
use bcad_render::viewport::{ViewMode as RenderViewMode, ViewportLayout};
use bcad_render::Pipelines;
use bcad_state::ui_state::ViewMode;
use bcad_state::AppState;

use crate::mesh_regeneration::MeshCache;
use crate::scene_renderer::SceneRenderer;

/// Map the bcad-state `ViewMode` enum to the bcad-render `ViewMode` enum.
fn state_view_mode_to_render(mode: ViewMode) -> RenderViewMode {
    match mode {
        ViewMode::TwoD => RenderViewMode::Only2D,
        ViewMode::ThreeD => RenderViewMode::Only3D,
        ViewMode::Split => RenderViewMode::SplitHorizontal,
    }
}

/// Render a single frame: 3D scene + egui overlay.
///
/// Accepts **both** cameras so that the correct one can be selected based on
/// the current `ViewMode`. In `Split` mode both cameras are used.
pub fn render_frame(
    gpu: &GpuContext,
    surface: &mut RenderSurface,
    pipelines: &Pipelines,
    camera_3d: &RenderCameraState,
    camera_2d: &RenderCameraState,
    mesh_cache: &MeshCache,
    app_state: &AppState,
    scene_renderer: &SceneRenderer,
    egui_ctx: &egui::Context,
    egui_renderer: &mut egui_wgpu::Renderer,
    textures_delta: egui::TexturesDelta,
    shapes: Vec<egui::epaint::ClippedShape>,
    pixels_per_point: f32,
) {
    // Acquire the next surface texture
    let output = match surface.surface.get_current_texture() {
        Ok(output) => output,
        Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
            surface.resize(gpu, surface.width, surface.height);
            return;
        }
        Err(wgpu::SurfaceError::OutOfMemory) => {
            log::error!("Out of GPU memory!");
            return;
        }
        Err(wgpu::SurfaceError::Timeout) => {
            log::warn!("Surface timeout, skipping frame");
            return;
        }
        Err(e) => {
            log::warn!("Surface error: {:?}", e);
            return;
        }
    };

    let view = output
        .texture
        .create_view(&wgpu::TextureViewDescriptor::default());

    let mut encoder = gpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("frame_encoder"),
        });

    // Determine background color from theme
    let bg_color = match app_state.ui.theme {
        bcad_state::ui_state::Theme::Dark => wgpu::Color {
            r: 0.102,
            g: 0.102,
            b: 0.180,
            a: 1.0,
        }, // #1a1a2e
        bcad_state::ui_state::Theme::Light => wgpu::Color {
            r: 0.961,
            g: 0.961,
            b: 0.961,
            a: 1.0,
        }, // #f5f5f5
    };

    // Compute the viewport layout from the current view mode
    let render_mode = state_view_mode_to_render(app_state.ui.view_mode);
    let layout = ViewportLayout::compute(render_mode, surface.width, surface.height);

    // Update lighting once per frame (shared across viewports)
    scene_renderer.update_lighting(
        &gpu.queue,
        convert_lighting_preset(app_state.settings.lighting_preset),
    );

    // ---- Render scene based on ViewMode ----
    match app_state.ui.view_mode {
        ViewMode::ThreeD => {
            // Full-surface 3D perspective viewport
            scene_renderer.update_camera(&gpu.queue, camera_3d);
            scene_renderer.update_grid(&gpu.queue, camera_3d, app_state);
            scene_renderer.render_scene(
                &mut encoder,
                &view,
                &surface.msaa_view,
                &surface.depth_view,
                bg_color,
                pipelines,
                mesh_cache,
                app_state,
                &gpu.queue,
                None,
                true,
            );
        }
        ViewMode::TwoD => {
            // 2D mode: only clear background + grid, NO 3D meshes.
            // The 2D floor plan is rendered as an egui overlay by plan_renderer_2d.
            scene_renderer.update_camera(&gpu.queue, camera_2d);
            scene_renderer.update_grid(&gpu.queue, camera_2d, app_state);
            scene_renderer.render_scene_2d_only(
                &mut encoder,
                &view,
                &surface.msaa_view,
                &surface.depth_view,
                bg_color,
                pipelines,
                &gpu.queue,
            );
        }
        ViewMode::Split => {
            // Split: left = 2D, right = 3D
            // First pass: render 2D viewport (clears the surface)
            if let Some(ref rect_2d) = layout.viewport_2d {
                scene_renderer.update_camera(&gpu.queue, camera_2d);
                scene_renderer.update_grid(&gpu.queue, camera_2d, app_state);
                scene_renderer.render_scene(
                    &mut encoder,
                    &view,
                    &surface.msaa_view,
                    &surface.depth_view,
                    bg_color,
                    pipelines,
                    mesh_cache,
                    app_state,
                    &gpu.queue,
                    Some(rect_2d),
                    true, // clear on first pass
                );
            }

            // Second pass: render 3D viewport (load, don't clear)
            if let Some(ref rect_3d) = layout.viewport_3d {
                scene_renderer.update_camera(&gpu.queue, camera_3d);
                scene_renderer.update_grid(&gpu.queue, camera_3d, app_state);
                scene_renderer.render_scene(
                    &mut encoder,
                    &view,
                    &surface.msaa_view,
                    &surface.depth_view,
                    bg_color,
                    pipelines,
                    mesh_cache,
                    app_state,
                    &gpu.queue,
                    Some(rect_3d),
                    false, // don't clear -- preserve the 2D viewport
                );
            }
        }
    }

    // ---- egui Overlay Render ----

    // Update egui textures
    for (id, delta) in &textures_delta.set {
        egui_renderer.update_texture(&gpu.device, &gpu.queue, *id, delta);
    }

    // Tessellate shapes
    let screen_descriptor = egui_wgpu::ScreenDescriptor {
        size_in_pixels: [surface.width, surface.height],
        pixels_per_point,
    };

    let paint_jobs = egui_ctx.tessellate(shapes, pixels_per_point);

    egui_renderer.update_buffers(
        &gpu.device,
        &gpu.queue,
        &mut encoder,
        &paint_jobs,
        &screen_descriptor,
    );

    // Render egui overlay.
    // We use forget_lifetime() on the render pass to satisfy egui-wgpu's
    // requirement for RenderPass<'static>. This is safe because we drop
    // the render pass before calling encoder.finish().
    {
        let render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("egui_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load, // Don't clear -- overlay on top of 3D
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        egui_renderer.render(
            &mut render_pass.forget_lifetime(),
            &paint_jobs,
            &screen_descriptor,
        );
    }

    // Free textures
    for id in &textures_delta.free {
        egui_renderer.free_texture(id);
    }

    // Submit and present
    gpu.queue.submit(std::iter::once(encoder.finish()));
    output.present();
}

/// Convert bcad-state's LightingPreset to bcad-render's LightingPreset.
fn convert_lighting_preset(
    preset: bcad_state::settings::LightingPreset,
) -> bcad_render::lighting::LightingPreset {
    match preset {
        bcad_state::settings::LightingPreset::Daylight => {
            bcad_render::lighting::LightingPreset::Daylight
        }
        bcad_state::settings::LightingPreset::Evening => {
            bcad_render::lighting::LightingPreset::Evening
        }
        bcad_state::settings::LightingPreset::Studio => {
            bcad_render::lighting::LightingPreset::Studio
        }
    }
}
