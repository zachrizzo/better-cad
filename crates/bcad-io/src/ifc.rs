//! IFC (Industry Foundation Classes) import/export.
//!
//! Exports BetterCAD elements to IFC 2x3 SPF (STEP Physical File) format.
//! This is a text-based format that can be read by Revit, ArchiCAD, etc.

use bcad_domain::Element;

pub fn import_ifc(_data: &[u8]) -> Result<(), crate::IoError> {
    Err(crate::IoError::FormatError(
        "IFC import not yet implemented".into(),
    ))
}

/// Export BetterCAD elements to IFC 2x3 SPF format.
pub fn export_ifc(elements: &[Element]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut w = IfcWriter::new();
    w.write_project(elements);
    Ok(w.finish().into_bytes())
}

// ---------------------------------------------------------------------------
// IFC GlobalId generation
// ---------------------------------------------------------------------------

/// IFC uses a 22-character base64 encoding of a 128-bit GUID.
/// Characters: 0-9, A-Z, a-z, underscore, dollar sign (64 chars).
fn ifc_guid_from_bytes(bytes: &[u8; 16]) -> String {
    const CHARS: &[u8; 64] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

    // Convert 16 bytes (128 bits) into 22 base-64 characters.
    // Process 3 bytes at a time into 4 chars (with the last group handling 1 byte -> 2 chars).
    let mut result = String::with_capacity(22);
    let mut num: u128 = 0;
    for &b in bytes {
        num = (num << 8) | b as u128;
    }

    // 128 bits -> 22 base-64 digits (22 * 6 = 132 bits, so first digit has reduced range)
    for i in (0..22).rev() {
        let shift = i * 6;
        let idx = ((num >> shift) & 0x3F) as usize;
        result.push(CHARS[idx] as char);
    }

    result
}

/// Generate a deterministic IFC GUID from a seed string (element id + salt).
fn make_ifc_guid(seed: &str) -> String {
    // Simple hash-based GUID: use a basic hash to produce 16 bytes
    let mut hash: [u8; 16] = [0u8; 16];
    let seed_bytes = seed.as_bytes();
    // FNV-like mixing for each byte position
    for (i, slot) in hash.iter_mut().enumerate() {
        let mut h: u64 = 0xcbf29ce484222325_u64;
        h = h.wrapping_mul(0x100000001b3).wrapping_add(i as u64);
        for &b in seed_bytes {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        *slot = (h & 0xFF) as u8;
    }
    ifc_guid_from_bytes(&hash)
}

// ---------------------------------------------------------------------------
// Sequential ID allocator and IFC writer
// ---------------------------------------------------------------------------

struct IfcWriter {
    next_id: u32,
    lines: Vec<String>,
}

impl IfcWriter {
    fn new() -> Self {
        Self {
            next_id: 1,
            lines: Vec::new(),
        }
    }

    fn alloc(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    fn emit(&mut self, id: u32, line: String) {
        self.lines.push(format!("#{}={};", id, line));
    }

    fn write_project(&mut self, elements: &[Element]) {
        // --- Shared infrastructure entities ---

        // #1 IFCPERSON
        let person = self.alloc();
        self.emit(person, "IFCPERSON($,$,'',$,$,$,$,$)".into());

        // #2 IFCORGANIZATION
        let org = self.alloc();
        self.emit(org, "IFCORGANIZATION($,'BetterCAD',$,$,$)".into());

        // #3 IFCPERSONANDORGANIZATION
        let person_org = self.alloc();
        self.emit(
            person_org,
            format!("IFCPERSONANDORGANIZATION(#{},#{},$)", person, org),
        );

        // #4 IFCAPPLICATION
        let app = self.alloc();
        self.emit(
            app,
            format!(
                "IFCAPPLICATION(#{},'0.1','BetterCAD','BetterCAD')",
                org
            ),
        );

        // #5 IFCOWNERHISTORY
        let owner_history = self.alloc();
        self.emit(
            owner_history,
            format!(
                "IFCOWNERHISTORY(#{},#{},$,.NOCHANGE.,$,$,$,0)",
                person_org, app
            ),
        );

        // --- Units ---
        // #6 IFCSIUNIT (length = metre)
        let unit_length = self.alloc();
        self.emit(unit_length, "IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)".into());

        // #7 IFCSIUNIT (area = square metre)
        let unit_area = self.alloc();
        self.emit(unit_area, "IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)".into());

        // #8 IFCSIUNIT (volume = cubic metre)
        let unit_volume = self.alloc();
        self.emit(
            unit_volume,
            "IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)".into(),
        );

        // #9 IFCSIUNIT (angle = radian)
        let unit_angle = self.alloc();
        self.emit(
            unit_angle,
            "IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)".into(),
        );

        // #10 IFCUNITASSIGNMENT
        let units = self.alloc();
        self.emit(
            units,
            format!(
                "IFCUNITASSIGNMENT((#{},#{},#{},#{}))",
                unit_length, unit_area, unit_volume, unit_angle
            ),
        );

        // --- Geometric representation context ---
        // World coordinate system origin
        let origin_3d = self.write_cartesian_point_3d(0.0, 0.0, 0.0);
        let dir_z = self.write_direction_3d(0.0, 0.0, 1.0);
        let dir_x = self.write_direction_3d(1.0, 0.0, 0.0);
        let world_coord = self.alloc();
        self.emit(
            world_coord,
            format!(
                "IFCAXIS2PLACEMENT3D(#{},#{},#{})",
                origin_3d, dir_z, dir_x
            ),
        );

        let dim_count = self.alloc();
        self.emit(dim_count, "IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0)".into());

        // Geometric representation context
        let geom_ctx = self.alloc();
        self.emit(
            geom_ctx,
            format!(
                "IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#{},$)",
                world_coord
            ),
        );

        // Sub context for Body
        let body_ctx = self.alloc();
        self.emit(
            body_ctx,
            format!(
                "IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#{},$,.MODEL_VIEW.,$)",
                geom_ctx
            ),
        );

        // --- Project ---
        let project_guid = make_ifc_guid("project_root");
        let project = self.alloc();
        self.emit(
            project,
            format!(
                "IFCPROJECT('{}',#{},'BetterCAD Project',$,$,$,$,(#{}),#{})",
                project_guid, owner_history, geom_ctx, units
            ),
        );

        // --- Site ---
        let site_guid = make_ifc_guid("site_default");
        let site_placement = self.write_local_placement(None, 0.0, 0.0, 0.0);
        let site = self.alloc();
        self.emit(
            site,
            format!(
                "IFCSITE('{}',#{},'Default Site',$,$,#{},$,$,.ELEMENT.,$,$,$,$,$)",
                site_guid, owner_history, site_placement
            ),
        );

        // --- Building ---
        let bldg_guid = make_ifc_guid("building_default");
        let bldg_placement = self.write_local_placement(Some(site_placement), 0.0, 0.0, 0.0);
        let building = self.alloc();
        self.emit(
            building,
            format!(
                "IFCBUILDING('{}',#{},'Default Building',$,$,#{},$,$,.ELEMENT.,$,$,$)",
                bldg_guid, owner_history, bldg_placement
            ),
        );

        // --- Building Storey ---
        let storey_guid = make_ifc_guid("storey_default");
        let storey_placement = self.write_local_placement(Some(bldg_placement), 0.0, 0.0, 0.0);
        let storey = self.alloc();
        self.emit(
            storey,
            format!(
                "IFCBUILDINGSTOREY('{}',#{},'Level 1',$,$,#{},$,$,.ELEMENT.,0.0)",
                storey_guid, owner_history, storey_placement
            ),
        );

        // --- Spatial containment hierarchy ---
        // Site in Project
        let rel_site = self.alloc();
        self.emit(
            rel_site,
            format!(
                "IFCRELAGGREGATES('{}',#{},$,$,#{},(#{}))",
                make_ifc_guid("rel_site_in_project"),
                owner_history,
                project,
                site
            ),
        );

        // Building in Site
        let rel_bldg = self.alloc();
        self.emit(
            rel_bldg,
            format!(
                "IFCRELAGGREGATES('{}',#{},$,$,#{},(#{}))",
                make_ifc_guid("rel_bldg_in_site"),
                owner_history,
                site,
                building
            ),
        );

        // Storey in Building
        let rel_storey = self.alloc();
        self.emit(
            rel_storey,
            format!(
                "IFCRELAGGREGATES('{}',#{},$,$,#{},(#{}))",
                make_ifc_guid("rel_storey_in_bldg"),
                owner_history,
                building,
                storey
            ),
        );

        // --- Write building elements ---
        let mut storey_elements: Vec<u32> = Vec::new();

        for element in elements {
            match element {
                Element::Wall(wall) => {
                    let id = self.write_wall(
                        wall,
                        owner_history,
                        storey_placement,
                        body_ctx,
                    );
                    storey_elements.push(id);
                }
                Element::Door(door) => {
                    let id = self.write_door(door, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                Element::Window(window) => {
                    let id =
                        self.write_window(window, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                Element::Floor(floor) => {
                    let id = self.write_floor(floor, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                Element::Roof(roof) => {
                    let id = self.write_roof(roof, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                Element::Column(col) => {
                    let id =
                        self.write_column(col, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                Element::Beam(beam) => {
                    let id = self.write_beam(beam, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                Element::Stair(stair) => {
                    let id =
                        self.write_stair(stair, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                Element::Room(room) => {
                    let id = self.write_space(room, owner_history, storey_placement, body_ctx);
                    storey_elements.push(id);
                }
                // Non-geometric elements (Level, Grid, Material, etc.) are skipped
                _ => {}
            }
        }

        // Containment: elements in storey
        if !storey_elements.is_empty() {
            let element_refs: Vec<String> =
                storey_elements.iter().map(|id| format!("#{}", id)).collect();
            let rel_contains = self.alloc();
            self.emit(
                rel_contains,
                format!(
                    "IFCRELCONTAINEDINSPATIALSTRUCTURE('{}',#{},$,$,({}),#{})",
                    make_ifc_guid("rel_contains_storey"),
                    owner_history,
                    element_refs.join(","),
                    storey
                ),
            );
        }
    }

    // --- Geometry helpers ---

    fn write_cartesian_point_3d(&mut self, x: f64, y: f64, z: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCCARTESIANPOINT(({},{},{}))", x, y, z));
        id
    }

    fn write_cartesian_point_2d(&mut self, x: f64, y: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCCARTESIANPOINT(({},{}))", x, y));
        id
    }

    fn write_direction_3d(&mut self, x: f64, y: f64, z: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCDIRECTION(({},{},{}))", x, y, z));
        id
    }

    fn write_direction_2d(&mut self, x: f64, y: f64) -> u32 {
        let id = self.alloc();
        self.emit(id, format!("IFCDIRECTION(({},{}))", x, y));
        id
    }

    fn write_local_placement(
        &mut self,
        relative_to: Option<u32>,
        x: f64,
        y: f64,
        z: f64,
    ) -> u32 {
        let origin = self.write_cartesian_point_3d(x, y, z);
        let dir_z = self.write_direction_3d(0.0, 0.0, 1.0);
        let dir_x = self.write_direction_3d(1.0, 0.0, 0.0);
        let axis = self.alloc();
        self.emit(
            axis,
            format!("IFCAXIS2PLACEMENT3D(#{},#{},#{})", origin, dir_z, dir_x),
        );

        let placement = self.alloc();
        match relative_to {
            Some(parent) => self.emit(
                placement,
                format!("IFCLOCALPLACEMENT(#{},#{})", parent, axis),
            ),
            None => self.emit(
                placement,
                format!("IFCLOCALPLACEMENT($,#{})", axis),
            ),
        }
        placement
    }

    fn write_local_placement_with_dir(
        &mut self,
        relative_to: Option<u32>,
        x: f64,
        y: f64,
        z: f64,
        axis_dx: f64,
        axis_dy: f64,
        axis_dz: f64,
        ref_dx: f64,
        ref_dy: f64,
        ref_dz: f64,
    ) -> u32 {
        let origin = self.write_cartesian_point_3d(x, y, z);
        let dir_z = self.write_direction_3d(axis_dx, axis_dy, axis_dz);
        let dir_x = self.write_direction_3d(ref_dx, ref_dy, ref_dz);
        let axis = self.alloc();
        self.emit(
            axis,
            format!("IFCAXIS2PLACEMENT3D(#{},#{},#{})", origin, dir_z, dir_x),
        );

        let placement = self.alloc();
        match relative_to {
            Some(parent) => self.emit(
                placement,
                format!("IFCLOCALPLACEMENT(#{},#{})", parent, axis),
            ),
            None => self.emit(
                placement,
                format!("IFCLOCALPLACEMENT($,#{})", axis),
            ),
        }
        placement
    }

    /// Write a rectangular profile and return its ID.
    fn write_rectangle_profile(&mut self, x_dim: f64, y_dim: f64) -> u32 {
        let center = self.write_cartesian_point_2d(0.0, 0.0);
        let dir = self.write_direction_2d(1.0, 0.0);
        let axis2d = self.alloc();
        self.emit(
            axis2d,
            format!("IFCAXIS2PLACEMENT2D(#{},#{})", center, dir),
        );

        let profile = self.alloc();
        self.emit(
            profile,
            format!(
                "IFCRECTANGLEPROFILEDEF(.AREA.,$,#{},{},{})",
                axis2d, x_dim, y_dim
            ),
        );
        profile
    }

    /// Write an arbitrary closed polyline profile from 2D points.
    fn write_arbitrary_profile(&mut self, points: &[[f64; 2]]) -> u32 {
        // Build polyline (closed: repeat first point at end)
        let mut point_ids: Vec<u32> = Vec::new();
        for p in points {
            point_ids.push(self.write_cartesian_point_2d(p[0], p[1]));
        }
        // Close the loop
        if let Some(&first) = points.first() {
            point_ids.push(self.write_cartesian_point_2d(first[0], first[1]));
        }

        let refs: Vec<String> = point_ids.iter().map(|id| format!("#{}", id)).collect();
        let polyline = self.alloc();
        self.emit(
            polyline,
            format!("IFCPOLYLINE(({}))", refs.join(",")),
        );

        let profile = self.alloc();
        self.emit(
            profile,
            format!("IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#{})", polyline),
        );
        profile
    }

    /// Create an extruded area solid from a profile, extruding along Z by depth.
    fn write_extruded_area_solid(
        &mut self,
        profile: u32,
        depth: f64,
    ) -> u32 {
        let origin = self.write_cartesian_point_3d(0.0, 0.0, 0.0);
        let dir_z = self.write_direction_3d(0.0, 0.0, 1.0);
        let dir_x = self.write_direction_3d(1.0, 0.0, 0.0);
        let position = self.alloc();
        self.emit(
            position,
            format!("IFCAXIS2PLACEMENT3D(#{},#{},#{})", origin, dir_z, dir_x),
        );

        let extrude_dir = self.write_direction_3d(0.0, 0.0, 1.0);

        let solid = self.alloc();
        self.emit(
            solid,
            format!(
                "IFCEXTRUDEDAREASOLID(#{},#{},#{},{})",
                profile, position, extrude_dir, depth
            ),
        );
        solid
    }

    /// Wrap a solid into a shape representation and product definition shape.
    fn write_body_shape(&mut self, solid: u32, body_ctx: u32) -> u32 {
        let shape_rep = self.alloc();
        self.emit(
            shape_rep,
            format!(
                "IFCSHAPEREPRESENTATION(#{},'Body','SweptSolid',(#{}))",
                body_ctx, solid
            ),
        );

        let prod_shape = self.alloc();
        self.emit(
            prod_shape,
            format!("IFCPRODUCTDEFINITIONSHAPE($,$,(#{}))", shape_rep),
        );
        prod_shape
    }

    // --- Building element writers ---

    fn write_wall(
        &mut self,
        wall: &bcad_domain::WallElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let dx = wall.end[0] - wall.start[0];
        let dy = wall.end[1] - wall.start[1];
        let length = (dx * dx + dy * dy).sqrt();

        // Wall direction
        let (dir_x, dir_y) = if length > 1e-9 {
            (dx / length, dy / length)
        } else {
            (1.0, 0.0)
        };

        let placement = self.write_local_placement_with_dir(
            Some(storey_placement),
            wall.start[0],
            wall.start[1],
            0.0,
            0.0, 0.0, 1.0,       // axis (Z-up)
            dir_x, dir_y, 0.0,    // ref direction (along wall)
        );

        // Profile: rectangle (length x thickness), extruded by height
        let profile = self.write_rectangle_profile(length, wall.thickness);
        let solid = self.write_extruded_area_solid(profile, wall.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("wall_{}", wall.meta.id));
        let wall_id = self.alloc();
        self.emit(
            wall_id,
            format!(
                "IFCWALLSTANDARDCASE('{}',#{},'{}','Wall',$,#{},#{},$)",
                guid,
                owner_history,
                wall.meta.name,
                placement,
                shape
            ),
        );

        // Property set with dimensions
        self.write_quantity_set(
            &wall.meta.id,
            owner_history,
            wall_id,
            "Wall",
            &[
                ("Length", length),
                ("Height", wall.height),
                ("Thickness", wall.thickness),
            ],
        );

        wall_id
    }

    fn write_door(
        &mut self,
        door: &bcad_domain::DoorElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement =
            self.write_local_placement(Some(storey_placement), 0.0, 0.0, door.sill_height);

        // Simple rectangular profile for the door leaf
        let profile = self.write_rectangle_profile(door.width, 0.05);
        let solid = self.write_extruded_area_solid(profile, door.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("door_{}", door.meta.id));
        let door_id = self.alloc();
        self.emit(
            door_id,
            format!(
                "IFCDOOR('{}',#{},'{}','Door',$,#{},#{},$,{},{})",
                guid,
                owner_history,
                door.meta.name,
                placement,
                shape,
                door.height,
                door.width
            ),
        );

        door_id
    }

    fn write_window(
        &mut self,
        window: &bcad_domain::WindowElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement =
            self.write_local_placement(Some(storey_placement), 0.0, 0.0, window.sill_height);

        let profile = self.write_rectangle_profile(window.width, 0.05);
        let solid = self.write_extruded_area_solid(profile, window.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("window_{}", window.meta.id));
        let win_id = self.alloc();
        self.emit(
            win_id,
            format!(
                "IFCWINDOW('{}',#{},'{}','Window',$,#{},#{},$,{},{})",
                guid,
                owner_history,
                window.meta.name,
                placement,
                shape,
                window.height,
                window.width
            ),
        );

        win_id
    }

    fn write_floor(
        &mut self,
        floor: &bcad_domain::FloorElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), 0.0, 0.0, 0.0);

        let profile = self.write_arbitrary_profile(&floor.boundary);
        let solid = self.write_extruded_area_solid(profile, floor.thickness);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("floor_{}", floor.meta.id));
        let slab_id = self.alloc();
        self.emit(
            slab_id,
            format!(
                "IFCSLAB('{}',#{},'{}','Floor slab',$,#{},#{},$,.FLOOR.)",
                guid,
                owner_history,
                floor.meta.name,
                placement,
                shape
            ),
        );

        slab_id
    }

    fn write_roof(
        &mut self,
        roof: &bcad_domain::RoofElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), 0.0, 0.0, 0.0);

        let profile = self.write_arbitrary_profile(&roof.boundary);
        let solid = self.write_extruded_area_solid(profile, roof.thickness);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("roof_{}", roof.meta.id));
        let roof_id = self.alloc();
        self.emit(
            roof_id,
            format!(
                "IFCROOF('{}',#{},'{}','Roof',$,#{},#{},$,.FLAT_ROOF.)",
                guid,
                owner_history,
                roof.meta.name,
                placement,
                shape
            ),
        );

        roof_id
    }

    fn write_column(
        &mut self,
        col: &bcad_domain::ColumnElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(
            Some(storey_placement),
            col.center[0],
            col.center[1],
            0.0,
        );

        let profile = self.write_rectangle_profile(col.width, col.depth);
        let solid = self.write_extruded_area_solid(profile, col.height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("column_{}", col.meta.id));
        let col_id = self.alloc();
        self.emit(
            col_id,
            format!(
                "IFCCOLUMN('{}',#{},'{}','Column',$,#{},#{},$)",
                guid, owner_history, col.meta.name, placement, shape
            ),
        );

        col_id
    }

    fn write_beam(
        &mut self,
        beam: &bcad_domain::BeamElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let dx = beam.end[0] - beam.start[0];
        let dy = beam.end[1] - beam.start[1];
        let dz = beam.end[2] - beam.start[2];
        let length = (dx * dx + dy * dy + dz * dz).sqrt();

        let (ref_dx, ref_dy, ref_dz) = if length > 1e-9 {
            (dx / length, dy / length, dz / length)
        } else {
            (1.0, 0.0, 0.0)
        };

        // Beam axis is along the beam direction, extrusion also along that
        let placement = self.write_local_placement_with_dir(
            Some(storey_placement),
            beam.start[0],
            beam.start[1],
            beam.start[2],
            ref_dx, ref_dy, ref_dz, // axis along beam
            0.0, 0.0, 1.0,          // ref direction
        );

        let profile = self.write_rectangle_profile(beam.width, beam.depth);
        let solid = self.write_extruded_area_solid(profile, length);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("beam_{}", beam.meta.id));
        let beam_id = self.alloc();
        self.emit(
            beam_id,
            format!(
                "IFCBEAM('{}',#{},'{}','Beam',$,#{},#{},$)",
                guid, owner_history, beam.meta.name, placement, shape
            ),
        );

        beam_id
    }

    fn write_stair(
        &mut self,
        stair: &bcad_domain::StairElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(
            Some(storey_placement),
            stair.start[0],
            stair.start[1],
            0.0,
        );

        // Simplified: represent stair as a ramp solid (bounding box)
        let dx = stair.end[0] - stair.start[0];
        let dy = stair.end[1] - stair.start[1];
        let run = (dx * dx + dy * dy).sqrt();

        let profile = self.write_rectangle_profile(run, stair.width);
        let solid = self.write_extruded_area_solid(profile, stair.total_height);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("stair_{}", stair.meta.id));
        let stair_id = self.alloc();
        self.emit(
            stair_id,
            format!(
                "IFCSTAIR('{}',#{},'{}','Stair',$,#{},#{},$,.STRAIGHT_RUN_STAIR.)",
                guid, owner_history, stair.meta.name, placement, shape
            ),
        );

        stair_id
    }

    fn write_space(
        &mut self,
        room: &bcad_domain::RoomElement,
        owner_history: u32,
        storey_placement: u32,
        body_ctx: u32,
    ) -> u32 {
        let placement = self.write_local_placement(Some(storey_placement), 0.0, 0.0, 0.0);

        // Room as extruded space (default 3m height)
        let profile = self.write_arbitrary_profile(&room.boundary);
        let solid = self.write_extruded_area_solid(profile, 3.0);
        let shape = self.write_body_shape(solid, body_ctx);

        let guid = make_ifc_guid(&format!("space_{}", room.meta.id));
        let space_id = self.alloc();
        self.emit(
            space_id,
            format!(
                "IFCSPACE('{}',#{},'{}','Room',$,#{},#{},$,.ELEMENT.,.INTERNAL.,$)",
                guid, owner_history, room.meta.name, placement, shape
            ),
        );

        space_id
    }

    // --- Property sets ---

    fn write_quantity_set(
        &mut self,
        element_seed: &str,
        owner_history: u32,
        element_id: u32,
        category: &str,
        quantities: &[(&str, f64)],
    ) {
        let mut qty_ids: Vec<u32> = Vec::new();
        for (name, value) in quantities {
            let qty = self.alloc();
            self.emit(
                qty,
                format!("IFCQUANTITYLENGTH('{}','{} {}',$,{},$)", name, category, name, value),
            );
            qty_ids.push(qty);
        }

        let refs: Vec<String> = qty_ids.iter().map(|id| format!("#{}", id)).collect();
        let qset = self.alloc();
        self.emit(
            qset,
            format!(
                "IFCELEMENTQUANTITY('{}',#{},'BaseQuantities',$,$,({}))",
                make_ifc_guid(&format!("qset_{}", element_seed)),
                owner_history,
                refs.join(",")
            ),
        );

        let rel = self.alloc();
        self.emit(
            rel,
            format!(
                "IFCRELDEFINESBYPROPERTIES('{}',#{},$,$,(#{}),#{})",
                make_ifc_guid(&format!("relqset_{}", element_seed)),
                owner_history,
                element_id,
                qset
            ),
        );
    }

    // --- File assembly ---

    fn finish(self) -> String {
        let timestamp = "2026-01-01T00:00:00";
        let mut output = String::new();

        // Header
        output.push_str("ISO-10303-21;\n");
        output.push_str("HEADER;\n");
        output.push_str("FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');\n");
        output.push_str(&format!(
            "FILE_NAME('export.ifc','{}',(''),(''),'','BetterCAD 0.1','');\n",
            timestamp
        ));
        output.push_str("FILE_SCHEMA(('IFC2X3'));\n");
        output.push_str("ENDSEC;\n");
        output.push_str("DATA;\n");

        // Entity lines
        for line in &self.lines {
            output.push_str(line);
            output.push('\n');
        }

        output.push_str("ENDSEC;\n");
        output.push_str("END-ISO-10303-21;\n");

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::*;

    #[test]
    fn test_ifc_guid_length() {
        let guid = make_ifc_guid("test_seed");
        assert_eq!(guid.len(), 22);
        // Ensure all characters are valid IFC base64
        for ch in guid.chars() {
            assert!(
                ch.is_ascii_alphanumeric() || ch == '_' || ch == '$',
                "invalid char: {}",
                ch
            );
        }
    }

    #[test]
    fn test_ifc_guid_deterministic() {
        let a = make_ifc_guid("wall_abc");
        let b = make_ifc_guid("wall_abc");
        assert_eq!(a, b);
    }

    #[test]
    fn test_ifc_guid_unique() {
        let a = make_ifc_guid("wall_1");
        let b = make_ifc_guid("wall_2");
        assert_ne!(a, b);
    }

    #[test]
    fn test_export_empty_project() {
        let bytes = export_ifc(&[]).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.starts_with("ISO-10303-21;"));
        assert!(text.contains("IFCPROJECT"));
        assert!(text.contains("IFCSITE"));
        assert!(text.contains("IFCBUILDING"));
        assert!(text.contains("IFCBUILDINGSTOREY"));
        assert!(text.ends_with("END-ISO-10303-21;\n"));
    }

    #[test]
    fn test_export_wall() {
        let elements = vec![Element::Wall(WallElement {
            meta: ElementMeta::new("Test Wall"),
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
        })];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("IFCWALLSTANDARDCASE"));
        assert!(text.contains("IFCEXTRUDEDAREASOLID"));
        assert!(text.contains("IFCRECTANGLEPROFILEDEF"));
        assert!(text.contains("IFCRELCONTAINEDINSPATIALSTRUCTURE"));
    }

    #[test]
    fn test_export_multiple_elements() {
        let elements = vec![
            Element::Wall(WallElement {
                meta: ElementMeta::new("Wall 1"),
                start: [0.0, 0.0],
                end: [5.0, 0.0],
                height: 3.0,
                thickness: 0.2,
            }),
            Element::Floor(FloorElement {
                meta: ElementMeta::new("Floor 1"),
                boundary: vec![[0.0, 0.0], [5.0, 0.0], [5.0, 4.0], [0.0, 4.0]],
                thickness: 0.3,
            }),
            Element::Column(ColumnElement {
                meta: ElementMeta::new("Col 1"),
                center: [2.5, 2.0],
                width: 0.3,
                depth: 0.3,
                height: 3.0,
            }),
        ];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("IFCWALLSTANDARDCASE"));
        assert!(text.contains("IFCSLAB"));
        assert!(text.contains("IFCCOLUMN"));
    }

    #[test]
    fn test_export_door_and_window() {
        let elements = vec![
            Element::Door(DoorElement {
                meta: ElementMeta::new("Door 1"),
                wall_id: "w1".into(),
                position_along_wall: 1.0,
                width: 0.9,
                height: 2.1,
                sill_height: 0.0,
                swing: DoorSwing::Right,
            }),
            Element::Window(WindowElement {
                meta: ElementMeta::new("Window 1"),
                wall_id: "w1".into(),
                position_along_wall: 3.0,
                width: 1.2,
                height: 1.0,
                sill_height: 0.9,
            }),
        ];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("IFCDOOR"));
        assert!(text.contains("IFCWINDOW"));
    }

    #[test]
    fn test_export_stair_and_room() {
        let elements = vec![
            Element::Stair(StairElement {
                meta: ElementMeta::new("Stair 1"),
                start: [0.0, 0.0],
                end: [3.0, 0.0],
                width: 1.0,
                risers: 15,
                total_height: 3.0,
            }),
            Element::Room(RoomElement {
                meta: ElementMeta::new("Living Room"),
                boundary: vec![[0.0, 0.0], [5.0, 0.0], [5.0, 4.0], [0.0, 4.0]],
            }),
        ];

        let bytes = export_ifc(&elements).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("IFCSTAIR"));
        assert!(text.contains("IFCSPACE"));
    }

    #[test]
    fn test_ifc_file_structure() {
        let bytes = export_ifc(&[]).unwrap();
        let text = String::from_utf8(bytes).unwrap();

        // Check required sections
        assert!(text.contains("HEADER;"));
        assert!(text.contains("FILE_DESCRIPTION"));
        assert!(text.contains("FILE_NAME"));
        assert!(text.contains("FILE_SCHEMA(('IFC2X3'))"));
        assert!(text.contains("DATA;"));
        assert!(text.contains("ENDSEC;"));

        // Check spatial hierarchy
        assert!(text.contains("IFCRELAGGREGATES"));
    }
}
