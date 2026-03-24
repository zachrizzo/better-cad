//! Scene renderer: manages GPU uniform buffers and bind groups for 3D rendering.
//!
//! Owns the camera, lighting, object, material, and grid uniform buffers,
//! creates their bind groups against the pipeline layouts, and provides
//! `render_scene()` which executes a full render pass (PBR meshes + grid).

use std::collections::HashMap;

use bcad_render::camera::CameraState as RenderCameraState;
use bcad_render::grid::GridUniforms;
use bcad_render::lighting::{LightingPreset, LightingUniforms};
use bcad_render::material::MaterialUniforms;
use bcad_render::uniforms::{CameraUniforms, ObjectUniforms, OBJECT_UNIFORM_STRIDE};
use bcad_render::viewport::ViewportRect;
use bcad_render::Pipelines;
use bcad_state::AppState;
use wgpu::util::DeviceExt;

use crate::mesh_regeneration::MeshCache;

/// Maximum number of objects in the dynamic uniform buffer.
const MAX_OBJECTS: u64 = 2048;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MaterialSlot {
    Default,
    Wall,
    Door,
    Window,
}

struct MaterialResource {
    _buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
}

struct MaterialPalette {
    default: MaterialResource,
    wall: MaterialResource,
    door: MaterialResource,
    window: MaterialResource,
}

/// Manages all GPU resources for 3D scene rendering.
pub struct SceneRenderer {
    // ---- Camera (bind group 0 in PBR) ----
    pub camera_uniform_buffer: wgpu::Buffer,
    pub camera_bind_group: wgpu::BindGroup,

    // ---- Lighting (bind group 1 in PBR) ----
    pub lighting_uniform_buffer: wgpu::Buffer,
    pub lighting_bind_group: wgpu::BindGroup,

    // ---- Per-Object dynamic (bind group 2 in PBR) ----
    pub object_uniform_buffer: wgpu::Buffer,
    pub object_bind_group: wgpu::BindGroup,

    // ---- Material (bind group 3 in PBR) ----
    materials: MaterialPalette,

    // ---- Grid (bind group 0 in grid pipeline) ----
    pub grid_uniform_buffer: wgpu::Buffer,
    pub grid_bind_group: wgpu::BindGroup,
}

impl SceneRenderer {
    /// Create all uniform buffers and bind groups for the scene.
    pub fn new(device: &wgpu::Device, pipelines: &Pipelines) -> Self {
        // ---- Camera ----
        let camera_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("camera_uniform_buffer"),
            size: std::mem::size_of::<CameraUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("camera_bind_group"),
            layout: &pipelines.camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_uniform_buffer.as_entire_binding(),
            }],
        });

        // ---- Lighting ----
        let lighting_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("lighting_uniform_buffer"),
            size: std::mem::size_of::<LightingUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let lighting_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("lighting_bind_group"),
            layout: &pipelines.lighting_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: lighting_uniform_buffer.as_entire_binding(),
            }],
        });

        // ---- Per-Object (dynamic uniform buffer) ----
        // Pre-allocate for MAX_OBJECTS, each at OBJECT_UNIFORM_STRIDE alignment.
        let object_buffer_size = MAX_OBJECTS * OBJECT_UNIFORM_STRIDE;
        let object_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("object_uniform_buffer"),
            size: object_buffer_size,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let object_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("object_bind_group"),
            layout: &pipelines.object_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer: &object_uniform_buffer,
                    offset: 0,
                    // The binding size is a single ObjectUniforms, not the whole buffer.
                    size: wgpu::BufferSize::new(OBJECT_UNIFORM_STRIDE),
                }),
            }],
        });

        // ---- Material ----
        let materials = MaterialPalette {
            default: create_material_resource(
                device,
                &pipelines.material_bind_group_layout,
                "default_material",
                material_for_slot(MaterialSlot::Default),
            ),
            wall: create_material_resource(
                device,
                &pipelines.material_bind_group_layout,
                "wall_material",
                material_for_slot(MaterialSlot::Wall),
            ),
            door: create_material_resource(
                device,
                &pipelines.material_bind_group_layout,
                "door_material",
                material_for_slot(MaterialSlot::Door),
            ),
            window: create_material_resource(
                device,
                &pipelines.material_bind_group_layout,
                "window_material",
                material_for_slot(MaterialSlot::Window),
            ),
        };

        // ---- Grid ----
        let grid_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("grid_uniform_buffer"),
            size: std::mem::size_of::<GridUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let grid_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("grid_bind_group"),
            layout: &pipelines.grid_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: grid_uniform_buffer.as_entire_binding(),
            }],
        });

        Self {
            camera_uniform_buffer,
            camera_bind_group,
            lighting_uniform_buffer,
            lighting_bind_group,
            object_uniform_buffer,
            object_bind_group,
            materials,
            grid_uniform_buffer,
            grid_bind_group,
        }
    }

    /// Write camera uniforms to the GPU. Call each frame.
    pub fn update_camera(&self, queue: &wgpu::Queue, camera: &RenderCameraState) {
        let uniforms = CameraUniforms::from_camera(camera);
        queue.write_buffer(
            &self.camera_uniform_buffer,
            0,
            bytemuck::bytes_of(&uniforms),
        );
    }

    /// Write lighting uniforms to the GPU.
    pub fn update_lighting(&self, queue: &wgpu::Queue, preset: LightingPreset) {
        let uniforms = LightingUniforms::from_preset(preset);
        queue.write_buffer(
            &self.lighting_uniform_buffer,
            0,
            bytemuck::bytes_of(&uniforms),
        );
    }

    /// Write grid uniforms to the GPU. Call each frame (camera may have moved).
    pub fn update_grid(
        &self,
        queue: &wgpu::Queue,
        camera: &RenderCameraState,
        app_state: &AppState,
    ) {
        let grid_uniforms = match app_state.ui.theme {
            bcad_state::ui_state::Theme::Dark => GridUniforms::default_dark(camera),
            bcad_state::ui_state::Theme::Light => GridUniforms::default_light(camera),
        };
        queue.write_buffer(
            &self.grid_uniform_buffer,
            0,
            bytemuck::bytes_of(&grid_uniforms),
        );
    }

    /// Execute the full 3D scene render pass.
    ///
    /// Renders:
    /// 1. Opaque PBR meshes
    /// 2. Infinite grid (if enabled)
    /// 3. Transparent PBR meshes
    ///
    /// When `viewport_rect` is `Some`, a scissor rect is applied so that drawing
    /// is confined to the given sub-region of the surface. When `clear_pass` is
    /// `true` the color and depth attachments are cleared; set it to `false` for
    /// the second viewport in a split render to avoid wiping the first viewport.
    pub fn render_scene<'a>(
        &'a self,
        encoder: &'a mut wgpu::CommandEncoder,
        color_view: &wgpu::TextureView,
        msaa_view: &wgpu::TextureView,
        depth_view: &wgpu::TextureView,
        bg_color: wgpu::Color,
        pipelines: &'a Pipelines,
        mesh_cache: &'a MeshCache,
        app_state: &AppState,
        queue: &wgpu::Queue,
        viewport_rect: Option<&ViewportRect>,
        clear_pass: bool,
    ) {
        // Write per-object uniforms into the dynamic buffer.
        // Separate meshes into opaque and transparent lists.
        let mesh_entries: Vec<(&str, &bcad_render::GpuMesh)> = mesh_cache
            .meshes
            .iter()
            .map(|(id, mesh)| (id.as_str(), mesh))
            .collect();
        let material_slots: HashMap<&str, MaterialSlot> = app_state
            .document
            .prototype
            .project
            .elements
            .iter()
            .map(|element| (element.id(), material_slot_for_element(element)))
            .collect();

        // Write object uniforms for all meshes (identity transform for now).
        for (i, _) in mesh_entries.iter().enumerate() {
            if i as u64 >= MAX_OBJECTS {
                log::warn!(
                    "Scene has more than {} objects; extra objects will not be rendered.",
                    MAX_OBJECTS
                );
                break;
            }
            let obj_uniform = ObjectUniforms::identity(i as u32);
            let offset = i as u64 * OBJECT_UNIFORM_STRIDE;
            // Write the ObjectUniforms at the correct stride offset.
            // Pad the data to OBJECT_UNIFORM_STRIDE so the write fills the slot.
            let mut padded = [0u8; 256]; // OBJECT_UNIFORM_STRIDE = 256
            let src = bytemuck::bytes_of(&obj_uniform);
            padded[..src.len()].copy_from_slice(src);
            queue.write_buffer(&self.object_uniform_buffer, offset, &padded);
        }

        // Decide load ops based on whether we should clear
        let color_load = if clear_pass {
            wgpu::LoadOp::Clear(bg_color)
        } else {
            wgpu::LoadOp::Load
        };
        let depth_load = if clear_pass {
            wgpu::LoadOp::Clear(1.0)
        } else {
            wgpu::LoadOp::Load
        };

        // ---- Begin render pass with MSAA ----
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scene_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: msaa_view,
                    resolve_target: Some(color_view),
                    ops: wgpu::Operations {
                        load: color_load,
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: depth_load,
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            // Apply scissor rect if a viewport sub-region is specified
            if let Some(rect) = viewport_rect {
                let (sx, sy, sw, sh) = rect.as_scissor();
                render_pass.set_scissor_rect(sx, sy, sw, sh);
                render_pass.set_viewport(sx as f32, sy as f32, sw as f32, sh as f32, 0.0, 1.0);
            }

            // ---- 1. Opaque PBR meshes ----
            if !mesh_entries.is_empty() {
                render_pass.set_pipeline(&pipelines.pbr_opaque);
                render_pass.set_bind_group(0, &self.camera_bind_group, &[]);
                render_pass.set_bind_group(1, &self.lighting_bind_group, &[]);

                for (i, (element_id, gpu_mesh)) in mesh_entries.iter().enumerate() {
                    if i as u64 >= MAX_OBJECTS {
                        break;
                    }
                    let dynamic_offset = (i as u64 * OBJECT_UNIFORM_STRIDE) as u32;
                    render_pass.set_bind_group(2, &self.object_bind_group, &[dynamic_offset]);
                    let material_slot = material_slots
                        .get(element_id)
                        .copied()
                        .unwrap_or(MaterialSlot::Default);
                    render_pass.set_bind_group(
                        3,
                        self.material_bind_group_for_slot(material_slot),
                        &[],
                    );
                    gpu_mesh.draw(&mut render_pass);
                }
            }

            // ---- 2. Infinite grid ----
            if app_state.ui.show_grid {
                render_pass.set_pipeline(&pipelines.grid);
                render_pass.set_bind_group(0, &self.grid_bind_group, &[]);
                render_pass.draw(0..6, 0..1);
            }

            // ---- 3. Transparent PBR meshes ----
            // TODO: separate transparent meshes from opaque ones based on material alpha.
            // For now, all meshes are treated as opaque above. When material state
            // is tracked per-mesh, transparent objects will be rendered here with
            // the pbr_transparent pipeline, sorted back-to-front.
        }
    }

    /// Render only the background clear + grid (no 3D meshes).
    /// Used for 2D plan view where the floor plan is drawn as an egui overlay.
    pub fn render_scene_2d_only<'a>(
        &'a self,
        encoder: &'a mut wgpu::CommandEncoder,
        color_view: &wgpu::TextureView,
        msaa_view: &wgpu::TextureView,
        depth_view: &wgpu::TextureView,
        bg_color: wgpu::Color,
        pipelines: &'a Pipelines,
        queue: &wgpu::Queue,
    ) {
        let _ = queue; // used by grid update (already called before this)
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scene_pass_2d"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: msaa_view,
                    resolve_target: Some(color_view),
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(bg_color),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            // Only render the grid, no meshes
            render_pass.set_pipeline(&pipelines.grid);
            render_pass.set_bind_group(0, &self.grid_bind_group, &[]);
            render_pass.draw(0..6, 0..1);
        }
    }

    fn material_bind_group_for_slot(&self, slot: MaterialSlot) -> &wgpu::BindGroup {
        match slot {
            MaterialSlot::Default => &self.materials.default.bind_group,
            MaterialSlot::Wall => &self.materials.wall.bind_group,
            MaterialSlot::Door => &self.materials.door.bind_group,
            MaterialSlot::Window => &self.materials.window.bind_group,
        }
    }
}

fn create_material_resource(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    label: &str,
    material: MaterialUniforms,
) -> MaterialResource {
    let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some(label),
        contents: bytemuck::bytes_of(&material),
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(&format!("{label}_bind_group")),
        layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer.as_entire_binding(),
        }],
    });

    MaterialResource {
        _buffer: buffer,
        bind_group,
    }
}

fn material_slot_for_element(element: &bcad_domain::Element) -> MaterialSlot {
    match element {
        bcad_domain::Element::Wall(_) => MaterialSlot::Wall,
        bcad_domain::Element::Door(_) => MaterialSlot::Door,
        bcad_domain::Element::Window(_) => MaterialSlot::Window,
        _ => MaterialSlot::Default,
    }
}

fn material_for_slot(slot: MaterialSlot) -> MaterialUniforms {
    match slot {
        MaterialSlot::Default => MaterialUniforms::default_material(),
        MaterialSlot::Wall => MaterialUniforms {
            base_color: [0.78, 0.79, 0.81, 1.0],
            metallic: 0.0,
            roughness: 0.9,
            _pad: [0.0; 2],
        },
        MaterialSlot::Door => MaterialUniforms {
            base_color: [0.58, 0.39, 0.22, 1.0],
            metallic: 0.0,
            roughness: 0.85,
            _pad: [0.0; 2],
        },
        MaterialSlot::Window => MaterialUniforms {
            base_color: [0.57, 0.73, 0.88, 1.0],
            metallic: 0.05,
            roughness: 0.2,
            _pad: [0.0; 2],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{material_for_slot, material_slot_for_element, MaterialSlot};
    use bcad_domain::{
        DoorElement, DoorHardwareType, DoorStyle, DoorSwing, Element, ElementMeta, WallElement,
        WindowElement, WindowHardwareType, WindowStyle,
    };

    #[test]
    fn doors_and_windows_use_distinct_material_colors_from_walls() {
        let wall_color = material_for_slot(MaterialSlot::Wall).base_color;
        let door_color = material_for_slot(MaterialSlot::Door).base_color;
        let window_color = material_for_slot(MaterialSlot::Window).base_color;

        assert_ne!(door_color, wall_color);
        assert_ne!(window_color, wall_color);
    }

    #[test]
    fn element_types_map_to_expected_material_slots() {
        let wall = Element::Wall(WallElement {
            meta: ElementMeta::new("Wall"),
            start: [0.0, 0.0],
            end: [1.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        });
        let door = Element::Door(DoorElement {
            meta: ElementMeta::new("Door"),
            wall_id: "wall-1".to_string(),
            position_along_wall: 0.5,
            width: 0.9,
            height: 2.1,
            sill_height: 0.0,
            swing: DoorSwing::OutRight,
            hardware_type: DoorHardwareType::Lever,
            style: DoorStyle::Flush,
        });
        let window = Element::Window(WindowElement {
            meta: ElementMeta::new("Window"),
            wall_id: "wall-1".to_string(),
            position_along_wall: 0.5,
            width: 1.2,
            height: 1.1,
            sill_height: 0.9,
            hardware_type: WindowHardwareType::Latch,
            style: WindowStyle::Picture,
        });

        assert_eq!(material_slot_for_element(&wall), MaterialSlot::Wall);
        assert_eq!(material_slot_for_element(&door), MaterialSlot::Door);
        assert_eq!(material_slot_for_element(&window), MaterialSlot::Window);
    }
}
