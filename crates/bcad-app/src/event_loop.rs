//! Main event loop handler using winit 0.30 `ApplicationHandler` trait.
//!
//! Handles window events, routes input to egui and the tool system,
//! collects commands, and triggers rendering.
//!
//! ViewMode-aware: cursor projection and camera routing change depending on
//! whether the active mode is 2D, 3D, or Split.

use std::sync::Arc;

use bcad_render::camera::{
    self, CameraState as RenderCameraState, MapController, MouseButton as CameraMouseButton,
    OrbitController,
};
use bcad_render::gpu::GpuContext;
use bcad_render::surface::RenderSurface;
use bcad_render::viewport::{ViewMode as RenderViewMode, ViewportLayout};
use bcad_render::Pipelines;
use bcad_snap::snap_engine::SnapEngine;
use bcad_state::chat_state::UiChatMessage;
use bcad_state::ui_state::{ToolType, ViewMode};
use bcad_state::AppState;
use bcad_tools::tool_manager::{EventDisposition, ToolManager};
use bcad_tools::tool_trait::{
    KeyCode, MouseButton, SnapCandidate, SnapContext, SnapMode, ToolContext, ToolId, ToolInput,
};
use bcad_ui::BcadUi;
use glam::{Vec2, Vec3};
use serde::Serialize;
use winit::application::ApplicationHandler;
use winit::dpi::{LogicalSize, PhysicalPosition};
use winit::event::{ElementState, WindowEvent};
use winit::event_loop::ActiveEventLoop;
use winit::keyboard::{Key, ModifiersState, NamedKey};
use winit::window::{Window, WindowAttributes, WindowId};

use crate::ai_service::{AiService, StreamChunk};
use crate::command_processor;
use crate::mesh_regeneration::MeshCache;
use crate::plan_renderer_2d;
use crate::preview_renderer;
use crate::render_frame;
use crate::scene_renderer::SceneRenderer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveViewport {
    Viewport2D,
    Viewport3D,
}

#[derive(Debug, Clone, Copy)]
struct Pending3DPointerPress {
    button: winit::event::MouseButton,
    screen_pos: Vec2,
    plan_pos: Vec2,
    shift: bool,
    ctrl: bool,
    alt: bool,
}

const CAMERA_DRAG_THRESHOLD_PX: f32 = 4.0;
const KEYBOARD_CAMERA_ZOOM_DELTA: f32 = 80.0;

struct RunningState {
    window: Arc<Window>,
    gpu: GpuContext,
    surface: RenderSurface,
    pipelines: Pipelines,
    app_state: AppState,
    ai_service: AiService,
    bcad_ui: BcadUi,
    tool_manager: ToolManager,
    snap_engine: SnapEngine,
    mesh_cache: MeshCache,
    scene_renderer: SceneRenderer,
    camera_3d: RenderCameraState,
    camera_2d: RenderCameraState,
    orbit_controller: OrbitController,
    map_controller: MapController,
    egui_ctx: egui::Context,
    egui_winit_state: egui_winit::State,
    egui_renderer: egui_wgpu::Renderer,
    ui_viewport_rect: egui::Rect,
    cursor_position: Option<PhysicalPosition<f64>>,
    scale_factor: f64,
    is_dragging: bool,
    drag_button: Option<CameraMouseButton>,
    drag_viewport: Option<ActiveViewport>,
    pending_3d_pointer_press: Option<Pending3DPointerPress>,
    last_applied_camera_revision: u64,
    modifiers: ModifiersState,
}

pub struct App {
    state: Option<RunningState>,
}
impl App {
    pub fn new() -> Self {
        Self { state: None }
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.state.is_some() {
            return;
        }
        let window_attrs = WindowAttributes::default()
            .with_title("BetterCAD")
            .with_inner_size(LogicalSize::new(1400.0, 900.0));
        let window = Arc::new(
            event_loop
                .create_window(window_attrs)
                .expect("Failed to create window"),
        );
        let scale_factor = window.scale_factor();
        let size = window.inner_size();
        let (width, height) = (size.width.max(1), size.height.max(1));
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });
        let wgpu_surface = instance
            .create_surface(window.clone())
            .expect("Failed to create wgpu surface");
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&wgpu_surface),
            force_fallback_adapter: false,
        }))
        .expect("Failed to find suitable GPU adapter");
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("bcad_device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits {
                    max_buffer_size: 256 * 1024 * 1024,
                    max_texture_dimension_2d: 8192,
                    ..wgpu::Limits::default()
                },
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        ))
        .expect("Failed to create GPU device");
        let gpu = GpuContext {
            instance,
            adapter,
            device,
            queue,
        };
        let render_surface = RenderSurface::new(&gpu, wgpu_surface, width, height);
        let pipelines = Pipelines::new(&gpu.device, render_surface.format());
        let app_state = AppState::default();
        let ai_service = AiService::new();
        let bcad_ui = BcadUi::new();
        let tool_manager = ToolManager::new();
        let snap_engine = SnapEngine::new(0.5);
        let mesh_cache = MeshCache::new();
        let scene_renderer = SceneRenderer::new(&gpu.device, &pipelines);
        let camera_3d = RenderCameraState::default_3d();
        let camera_2d = RenderCameraState::default_2d();
        let orbit_controller = OrbitController::new();
        let map_controller = MapController::new();
        let egui_ctx = egui::Context::default();
        let egui_winit_state = egui_winit::State::new(
            egui_ctx.clone(),
            egui_ctx.viewport_id(),
            &window,
            Some(scale_factor as f32),
            None,
            None,
        );
        let egui_renderer =
            egui_wgpu::Renderer::new(&gpu.device, render_surface.format(), None, 1, false);
        log::info!(
            "BetterCAD initialized: {}x{} @ {:.1}x scale",
            width,
            height,
            scale_factor
        );
        self.state = Some(RunningState {
            window,
            gpu,
            surface: render_surface,
            pipelines,
            app_state,
            ai_service,
            bcad_ui,
            tool_manager,
            snap_engine,
            mesh_cache,
            scene_renderer,
            camera_3d,
            camera_2d,
            orbit_controller,
            map_controller,
            egui_ctx,
            egui_winit_state,
            egui_renderer,
            ui_viewport_rect: full_surface_rect_points(scale_factor, width, height),
            cursor_position: None,
            scale_factor,
            is_dragging: false,
            drag_button: None,
            drag_viewport: None,
            pending_3d_pointer_press: None,
            last_applied_camera_revision: 0,
            modifiers: ModifiersState::empty(),
        });
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        let Some(state) = self.state.as_mut() else {
            return;
        };
        let egui_response = state
            .egui_winit_state
            .on_window_event(&state.window, &event);
        let egui_consumed = egui_response.consumed;
        let pointer_position = match &event {
            WindowEvent::CursorMoved { position, .. } => Some(*position),
            WindowEvent::MouseInput { .. } | WindowEvent::MouseWheel { .. } => {
                state.cursor_position
            }
            _ => None,
        };
        let pointer_in_viewport = pointer_position
            .map(|position| {
                physical_position_in_rect(position, state.scale_factor, state.ui_viewport_rect)
            })
            .unwrap_or(false);
        let egui_wants_pointer = egui_consumed && !pointer_in_viewport;
        let egui_wants_keyboard = egui_consumed || state.egui_ctx.wants_keyboard_input();
        match event {
            WindowEvent::CloseRequested => {
                log::info!("Close requested, exiting.");
                event_loop.exit();
            }
            WindowEvent::Resized(new_size) => {
                let (width, height) = (new_size.width.max(1), new_size.height.max(1));
                state.surface.resize(&state.gpu, width, height);
                update_camera_aspects(
                    &state.app_state,
                    &mut state.camera_3d,
                    &mut state.camera_2d,
                    width,
                    height,
                );
                state.window.request_redraw();
            }
            WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                state.scale_factor = scale_factor;
            }
            WindowEvent::RedrawRequested => {
                sync_tool_manager_from_state(state);
                let raw_input = state.egui_winit_state.take_egui_input(&state.window);
                state.egui_ctx.begin_pass(raw_input);
                let (ui_commands, ui_actions, ui_viewport_rect) =
                    state.bcad_ui.show(&state.egui_ctx, &mut state.app_state);
                state.ui_viewport_rect = ui_viewport_rect;

                // --- Render tool preview geometry as egui overlay ---
                {
                    let tool_ctx = build_tool_context(&state.app_state);
                    let preview = state.tool_manager.preview_geometry(&tool_ctx);
                    if !preview.is_empty() {
                        let painter = state.egui_ctx.layer_painter(egui::LayerId::new(
                            egui::Order::Foreground,
                            egui::Id::new("tool_preview"),
                        ));
                        // Single-view modes render across the full wgpu surface, so the
                        // preview overlay needs to project into that same rect.
                        let viewport_rect = full_surface_rect_points(
                            state.scale_factor,
                            state.surface.width,
                            state.surface.height,
                        );
                        let level_y = state
                            .app_state
                            .levels
                            .level_elevation(&state.app_state.levels.active_level_id)
                            as f32;
                        match state.app_state.ui.view_mode {
                            bcad_state::ui_state::ViewMode::TwoD => {
                                preview_renderer::render_preview(
                                    &painter,
                                    viewport_rect,
                                    &preview,
                                    &state.camera_2d,
                                    &state.camera_3d,
                                    true,
                                    level_y,
                                );
                            }
                            bcad_state::ui_state::ViewMode::ThreeD => {
                                preview_renderer::render_preview(
                                    &painter,
                                    viewport_rect,
                                    &preview,
                                    &state.camera_2d,
                                    &state.camera_3d,
                                    false,
                                    level_y,
                                );
                            }
                            bcad_state::ui_state::ViewMode::Split => {
                                // In split mode, render preview in both viewports.
                                let rm = state_view_mode_to_render(state.app_state.ui.view_mode);
                                let layout = bcad_render::viewport::ViewportLayout::compute(
                                    rm,
                                    state.surface.width,
                                    state.surface.height,
                                );
                                let sf = state.scale_factor as f32;
                                if let Some(ref r2d) = layout.viewport_2d {
                                    let vp = egui::Rect::from_min_size(
                                        egui::pos2(r2d.x as f32 / sf, r2d.y as f32 / sf),
                                        egui::vec2(r2d.width as f32 / sf, r2d.height as f32 / sf),
                                    );
                                    preview_renderer::render_preview(
                                        &painter,
                                        vp,
                                        &preview,
                                        &state.camera_2d,
                                        &state.camera_3d,
                                        true,
                                        level_y,
                                    );
                                }
                                if let Some(ref r3d) = layout.viewport_3d {
                                    let vp = egui::Rect::from_min_size(
                                        egui::pos2(r3d.x as f32 / sf, r3d.y as f32 / sf),
                                        egui::vec2(r3d.width as f32 / sf, r3d.height as f32 / sf),
                                    );
                                    preview_renderer::render_preview(
                                        &painter,
                                        vp,
                                        &preview,
                                        &state.camera_2d,
                                        &state.camera_3d,
                                        false,
                                        level_y,
                                    );
                                }
                            }
                        }
                    }
                }

                // --- Render 2D plan elements ---
                if matches!(
                    state.app_state.ui.view_mode,
                    bcad_state::ui_state::ViewMode::TwoD | bcad_state::ui_state::ViewMode::Split
                ) {
                    let plan_painter = state.egui_ctx.layer_painter(egui::LayerId::new(
                        egui::Order::Background,
                        egui::Id::new("plan_2d"),
                    ));
                    let plan_viewport = match state.app_state.ui.view_mode {
                        bcad_state::ui_state::ViewMode::Split => {
                            let rm = state_view_mode_to_render(state.app_state.ui.view_mode);
                            let layout = bcad_render::viewport::ViewportLayout::compute(
                                rm,
                                state.surface.width,
                                state.surface.height,
                            );
                            let sf = state.scale_factor as f32;
                            if let Some(ref r2d) = layout.viewport_2d {
                                egui::Rect::from_min_size(
                                    egui::pos2(r2d.x as f32 / sf, r2d.y as f32 / sf),
                                    egui::vec2(r2d.width as f32 / sf, r2d.height as f32 / sf),
                                )
                            } else {
                                full_surface_rect_points(
                                    state.scale_factor,
                                    state.surface.width,
                                    state.surface.height,
                                )
                            }
                        }
                        _ => full_surface_rect_points(
                            state.scale_factor,
                            state.surface.width,
                            state.surface.height,
                        ),
                    };
                    plan_renderer_2d::render_2d_plan(
                        &plan_painter,
                        plan_viewport,
                        &state.camera_2d,
                        &state.app_state.document.prototype.project.elements,
                        &state.app_state.levels.active_level_id,
                        state.app_state.ui.theme,
                    );
                }

                let full_output = state.egui_ctx.end_pass();
                state
                    .egui_winit_state
                    .handle_platform_output(&state.window, full_output.platform_output);
                let action_commands =
                    crate::file_ops::process_ui_actions(ui_actions, &mut state.app_state);
                let tool_commands = state.tool_manager.take_commands();
                let all_commands: Vec<bcad_state::Command> = ui_commands
                    .into_iter()
                    .chain(action_commands)
                    .chain(convert_tool_commands(tool_commands, &state.app_state))
                    .collect();

                // Intercept SendChatMessage commands – route them to the AI
                // service before the command processor (which just logs them).
                for cmd in &all_commands {
                    if let bcad_state::Command::SendChatMessage { content } = cmd {
                        let content = content.clone();
                        let elements =
                            &state.app_state.document.prototype.project.elements;
                        let active_level_id =
                            state.app_state.levels.active_level_id.clone();
                        if let Some(chat) = state.app_state.chat.active_chat_mut() {
                            state.ai_service.send_message(
                                chat,
                                &content,
                                elements,
                                &active_level_id,
                            );
                        }
                    }
                }

                let change_flags =
                    command_processor::process_commands(all_commands, &mut state.app_state);

                // Poll AI streaming chunks and update chat state each frame.
                {
                    let chunks = state.ai_service.poll_chunks();
                    if !chunks.is_empty() {
                        let mut ai_commands: Vec<bcad_state::Command> = Vec::new();
                        for chunk in chunks {
                            match chunk {
                                StreamChunk::TextDelta(text) => {
                                    if let Some(chat) = state.app_state.chat.active_chat_mut() {
                                        if let Some(UiChatMessage::Assistant { content, .. }) =
                                            chat.ui_messages.last_mut()
                                        {
                                            content.push_str(&text);
                                        }
                                    }
                                }
                                StreamChunk::ToolCall { name, status } => {
                                    log::info!("AI tool executed: {} -> {}", name, status);
                                    // Append a note to the assistant's streaming
                                    // message so the user can see what happened.
                                    if let Some(chat) = state.app_state.chat.active_chat_mut() {
                                        if let Some(UiChatMessage::Assistant { content, .. }) =
                                            chat.ui_messages.last_mut()
                                        {
                                            if !content.is_empty()
                                                && !content.ends_with('\n')
                                            {
                                                content.push('\n');
                                            }
                                            content.push_str(&format!(
                                                "[tool: {} -> {}]\n",
                                                name, status
                                            ));
                                        }
                                    }
                                }
                                StreamChunk::CreateElement(element) => {
                                    ai_commands.push(bcad_state::Command::CreateElement {
                                        element,
                                    });
                                }
                                StreamChunk::DeleteElement(id) => {
                                    ai_commands
                                        .push(bcad_state::Command::DeleteElement { id });
                                }
                                StreamChunk::SetViewMode(mode) => {
                                    let vm = match mode.as_str() {
                                        "3d" => bcad_state::ui_state::ViewMode::ThreeD,
                                        "split" => bcad_state::ui_state::ViewMode::Split,
                                        _ => bcad_state::ui_state::ViewMode::TwoD,
                                    };
                                    ai_commands.push(bcad_state::Command::SetViewMode {
                                        mode: vm,
                                    });
                                }
                                StreamChunk::Done => {
                                    if let Some(chat) = state.app_state.chat.active_chat_mut() {
                                        // Finalize the assistant message: mark
                                        // streaming=false and copy content into
                                        // api_messages so follow-up turns have
                                        // full context.
                                        if let Some(UiChatMessage::Assistant {
                                            streaming,
                                            content,
                                            ..
                                        }) = chat.ui_messages.last_mut()
                                        {
                                            *streaming = false;
                                            let final_content = content.clone();
                                            chat.api_messages.push(
                                                bcad_state::chat_state::ApiMessage {
                                                    role: "assistant".to_string(),
                                                    content: serde_json::Value::String(
                                                        final_content,
                                                    ),
                                                },
                                            );
                                        }
                                    }
                                    state.ai_service.is_streaming = false;
                                    state.app_state.chat.is_streaming = false;
                                }
                                StreamChunk::Error(err) => {
                                    log::error!("AI streaming error: {}", err);
                                    if let Some(chat) = state.app_state.chat.active_chat_mut() {
                                        if let Some(UiChatMessage::Assistant {
                                            content,
                                            streaming,
                                            ..
                                        }) = chat.ui_messages.last_mut()
                                        {
                                            if content.is_empty() {
                                                *content = format!("[Error: {}]", err);
                                            }
                                            *streaming = false;
                                        }
                                    }
                                    state.ai_service.is_streaming = false;
                                    state.app_state.chat.is_streaming = false;
                                }
                            }
                        }
                        // Process any element create/delete commands from tool calls.
                        if !ai_commands.is_empty() {
                            let ai_change_flags = command_processor::process_commands(
                                ai_commands,
                                &mut state.app_state,
                            );
                            if ai_change_flags.contains(bcad_state::ChangeFlags::ELEMENTS) {
                                let elements =
                                    &state.app_state.document.prototype.project.elements;
                                state.snap_engine.rebuild(elements);
                                state.mesh_cache.regenerate_all(elements, &state.gpu);
                            }
                        }
                        // Mark chat dirty so the UI repaints.
                        state.app_state.change_flags |= bcad_state::ChangeFlags::CHAT;
                    }
                }

                if change_flags.contains(bcad_state::ChangeFlags::ELEMENTS) {
                    let elements = &state.app_state.document.prototype.project.elements;
                    state.snap_engine.rebuild(elements);
                    state.mesh_cache.regenerate_all(elements, &state.gpu);
                    log::info!("Snap engine rebuilt: {} elements, {} snap candidates",
                        elements.len(), state.snap_engine.candidate_count());
                }
                sync_tool_manager_from_state(state);
                update_camera_aspects(
                    &state.app_state,
                    &mut state.camera_3d,
                    &mut state.camera_2d,
                    state.surface.width,
                    state.surface.height,
                );
                apply_programmatic_camera_if_needed(state);
                sync_measurement_feedback(state);
                render_frame::render_frame(
                    &state.gpu,
                    &mut state.surface,
                    &state.pipelines,
                    &state.camera_3d,
                    &state.camera_2d,
                    &state.mesh_cache,
                    &state.app_state,
                    &state.scene_renderer,
                    &state.egui_ctx,
                    &mut state.egui_renderer,
                    full_output.textures_delta,
                    full_output.shapes,
                    state.egui_ctx.pixels_per_point(),
                );
                state.window.request_redraw();
            }
            WindowEvent::CursorMoved { position, .. } => {
                state.cursor_position = Some(position);
                let plan_pos = screen_to_plan(
                    position,
                    state.scale_factor,
                    &state.app_state,
                    &state.camera_2d,
                    &state.camera_3d,
                    state.surface.width,
                    state.surface.height,
                );
                let screen_pos = Vec2::new(position.x as f32, position.y as f32);
                if !egui_wants_pointer {
                    if !state.is_dragging {
                        if let Some(pending) = state.pending_3d_pointer_press {
                            let delta = screen_pos - pending.screen_pos;
                            if delta.length_squared()
                                >= CAMERA_DRAG_THRESHOLD_PX * CAMERA_DRAG_THRESHOLD_PX
                            {
                                let camera_button =
                                    winit_mouse_button_to_camera_button(pending.button);
                                state.pending_3d_pointer_press = None;
                                state.is_dragging = true;
                                state.drag_button = Some(camera_button);
                                state.drag_viewport = Some(ActiveViewport::Viewport3D);
                                route_camera_drag_start(
                                    state,
                                    camera_button,
                                    pending.screen_pos,
                                    ActiveViewport::Viewport3D,
                                );
                            }
                        }
                    }
                    if state.is_dragging {
                        let vp = state.drag_viewport.unwrap_or_else(|| {
                            active_viewport_for_cursor(
                                position,
                                &state.app_state,
                                state.surface.width,
                                state.surface.height,
                            )
                        });
                        route_camera_drag_move(state, screen_pos, vp);
                    }
                }
                let active_vp = active_viewport_for_cursor(
                    position,
                    &state.app_state,
                    state.surface.width,
                    state.surface.height,
                );
                let snap_ctx = build_snap_context(&state.snap_engine, &state.app_state);
                let tool_ctx = build_tool_context_for_viewport(&state.app_state, active_vp);
                state.tool_manager.dispatch_input(
                    ToolInput::PointerMove {
                        plan_pos,
                        screen_pos,
                        shift: state.modifiers.shift_key(),
                        ctrl: state.modifiers.control_key(),
                        alt: state.modifiers.alt_key(),
                    },
                    &snap_ctx,
                    &tool_ctx,
                );
            }
            WindowEvent::CursorLeft { .. } => {
                state.cursor_position = None;
                state.app_state.measurement.cursor = None;
                state.pending_3d_pointer_press = None;
            }
            WindowEvent::MouseInput {
                state: button_state,
                button,
                ..
            } => {
                if !egui_wants_pointer {
                    let position = state
                        .cursor_position
                        .unwrap_or(PhysicalPosition::new(0.0, 0.0));
                    let plan_pos = screen_to_plan(
                        position,
                        state.scale_factor,
                        &state.app_state,
                        &state.camera_2d,
                        &state.camera_3d,
                        state.surface.width,
                        state.surface.height,
                    );
                    let screen_pos = Vec2::new(position.x as f32, position.y as f32);
                    let active_vp = active_viewport_for_cursor(
                        position,
                        &state.app_state,
                        state.surface.width,
                        state.surface.height,
                    );
                    match button_state {
                        ElementState::Pressed => {
                            if active_vp == ActiveViewport::Viewport3D
                                && matches!(
                                    button,
                                    winit::event::MouseButton::Left
                                        | winit::event::MouseButton::Middle
                                        | winit::event::MouseButton::Right
                                )
                            {
                                state.pending_3d_pointer_press = Some(Pending3DPointerPress {
                                    button,
                                    screen_pos,
                                    plan_pos,
                                    shift: state.modifiers.shift_key(),
                                    ctrl: state.modifiers.control_key(),
                                    alt: state.modifiers.alt_key(),
                                });
                            } else {
                                let disposition =
                                    dispatch_tool_pointer_press(state, active_vp, button, plan_pos);
                                if disposition == EventDisposition::NotConsumed {
                                    let camera_button = winit_mouse_button_to_camera_button(button);
                                    state.is_dragging = true;
                                    state.drag_button = Some(camera_button);
                                    state.drag_viewport = Some(active_vp);
                                    route_camera_drag_start(
                                        state,
                                        camera_button,
                                        screen_pos,
                                        active_vp,
                                    );
                                }
                                sync_state_from_tool_manager(state);
                            }
                        }
                        ElementState::Released => {
                            if state.is_dragging {
                                if state.drag_button
                                    == Some(winit_mouse_button_to_camera_button(button))
                                {
                                    state.is_dragging = false;
                                    state.drag_button = None;
                                    state.drag_viewport = None;
                                    state.orbit_controller.handle_mouse_up();
                                    state.map_controller.handle_mouse_up();
                                }
                            } else if let Some(pending) = state.pending_3d_pointer_press.take() {
                                if pending.button == button {
                                    dispatch_deferred_tool_pointer_press(
                                        state,
                                        pending,
                                        ActiveViewport::Viewport3D,
                                    );
                                    sync_state_from_tool_manager(state);
                                }
                            }
                        }
                    }
                }
            }
            WindowEvent::MouseWheel { delta, .. } => {
                if !egui_wants_pointer {
                    let scroll_delta = match delta {
                        winit::event::MouseScrollDelta::LineDelta(_, y) => y * 50.0,
                        winit::event::MouseScrollDelta::PixelDelta(pos) => pos.y as f32,
                    };
                    let position = state
                        .cursor_position
                        .unwrap_or(PhysicalPosition::new(0.0, 0.0));
                    route_scroll(
                        state,
                        scroll_delta,
                        active_viewport_for_cursor(
                            position,
                            &state.app_state,
                            state.surface.width,
                            state.surface.height,
                        ),
                    );
                }
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if !egui_wants_keyboard && event.state == ElementState::Pressed {
                    if handle_camera_keyboard_shortcuts(&event.logical_key, state) {
                        return;
                    }
                    if let Some(key_code) = winit_key_to_tool_key(&event.logical_key) {
                        let snap_ctx = build_snap_context(&state.snap_engine, &state.app_state);
                        let tool_ctx = build_tool_context(&state.app_state);
                        state.tool_manager.dispatch_input(
                            ToolInput::KeyDown {
                                key: key_code,
                                shift: state.modifiers.shift_key(),
                                ctrl: state.modifiers.control_key(),
                                alt: state.modifiers.alt_key(),
                            },
                            &snap_ctx,
                            &tool_ctx,
                        );
                    }
                    let kb_cmds = handle_keyboard_shortcuts(
                        &event.logical_key,
                        state.modifiers,
                        &mut state.tool_manager,
                        &mut state.app_state,
                    );
                    if !kb_cmds.is_empty() {
                        command_processor::process_commands(kb_cmds, &mut state.app_state);
                    }
                    sync_state_from_tool_manager(state);
                }
            }
            WindowEvent::ModifiersChanged(mods) => {
                state.modifiers = mods.state();
            }
            _ => {}
        }
    }
    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        if let Some(state) = self.state.as_ref() {
            state.window.request_redraw();
        }
    }
}

// --- Viewport helpers ---
fn state_view_mode_to_render(mode: ViewMode) -> RenderViewMode {
    match mode {
        ViewMode::TwoD => RenderViewMode::Only2D,
        ViewMode::ThreeD => RenderViewMode::Only3D,
        ViewMode::Split => RenderViewMode::SplitHorizontal,
    }
}
fn active_viewport_for_cursor(
    position: PhysicalPosition<f64>,
    app_state: &AppState,
    sw: u32,
    sh: u32,
) -> ActiveViewport {
    match app_state.ui.view_mode {
        ViewMode::TwoD => ActiveViewport::Viewport2D,
        ViewMode::ThreeD => ActiveViewport::Viewport3D,
        ViewMode::Split => {
            let layout =
                ViewportLayout::compute(state_view_mode_to_render(app_state.ui.view_mode), sw, sh);
            if let Some(ref r) = layout.viewport_2d {
                if r.contains(position.x as u32, position.y as u32) {
                    return ActiveViewport::Viewport2D;
                }
            }
            ActiveViewport::Viewport3D
        }
    }
}
fn update_camera_aspects(
    app_state: &AppState,
    c3d: &mut RenderCameraState,
    c2d: &mut RenderCameraState,
    w: u32,
    h: u32,
) {
    match app_state.ui.view_mode {
        ViewMode::TwoD => {
            c2d.aspect = w as f32 / h as f32;
            c3d.aspect = c2d.aspect;
        }
        ViewMode::ThreeD => {
            c3d.aspect = w as f32 / h as f32;
            c2d.aspect = c3d.aspect;
        }
        ViewMode::Split => {
            let layout =
                ViewportLayout::compute(state_view_mode_to_render(app_state.ui.view_mode), w, h);
            if let Some(ref r) = layout.viewport_2d {
                c2d.aspect = r.aspect();
            }
            if let Some(ref r) = layout.viewport_3d {
                c3d.aspect = r.aspect();
            }
        }
    }
}

// --- Camera routing ---
fn active_viewport_for_keyboard_camera(state: &RunningState) -> Option<ActiveViewport> {
    match state.app_state.ui.view_mode {
        ViewMode::ThreeD => Some(ActiveViewport::Viewport3D),
        ViewMode::Split => {
            let position = state.cursor_position?;
            let viewport = active_viewport_for_cursor(
                position,
                &state.app_state,
                state.surface.width,
                state.surface.height,
            );
            (viewport == ActiveViewport::Viewport3D).then_some(ActiveViewport::Viewport3D)
        }
        ViewMode::TwoD => None,
    }
}

fn handle_camera_keyboard_shortcuts(key: &Key, state: &mut RunningState) -> bool {
    let zoom_delta = match key {
        Key::Character(c) if c == "=" || c == "+" => Some(KEYBOARD_CAMERA_ZOOM_DELTA),
        Key::Named(NamedKey::PageUp) => Some(KEYBOARD_CAMERA_ZOOM_DELTA),
        Key::Named(NamedKey::PageDown) => Some(-KEYBOARD_CAMERA_ZOOM_DELTA),
        _ => None,
    };

    if let Some(delta) = zoom_delta {
        if let Some(viewport) = active_viewport_for_keyboard_camera(state) {
            route_scroll(state, delta, viewport);
            return true;
        }
    }

    false
}

fn full_surface_rect_points(scale_factor: f64, width: u32, height: u32) -> egui::Rect {
    egui::Rect::from_min_size(
        egui::Pos2::ZERO,
        egui::vec2(
            width as f32 / scale_factor as f32,
            height as f32 / scale_factor as f32,
        ),
    )
}

fn physical_position_in_rect(
    position: PhysicalPosition<f64>,
    scale_factor: f64,
    rect: egui::Rect,
) -> bool {
    rect.contains(egui::pos2(
        position.x as f32 / scale_factor as f32,
        position.y as f32 / scale_factor as f32,
    ))
}

fn winit_mouse_button_to_camera_button(button: winit::event::MouseButton) -> CameraMouseButton {
    match button {
        winit::event::MouseButton::Left => CameraMouseButton::Left,
        winit::event::MouseButton::Middle => CameraMouseButton::Middle,
        winit::event::MouseButton::Right => CameraMouseButton::Right,
        _ => CameraMouseButton::Left,
    }
}

fn winit_mouse_button_to_tool_button(button: winit::event::MouseButton) -> MouseButton {
    match button {
        winit::event::MouseButton::Left => MouseButton::Left,
        winit::event::MouseButton::Middle => MouseButton::Middle,
        winit::event::MouseButton::Right => MouseButton::Right,
        _ => MouseButton::Left,
    }
}

fn dispatch_tool_pointer_press(
    state: &mut RunningState,
    viewport: ActiveViewport,
    button: winit::event::MouseButton,
    plan_pos: Vec2,
) -> EventDisposition {
    let snap_ctx = build_snap_context(&state.snap_engine, &state.app_state);
    let tool_ctx = build_tool_context_for_viewport(&state.app_state, viewport);

    if button == winit::event::MouseButton::Right {
        state
            .tool_manager
            .dispatch_input(ToolInput::RightClick { plan_pos }, &snap_ctx, &tool_ctx)
    } else {
        state.tool_manager.dispatch_input(
            ToolInput::Click {
                plan_pos,
                button: winit_mouse_button_to_tool_button(button),
                shift: state.modifiers.shift_key(),
                ctrl: state.modifiers.control_key(),
                alt: state.modifiers.alt_key(),
            },
            &snap_ctx,
            &tool_ctx,
        )
    }
}

fn dispatch_deferred_tool_pointer_press(
    state: &mut RunningState,
    pending: Pending3DPointerPress,
    viewport: ActiveViewport,
) {
    let snap_ctx = build_snap_context(&state.snap_engine, &state.app_state);
    let tool_ctx = build_tool_context_for_viewport(&state.app_state, viewport);

    if pending.button == winit::event::MouseButton::Right {
        state.tool_manager.dispatch_input(
            ToolInput::RightClick {
                plan_pos: pending.plan_pos,
            },
            &snap_ctx,
            &tool_ctx,
        );
    } else {
        state.tool_manager.dispatch_input(
            ToolInput::Click {
                plan_pos: pending.plan_pos,
                button: winit_mouse_button_to_tool_button(pending.button),
                shift: pending.shift,
                ctrl: pending.ctrl,
                alt: pending.alt,
            },
            &snap_ctx,
            &tool_ctx,
        );
    }
}

fn route_camera_drag_start(
    s: &mut RunningState,
    btn: CameraMouseButton,
    pos: Vec2,
    vp: ActiveViewport,
) {
    match vp {
        ActiveViewport::Viewport3D => {
            s.orbit_controller.handle_mouse_down(btn, pos, &s.camera_3d);
        }
        ActiveViewport::Viewport2D => {
            s.map_controller.handle_mouse_down(pos, &s.camera_2d);
        }
    }
}
fn route_camera_drag_move(s: &mut RunningState, pos: Vec2, vp: ActiveViewport) {
    match vp {
        ActiveViewport::Viewport3D => {
            s.orbit_controller.handle_mouse_move(pos, &mut s.camera_3d);
        }
        ActiveViewport::Viewport2D => {
            s.map_controller.handle_mouse_move(pos, &mut s.camera_2d);
        }
    }
}
fn route_scroll(s: &mut RunningState, d: f32, vp: ActiveViewport) {
    match vp {
        ActiveViewport::Viewport3D => {
            s.orbit_controller.handle_scroll(d, &mut s.camera_3d);
        }
        ActiveViewport::Viewport2D => {
            s.map_controller.handle_scroll(d, &mut s.camera_2d);
        }
    }
}

// --- Coordinate projection ---
fn screen_to_plan(
    position: PhysicalPosition<f64>,
    sf: f64,
    app_state: &AppState,
    cam2d: &RenderCameraState,
    cam3d: &RenderCameraState,
    sw: u32,
    sh: u32,
) -> Vec2 {
    let vp = active_viewport_for_cursor(position, app_state, sw, sh);
    let rm = state_view_mode_to_render(app_state.ui.view_mode);
    let layout = ViewportLayout::compute(rm, sw, sh);
    match vp {
        ActiveViewport::Viewport2D => {
            let (nx, ny) = if let Some(ref r) = layout.viewport_2d {
                let lx = (position.x / sf) as f32;
                let ly = (position.y / sf) as f32;
                let ls = sf as f32;
                (
                    (lx - r.x as f32 / ls) / (r.width as f32 / ls) * 2.0 - 1.0,
                    1.0 - (ly - r.y as f32 / ls) / (r.height as f32 / ls) * 2.0,
                )
            } else {
                let nx = (position.x / sf) / (sw as f64 / sf) * 2.0 - 1.0;
                let ny = 1.0 - (position.y / sf) / (sh as f64 / sf) * 2.0;
                (nx as f32, ny as f32)
            };
            let hw = cam2d.zoom_level * cam2d.aspect * 0.5;
            let hh = cam2d.zoom_level * 0.5;
            Vec2::new(nx * hw + cam2d.pan_offset.x, ny * hh + cam2d.pan_offset.y)
        }
        ActiveViewport::Viewport3D => {
            let (nx, ny) = if let Some(ref r) = layout.viewport_3d {
                let lx = (position.x / sf) as f32;
                let ly = (position.y / sf) as f32;
                let ls = sf as f32;
                (
                    (lx - r.x as f32 / ls) / (r.width as f32 / ls) * 2.0 - 1.0,
                    1.0 - (ly - r.y as f32 / ls) / (r.height as f32 / ls) * 2.0,
                )
            } else {
                let nx = (position.x / sf) / (sw as f64 / sf) * 2.0 - 1.0;
                let ny = 1.0 - (position.y / sf) / (sh as f64 / sf) * 2.0;
                (nx as f32, ny as f32)
            };
            // Project to active level elevation (not hardcoded Y=0)
            let level_y = app_state
                .levels
                .level_elevation(&app_state.levels.active_level_id)
                as f32;
            if let Some([x, z]) = camera::ray_plane_intersection(cam3d, nx, ny, level_y) {
                Vec2::new(x, z)
            } else {
                Vec2::new(cam3d.target.x, cam3d.target.z)
            }
        }
    }
}

// --- Snap & tool context ---
fn build_snap_context(engine: &SnapEngine, app_state: &AppState) -> SnapContext {
    if !app_state.ui.snap_enabled {
        return SnapContext {
            candidates: Vec::new(),
            enabled: false,
            grid_spacing: 0.25,
        };
    }
    if engine.is_empty() {
        return SnapContext {
            candidates: Vec::new(),
            enabled: true,
            grid_spacing: 0.25,
        };
    }
    let candidates = engine
        .all_candidates()
        .iter()
        .map(|c| SnapCandidate {
            point: Vec2::new(c.point[0] as f32, c.point[1] as f32),
            modes: vec![match c.snap_type {
                bcad_snap::snap_types::SnapType::Endpoint => SnapMode::Endpoint,
                bcad_snap::snap_types::SnapType::Midpoint => SnapMode::Midpoint,
                bcad_snap::snap_types::SnapType::Center => SnapMode::Center,
                bcad_snap::snap_types::SnapType::Intersection => SnapMode::Intersection,
                bcad_snap::snap_types::SnapType::Nearest => SnapMode::Nearest,
                bcad_snap::snap_types::SnapType::Perpendicular => SnapMode::Perpendicular,
                bcad_snap::snap_types::SnapType::Grid => SnapMode::Grid,
            }],
            source_element_id: c.source_element_id.clone(),
        })
        .collect();
    SnapContext {
        candidates,
        enabled: true,
        grid_spacing: 0.25,
    }
}
fn build_tool_context_for_viewport(state: &AppState, vp: ActiveViewport) -> ToolContext {
    let el = state.levels.level_elevation(&state.levels.active_level_id);
    let vp_mode = match vp {
        ActiveViewport::Viewport2D => bcad_tools::tool_trait::ViewportMode::View2D,
        ActiveViewport::Viewport3D => bcad_tools::tool_trait::ViewportMode::View3D,
    };
    ToolContext {
        elements: state.document.prototype.project.elements.clone(),
        active_level_id: state.levels.active_level_id.clone(),
        active_level_elevation: el,
        active_surface_elevation: el,
        defaults: build_tool_defaults(state),
        length_unit: state_length_unit_to_tool(state.settings.length_unit),
        viewport_mode: vp_mode,
        selected_element_id: state.ui.selected_body_id.clone(),
        active_door_family_type_id: state.ui.active_door_family_type_id.clone(),
        active_window_family_type_id: state.ui.active_window_family_type_id.clone(),
    }
}
fn build_tool_context(state: &AppState) -> ToolContext {
    let vp = match state.ui.view_mode {
        bcad_state::ui_state::ViewMode::TwoD => ActiveViewport::Viewport2D,
        bcad_state::ui_state::ViewMode::ThreeD => ActiveViewport::Viewport3D,
        bcad_state::ui_state::ViewMode::Split => ActiveViewport::Viewport2D,
    };
    build_tool_context_for_viewport(state, vp)
}

fn build_tool_defaults(state: &AppState) -> bcad_tools::tool_trait::BimDefaults {
    bcad_tools::tool_trait::BimDefaults {
        wall_height: state.bim_defaults.wall_height,
        wall_thickness: state.bim_defaults.wall_thickness,
        door_width: state.bim_defaults.door_width,
        door_height: state.bim_defaults.door_height,
        door_sill: state.bim_defaults.door_sill,
        door_swing: state_door_swing_to_domain(state.bim_defaults.door_swing),
        door_hardware_type: state_door_hardware_to_domain(state.bim_defaults.door_hardware_type),
        door_style: state_door_style_to_domain(state.bim_defaults.door_style),
        window_width: state.bim_defaults.window_width,
        window_height: state.bim_defaults.window_height,
        window_sill: state.bim_defaults.window_sill,
        window_hardware_type: state_window_hardware_to_domain(
            state.bim_defaults.window_hardware_type,
        ),
        window_style: state_window_style_to_domain(state.bim_defaults.window_style),
        column_width: state.bim_defaults.column_width,
        column_depth: state.bim_defaults.column_depth,
        column_height: state.bim_defaults.column_height,
        beam_width: state.bim_defaults.beam_width,
        beam_depth: state.bim_defaults.beam_depth,
        beam_elevation: state.bim_defaults.beam_elevation,
        roof_thickness: state.bim_defaults.roof_thickness,
        roof_elevation: state.bim_defaults.roof_elevation,
        roof_auto_elevation: state.bim_defaults.roof_auto_elevation,
        roof_type: state_roof_type_to_domain(state.bim_defaults.roof_type),
        roof_pitch_degrees: state.bim_defaults.roof_pitch_degrees,
        roof_ridge_angle_degrees: state.bim_defaults.roof_ridge_angle_degrees,
        stair_width: state.bim_defaults.stair_width,
        stair_risers: state.bim_defaults.stair_risers,
        stair_height: state.bim_defaults.stair_height,
        stair_type: state_stair_type_to_domain(state.bim_defaults.stair_type),
        spiral_turns: state.bim_defaults.spiral_turns,
        stair_side_wall_thickness: state.bim_defaults.stair_side_wall_thickness,
        floor_thickness: state.bim_defaults.floor_thickness,
        furniture_type: enum_to_snake_case(&state.bim_defaults.furniture_type),
        furniture_rotation: state.bim_defaults.furniture_rotation,
        plumbing_type: enum_to_snake_case(&state.bim_defaults.plumbing_type),
        plumbing_rotation: state.bim_defaults.plumbing_rotation,
        electrical_type: enum_to_snake_case(&state.bim_defaults.electrical_type),
        electrical_rotation: state.bim_defaults.electrical_rotation,
        cabinet_type: enum_to_snake_case(&state.bim_defaults.cabinet_type),
        cabinet_rotation: state.bim_defaults.cabinet_rotation,
        cabinet_door_count: state.bim_defaults.cabinet_door_count,
        cabinet_drawer_count: state.bim_defaults.cabinet_drawer_count,
        hvac_type: enum_to_snake_case(&state.bim_defaults.hvac_type),
        hvac_rotation: state.bim_defaults.hvac_rotation,
        fire_safety_type: enum_to_snake_case(&state.bim_defaults.fire_safety_type),
        fire_safety_rotation: state.bim_defaults.fire_safety_rotation,
        accessibility_type: enum_to_snake_case(&state.bim_defaults.accessibility_type),
        accessibility_rotation: state.bim_defaults.accessibility_rotation,
        dimension_sub_mode: state_dimension_sub_mode_to_tool(state.ui.dimension_sub_mode),
        sketch_draw_mode: state_sketch_draw_mode_to_tool(state.sketch.draw_mode),
    }
}

fn state_length_unit_to_tool(
    unit: bcad_state::settings::LengthUnit,
) -> bcad_tools::tool_trait::LengthUnit {
    match unit {
        bcad_state::settings::LengthUnit::M => bcad_tools::tool_trait::LengthUnit::Meters,
        bcad_state::settings::LengthUnit::Ft => bcad_tools::tool_trait::LengthUnit::Feet,
        bcad_state::settings::LengthUnit::In => bcad_tools::tool_trait::LengthUnit::Inches,
        bcad_state::settings::LengthUnit::Mm => bcad_tools::tool_trait::LengthUnit::Millimeters,
        bcad_state::settings::LengthUnit::Cm => bcad_tools::tool_trait::LengthUnit::Centimeters,
    }
}

fn state_dimension_sub_mode_to_tool(
    mode: bcad_state::ui_state::DimensionSubMode,
) -> bcad_tools::dimension_tool::DimensionSubMode {
    match mode {
        bcad_state::ui_state::DimensionSubMode::Aligned => {
            bcad_tools::dimension_tool::DimensionSubMode::Aligned
        }
        bcad_state::ui_state::DimensionSubMode::Horizontal => {
            bcad_tools::dimension_tool::DimensionSubMode::Horizontal
        }
        bcad_state::ui_state::DimensionSubMode::Vertical => {
            bcad_tools::dimension_tool::DimensionSubMode::Vertical
        }
        bcad_state::ui_state::DimensionSubMode::Chain => {
            bcad_tools::dimension_tool::DimensionSubMode::Chain
        }
        bcad_state::ui_state::DimensionSubMode::Baseline => {
            bcad_tools::dimension_tool::DimensionSubMode::Baseline
        }
        bcad_state::ui_state::DimensionSubMode::Ordinate => {
            bcad_tools::dimension_tool::DimensionSubMode::Ordinate
        }
    }
}

fn state_sketch_draw_mode_to_tool(
    mode: bcad_state::sketch_state::SketchDrawMode,
) -> bcad_tools::sketch_tool::SketchDrawMode {
    match mode {
        bcad_state::sketch_state::SketchDrawMode::None => {
            bcad_tools::sketch_tool::SketchDrawMode::None
        }
        bcad_state::sketch_state::SketchDrawMode::Line => {
            bcad_tools::sketch_tool::SketchDrawMode::Line
        }
        bcad_state::sketch_state::SketchDrawMode::Rectangle => {
            bcad_tools::sketch_tool::SketchDrawMode::Rectangle
        }
        bcad_state::sketch_state::SketchDrawMode::Circle => {
            bcad_tools::sketch_tool::SketchDrawMode::Circle
        }
    }
}

fn state_door_swing_to_domain(
    swing: bcad_state::bim_defaults::DoorSwing,
) -> bcad_domain::DoorSwing {
    match swing {
        bcad_state::bim_defaults::DoorSwing::OutLeft => bcad_domain::DoorSwing::OutLeft,
        bcad_state::bim_defaults::DoorSwing::OutRight => bcad_domain::DoorSwing::OutRight,
        bcad_state::bim_defaults::DoorSwing::InLeft => bcad_domain::DoorSwing::InLeft,
        bcad_state::bim_defaults::DoorSwing::InRight => bcad_domain::DoorSwing::InRight,
    }
}

fn state_door_hardware_to_domain(
    hardware_type: bcad_state::bim_defaults::DoorHardwareType,
) -> bcad_domain::DoorHardwareType {
    match hardware_type {
        bcad_state::bim_defaults::DoorHardwareType::None => bcad_domain::DoorHardwareType::None,
        bcad_state::bim_defaults::DoorHardwareType::Knob => bcad_domain::DoorHardwareType::Knob,
        bcad_state::bim_defaults::DoorHardwareType::Lever => bcad_domain::DoorHardwareType::Lever,
        bcad_state::bim_defaults::DoorHardwareType::PullBar => {
            bcad_domain::DoorHardwareType::PullBar
        }
    }
}

fn state_door_style_to_domain(
    style: bcad_state::bim_defaults::DoorStyle,
) -> bcad_domain::DoorStyle {
    match style {
        bcad_state::bim_defaults::DoorStyle::Flush => bcad_domain::DoorStyle::Flush,
        bcad_state::bim_defaults::DoorStyle::Panel => bcad_domain::DoorStyle::Panel,
        bcad_state::bim_defaults::DoorStyle::Double => bcad_domain::DoorStyle::Double,
    }
}

fn state_window_hardware_to_domain(
    hardware_type: bcad_state::bim_defaults::WindowHardwareType,
) -> bcad_domain::WindowHardwareType {
    match hardware_type {
        bcad_state::bim_defaults::WindowHardwareType::None => bcad_domain::WindowHardwareType::None,
        bcad_state::bim_defaults::WindowHardwareType::Latch => {
            bcad_domain::WindowHardwareType::Latch
        }
        bcad_state::bim_defaults::WindowHardwareType::Crank => {
            bcad_domain::WindowHardwareType::Crank
        }
    }
}

fn state_window_style_to_domain(
    style: bcad_state::bim_defaults::WindowStyle,
) -> bcad_domain::WindowStyle {
    match style {
        bcad_state::bim_defaults::WindowStyle::Picture => bcad_domain::WindowStyle::Picture,
        bcad_state::bim_defaults::WindowStyle::Casement => bcad_domain::WindowStyle::Casement,
        bcad_state::bim_defaults::WindowStyle::DoubleHung => bcad_domain::WindowStyle::DoubleHung,
    }
}

fn state_stair_type_to_domain(
    stair_type: bcad_state::bim_defaults::StairType,
) -> bcad_domain::StairType {
    match stair_type {
        bcad_state::bim_defaults::StairType::Straight => bcad_domain::StairType::Straight,
        bcad_state::bim_defaults::StairType::Spiral => bcad_domain::StairType::Spiral,
    }
}

fn state_roof_type_to_domain(
    roof_type: bcad_state::bim_defaults::RoofType,
) -> bcad_domain::RoofType {
    match roof_type {
        bcad_state::bim_defaults::RoofType::Flat => bcad_domain::RoofType::Flat,
        bcad_state::bim_defaults::RoofType::Shed => bcad_domain::RoofType::Shed,
        bcad_state::bim_defaults::RoofType::Gable => bcad_domain::RoofType::Gable,
        bcad_state::bim_defaults::RoofType::Hip => bcad_domain::RoofType::Hip,
    }
}

fn enum_to_snake_case<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default()
}

// --- Tool command conversion ---
fn convert_tool_commands(
    tool_cmds: Vec<bcad_tools::tool_trait::Command>,
    app_state: &AppState,
) -> Vec<bcad_state::Command> {
    let mut result = Vec::new();
    for cmd in tool_cmds {
        match cmd {
            bcad_tools::tool_trait::Command::CreateElement(bcad_domain::Element::View(view)) => {
                if let Some(saved_view) = saved_view_from_element_view(&view) {
                    let view_id = saved_view.id.clone();
                    result.push(bcad_state::Command::AddSavedView { view: saved_view });
                    result.push(bcad_state::Command::SetActiveView { id: Some(view_id) });
                } else {
                    result.push(bcad_state::Command::CreateElement {
                        element: bcad_domain::Element::View(view),
                    });
                }
            }
            bcad_tools::tool_trait::Command::CreateElement(element) => {
                result.push(bcad_state::Command::CreateElement { element })
            }
            bcad_tools::tool_trait::Command::UpdateElement { id, element } => {
                result.push(bcad_state::Command::UpdateElement { id, element })
            }
            bcad_tools::tool_trait::Command::DeleteElement(id) => {
                result.push(bcad_state::Command::DeleteElement { id })
            }
            bcad_tools::tool_trait::Command::BatchCreate(elements) => {
                for element in elements {
                    result.push(bcad_state::Command::CreateElement { element });
                }
            }
            bcad_tools::tool_trait::Command::Undo => result.push(bcad_state::Command::Undo),
            bcad_tools::tool_trait::Command::Redo => result.push(bcad_state::Command::Redo),
            bcad_tools::tool_trait::Command::SetActiveTool(_)
            | bcad_tools::tool_trait::Command::Save
            | bcad_tools::tool_trait::Command::Load => {}
            bcad_tools::tool_trait::Command::AutoJoinWalls { wall_id, level_id } => {
                // Pass through to command processor so it runs AFTER CreateElement
                result.push(bcad_state::Command::AutoJoinWalls { wall_id, level_id });
            }
            bcad_tools::tool_trait::Command::Duplicate => convert_duplicate(app_state, &mut result),
            bcad_tools::tool_trait::Command::DeleteSelected => {
                if let Some(id) = &app_state.ui.selected_body_id {
                    result.push(bcad_state::Command::DeleteElement { id: id.clone() });
                }
            }
            bcad_tools::tool_trait::Command::RotateSelected => {
                convert_rotate_selected(app_state, &mut result)
            }
            bcad_tools::tool_trait::Command::MoveElement {
                id,
                delta_x,
                delta_z,
            } => {
                convert_move_element(&id, delta_x, delta_z, app_state, &mut result);
            }
            bcad_tools::tool_trait::Command::SelectElement { id } => {
                result.push(bcad_state::Command::SelectBody { id });
            }
        }
    }
    result
}

fn saved_view_from_element_view(
    view: &bcad_domain::ViewElement,
) -> Option<bcad_state::view_state::SavedView> {
    match view.view_type.as_str() {
        "section" => {
            let cut_line_start = view.cut_start?;
            let cut_line_end = view.cut_end?;
            let dx = cut_line_end[0] - cut_line_start[0];
            let dz = cut_line_end[1] - cut_line_start[1];
            let len = (dx * dx + dz * dz).sqrt();
            if len < 1e-8 {
                return None;
            }
            let nx = -dz / len;
            let nz = dx / len;
            let mid_x = (cut_line_start[0] + cut_line_end[0]) * 0.5;
            let mid_z = (cut_line_start[1] + cut_line_end[1]) * 0.5;
            let camera_distance = 20.0;

            Some(bcad_state::view_state::SavedView {
                id: view.meta.id.clone(),
                name: view.meta.name.clone(),
                view_type: bcad_state::view_state::SavedViewType::Section,
                cut_line_start: Some(cut_line_start),
                cut_line_end: Some(cut_line_end),
                direction: None,
                camera_position: [
                    mid_x + nx * camera_distance,
                    5.0,
                    mid_z + nz * camera_distance,
                ],
                camera_target: [mid_x, 5.0, mid_z],
            })
        }
        "elevation" => {
            let direction = match view.elevation_direction.as_deref() {
                Some("north") => bcad_state::view_state::CardinalDirection::North,
                Some("south") => bcad_state::view_state::CardinalDirection::South,
                Some("east") => bcad_state::view_state::CardinalDirection::East,
                Some("west") => bcad_state::view_state::CardinalDirection::West,
                _ => return None,
            };
            let dist = 50.0;
            let camera_position = match direction {
                bcad_state::view_state::CardinalDirection::North => [0.0, 3.0, -dist],
                bcad_state::view_state::CardinalDirection::South => [0.0, 3.0, dist],
                bcad_state::view_state::CardinalDirection::East => [dist, 3.0, 0.0],
                bcad_state::view_state::CardinalDirection::West => [-dist, 3.0, 0.0],
            };

            Some(bcad_state::view_state::SavedView {
                id: view.meta.id.clone(),
                name: view.meta.name.clone(),
                view_type: bcad_state::view_state::SavedViewType::Elevation,
                cut_line_start: None,
                cut_line_end: None,
                direction: Some(direction),
                camera_position,
                camera_target: [0.0, 3.0, 0.0],
            })
        }
        _ => None,
    }
}
fn convert_duplicate(app_state: &AppState, result: &mut Vec<bcad_state::Command>) {
    let sid = match &app_state.ui.selected_body_id {
        Some(id) => id,
        None => return,
    };
    let el = match app_state
        .document
        .prototype
        .project
        .elements
        .iter()
        .find(|e| e.id() == sid)
    {
        Some(e) => e,
        None => return,
    };
    let mut c = el.clone();
    let nid = uuid::Uuid::new_v4().to_string();
    set_element_id_and_offset(&mut c, &nid, 0.5);
    result.push(bcad_state::Command::CreateElement { element: c });
}
pub(crate) fn set_element_id_and_offset(element: &mut bcad_domain::Element, new_id: &str, o: f64) {
    match element {
        bcad_domain::Element::Wall(w) => {
            w.meta.id = new_id.into();
            w.meta.name = format!("{} (copy)", w.meta.name);
            w.start[0] += o;
            w.end[0] += o;
            w.start[1] += o;
            w.end[1] += o;
        }
        bcad_domain::Element::Column(c) => {
            c.meta.id = new_id.into();
            c.meta.name = format!("{} (copy)", c.meta.name);
            c.center[0] += o;
            c.center[1] += o;
        }
        bcad_domain::Element::Beam(b) => {
            b.meta.id = new_id.into();
            b.meta.name = format!("{} (copy)", b.meta.name);
            b.start[0] += o;
            b.end[0] += o;
            b.start[1] += o;
            b.end[1] += o;
        }
        bcad_domain::Element::Door(d) => {
            d.meta.id = new_id.into();
            d.meta.name = format!("{} (copy)", d.meta.name);
            d.position_along_wall += o;
        }
        bcad_domain::Element::Window(w) => {
            w.meta.id = new_id.into();
            w.meta.name = format!("{} (copy)", w.meta.name);
            w.position_along_wall += o;
        }
        bcad_domain::Element::Furniture(f) => {
            f.meta.id = new_id.into();
            f.meta.name = format!("{} (copy)", f.meta.name);
            f.position[0] += o;
            f.position[1] += o;
        }
        bcad_domain::Element::Electrical(e) => {
            e.meta.id = new_id.into();
            e.meta.name = format!("{} (copy)", e.meta.name);
            e.position[0] += o;
            e.position[1] += o;
        }
        bcad_domain::Element::Plumbing(p) => {
            p.meta.id = new_id.into();
            p.meta.name = format!("{} (copy)", p.meta.name);
            p.position[0] += o;
            p.position[1] += o;
        }
        bcad_domain::Element::Hvac(h) => {
            h.meta.id = new_id.into();
            h.meta.name = format!("{} (copy)", h.meta.name);
            h.position[0] += o;
            h.position[1] += o;
        }
        bcad_domain::Element::FireSafety(f) => {
            f.meta.id = new_id.into();
            f.meta.name = format!("{} (copy)", f.meta.name);
            f.position[0] += o;
            f.position[1] += o;
        }
        bcad_domain::Element::Accessibility(a) => {
            a.meta.id = new_id.into();
            a.meta.name = format!("{} (copy)", a.meta.name);
            a.position[0] += o;
            a.position[1] += o;
        }
        bcad_domain::Element::Cabinet(c) => {
            c.meta.id = new_id.into();
            c.meta.name = format!("{} (copy)", c.meta.name);
            c.position[0] += o;
            c.position[1] += o;
        }
        other => {
            let nn = format!("{} (copy)", other.meta().name);
            match other {
                bcad_domain::Element::Site(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Level(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Grid(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Floor(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Roof(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Foundation(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Stair(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Room(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::View(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Sheet(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Material(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::FamilyType(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Generic(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::SiteDetail(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::LeaderAnnotation(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Keynote(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                bcad_domain::Element::Tag(e) => {
                    e.meta.id = new_id.into();
                    e.meta.name = nn;
                }
                _ => {}
            }
        }
    }
}
fn convert_rotate_selected(app_state: &AppState, result: &mut Vec<bcad_state::Command>) {
    use std::f64::consts::FRAC_PI_2;
    let sid = match &app_state.ui.selected_body_id {
        Some(id) => id,
        None => return,
    };
    let el = match app_state
        .document
        .prototype
        .project
        .elements
        .iter()
        .find(|e| e.id() == sid)
    {
        Some(e) => e,
        None => return,
    };
    let mut r = el.clone();
    match &mut r {
        bcad_domain::Element::Furniture(f) => f.rotation += FRAC_PI_2,
        bcad_domain::Element::Electrical(e) => e.rotation += FRAC_PI_2,
        bcad_domain::Element::Plumbing(p) => p.rotation += FRAC_PI_2,
        bcad_domain::Element::Hvac(h) => h.rotation += FRAC_PI_2,
        bcad_domain::Element::FireSafety(f) => f.rotation += FRAC_PI_2,
        bcad_domain::Element::Accessibility(a) => a.rotation += FRAC_PI_2,
        bcad_domain::Element::Cabinet(c) => c.rotation += FRAC_PI_2,
        bcad_domain::Element::Wall(w) => {
            let (cx, cy) = ((w.start[0] + w.end[0]) / 2.0, (w.start[1] + w.end[1]) / 2.0);
            let (s0, s1) = rot90(w.start[0], w.start[1], cx, cy);
            let (e0, e1) = rot90(w.end[0], w.end[1], cx, cy);
            w.start = [s0, s1];
            w.end = [e0, e1];
        }
        bcad_domain::Element::Column(_) => {}
        bcad_domain::Element::Beam(b) => {
            let (cx, cy) = ((b.start[0] + b.end[0]) / 2.0, (b.start[1] + b.end[1]) / 2.0);
            let (s0, s1) = rot90(b.start[0], b.start[1], cx, cy);
            let (e0, e1) = rot90(b.end[0], b.end[1], cx, cy);
            b.start[0] = s0;
            b.start[1] = s1;
            b.end[0] = e0;
            b.end[1] = e1;
        }
        _ => return,
    }
    result.push(bcad_state::Command::UpdateElement {
        id: sid.clone(),
        element: r,
    });
}
fn rot90(x: f64, y: f64, cx: f64, cy: f64) -> (f64, f64) {
    (cx - (y - cy), cy + (x - cx))
}

fn convert_move_element(
    id: &str,
    dx: f64,
    dz: f64,
    app_state: &AppState,
    result: &mut Vec<bcad_state::Command>,
) {
    let elements = &app_state.document.prototype.project.elements;
    let element = match elements.iter().find(|e| e.id() == id) {
        Some(e) => e,
        None => return,
    };
    let mut moved = element.clone();
    match &mut moved {
        bcad_domain::Element::Wall(w) => {
            w.start[0] += dx;
            w.end[0] += dx;
            w.start[1] += dz;
            w.end[1] += dz;
        }
        bcad_domain::Element::Column(c) => {
            c.center[0] += dx;
            c.center[1] += dz;
        }
        bcad_domain::Element::Beam(b) => {
            b.start[0] += dx;
            b.end[0] += dx;
            b.start[1] += dz;
            b.end[1] += dz;
        }
        bcad_domain::Element::Furniture(f) => {
            f.position[0] += dx;
            f.position[1] += dz;
        }
        bcad_domain::Element::Electrical(e) => {
            e.position[0] += dx;
            e.position[1] += dz;
        }
        bcad_domain::Element::Plumbing(p) => {
            p.position[0] += dx;
            p.position[1] += dz;
        }
        bcad_domain::Element::Hvac(h) => {
            h.position[0] += dx;
            h.position[1] += dz;
        }
        bcad_domain::Element::FireSafety(f) => {
            f.position[0] += dx;
            f.position[1] += dz;
        }
        bcad_domain::Element::Accessibility(a) => {
            a.position[0] += dx;
            a.position[1] += dz;
        }
        bcad_domain::Element::Cabinet(c) => {
            c.position[0] += dx;
            c.position[1] += dz;
        }
        _ => return,
    }
    result.push(bcad_state::Command::UpdateElement {
        id: id.to_string(),
        element: moved,
    });
}

fn sync_tool_manager_from_state(state: &mut RunningState) {
    let desired = tool_type_to_tool_id(state.app_state.ui.active_tool);
    if state.tool_manager.active_tool_id() != desired {
        state.tool_manager.set_active_tool(desired);
    }
}

fn sync_state_from_tool_manager(state: &mut RunningState) {
    let desired = tool_id_to_tool_type(state.tool_manager.active_tool_id());
    if state.app_state.ui.active_tool != desired {
        state.app_state.ui.active_tool = desired;
        if desired != ToolType::Dimension {
            state.app_state.ui.dimension_sub_mode = bcad_state::ui_state::DimensionSubMode::Aligned;
        }
    }
    state.app_state.sketch.active = desired == ToolType::Sketch;
}

fn tool_type_to_tool_id(tool: ToolType) -> ToolId {
    match tool {
        ToolType::Select => ToolId::Select,
        ToolType::Foundation => ToolId::Foundation,
        ToolType::Parking => ToolId::Parking,
        ToolType::Wall => ToolId::Wall,
        ToolType::Door => ToolId::Door,
        ToolType::Floor => ToolId::Floor,
        ToolType::Roof => ToolId::Roof,
        ToolType::Stair => ToolId::Stair,
        ToolType::Measure => ToolId::Measure,
        ToolType::MeasurePath => ToolId::MeasurePath,
        ToolType::MeasureAngle => ToolId::MeasureAngle,
        ToolType::MeasureArea => ToolId::MeasureArea,
        ToolType::Window => ToolId::Window,
        ToolType::Column => ToolId::Column,
        ToolType::Beam => ToolId::Beam,
        ToolType::Room => ToolId::Room,
        ToolType::Dimension => ToolId::Dimension,
        ToolType::Text => ToolId::Text,
        ToolType::Sketch => ToolId::Sketch,
        ToolType::Section => ToolId::Section,
        ToolType::Furniture => ToolId::Furniture,
        ToolType::Plumbing => ToolId::Plumbing,
        ToolType::Electrical => ToolId::Electrical,
        ToolType::Cabinet => ToolId::Cabinet,
        ToolType::Hvac => ToolId::Hvac,
        ToolType::FireSafety => ToolId::FireSafety,
        ToolType::Accessibility => ToolId::Accessibility,
        ToolType::SpotElevation => ToolId::SpotElevation,
    }
}

fn tool_id_to_tool_type(tool: ToolId) -> ToolType {
    match tool {
        ToolId::Select => ToolType::Select,
        ToolId::Foundation => ToolType::Foundation,
        ToolId::Parking => ToolType::Parking,
        ToolId::Wall | ToolId::ArcWall => ToolType::Wall,
        ToolId::Door => ToolType::Door,
        ToolId::Floor => ToolType::Floor,
        ToolId::Roof => ToolType::Roof,
        ToolId::Stair => ToolType::Stair,
        ToolId::Measure => ToolType::Measure,
        ToolId::MeasurePath => ToolType::MeasurePath,
        ToolId::MeasureAngle => ToolType::MeasureAngle,
        ToolId::MeasureArea => ToolType::MeasureArea,
        ToolId::Window => ToolType::Window,
        ToolId::Column => ToolType::Column,
        ToolId::Beam => ToolType::Beam,
        ToolId::Room => ToolType::Room,
        ToolId::Dimension => ToolType::Dimension,
        ToolId::Text => ToolType::Text,
        ToolId::Sketch => ToolType::Sketch,
        ToolId::Section => ToolType::Section,
        ToolId::Furniture => ToolType::Furniture,
        ToolId::Plumbing => ToolType::Plumbing,
        ToolId::Electrical => ToolType::Electrical,
        ToolId::Cabinet => ToolType::Cabinet,
        ToolId::Hvac => ToolType::Hvac,
        ToolId::FireSafety => ToolType::FireSafety,
        ToolId::Accessibility => ToolType::Accessibility,
        ToolId::SpotElevation => ToolType::SpotElevation,
    }
}

fn apply_programmatic_camera_if_needed(state: &mut RunningState) {
    if state.app_state.camera.revision == state.last_applied_camera_revision {
        return;
    }
    let position = state.app_state.camera.position;
    let target = state.app_state.camera.target;
    apply_look_at_camera(&mut state.camera_3d, position, target);
    state.last_applied_camera_revision = state.app_state.camera.revision;
}

fn apply_look_at_camera(camera: &mut RenderCameraState, position: [f64; 3], target: [f64; 3]) {
    let position = Vec3::new(position[0] as f32, position[1] as f32, position[2] as f32);
    let target = Vec3::new(target[0] as f32, target[1] as f32, target[2] as f32);
    let delta = position - target;
    let distance = delta.length().max(0.1);

    camera.position = position;
    camera.target = target;
    camera.up = Vec3::Y;
    camera.distance = distance;
    camera.azimuth = delta.x.atan2(delta.z);
    camera.elevation = (delta.y / distance).asin();
}

fn sync_measurement_feedback(state: &mut RunningState) {
    let tool_ctx = build_tool_context(&state.app_state);
    state.app_state.measurement.tool_readout = state.tool_manager.status_text(&tool_ctx);

    state.app_state.measurement.cursor = state.cursor_position.map(|position| {
        let plan_pos = screen_to_plan(
            position,
            state.scale_factor,
            &state.app_state,
            &state.camera_2d,
            &state.camera_3d,
            state.surface.width,
            state.surface.height,
        );
        [
            plan_pos.x as f64,
            state
                .app_state
                .levels
                .level_elevation(&state.app_state.levels.active_level_id),
            plan_pos.y as f64,
        ]
    });
}

// --- Key conversion & shortcuts ---
fn winit_key_to_tool_key(key: &Key) -> Option<KeyCode> {
    match key {
        Key::Named(n) => match n {
            NamedKey::Escape => Some(KeyCode::Escape),
            NamedKey::Enter => Some(KeyCode::Enter),
            NamedKey::Space => Some(KeyCode::Space),
            NamedKey::Backspace => Some(KeyCode::Backspace),
            NamedKey::Delete => Some(KeyCode::Delete),
            NamedKey::Tab => Some(KeyCode::Tab),
            NamedKey::ArrowUp => Some(KeyCode::ArrowUp),
            NamedKey::ArrowDown => Some(KeyCode::ArrowDown),
            NamedKey::ArrowLeft => Some(KeyCode::ArrowLeft),
            NamedKey::ArrowRight => Some(KeyCode::ArrowRight),
            NamedKey::Shift => Some(KeyCode::ShiftLeft),
            NamedKey::Control => Some(KeyCode::ControlLeft),
            NamedKey::Alt => Some(KeyCode::AltLeft),
            NamedKey::F1 => Some(KeyCode::F1),
            NamedKey::F2 => Some(KeyCode::F2),
            NamedKey::F3 => Some(KeyCode::F3),
            NamedKey::F4 => Some(KeyCode::F4),
            NamedKey::F5 => Some(KeyCode::F5),
            NamedKey::F6 => Some(KeyCode::F6),
            NamedKey::F7 => Some(KeyCode::F7),
            NamedKey::F8 => Some(KeyCode::F8),
            NamedKey::F9 => Some(KeyCode::F9),
            NamedKey::F10 => Some(KeyCode::F10),
            NamedKey::F11 => Some(KeyCode::F11),
            NamedKey::F12 => Some(KeyCode::F12),
            _ => None,
        },
        Key::Character(c) => {
            let ch = c.chars().next()?;
            match ch.to_ascii_lowercase() {
                'a' => Some(KeyCode::A),
                'b' => Some(KeyCode::B),
                'c' => Some(KeyCode::C),
                'd' => Some(KeyCode::D),
                'e' => Some(KeyCode::E),
                'f' => Some(KeyCode::F),
                'g' => Some(KeyCode::G),
                'h' => Some(KeyCode::H),
                'i' => Some(KeyCode::I),
                'j' => Some(KeyCode::J),
                'k' => Some(KeyCode::K),
                'l' => Some(KeyCode::L),
                'm' => Some(KeyCode::M),
                'n' => Some(KeyCode::N),
                'o' => Some(KeyCode::O),
                'p' => Some(KeyCode::P),
                'q' => Some(KeyCode::Q),
                'r' => Some(KeyCode::R),
                's' => Some(KeyCode::S),
                't' => Some(KeyCode::T),
                'u' => Some(KeyCode::U),
                'v' => Some(KeyCode::V),
                'w' => Some(KeyCode::W),
                'x' => Some(KeyCode::X),
                'y' => Some(KeyCode::Y),
                'z' => Some(KeyCode::Z),
                '0' => Some(KeyCode::Key0),
                '1' => Some(KeyCode::Key1),
                '2' => Some(KeyCode::Key2),
                '3' => Some(KeyCode::Key3),
                '4' => Some(KeyCode::Key4),
                '5' => Some(KeyCode::Key5),
                '6' => Some(KeyCode::Key6),
                '7' => Some(KeyCode::Key7),
                '8' => Some(KeyCode::Key8),
                '9' => Some(KeyCode::Key9),
                _ => None,
            }
        }
        _ => None,
    }
}
fn handle_keyboard_shortcuts(
    key: &Key,
    modifiers: ModifiersState,
    tm: &mut ToolManager,
    app_state: &mut AppState,
) -> Vec<bcad_state::Command> {
    let ctrl = modifiers.control_key() || modifiers.super_key();
    let shift = modifiers.shift_key();
    let mut cmds = Vec::new();

    // --- Modifier shortcuts (Ctrl+key) ---
    if ctrl {
        match key {
            Key::Character(c) => match c.as_str() {
                "z" | "Z" => {
                    if shift {
                        cmds.push(bcad_state::Command::Redo);
                    } else {
                        cmds.push(bcad_state::Command::Undo);
                    }
                    return cmds;
                }
                "c" | "C" => {
                    cmds.push(bcad_state::Command::CopySelected);
                    return cmds;
                }
                "v" | "V" => {
                    cmds.push(bcad_state::Command::PasteFromClipboard);
                    return cmds;
                }
                "d" | "D" => {
                    if !shift {
                        cmds.push(bcad_state::Command::DuplicateSelected);
                    }
                    return cmds;
                }
                _ => {}
            },
            _ => {}
        }
        // Don't process tool shortcuts when Ctrl is held
        return cmds;
    }

    // --- Delete key ---
    // Note: The select tool already handles Delete/Backspace via ToolInput::KeyDown,
    // emitting Command::DeleteSelected. We handle it here too as a fallback for
    // when other tools are active (so Delete always works).
    if matches!(key, Key::Named(NamedKey::Delete) | Key::Named(NamedKey::Backspace)) {
        if let Some(ref id) = app_state.ui.selected_body_id {
            cmds.push(bcad_state::Command::DeleteElement { id: id.clone() });
            cmds.push(bcad_state::Command::ClearSelection);
        }
        return cmds;
    }

    // --- Single-key tool shortcuts (no modifier) ---
    let maybe_tool = match key {
        Key::Character(c) => match c.as_str() {
            "h" | "H" => Some(ToolId::Foundation),
            "p" | "P" => Some(ToolId::Parking),
            "w" | "W" => Some(ToolId::Wall),
            "d" | "D" => Some(ToolId::Door),
            "n" | "N" => Some(ToolId::Window),
            "f" | "F" => Some(ToolId::Floor),
            "s" | "S" => Some(ToolId::Stair),
            "c" | "C" => Some(ToolId::Column),
            "b" | "B" => Some(ToolId::Beam),
            "o" | "O" => Some(ToolId::Roof),
            "a" | "A" => Some(ToolId::Dimension),
            "t" | "T" => Some(ToolId::Text),
            "k" | "K" => Some(ToolId::Sketch),
            "i" | "I" => Some(ToolId::Furniture),
            "u" | "U" => Some(ToolId::Plumbing),
            "e" | "E" => Some(ToolId::Electrical),
            "j" | "J" => Some(ToolId::Cabinet),
            "v" | "V" => Some(ToolId::Hvac),
            "g" | "G" => Some(ToolId::FireSafety),
            "y" | "Y" => Some(ToolId::Accessibility),
            "m" | "M" => Some(ToolId::Measure),
            "-" => Some(ToolId::Section),
            _ => None,
        },
        _ => None,
    };

    if let Some(tool) = maybe_tool {
        tm.set_active_tool(tool);
    }

    cmds
}
