use ratatui::layout::Constraint;

use crate::state::FocusPane;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Breakpoint {
    Narrow,
    Medium,
    Wide,
}

pub fn breakpoint(width: u16) -> Breakpoint {
    if width < 100 {
        Breakpoint::Narrow
    } else if width >= 120 {
        Breakpoint::Wide
    } else {
        Breakpoint::Medium
    }
}

pub fn system_column_constraints() -> [Constraint; 2] {
    [Constraint::Fill(1), Constraint::Length(7)]
}

pub fn narrow_rows(total_height: u16) -> [Constraint; 5] {
    let mut heights = [9u16, 7, 7, 8, 7];
    const BASE_TOTAL: u16 = 38;

    if total_height > BASE_TOTAL {
        heights[4] += total_height - BASE_TOTAL;
    } else if total_height < BASE_TOTAL {
        let mins = [7u16, 7, 5, 5, 5];
        let order = [4usize, 3, 2, 0];
        let mut deficit = BASE_TOTAL - total_height;

        for index in order {
            if deficit == 0 {
                break;
            }
            let shrink = heights[index].saturating_sub(mins[index]).min(deficit);
            heights[index] -= shrink;
            deficit -= shrink;
        }
    }

    heights.map(Constraint::Length)
}

pub fn wide_columns(_focus: FocusPane) -> [Constraint; 3] {
    [
        Constraint::Fill(1),
        Constraint::Fill(1),
        Constraint::Fill(1),
    ]
}

pub fn medium_columns(_focus: FocusPane) -> [Constraint; 2] {
    [Constraint::Fill(1), Constraint::Fill(1)]
}

pub fn right_column_constraints(_focus: FocusPane) -> [Constraint; 2] {
    [Constraint::Fill(1), Constraint::Fill(1)]
}
