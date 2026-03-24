//! Furniture tool default properties panel.

use crate::widgets::labeled_drag_value;
use bcad_state::bim_defaults::FurnitureSymbolType;
use bcad_state::{AppState, Command};

/// Show furniture default properties. Returns commands for any changes.
pub fn show(ui: &mut egui::Ui, state: &AppState) -> Vec<Command> {
    let mut cmds = Vec::new();
    let d = &state.bim_defaults;

    // Furniture type dropdown
    let mut ftype = d.furniture_type;
    ui.horizontal(|ui| {
        ui.label("Type");
        egui::ComboBox::from_id_salt("furniture_type")
            .selected_text(furniture_label(ftype))
            .show_ui(ui, |ui| {
                for variant in ALL_FURNITURE_TYPES {
                    if ui
                        .selectable_value(&mut ftype, *variant, furniture_label(*variant))
                        .changed()
                    {
                        cmds.push(Command::SetDefaultFurnitureType {
                            furniture_type: ftype,
                        });
                    }
                }
            });
    });

    // Rotation
    let mut rotation = d.furniture_rotation;
    if labeled_drag_value(ui, "Rotation", &mut rotation, 1.0, 0.0..=360.0) {
        cmds.push(Command::SetDefaultFurnitureRotation { rotation });
    }

    cmds
}

const ALL_FURNITURE_TYPES: &[FurnitureSymbolType] = &[
    FurnitureSymbolType::Desk,
    FurnitureSymbolType::Chair,
    FurnitureSymbolType::Table,
    FurnitureSymbolType::Bed,
    FurnitureSymbolType::Sofa,
    FurnitureSymbolType::DiningTable,
    FurnitureSymbolType::Bookshelf,
    FurnitureSymbolType::Wardrobe,
    FurnitureSymbolType::ToiletStall,
    FurnitureSymbolType::ReceptionDesk,
    FurnitureSymbolType::ConferenceTable,
    FurnitureSymbolType::KitchenIsland,
    FurnitureSymbolType::Refrigerator,
    FurnitureSymbolType::Stove,
    FurnitureSymbolType::Washer,
    FurnitureSymbolType::Dryer,
    FurnitureSymbolType::Nightstand,
    FurnitureSymbolType::CoffeeTable,
    FurnitureSymbolType::TvConsole,
    FurnitureSymbolType::ConsoleTable,
    FurnitureSymbolType::Bench,
    FurnitureSymbolType::Ottoman,
    FurnitureSymbolType::Vanity,
    FurnitureSymbolType::Microwave,
    FurnitureSymbolType::Oven,
    FurnitureSymbolType::RangeHood,
    FurnitureSymbolType::Plant,
    FurnitureSymbolType::Mirror,
    FurnitureSymbolType::Fireplace,
    FurnitureSymbolType::CoffeeMaker,
    FurnitureSymbolType::Artwork,
];

fn furniture_label(ft: FurnitureSymbolType) -> &'static str {
    match ft {
        FurnitureSymbolType::Desk => "Desk",
        FurnitureSymbolType::Chair => "Chair",
        FurnitureSymbolType::Table => "Table",
        FurnitureSymbolType::Bed => "Bed",
        FurnitureSymbolType::Sofa => "Sofa",
        FurnitureSymbolType::DiningTable => "Dining Table",
        FurnitureSymbolType::Bookshelf => "Bookshelf",
        FurnitureSymbolType::Wardrobe => "Wardrobe",
        FurnitureSymbolType::ToiletStall => "Toilet Stall",
        FurnitureSymbolType::ReceptionDesk => "Reception Desk",
        FurnitureSymbolType::ConferenceTable => "Conference Table",
        FurnitureSymbolType::KitchenIsland => "Kitchen Island",
        FurnitureSymbolType::Refrigerator => "Refrigerator",
        FurnitureSymbolType::Stove => "Stove",
        FurnitureSymbolType::Washer => "Washer",
        FurnitureSymbolType::Dryer => "Dryer",
        FurnitureSymbolType::Nightstand => "Nightstand",
        FurnitureSymbolType::CoffeeTable => "Coffee Table",
        FurnitureSymbolType::TvConsole => "TV Console",
        FurnitureSymbolType::ConsoleTable => "Console Table",
        FurnitureSymbolType::Bench => "Bench",
        FurnitureSymbolType::Ottoman => "Ottoman",
        FurnitureSymbolType::Vanity => "Vanity",
        FurnitureSymbolType::Microwave => "Microwave",
        FurnitureSymbolType::Oven => "Oven",
        FurnitureSymbolType::RangeHood => "Range Hood",
        FurnitureSymbolType::Plant => "Plant",
        FurnitureSymbolType::Mirror => "Mirror",
        FurnitureSymbolType::Fireplace => "Fireplace",
        FurnitureSymbolType::CoffeeMaker => "Coffee Maker",
        FurnitureSymbolType::Artwork => "Artwork",
    }
}
