// PBR (Physically-Based Rendering) shader for BetterCAD mesh rendering.
//
// Simplified Cook-Torrance BRDF with:
// - Ambient light
// - One directional light (main)
// - One fill directional light
// - Hemisphere light (sky/ground blend by normal)
// - Emissive overlay for selection/hover highlighting
// - Alpha transparency for ghosted levels and glass materials

// ---- Bind Group 0: Camera (per-viewport, per-frame) ----
struct CameraUniforms {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    view_proj: mat4x4<f32>,
    view_pos: vec3<f32>,
    _pad: f32,
};
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

// ---- Bind Group 1: Lighting (per-frame) ----
struct LightingUniforms {
    ambient_color: vec3<f32>,
    ambient_intensity: f32,

    main_light_dir: vec3<f32>,
    main_light_intensity: f32,
    main_light_color: vec3<f32>,
    _pad1: f32,

    fill_light_dir: vec3<f32>,
    fill_light_intensity: f32,
    fill_light_color: vec3<f32>,
    _pad2: f32,

    hemi_sky_color: vec3<f32>,
    hemi_intensity: f32,
    hemi_ground_color: vec3<f32>,
    _pad3: f32,
};
@group(1) @binding(0) var<uniform> lighting: LightingUniforms;

// ---- Bind Group 2: Per-Object (dynamic offset) ----
struct ObjectUniforms {
    model_matrix: mat4x4<f32>,
    emissive_color: vec3<f32>,
    emissive_intensity: f32,
    opacity: f32,
    entity_id: u32,
    _pad: vec2<f32>,
};
@group(2) @binding(0) var<uniform> object: ObjectUniforms;

// ---- Bind Group 3: Material ----
struct MaterialUniforms {
    base_color: vec4<f32>,
    metallic: f32,
    roughness: f32,
    _pad: vec2<f32>,
};
@group(3) @binding(0) var<uniform> material: MaterialUniforms;

// ---- Vertex ----
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    let world_pos = (object.model_matrix * vec4<f32>(in.position, 1.0)).xyz;
    // Transform normal by the inverse-transpose of the upper 3x3 model matrix.
    // For uniform scaling this is equivalent to the model matrix upper 3x3.
    let normal_matrix = mat3x3<f32>(
        object.model_matrix[0].xyz,
        object.model_matrix[1].xyz,
        object.model_matrix[2].xyz,
    );
    let world_normal = normalize(normal_matrix * in.normal);

    var out: VertexOutput;
    out.clip_position = camera.view_proj * vec4<f32>(world_pos, 1.0);
    out.world_pos = world_pos;
    out.world_normal = world_normal;
    return out;
}

// ---- PBR Helpers ----

const PI: f32 = 3.14159265359;

// Fresnel-Schlick approximation
fn fresnel_schlick(cos_theta: f32, f0: vec3<f32>) -> vec3<f32> {
    return f0 + (1.0 - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

// GGX/Trowbridge-Reitz normal distribution
fn distribution_ggx(n_dot_h: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let denom = n_dot_h * n_dot_h * (a2 - 1.0) + 1.0;
    return a2 / (PI * denom * denom);
}

// Smith's Schlick-GGX geometry function
fn geometry_schlick_ggx(n_dot_v: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    return n_dot_v / (n_dot_v * (1.0 - k) + k);
}

// Smith's geometry function (combined view + light)
fn geometry_smith(n_dot_v: f32, n_dot_l: f32, roughness: f32) -> f32 {
    return geometry_schlick_ggx(n_dot_v, roughness) * geometry_schlick_ggx(n_dot_l, roughness);
}

// Compute Cook-Torrance BRDF contribution from a single directional light
fn cook_torrance_directional(
    light_dir: vec3<f32>,
    light_color: vec3<f32>,
    light_intensity: f32,
    normal: vec3<f32>,
    view_dir: vec3<f32>,
    albedo: vec3<f32>,
    metallic: f32,
    roughness: f32,
) -> vec3<f32> {
    let l = normalize(-light_dir); // light_dir points from light toward origin; flip for shading
    let h = normalize(view_dir + l);

    let n_dot_l = max(dot(normal, l), 0.0);
    let n_dot_v = max(dot(normal, view_dir), 0.001);
    let n_dot_h = max(dot(normal, h), 0.0);
    let v_dot_h = max(dot(view_dir, h), 0.0);

    // Fresnel: metallic surfaces reflect their base color, dielectrics reflect white
    let f0 = mix(vec3<f32>(0.04, 0.04, 0.04), albedo, metallic);
    let f = fresnel_schlick(v_dot_h, f0);

    // Normal distribution and geometry
    let d = distribution_ggx(n_dot_h, roughness);
    let g = geometry_smith(n_dot_v, n_dot_l, roughness);

    // Cook-Torrance specular BRDF
    let numerator = d * g * f;
    let denominator = 4.0 * n_dot_v * n_dot_l + 0.0001;
    let specular = numerator / denominator;

    // Energy conservation: diffuse is reduced by specular reflectance
    let ks = f;
    let kd = (vec3<f32>(1.0, 1.0, 1.0) - ks) * (1.0 - metallic);

    // Lambertian diffuse
    let diffuse = kd * albedo / PI;

    return (diffuse + specular) * light_color * light_intensity * n_dot_l;
}

// ---- Fragment ----

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let normal = normalize(in.world_normal);
    let view_dir = normalize(camera.view_pos - in.world_pos);

    let albedo = material.base_color.rgb;
    let metallic = material.metallic;
    let roughness = max(material.roughness, 0.04); // Prevent zero roughness artifacts

    // --- Ambient ---
    let ambient = lighting.ambient_color * lighting.ambient_intensity * albedo;

    // --- Main directional light (Cook-Torrance) ---
    let main_contrib = cook_torrance_directional(
        lighting.main_light_dir,
        lighting.main_light_color,
        lighting.main_light_intensity,
        normal,
        view_dir,
        albedo,
        metallic,
        roughness,
    );

    // --- Fill directional light (simplified diffuse + specular) ---
    let fill_contrib = cook_torrance_directional(
        lighting.fill_light_dir,
        lighting.fill_light_color,
        lighting.fill_light_intensity,
        normal,
        view_dir,
        albedo,
        metallic,
        roughness,
    );

    // --- Hemisphere light ---
    // Blend between sky and ground color based on the normal's Y component.
    let hemi_factor = dot(normal, vec3<f32>(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    let hemi_color = mix(lighting.hemi_ground_color, lighting.hemi_sky_color, hemi_factor);
    let hemi_contrib = hemi_color * lighting.hemi_intensity * albedo;

    // --- Combine lighting ---
    var color = ambient + main_contrib + fill_contrib + hemi_contrib;

    // --- Emissive overlay (selection / hover highlight) ---
    color = color + object.emissive_color * object.emissive_intensity;

    // --- Final alpha ---
    let alpha = material.base_color.a * object.opacity;

    return vec4<f32>(color, alpha);
}
