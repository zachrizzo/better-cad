//! BetterCAD PDF export crate.
//!
//! Generates multi-sheet construction document PDFs from BetterCAD element
//! data using the `printpdf` crate. Supports floor plans, electrical plans,
//! plumbing plans, reflected ceiling plans, site plans, elevations placeholders,
//! and door/window/room schedule tables.
//!
//! # Usage
//!
//! ```rust,no_run
//! use bcad_pdf::{export_pdf, PdfExportOptions, PaperSize, SheetType, ProjectInfo};
//!
//! let elements = vec![]; // your bcad_domain::Element list
//! let options = PdfExportOptions {
//!     paper_size: PaperSize::ArchD,
//!     scale: "1:100".to_string(),
//!     sheets: vec![SheetType::FloorPlan, SheetType::Schedules],
//!     project_info: ProjectInfo {
//!         project_name: "Example Project".to_string(),
//!         ..Default::default()
//!     },
//!     show_title_block: true,
//! };
//! let pdf_bytes = export_pdf(&elements, &options);
//! std::fs::write("output.pdf", &pdf_bytes).unwrap();
//! ```

mod drawing_helpers;
pub mod pdf_export;
pub mod title_block;
pub mod types;

// Re-export the main public API at crate root for convenience.
pub use pdf_export::export_pdf;
pub use types::{
    generate_sheet_number, kind_to_layer, parse_scale, Lineweights, PaperSize, PdfExportOptions,
    ProjectInfo, RevisionEntry, SheetInfo, SheetType,
};

/// Coordinate transform helper: convert a world-space point to page-space
/// given a scale factor and offset.
///
/// `scale` is the number of mm on paper per model unit (e.g. at 1:100,
/// 1 model metre = 10 mm on paper, so `scale = 10.0`).
pub fn world_to_page(point: [f64; 2], scale: f64, offset: [f64; 2]) -> (f64, f64) {
    (offset[0] + point[0] * scale, offset[1] + point[1] * scale)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bcad_domain::*;

    #[test]
    fn test_paper_sizes() {
        let (w, h) = PaperSize::ArchD.dimensions_mm();
        assert!((w - 914.4).abs() < 0.1);
        assert!((h - 609.6).abs() < 0.1);

        let (w, h) = PaperSize::A1.dimensions_mm();
        assert!((w - 841.0).abs() < 0.1);
        assert!((h - 594.0).abs() < 0.1);

        let (w, h) = PaperSize::Letter.dimensions_mm();
        assert!((w - 279.4).abs() < 0.1);
        assert!((h - 215.9).abs() < 0.1);

        let (w, h) = PaperSize::Tabloid.dimensions_mm();
        assert!((w - 431.8).abs() < 0.1);
        assert!((h - 279.4).abs() < 0.1);
    }

    #[test]
    fn test_parse_scale() {
        assert!((parse_scale("1:100") - 0.01).abs() < 1e-6);
        assert!((parse_scale("1:50") - 0.02).abs() < 1e-6);
        assert!((parse_scale("1:200") - 0.005).abs() < 1e-6);
    }

    #[test]
    fn test_world_to_page() {
        let (px, py) = world_to_page([5.0, 3.0], 10.0, [100.0, 50.0]);
        assert!((px - 150.0).abs() < 1e-6);
        assert!((py - 80.0).abs() < 1e-6);
    }

    #[test]
    fn test_sheet_number_generation() {
        assert_eq!(generate_sheet_number(SheetType::FloorPlan, 0), "A-101");
        assert_eq!(generate_sheet_number(SheetType::FloorPlan, 1), "A-102");
        assert_eq!(generate_sheet_number(SheetType::ElectricalPlan, 0), "E-101");
        assert_eq!(generate_sheet_number(SheetType::Schedules, 0), "A-601");
        assert_eq!(generate_sheet_number(SheetType::Elevations, 0), "A-201");
    }

    #[test]
    fn test_export_empty_elements_produces_valid_pdf() {
        let options = PdfExportOptions {
            paper_size: PaperSize::Letter,
            scale: "1:100".to_string(),
            sheets: vec![SheetType::FloorPlan],
            project_info: ProjectInfo {
                project_name: "Test Project".to_string(),
                project_address: "123 Test St".to_string(),
                client_name: "Test Client".to_string(),
                architect_name: "Test Architect".to_string(),
                ..Default::default()
            },
            show_title_block: true,
        };
        let bytes = export_pdf(&[], &options);
        // A valid PDF must be non-empty and start with %PDF
        assert!(!bytes.is_empty());
        assert!(bytes.len() > 100);
        assert_eq!(&bytes[0..5], b"%PDF-");
    }

    #[test]
    fn test_export_with_wall_elements() {
        let wall = Element::Wall(WallElement {
            meta: ElementMeta {
                id: "wall-1".to_string(),
                name: "Wall A".to_string(),
                level_id: None,
                host_id: None,
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            start: [0.0, 0.0],
            end: [5.0, 0.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        });
        let wall2 = Element::Wall(WallElement {
            meta: ElementMeta {
                id: "wall-2".to_string(),
                name: "Wall B".to_string(),
                level_id: None,
                host_id: None,
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            start: [5.0, 0.0],
            end: [5.0, 4.0],
            height: 3.0,
            thickness: 0.2,
            arc: None,
            arc_segments: 24,
        });

        let elements = vec![wall, wall2];
        let options = PdfExportOptions {
            paper_size: PaperSize::ArchD,
            scale: "1:50".to_string(),
            sheets: vec![SheetType::FloorPlan],
            project_info: ProjectInfo {
                project_name: "Wall Test".to_string(),
                ..Default::default()
            },
            show_title_block: true,
        };
        let bytes = export_pdf(&elements, &options);
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..5], b"%PDF-");
        // With actual wall content, the PDF should be larger than the empty one
        let empty_bytes = export_pdf(&[], &options);
        assert!(bytes.len() > empty_bytes.len());
    }

    #[test]
    fn test_export_schedule_sheet() {
        let door = Element::Door(DoorElement {
            meta: ElementMeta {
                id: "door-1".to_string(),
                name: "D1".to_string(),
                level_id: None,
                host_id: Some("wall-1".into()),
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            wall_id: "wall-1".to_string(),
            position_along_wall: 0.5,
            width: 0.9,
            height: 2.1,
            sill_height: 0.0,
            swing: DoorSwing::OutRight,
            hardware_type: bcad_domain::DoorHardwareType::Lever,
            style: bcad_domain::DoorStyle::Flush,
        });
        let room = Element::Room(RoomElement {
            meta: ElementMeta {
                id: "room-1".to_string(),
                name: "Living Room".to_string(),
                level_id: None,
                host_id: None,
                type_id: None,
                parent_id: None,
                material_id: None,
                ifc_guid: None,
                classification: None,
                layer: None,
            },
            boundary: vec![[0.0, 0.0], [5.0, 0.0], [5.0, 4.0], [0.0, 4.0]],
            boundary_segments: vec![],
        });

        let elements = vec![door, room];
        let options = PdfExportOptions {
            paper_size: PaperSize::Letter,
            scale: "1:100".to_string(),
            sheets: vec![SheetType::Schedules],
            project_info: ProjectInfo {
                project_name: "Schedule Test".to_string(),
                ..Default::default()
            },
            show_title_block: true,
        };
        let bytes = export_pdf(&elements, &options);
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..5], b"%PDF-");
    }

    #[test]
    fn test_export_multi_sheet() {
        let options = PdfExportOptions {
            paper_size: PaperSize::Tabloid,
            scale: "1:100".to_string(),
            sheets: vec![
                SheetType::FloorPlan,
                SheetType::ElectricalPlan,
                SheetType::Elevations,
                SheetType::Schedules,
            ],
            project_info: ProjectInfo {
                project_name: "Multi-Sheet Test".to_string(),
                project_address: "456 Test Ave".to_string(),
                ..Default::default()
            },
            show_title_block: true,
        };
        let bytes = export_pdf(&[], &options);
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..5], b"%PDF-");
    }

    #[test]
    fn test_kind_to_layer_mapping() {
        assert_eq!(kind_to_layer("wall"), "A-WALL");
        assert_eq!(kind_to_layer("door"), "A-DOOR");
        assert_eq!(kind_to_layer("window"), "A-WIND");
        assert_eq!(kind_to_layer("electrical"), "E-POWR");
        assert_eq!(kind_to_layer("plumbing"), "P-FIXT");
        assert_eq!(kind_to_layer("dimension"), "G-DIMS");
        assert_eq!(kind_to_layer("tag"), "G-TAGS");
        assert_eq!(kind_to_layer("unknown_type"), "");
    }

    #[test]
    fn test_lineweights_iso128() {
        // ISO 128 pen weight series
        assert!((Lineweights::WALL_CUT_EXTERIOR - 0.50).abs() < 1e-6);
        assert!((Lineweights::WALL_CUT_INTERIOR - 0.35).abs() < 1e-6);
        assert!((Lineweights::WALL_CUT - 0.50).abs() < 1e-6); // legacy alias
        assert!((Lineweights::WALL_BEYOND - 0.25).abs() < 1e-6);
        assert!((Lineweights::DOOR_LEAF - 0.35).abs() < 1e-6);
        assert!((Lineweights::DOOR_SWING - 0.25).abs() < 1e-6);
        assert!((Lineweights::WINDOW_FRAME - 0.35).abs() < 1e-6);
        assert!((Lineweights::WINDOW_GLASS - 0.25).abs() < 1e-6);
        assert!((Lineweights::DOOR_WINDOW - 0.35).abs() < 1e-6); // legacy alias
        assert!((Lineweights::COLUMN_OUTLINE - 0.50).abs() < 1e-6);
        assert!((Lineweights::STAIR_TREAD - 0.25).abs() < 1e-6);
        assert!((Lineweights::STAIR_ARROW - 0.18).abs() < 1e-6);
        assert!((Lineweights::DIMENSION - 0.18).abs() < 1e-6);
        assert!((Lineweights::EXTENSION - 0.13).abs() < 1e-6);
        assert!((Lineweights::TICK_MARK - 0.25).abs() < 1e-6);
        assert!((Lineweights::BORDER - 0.70).abs() < 1e-6);
        assert!((Lineweights::BORDER_INNER - 0.25).abs() < 1e-6);
    }
}
