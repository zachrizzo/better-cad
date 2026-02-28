//! 2D sketch primitives (points, lines) and the Sketch container.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PointId(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct LineId(pub usize);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchPoint {
    pub id: PointId,
    pub x: f64,
    pub y: f64,
    pub fixed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchLine {
    pub id: LineId,
    pub p1: PointId,
    pub p2: PointId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sketch {
    pub points: Vec<SketchPoint>,
    pub lines: Vec<SketchLine>,
    pub constraints: Vec<crate::constraint::Constraint>,
    next_point_id: usize,
    next_line_id: usize,
}

impl Sketch {
    pub fn new() -> Self {
        Self {
            points: Vec::new(),
            lines: Vec::new(),
            constraints: Vec::new(),
            next_point_id: 0,
            next_line_id: 0,
        }
    }

    pub fn add_point(&mut self, x: f64, y: f64, fixed: bool) -> PointId {
        let id = PointId(self.next_point_id);
        self.next_point_id += 1;
        self.points.push(SketchPoint { id, x, y, fixed });
        id
    }

    pub fn add_line(&mut self, p1: PointId, p2: PointId) -> LineId {
        let id = LineId(self.next_line_id);
        self.next_line_id += 1;
        self.lines.push(SketchLine { id, p1, p2 });
        id
    }

    pub fn add_constraint(&mut self, c: crate::constraint::Constraint) {
        self.constraints.push(c);
    }

    pub fn get_point(&self, id: PointId) -> Option<&SketchPoint> {
        self.points.iter().find(|p| p.id == id)
    }

    pub fn get_point_mut(&mut self, id: PointId) -> Option<&mut SketchPoint> {
        self.points.iter_mut().find(|p| p.id == id)
    }

    pub fn get_line(&self, id: LineId) -> Option<&SketchLine> {
        self.lines.iter().find(|l| l.id == id)
    }
}
