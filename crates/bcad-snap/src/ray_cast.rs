//! Coordinate projection and ray-casting utilities.
//!
//! These functions project screen coordinates into plan-space (the 2-D
//! horizontal plane used by the snap engine). Both perspective and
//! orthographic projections are supported.

/// Compute the intersection of a ray with a horizontal plane at `plane_y`.
///
/// The plane is defined as Y = `plane_y` in 3-D space (BetterCAD uses Y-up).
/// Returns the XZ coordinates of the hit point, or `None` if the ray is
/// parallel to the plane (direction Y component is essentially zero).
///
/// # Parameters
/// - `ray_origin`: the 3-D origin of the ray (e.g. camera position).
/// - `ray_dir`: the 3-D direction of the ray (does not need to be normalized).
/// - `plane_y`: the Y height of the horizontal plane.
pub fn ray_plane_intersection(
    ray_origin: [f64; 3],
    ray_dir: [f64; 3],
    plane_y: f64,
) -> Option<[f64; 2]> {
    // The plane normal is (0, 1, 0). The ray-plane intersection parameter is:
    //   t = (plane_y - origin.y) / dir.y
    if ray_dir[1].abs() < 1e-12 {
        return None; // ray is parallel to the plane
    }

    let t = (plane_y - ray_origin[1]) / ray_dir[1];
    if t < 0.0 {
        return None; // intersection is behind the ray origin
    }

    let x = ray_origin[0] + t * ray_dir[0];
    let z = ray_origin[2] + t * ray_dir[2];
    Some([x, z])
}

/// Convert screen coordinates to plan-space using a perspective camera.
///
/// This is a simplified perspective un-projection that casts a ray from the
/// camera through a point on the near plane, then intersects it with the
/// Y=0 plane (or a specified `plane_y`).
///
/// # Parameters
/// - `screen_pos`: pixel coordinates `[x, y]`, origin at top-left.
/// - `viewport_size`: `[width, height]` of the viewport in pixels.
/// - `camera_pos`: 3-D position of the camera.
/// - `camera_target`: 3-D point the camera is looking at.
/// - `fov`: vertical field of view in **radians**.
///
/// Returns the XZ plan-space position (Y = 0 plane), or `None` if the ray
/// is nearly parallel to the ground plane.
pub fn screen_to_plan(
    screen_pos: [f64; 2],
    viewport_size: [f64; 2],
    camera_pos: [f64; 3],
    camera_target: [f64; 3],
    fov: f64,
) -> Option<[f64; 2]> {
    let aspect = viewport_size[0] / viewport_size[1];
    let half_h = (fov * 0.5).tan();
    let half_w = half_h * aspect;

    // Normalized device coordinates [-1, 1]
    let ndc_x = (2.0 * screen_pos[0] / viewport_size[0]) - 1.0;
    let ndc_y = 1.0 - (2.0 * screen_pos[1] / viewport_size[1]); // flip Y

    // Camera basis vectors
    let forward = normalize_3([
        camera_target[0] - camera_pos[0],
        camera_target[1] - camera_pos[1],
        camera_target[2] - camera_pos[2],
    ]);
    let world_up = [0.0, 1.0, 0.0];
    let right = normalize_3(cross(forward, world_up));
    let up = cross(right, forward);

    // Ray direction in world space
    let ray_dir = [
        forward[0] + ndc_x * half_w * right[0] + ndc_y * half_h * up[0],
        forward[1] + ndc_x * half_w * right[1] + ndc_y * half_h * up[1],
        forward[2] + ndc_x * half_w * right[2] + ndc_y * half_h * up[2],
    ];

    ray_plane_intersection(camera_pos, ray_dir, 0.0)
}

/// Convert screen coordinates to plan-space using an orthographic (2-D) camera.
///
/// # Parameters
/// - `screen_pos`: pixel coordinates `[x, y]`, origin at top-left.
/// - `viewport_rect`: `[x, y, width, height]` of the viewport on screen.
/// - `camera_center`: the plan-space position at the center of the viewport.
/// - `zoom`: zoom factor (pixels per plan-space unit).
///
/// Returns the plan-space `[x, y]` position.
pub fn screen_to_plan_ortho(
    screen_pos: [f64; 2],
    viewport_rect: [f64; 4],
    camera_center: [f64; 2],
    zoom: f64,
) -> [f64; 2] {
    let vp_x = viewport_rect[0];
    let vp_y = viewport_rect[1];
    let vp_w = viewport_rect[2];
    let vp_h = viewport_rect[3];

    let zoom = if zoom.abs() < 1e-12 { 1.0 } else { zoom };

    // Offset from viewport center in pixels
    let dx_px = screen_pos[0] - (vp_x + vp_w * 0.5);
    let dy_px = screen_pos[1] - (vp_y + vp_h * 0.5);

    // Convert to plan-space (Y is flipped: screen-down = plan-up may depend
    // on convention; here we keep it consistent with "screen Y down = plan Y up").
    [
        camera_center[0] + dx_px / zoom,
        camera_center[1] - dy_px / zoom,
    ]
}

// ---------------------------------------------------------------------------
// Vector math helpers (avoiding a glam dependency in this module)
// ---------------------------------------------------------------------------

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn normalize_3(v: [f64; 3]) -> [f64; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len < 1e-12 {
        return [0.0, 0.0, 0.0];
    }
    [v[0] / len, v[1] / len, v[2] / len]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ray_plane_basic_intersection() {
        // Ray from (0, 10, 0) pointing straight down
        let result = ray_plane_intersection([0.0, 10.0, 0.0], [0.0, -1.0, 0.0], 0.0);
        assert!(result.is_some());
        let pt = result.unwrap();
        assert!((pt[0] - 0.0).abs() < 1e-6);
        assert!((pt[1] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_ray_plane_angled() {
        // Ray from (0, 10, 0) pointing diagonally
        let result = ray_plane_intersection([0.0, 10.0, 0.0], [1.0, -1.0, 2.0], 0.0);
        assert!(result.is_some());
        let pt = result.unwrap();
        // t = 10, so x = 10, z = 20
        assert!((pt[0] - 10.0).abs() < 1e-6);
        assert!((pt[1] - 20.0).abs() < 1e-6);
    }

    #[test]
    fn test_ray_plane_parallel() {
        // Ray parallel to the plane
        let result = ray_plane_intersection([0.0, 5.0, 0.0], [1.0, 0.0, 0.0], 0.0);
        assert!(result.is_none());
    }

    #[test]
    fn test_ray_plane_behind_origin() {
        // Ray pointing away from the plane (upward, plane below)
        let result = ray_plane_intersection([0.0, 5.0, 0.0], [0.0, 1.0, 0.0], 0.0);
        assert!(result.is_none());
    }

    #[test]
    fn test_ray_plane_at_custom_height() {
        let result = ray_plane_intersection([0.0, 10.0, 0.0], [0.0, -1.0, 0.0], 5.0);
        assert!(result.is_some());
        let pt = result.unwrap();
        assert!((pt[0] - 0.0).abs() < 1e-6);
        assert!((pt[1] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_screen_to_plan_ortho_center() {
        // Click at viewport center
        let result = screen_to_plan_ortho(
            [400.0, 300.0],           // screen pos
            [0.0, 0.0, 800.0, 600.0], // viewport rect
            [10.0, 20.0],             // camera center
            100.0,                    // zoom (100 pixels per unit)
        );
        assert!((result[0] - 10.0).abs() < 1e-6);
        assert!((result[1] - 20.0).abs() < 1e-6);
    }

    #[test]
    fn test_screen_to_plan_ortho_offset() {
        // Click 100 pixels right and 50 pixels down from center
        let result =
            screen_to_plan_ortho([500.0, 350.0], [0.0, 0.0, 800.0, 600.0], [0.0, 0.0], 100.0);
        assert!((result[0] - 1.0).abs() < 1e-6); // 100px / 100 = 1.0
        assert!((result[1] - -0.5).abs() < 1e-6); // -50px / 100 = -0.5 (Y flipped)
    }

    #[test]
    fn test_screen_to_plan_perspective() {
        // Camera above origin looking straight down
        let result = screen_to_plan(
            [400.0, 300.0],              // center of viewport
            [800.0, 600.0],              // viewport size
            [0.0, 10.0, 0.0],            // camera at Y=10
            [0.0, 0.0, 0.0],             // looking at origin
            std::f64::consts::FRAC_PI_4, // 45 degree FOV
        );
        assert!(result.is_some());
        let pt = result.unwrap();
        // Should be near (0, 0) since we're looking straight down at center
        assert!(pt[0].abs() < 0.1);
        assert!(pt[1].abs() < 0.1);
    }
}
