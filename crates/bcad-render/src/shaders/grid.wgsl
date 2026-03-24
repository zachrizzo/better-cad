// Infinite grid shader for BetterCAD.
//
// Renders an infinite grid on the XZ plane at a configurable Y elevation.
// Uses a fullscreen quad approach: each fragment ray-marches to find the
// XZ plane intersection and computes grid lines via fwidth/smoothstep.
//
// Themed colors are passed as uniforms so the grid adapts to light/dark themes.

struct GridUniforms {
    view_proj: mat4x4<f32>,
    inv_view_proj: mat4x4<f32>,
    camera_position: vec3<f32>,
    grid_elevation: f32,
    cell_size: f32,
    section_size: f32,
    cell_color: vec4<f32>,
    section_color: vec4<f32>,
    fade_distance: f32,
    fade_strength: f32,
    cell_thickness: f32,
    section_thickness: f32,
};
@group(0) @binding(0) var<uniform> grid: GridUniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) near_point: vec3<f32>,
    @location(1) far_point: vec3<f32>,
};

// Fullscreen quad: 6 vertices forming 2 triangles covering [-1, 1] NDC.
@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    let positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0),
    );
    let pos = positions[idx];

    // Unproject near and far plane points to world space using inverse VP.
    let near_h = grid.inv_view_proj * vec4<f32>(pos, 0.0, 1.0);
    let far_h = grid.inv_view_proj * vec4<f32>(pos, 1.0, 1.0);

    var out: VertexOutput;
    out.clip_position = vec4<f32>(pos, 0.0, 1.0);
    out.near_point = near_h.xyz / near_h.w;
    out.far_point = far_h.xyz / far_h.w;
    return out;
}

// Compute grid line intensity for a given world-space coordinate.
fn grid_line(coord: f32, size: f32, thickness: f32) -> f32 {
    let grid_coord = coord / size;
    let derivative = fwidth(grid_coord);
    let grid_val = abs(fract(grid_coord - 0.5) - 0.5);
    return 1.0 - smoothstep(0.0, derivative * thickness, grid_val);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Ray-plane intersection: find t where ray hits Y = grid_elevation.
    let ray_dir = in.far_point - in.near_point;
    let denom = ray_dir.y;

    // Avoid division by zero when ray is parallel to the grid plane.
    if abs(denom) < 1e-6 {
        discard;
    }

    let t = (grid.grid_elevation - in.near_point.y) / denom;

    // Only render if intersection is between near and far planes.
    if t < 0.0 || t > 1.0 {
        discard;
    }

    let world_pos = in.near_point + t * ray_dir;

    // --- Distance fade ---
    let dist = length(world_pos.xz - grid.camera_position.xz);
    let fade = 1.0 - clamp(dist / grid.fade_distance, 0.0, 1.0);
    let fade_alpha = pow(fade, grid.fade_strength);

    if fade_alpha < 0.001 {
        discard;
    }

    // --- Grid lines ---
    // Cell grid (fine)
    let cell_x = grid_line(world_pos.x, grid.cell_size, grid.cell_thickness);
    let cell_z = grid_line(world_pos.z, grid.cell_size, grid.cell_thickness);
    let cell_intensity = max(cell_x, cell_z);

    // Section grid (coarse, every N cells)
    let section_x = grid_line(world_pos.x, grid.section_size, grid.section_thickness);
    let section_z = grid_line(world_pos.z, grid.section_size, grid.section_thickness);
    let section_intensity = max(section_x, section_z);

    // Blend: section lines override cell lines where present.
    var color = grid.cell_color.rgb * cell_intensity;
    var alpha = grid.cell_color.a * cell_intensity;

    // Section lines are drawn on top.
    let section_alpha = grid.section_color.a * section_intensity;
    color = mix(color, grid.section_color.rgb, section_intensity);
    alpha = max(alpha, section_alpha);

    // Apply distance fade.
    alpha = alpha * fade_alpha;

    if alpha < 0.001 {
        discard;
    }

    // --- Depth ---
    // Write correct depth so grid interacts properly with 3D geometry.
    // The clip-space Z is computed from the actual world position.
    // (Note: @builtin(frag_depth) would be needed for depth write, but
    // we rely on the clip_position depth interpolation for now.)

    return vec4<f32>(color, alpha);
}
