//! Viewport layout management for split-view rendering.

/// How the render surface is divided between 2D and 3D viewports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ViewMode {
    /// Full-surface 3D perspective viewport.
    Only3D,
    /// Full-surface 2D orthographic viewport.
    Only2D,
    /// Side-by-side: left = 2D plan view, right = 3D perspective.
    SplitHorizontal,
}

/// A rectangular region within the render surface (in pixels).
#[derive(Debug, Clone, Copy)]
pub struct ViewportRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl ViewportRect {
    /// Convert to wgpu scissor rect parameters.
    pub fn as_scissor(&self) -> (u32, u32, u32, u32) {
        (self.x, self.y, self.width, self.height)
    }

    /// Compute the aspect ratio (width / height).
    pub fn aspect(&self) -> f32 {
        if self.height == 0 {
            1.0
        } else {
            self.width as f32 / self.height as f32
        }
    }

    /// Test whether a pixel coordinate (in surface space) lies within this viewport.
    pub fn contains(&self, px: u32, py: u32) -> bool {
        px >= self.x && px < self.x + self.width && py >= self.y && py < self.y + self.height
    }

    /// Convert a surface-space pixel coordinate to NDC [-1, 1] relative to this viewport.
    /// Returns `None` if the point is outside the viewport.
    pub fn pixel_to_ndc(&self, px: f32, py: f32) -> Option<(f32, f32)> {
        let fx = px - self.x as f32;
        let fy = py - self.y as f32;
        if fx < 0.0 || fx > self.width as f32 || fy < 0.0 || fy > self.height as f32 {
            return None;
        }
        let ndc_x = fx / self.width as f32 * 2.0 - 1.0;
        let ndc_y = 1.0 - fy / self.height as f32 * 2.0;
        Some((ndc_x, ndc_y))
    }
}

/// Manages the split-view layout, computing scissor rects for each viewport.
#[derive(Debug, Clone)]
pub struct ViewportLayout {
    pub mode: ViewMode,
    /// The 3D viewport rect (None if mode is Only2D).
    pub viewport_3d: Option<ViewportRect>,
    /// The 2D viewport rect (None if mode is Only3D).
    pub viewport_2d: Option<ViewportRect>,
}

impl ViewportLayout {
    /// Compute viewport rectangles for a given mode and surface size.
    pub fn compute(mode: ViewMode, surface_width: u32, surface_height: u32) -> Self {
        match mode {
            ViewMode::Only3D => Self {
                mode,
                viewport_3d: Some(ViewportRect {
                    x: 0,
                    y: 0,
                    width: surface_width,
                    height: surface_height,
                }),
                viewport_2d: None,
            },
            ViewMode::Only2D => Self {
                mode,
                viewport_3d: None,
                viewport_2d: Some(ViewportRect {
                    x: 0,
                    y: 0,
                    width: surface_width,
                    height: surface_height,
                }),
            },
            ViewMode::SplitHorizontal => {
                let half_w = surface_width / 2;
                Self {
                    mode,
                    viewport_3d: Some(ViewportRect {
                        x: half_w,
                        y: 0,
                        width: surface_width - half_w,
                        height: surface_height,
                    }),
                    viewport_2d: Some(ViewportRect {
                        x: 0,
                        y: 0,
                        width: half_w,
                        height: surface_height,
                    }),
                }
            }
        }
    }

    /// Returns an iterator over all active viewports (for rendering loops).
    pub fn active_viewports(&self) -> Vec<(&'static str, &ViewportRect)> {
        let mut result = Vec::new();
        if let Some(ref rect) = self.viewport_3d {
            result.push(("3d", rect));
        }
        if let Some(ref rect) = self.viewport_2d {
            result.push(("2d", rect));
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_only_3d_covers_full_surface() {
        let layout = ViewportLayout::compute(ViewMode::Only3D, 1920, 1080);
        let r = layout.viewport_3d.unwrap();
        assert_eq!(r.x, 0);
        assert_eq!(r.y, 0);
        assert_eq!(r.width, 1920);
        assert_eq!(r.height, 1080);
        assert!(layout.viewport_2d.is_none());
    }

    #[test]
    fn test_only_2d_covers_full_surface() {
        let layout = ViewportLayout::compute(ViewMode::Only2D, 1920, 1080);
        let r = layout.viewport_2d.unwrap();
        assert_eq!(r.x, 0);
        assert_eq!(r.width, 1920);
        assert!(layout.viewport_3d.is_none());
    }

    #[test]
    fn test_split_horizontal_divides_evenly() {
        let layout = ViewportLayout::compute(ViewMode::SplitHorizontal, 1920, 1080);
        let r2d = layout.viewport_2d.unwrap();
        let r3d = layout.viewport_3d.unwrap();
        assert_eq!(r2d.x, 0);
        assert_eq!(r2d.width, 960);
        assert_eq!(r3d.x, 960);
        assert_eq!(r3d.width, 960);
    }

    #[test]
    fn test_aspect_ratio() {
        let r = ViewportRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let aspect = r.aspect();
        assert!((aspect - 1.7777).abs() < 0.01);
    }
}
