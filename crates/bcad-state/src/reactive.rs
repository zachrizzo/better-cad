//! Reactive notification system using bitflags.
//!
//! Each egui panel subscribes to specific `ChangeFlags` and gets notified
//! only when relevant state slices change.

use std::sync::Arc;

use bitflags::bitflags;

bitflags! {
    /// Which slices of AppState have changed since the last poll.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
    pub struct ChangeFlags: u32 {
        const DOCUMENT       = 1 << 0;
        const ELEMENTS       = 1 << 1;
        const MESHES         = 1 << 2;
        const UI             = 1 << 3;
        const SELECTION      = 1 << 4;
        const SETTINGS       = 1 << 5;
        const BIM_DEFAULTS   = 1 << 6;
        const BIM_TRANSIENT  = 1 << 7;
        const LEVELS         = 1 << 8;
        const LAYERS         = 1 << 9;
        const SKETCH         = 1 << 10;
        const VIEWS          = 1 << 11;
        const CAMERA         = 1 << 12;
        const MATERIALS      = 1 << 13;
        const MEASUREMENT    = 1 << 14;
        const CHAT           = 1 << 15;
        const HISTORY        = 1 << 16;
    }
}

/// A subscriber callback invoked when relevant state changes.
pub type SubscriberCallback = Arc<dyn Fn(ChangeFlags) + Send + Sync>;

/// A registered subscriber with a filter mask and unique ID.
pub struct Subscriber {
    pub filter: ChangeFlags,
    pub callback: SubscriberCallback,
    pub id: u64,
}

// Implement Debug manually since Arc<dyn Fn> doesn't implement Debug.
impl std::fmt::Debug for Subscriber {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Subscriber")
            .field("filter", &self.filter)
            .field("id", &self.id)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_flags() {
        let flags = ChangeFlags::empty();
        assert!(!flags.contains(ChangeFlags::DOCUMENT));
        assert!(!flags.contains(ChangeFlags::UI));
        assert_eq!(flags.bits(), 0);
    }

    #[test]
    fn default_flags_is_empty() {
        let flags = ChangeFlags::default();
        assert_eq!(flags, ChangeFlags::empty());
    }

    #[test]
    fn union_of_elements_and_ui() {
        let flags = ChangeFlags::ELEMENTS | ChangeFlags::UI;
        assert!(flags.contains(ChangeFlags::ELEMENTS));
        assert!(flags.contains(ChangeFlags::UI));
        assert!(!flags.contains(ChangeFlags::DOCUMENT));
        assert!(!flags.contains(ChangeFlags::CAMERA));
    }

    #[test]
    fn all_contains_every_flag() {
        let all = ChangeFlags::all();
        assert!(all.contains(ChangeFlags::DOCUMENT));
        assert!(all.contains(ChangeFlags::ELEMENTS));
        assert!(all.contains(ChangeFlags::MESHES));
        assert!(all.contains(ChangeFlags::UI));
        assert!(all.contains(ChangeFlags::SELECTION));
        assert!(all.contains(ChangeFlags::SETTINGS));
        assert!(all.contains(ChangeFlags::BIM_DEFAULTS));
        assert!(all.contains(ChangeFlags::BIM_TRANSIENT));
        assert!(all.contains(ChangeFlags::LEVELS));
        assert!(all.contains(ChangeFlags::LAYERS));
        assert!(all.contains(ChangeFlags::SKETCH));
        assert!(all.contains(ChangeFlags::VIEWS));
        assert!(all.contains(ChangeFlags::CAMERA));
        assert!(all.contains(ChangeFlags::MATERIALS));
        assert!(all.contains(ChangeFlags::MEASUREMENT));
        assert!(all.contains(ChangeFlags::CHAT));
        assert!(all.contains(ChangeFlags::HISTORY));
    }

    #[test]
    fn flags_are_distinct_single_bits() {
        // Each flag should be a single bit (power of two)
        let individual = [
            ChangeFlags::DOCUMENT,
            ChangeFlags::ELEMENTS,
            ChangeFlags::MESHES,
            ChangeFlags::UI,
            ChangeFlags::SELECTION,
            ChangeFlags::SETTINGS,
            ChangeFlags::BIM_DEFAULTS,
            ChangeFlags::BIM_TRANSIENT,
            ChangeFlags::LEVELS,
            ChangeFlags::LAYERS,
            ChangeFlags::SKETCH,
            ChangeFlags::VIEWS,
            ChangeFlags::CAMERA,
            ChangeFlags::MATERIALS,
            ChangeFlags::MEASUREMENT,
            ChangeFlags::CHAT,
            ChangeFlags::HISTORY,
        ];
        for flag in &individual {
            assert!(
                flag.bits().is_power_of_two(),
                "flag {:?} is not a single bit",
                flag
            );
        }
    }
}
