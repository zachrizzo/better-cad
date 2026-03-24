//! Camera state and controllers for 3D orbit and 2D pan/zoom.

use glam::{Mat4, Vec2, Vec3};

/// Camera projection type.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Projection {
    /// Perspective projection with vertical FOV (radians), near, and far planes.
    Perspective { fov_y: f32, near: f32, far: f32 },
    /// Orthographic projection with zoom factor, near, and far planes.
    Orthographic { zoom: f32, near: f32, far: f32 },
}

/// Camera state used by both 3D orbit and 2D pan cameras.
#[derive(Debug, Clone)]
pub struct CameraState {
    /// Eye position in world space.
    pub position: Vec3,
    /// Look-at target in world space.
    pub target: Vec3,
    /// Up vector (Y-up convention).
    pub up: Vec3,
    /// Projection parameters.
    pub projection: Projection,
    /// Aspect ratio (width / height).
    pub aspect: f32,
    /// Orbit distance from target.
    pub distance: f32,
    /// Horizontal orbit angle in radians.
    pub azimuth: f32,
    /// Vertical orbit angle in radians.
    pub elevation: f32,
    /// 2D pan offset.
    pub pan_offset: Vec2,
    /// Orthographic zoom level.
    pub zoom_level: f32,
}

impl CameraState {
    /// Create the default 3D camera matching the existing Three.js setup:
    /// position [5,5,5], fov 50 degrees.
    pub fn default_3d() -> Self {
        Self {
            position: Vec3::new(5.0, 5.0, 5.0),
            target: Vec3::ZERO,
            up: Vec3::Y,
            projection: Projection::Perspective {
                fov_y: 50.0_f32.to_radians(),
                near: 0.1,
                far: 1000.0,
            },
            aspect: 1.0,
            distance: Vec3::new(5.0, 5.0, 5.0).length(),
            azimuth: std::f32::consts::FRAC_PI_4,
            elevation: (1.0_f32 / 2.0_f32.sqrt()).atan(),
            pan_offset: Vec2::ZERO,
            zoom_level: 1.0,
        }
    }

    /// Create the default 2D camera: orthographic, looking straight down the
    /// plan plane (XZ) with Y-up.
    pub fn default_2d() -> Self {
        Self {
            position: Vec3::new(0.0, -50.0, 0.0),
            target: Vec3::ZERO,
            // Keep +X to the right and +Z at the top of the screen so the
            // rendered 2D view matches the tool system's plan coordinates.
            up: Vec3::Z,
            projection: Projection::Orthographic {
                zoom: 40.0,
                near: 0.1,
                far: 1000.0,
            },
            aspect: 1.0,
            distance: 50.0,
            azimuth: 0.0,
            elevation: 0.0,
            pan_offset: Vec2::ZERO,
            zoom_level: 40.0,
        }
    }

    /// Compute the view (look-at) matrix.
    pub fn view_matrix(&self) -> Mat4 {
        Mat4::look_at_rh(self.position, self.target, self.up)
    }

    /// Compute the projection matrix.
    pub fn projection_matrix(&self) -> Mat4 {
        match self.projection {
            Projection::Perspective { fov_y, near, far } => {
                Mat4::perspective_rh(fov_y, self.aspect, near, far)
            }
            Projection::Orthographic { zoom, near, far } => {
                let half_w = zoom * self.aspect * 0.5;
                let half_h = zoom * 0.5;
                Mat4::orthographic_rh(-half_w, half_w, -half_h, half_h, near, far)
            }
        }
    }

    /// Compute the combined view-projection matrix.
    pub fn view_projection_matrix(&self) -> Mat4 {
        self.projection_matrix() * self.view_matrix()
    }

    /// Compute the inverse of the view-projection matrix.
    pub fn inverse_view_projection_matrix(&self) -> Mat4 {
        self.view_projection_matrix().inverse()
    }
}

/// Cast a ray from screen NDC coordinates through the camera and intersect it
/// with the horizontal plane at the given Y coordinate (Y-up convention).
///
/// `ndc_x` and `ndc_y` are in Normalized Device Coordinates: [-1, 1].
/// Returns the (X, Z) world-space coordinates of the intersection point,
/// or `None` if the ray is parallel to the plane.
pub fn ray_plane_intersection(
    camera: &CameraState,
    ndc_x: f32,
    ndc_y: f32,
    plane_y: f32,
) -> Option<[f32; 2]> {
    let inv_vp = camera.inverse_view_projection_matrix();

    // Unproject two points along the ray (near and far in NDC)
    let near_ndc = glam::Vec4::new(ndc_x, ndc_y, -1.0, 1.0);
    let far_ndc = glam::Vec4::new(ndc_x, ndc_y, 1.0, 1.0);

    let near_world = inv_vp * near_ndc;
    let far_world = inv_vp * far_ndc;

    if near_world.w.abs() < 1e-10 || far_world.w.abs() < 1e-10 {
        return None;
    }

    let near_pos = Vec3::new(
        near_world.x / near_world.w,
        near_world.y / near_world.w,
        near_world.z / near_world.w,
    );
    let far_pos = Vec3::new(
        far_world.x / far_world.w,
        far_world.y / far_world.w,
        far_world.z / far_world.w,
    );

    let ray_dir = far_pos - near_pos;

    // Intersect with Y = plane_y: near_pos.y + t * ray_dir.y = plane_y
    if ray_dir.y.abs() < 1e-10 {
        return None; // Ray is parallel to the plane
    }

    let t = (plane_y - near_pos.y) / ray_dir.y;
    let hit = near_pos + ray_dir * t;

    Some([hit.x, hit.z])
}

// ---------------------------------------------------------------------------
// Orbit controller (3D viewport)
// ---------------------------------------------------------------------------

/// Mouse button identifiers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Middle,
    Right,
}

/// Internal drag state for orbit controller.
enum OrbitDragState {
    Rotate {
        start_azimuth: f32,
        start_elevation: f32,
        start_mouse: Vec2,
    },
    Pan {
        start_target: Vec3,
        start_mouse: Vec2,
    },
}

/// Orbit controls for the 3D viewport (matching Three.js OrbitControls).
///
/// - Left drag: rotate (azimuth + elevation)
/// - Middle/right drag: pan (translate target)
/// - Scroll: dolly zoom (change distance)
pub struct OrbitController {
    pub enabled: bool,
    pub rotate_speed: f32,
    pub pan_speed: f32,
    pub zoom_speed: f32,
    pub min_distance: f32,
    pub max_distance: f32,
    pub min_elevation: f32,
    pub max_elevation: f32,
    drag_state: Option<OrbitDragState>,
}

impl Default for OrbitController {
    fn default() -> Self {
        Self {
            enabled: true,
            rotate_speed: 1.0,
            pan_speed: 1.0,
            zoom_speed: 1.0,
            min_distance: 0.1,
            max_distance: 500.0,
            min_elevation: -std::f32::consts::FRAC_PI_2 + 0.01,
            max_elevation: std::f32::consts::FRAC_PI_2 - 0.01,
            drag_state: None,
        }
    }
}

impl OrbitController {
    pub fn new() -> Self {
        Self::default()
    }

    /// Begin a drag interaction.
    pub fn handle_mouse_down(&mut self, button: MouseButton, pos: Vec2, camera: &CameraState) {
        if !self.enabled {
            return;
        }
        match button {
            MouseButton::Left => {
                self.drag_state = Some(OrbitDragState::Rotate {
                    start_azimuth: camera.azimuth,
                    start_elevation: camera.elevation,
                    start_mouse: pos,
                });
            }
            MouseButton::Middle | MouseButton::Right => {
                self.drag_state = Some(OrbitDragState::Pan {
                    start_target: camera.target,
                    start_mouse: pos,
                });
            }
        }
    }

    /// Update camera from mouse movement during a drag.
    pub fn handle_mouse_move(&mut self, pos: Vec2, camera: &mut CameraState) {
        if !self.enabled {
            return;
        }
        match &self.drag_state {
            Some(OrbitDragState::Rotate {
                start_azimuth,
                start_elevation,
                start_mouse,
            }) => {
                let delta = pos - *start_mouse;
                camera.azimuth = start_azimuth - delta.x * 0.01 * self.rotate_speed;
                camera.elevation = (start_elevation + delta.y * 0.01 * self.rotate_speed)
                    .clamp(self.min_elevation, self.max_elevation);
                self.update_camera_from_orbit(camera);
            }
            Some(OrbitDragState::Pan {
                start_target,
                start_mouse,
            }) => {
                let delta = pos - *start_mouse;
                let right = (camera.target - camera.position)
                    .cross(camera.up)
                    .normalize();
                let cam_up = right.cross(camera.target - camera.position).normalize();
                let pan_factor = camera.distance * 0.002 * self.pan_speed;
                camera.target =
                    *start_target - right * delta.x * pan_factor + cam_up * delta.y * pan_factor;
                self.update_camera_from_orbit(camera);
            }
            None => {}
        }
    }

    /// End the current drag interaction.
    pub fn handle_mouse_up(&mut self) {
        self.drag_state = None;
    }

    /// Handle scroll wheel for dolly zoom.
    pub fn handle_scroll(&mut self, delta: f32, camera: &mut CameraState) {
        if !self.enabled {
            return;
        }
        let factor = 1.0 - delta * 0.001 * self.zoom_speed;
        camera.distance = (camera.distance * factor).clamp(self.min_distance, self.max_distance);
        self.update_camera_from_orbit(camera);
    }

    /// Update camera position from spherical orbit parameters.
    pub fn update_camera_from_orbit(&self, camera: &mut CameraState) {
        let x = camera.distance * camera.elevation.cos() * camera.azimuth.sin();
        let y = camera.distance * camera.elevation.sin();
        let z = camera.distance * camera.elevation.cos() * camera.azimuth.cos();
        camera.position = camera.target + Vec3::new(x, y, z);
    }
}

// ---------------------------------------------------------------------------
// Map controller (2D viewport)
// ---------------------------------------------------------------------------

/// Internal drag state for map controller.
struct MapDragState {
    start_pan: Vec2,
    start_mouse: Vec2,
}

/// Map controls for the 2D viewport (pan + zoom only, no rotation).
///
/// Matches Three.js MapControls with `enableRotate = false`.
pub struct MapController {
    pub enabled: bool,
    pub pan_speed: f32,
    pub zoom_speed: f32,
    pub min_zoom: f32,
    pub max_zoom: f32,
    drag_state: Option<MapDragState>,
}

impl Default for MapController {
    fn default() -> Self {
        Self {
            enabled: true,
            pan_speed: 1.0,
            zoom_speed: 1.0,
            min_zoom: 1.0,
            max_zoom: 200.0,
            drag_state: None,
        }
    }
}

impl MapController {
    pub fn new() -> Self {
        Self::default()
    }

    /// Begin a pan drag (any mouse button).
    pub fn handle_mouse_down(&mut self, pos: Vec2, camera: &CameraState) {
        if !self.enabled {
            return;
        }
        self.drag_state = Some(MapDragState {
            start_pan: camera.pan_offset,
            start_mouse: pos,
        });
    }

    /// Update pan offset from mouse movement.
    pub fn handle_mouse_move(&mut self, pos: Vec2, camera: &mut CameraState) {
        if !self.enabled {
            return;
        }
        if let Some(ref state) = self.drag_state {
            let delta = pos - state.start_mouse;
            let pan_factor = camera.zoom_level * 0.002 * self.pan_speed;
            camera.pan_offset =
                state.start_pan + Vec2::new(-delta.x * pan_factor, delta.y * pan_factor);
            camera.target = Vec3::new(camera.pan_offset.x, 0.0, camera.pan_offset.y);
            camera.position = camera.target - Vec3::new(0.0, camera.distance, 0.0);
        }
    }

    /// End the current drag interaction.
    pub fn handle_mouse_up(&mut self) {
        self.drag_state = None;
    }

    /// Handle scroll wheel for zoom.
    pub fn handle_scroll(&mut self, delta: f32, camera: &mut CameraState) {
        if !self.enabled {
            return;
        }
        let factor = 1.0 - delta * 0.001 * self.zoom_speed;
        camera.zoom_level = (camera.zoom_level * factor).clamp(self.min_zoom, self.max_zoom);
        if let Projection::Orthographic { ref mut zoom, .. } = camera.projection {
            *zoom = camera.zoom_level;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_2d_camera_is_top_down_on_xz_plane() {
        let camera = CameraState::default_2d();

        assert_eq!(camera.position, Vec3::new(0.0, -50.0, 0.0));
        assert_eq!(camera.target, Vec3::ZERO);
        assert_eq!(camera.up, Vec3::Z);
    }

    #[test]
    fn map_pan_moves_top_down_camera_across_plan() {
        let mut camera = CameraState::default_2d();
        let mut controller = MapController::new();

        controller.handle_mouse_down(Vec2::ZERO, &camera);
        controller.handle_mouse_move(Vec2::new(10.0, -5.0), &mut camera);

        assert_eq!(camera.target.y, 0.0);
        assert!((camera.position.y + camera.distance).abs() < 1e-5);
        assert_eq!(camera.position.x, camera.target.x);
        assert_eq!(camera.position.z, camera.target.z);
    }
}
