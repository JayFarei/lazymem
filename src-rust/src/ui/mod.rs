use std::collections::{BTreeMap, HashMap, HashSet};

use ratatui::Frame;
use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Clear, Paragraph, Wrap};

use crate::collector::sessions::{is_claude, is_codex_agent};
use crate::layout::{
    Breakpoint, breakpoint, medium_columns, narrow_rows, right_column_constraints,
    system_column_constraints, wide_columns,
};
use crate::state::{AppState, AuditData, FocusPane, TopProc};

const FG_TEXT: Color = Color::Rgb(0xc9, 0xd1, 0xd9);
const FG_MUTED: Color = Color::Rgb(0x8b, 0x94, 0x9e);
const FG_SUBTLE: Color = Color::Rgb(0x4d, 0x55, 0x66);
const TITLE_DIM: Color = Color::Rgb(0x6e, 0x76, 0x81);
const BORDER_DIM: Color = Color::Rgb(0x30, 0x36, 0x3d);
const GRID_DIM: Color = Color::Rgb(0x21, 0x26, 0x2d);
const SYS_FOCUS: Color = Color::Rgb(0x58, 0xa6, 0xff);
const AGENTS_FOCUS: Color = Color::Rgb(0x3f, 0xb9, 0x50);
const DEV_FOCUS: Color = Color::Rgb(0xd2, 0xa8, 0x4c);
const DOCKER_FOCUS: Color = Color::Rgb(0xbc, 0x8c, 0xff);
const SELECT_BG: Color = Color::Rgb(0x16, 0x1b, 0x22);
const ERROR: Color = Color::Rgb(0xff, 0x7b, 0x72);
const LOADING_LOGO: &[&str] = &[
    " _                    __  __                ",
    "| |    __ _ _____   _|  \\/  | ___ _ __ ___  ",
    "| |   / _` |_  / | | | |\\/| |/ _ \\'_ ` _ \\\\ ",
    "| |__| (_| |/ /| |_| | |  | |  __/ | | | | |",
    "|_____\\__,_/___|\\__, |_|  |_|\\___|_| |_| |_|",
    "                |___/                        ",
];
const LOADING_SPINNER: &[&str] = &["   ", ".  ", ".. ", "..."];

pub fn render(frame: &mut Frame, state: &AppState) {
    let initial_loading = state.data.is_none() && state.loading;
    if initial_loading {
        render_loading(frame, frame.area(), state);
        return;
    }

    if state.show_help {
        render_help_screen(frame);
        return;
    }

    if state.fullscreen.is_some() {
        render_fullscreen(frame, state);
        return;
    }

    render_dashboard(frame, state);
}

fn render_dashboard(frame: &mut Frame, state: &AppState) {
    let [content, status] =
        Layout::vertical([Constraint::Fill(1), Constraint::Length(1)]).areas(frame.area());

    match breakpoint(content.width) {
        Breakpoint::Narrow => render_narrow(frame, content, state),
        Breakpoint::Medium => render_medium(frame, content, state),
        Breakpoint::Wide => render_wide(frame, content, state),
    }

    render_status_bar(frame, status, state);
}

fn render_narrow(frame: &mut Frame, area: Rect, state: &AppState) {
    let panel_width = dashboard_panel_width(area.width);
    let chunks = Layout::vertical(narrow_rows(area.height)).split(area);

    render_system_panel(frame, chunks[0], state, panel_width);
    render_buddy_panel(frame, chunks[1], state);
    render_agents_panel(frame, chunks[2], state, panel_width);
    render_dev_panel(frame, chunks[3], state, panel_width);
    render_docker_panel(frame, chunks[4], state, panel_width);
}

fn render_medium(frame: &mut Frame, area: Rect, state: &AppState) {
    let panel_width = dashboard_panel_width(area.width);
    let [left, right] = Layout::horizontal(medium_columns(state.focus)).areas(area);
    let [system, buddy] = Layout::vertical(system_column_constraints()).areas(left);
    let agents_h = right.height / 3;
    let dev_h = right.height / 3 + 1;
    let docker_h = right.height.saturating_sub(agents_h + dev_h);
    let [agents, dev, docker] = Layout::vertical([
        Constraint::Length(agents_h),
        Constraint::Length(dev_h),
        Constraint::Length(docker_h),
    ])
    .areas(right);

    render_system_panel(frame, system, state, panel_width);
    render_buddy_panel(frame, buddy, state);
    render_agents_panel(frame, agents, state, panel_width);
    render_dev_panel(frame, dev, state, panel_width);
    render_docker_panel(frame, docker, state, panel_width);
}

fn render_wide(frame: &mut Frame, area: Rect, state: &AppState) {
    let panel_width = dashboard_panel_width(area.width);
    let [left, middle, right] = Layout::horizontal(wide_columns(state.focus)).areas(area);
    let [system, buddy] = Layout::vertical(system_column_constraints()).areas(left);
    let [dev, docker] = Layout::vertical(right_column_constraints(state.focus)).areas(right);

    render_system_panel(frame, system, state, panel_width);
    render_buddy_panel(frame, buddy, state);
    render_agents_panel(frame, middle, state, panel_width);
    render_dev_panel(frame, dev, state, panel_width);
    render_docker_panel(frame, docker, state, panel_width);
}

fn render_fullscreen(frame: &mut Frame, state: &AppState) {
    let [content, footer] =
        Layout::vertical([Constraint::Fill(1), Constraint::Length(1)]).areas(frame.area());
    let panel_width = content.width.saturating_sub(4) as usize;

    match state.fullscreen.expect("fullscreen pane should exist") {
        FocusPane::Sys => render_system_panel(frame, content, state, panel_width),
        FocusPane::Agents => render_agents_panel(frame, content, state, panel_width),
        FocusPane::Dev => render_dev_panel(frame, content, state, panel_width),
        FocusPane::Docker => render_docker_panel(frame, content, state, panel_width),
    }

    render_fullscreen_footer(frame, footer);
}

fn render_loading(frame: &mut Frame, area: Rect, state: &AppState) {
    let spinner_idx =
        ((state.started_at.elapsed().as_millis() / 300) as usize) % LOADING_SPINNER.len();
    let splash_h = (LOADING_LOGO.len() + 3) as u16;
    let [_, splash, _] = Layout::vertical([
        Constraint::Fill(1),
        Constraint::Length(splash_h),
        Constraint::Fill(1),
    ])
    .areas(area);

    let mut lines = LOADING_LOGO
        .iter()
        .map(|line| Line::from(Span::styled(*line, Style::default().fg(SYS_FOCUS))))
        .collect::<Vec<_>>();
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        format!("collecting{}", LOADING_SPINNER[spinner_idx]),
        Style::default().fg(FG_SUBTLE),
    )));

    frame.render_widget(
        Paragraph::new(lines).alignment(ratatui::layout::Alignment::Center),
        splash,
    );
}

fn render_system_panel(frame: &mut Frame, area: Rect, state: &AppState, panel_width: usize) {
    if state.fullscreen != Some(FocusPane::Sys) && area.height <= 9 {
        render_system_panel_compact(frame, area, state, panel_width);
        return;
    }

    let block = panel_block(
        &system_title(state.data.as_ref()),
        state.focus == FocusPane::Sys,
        SYS_FOCUS,
    );
    let mut lines = Vec::new();

    if let Some(data) = &state.data {
        let focused = state.focus == FocusPane::Sys;
        let expanded = state.fullscreen == Some(FocusPane::Sys);
        let title_color = if focused { SYS_FOCUS } else { TITLE_DIM };
        let panel_w = if expanded {
            area.width.saturating_sub(4) as usize
        } else {
            panel_width
        };
        let total_mb = data.system.total_mb.max(1);
        let used_pct = data.system.used_mb as f64 / total_mb as f64;
        let ram_pct_label = format!("{:.0}", used_pct * 100.0);
        let ram_val = format!(
            "{}/{}",
            fmt_mb(data.system.used_mb),
            fmt_mb(data.system.total_mb)
        );
        let ram_val_w = ram_val.chars().count() + 2;
        let dot_full_w = panel_w;
        let dot_label_w = 4usize.max(panel_w.saturating_sub(4 + ram_val_w));
        let swap_val = swap_val_str(&data.system);
        let val_w = 7usize.max(swap_val.chars().count() + 1);
        let mem_bar_w = 4usize.max(panel_w.saturating_sub(8 + val_w));
        let proc_name_w = if expanded {
            24usize.min(14usize.max(panel_w.saturating_sub(30)))
        } else {
            18usize.min(12usize.max(12 + panel_w.saturating_sub(30) / 2))
        };
        let proc_bar_w = 4usize.max(panel_w.saturating_sub(proc_name_w + 3 + val_w));
        let proc_groups = system_proc_groups(data);
        let max_group_mem = proc_groups
            .iter()
            .map(|group| group.total_mb)
            .max()
            .unwrap_or(1)
            .max(1);

        lines.push(Line::from(""));
        let summary_rows = vec![0, 1, 2, 3, 4, 5, 6];
        for row in summary_rows {
            if row == 3 {
                let mut spans = vec![Span::styled("RAM ", Style::default().fg(title_color))];
                spans.extend(dot_matrix_row_spans(
                    &ram_pct_label,
                    row,
                    dot_label_w,
                    used_pct,
                    4,
                    dot_full_w,
                ));
                spans.push(Span::styled(
                    format!("  {ram_val}"),
                    Style::default().fg(FG_MUTED),
                ));
                lines.push(Line::from(spans));
            } else {
                lines.push(Line::from(dot_matrix_row_spans(
                    &ram_pct_label,
                    row,
                    dot_full_w,
                    used_pct,
                    0,
                    dot_full_w,
                )));
            }
        }

        if expanded {
            lines.extend(system_memory_lines(data, mem_bar_w, val_w));
            lines.push(Line::from(""));
        }

        lines.push(Line::from(Span::styled(
            "─".repeat(panel_w.max(10)),
            Style::default().fg(GRID_DIM),
        )));
        lines.push(Line::from(vec![
            Span::styled("procs ", Style::default().fg(title_color)),
            Span::styled(
                system_proc_total_count(data).to_string(),
                Style::default().fg(FG_SUBTLE),
            ),
        ]));
        if expanded {
            lines.push(Line::from(""));
        }
        lines.push(Line::from(vec![
            Span::styled(
                format!("  {:<width$}", "name", width = proc_name_w),
                Style::default().fg(FG_SUBTLE),
            ),
            Span::styled(
                format!(" {:<width$}", "usage", width = proc_bar_w),
                Style::default().fg(FG_SUBTLE),
            ),
            Span::styled(
                format!("{:>width$}", "mem", width = val_w),
                Style::default().fg(FG_SUBTLE),
            ),
        ]));

        if proc_groups.is_empty() {
            lines.push(Line::from("no process data"));
        } else {
            for (index, group) in proc_groups.iter().enumerate() {
                let selected = focused && state.selected_index == index;
                let proc_fg = if selected {
                    FG_TEXT
                } else {
                    proc_color(group.total_mb, data.system.total_mb)
                };
                let row_style = if selected {
                    Style::default().bg(SELECT_BG)
                } else {
                    Style::default()
                };
                let marker = if selected { "▸ " } else { "  " };
                let raw_label = if group.procs.len() > 1 {
                    format!("{} ×{}", group.name, group.procs.len())
                } else {
                    group.name.clone()
                };
                let label = truncate_pad(&raw_label, proc_name_w);
                let mut spans = vec![Span::styled(
                    format!("{marker}{label}"),
                    row_style.fg(proc_fg),
                )];
                spans.push(Span::styled(" ", row_style.fg(BORDER_DIM)));
                spans.extend(bar_spans(
                    group.total_mb as f64 / max_group_mem as f64,
                    proc_bar_w,
                    proc_fg,
                    GRID_DIM,
                    row_style,
                ));
                spans.push(Span::styled(
                    format!("{:>width$}", fmt_mb(group.total_mb), width = val_w),
                    row_style.fg(proc_fg),
                ));
                lines.push(Line::from(spans));

                if focused && state.expanded_index == Some(index) {
                    let detail_w = 10usize.max(panel_w.saturating_sub(20));
                    for proc_ in &group.procs {
                        let proc_mem_fg = proc_color(proc_.mem_mb, data.system.total_mb);
                        lines.push(Line::from(vec![
                            Span::styled(
                                format!("    {:<8}", proc_.pid),
                                Style::default().fg(TITLE_DIM),
                            ),
                            Span::styled(
                                format!("{:>5}", fmt_mb(proc_.mem_mb)),
                                Style::default().fg(proc_mem_fg),
                            ),
                            Span::styled("  ", Style::default().fg(FG_SUBTLE)),
                            Span::styled(
                                slice_text(&proc_.args, detail_w),
                                Style::default().fg(TITLE_DIM),
                            ),
                        ]));
                    }
                }
            }
        }
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(block)
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_system_panel_compact(
    frame: &mut Frame,
    area: Rect,
    state: &AppState,
    panel_width: usize,
) {
    let inner_w = area.width.saturating_sub(2) as usize;
    let border_color = if state.focus == FocusPane::Sys {
        SYS_FOCUS
    } else {
        BORDER_DIM
    };
    let title_prefix = format!("─ {} ", system_title(state.data.as_ref()));
    let title = slice_text(&title_prefix, inner_w);
    let top = format!(
        "╭{}{}╮",
        title,
        "─".repeat(inner_w.saturating_sub(title.chars().count()))
    );

    let mut lines = vec![
        Line::from(Span::styled(top, Style::default().fg(border_color))),
        Line::from(format!("│{}│", " ".repeat(inner_w))),
    ];

    if let Some(data) = &state.data {
        let ram_val = format!(
            "{}/{}",
            fmt_mb(data.system.used_mb),
            fmt_mb(data.system.total_mb)
        );
        let val_w = 7usize.max(swap_val_str(&data.system).chars().count() + 1);
        let proc_name_w = 18usize.min(12usize.max(12 + panel_width.saturating_sub(30) / 2));
        let proc_bar_w = 4usize.max(panel_width.saturating_sub(proc_name_w + 3 + val_w));
        let proc_groups = system_proc_groups(data);
        let max_group_mem = proc_groups
            .iter()
            .map(|group| group.total_mb)
            .max()
            .unwrap_or(1)
            .max(1);
        let base_grid = pad_right(&"▪".repeat(panel_width), inner_w);
        let divider = pad_right(&"─".repeat(panel_width), inner_w);
        let header = pad_right(
            &format!(
                "  {:<name_w$} {:<bar_w$}{:>val_w$}",
                "name",
                "usage",
                "mem",
                name_w = proc_name_w,
                bar_w = proc_bar_w,
                val_w = val_w,
            ),
            inner_w,
        );
        let ram_bar_w = panel_width.saturating_sub(4 + 2 + ram_val.chars().count());
        let ram_base = pad_right(
            &format!("RAM {}  {ram_val}", "▪".repeat(ram_bar_w)),
            inner_w,
        );
        let focused = state.focus == FocusPane::Sys;
        let start = if focused {
            state
                .selected_index
                .min(proc_groups.len().saturating_sub(1))
        } else {
            0
        };
        let primary = proc_groups.get(start);
        let secondary = proc_groups.get(start + 1);

        lines.push(Line::from(format!("│{}│", base_grid)));
        lines.push(Line::from(format!("│{}│", divider)));
        lines.push(Line::from(format!(
            "│{}│",
            overlay_text(
                &base_grid,
                &format!("procs {}", system_proc_total_count(data))
            )
        )));
        lines.push(Line::from(format!(
            "│{}│",
            overlay_text(&ram_base, &header)
        )));
        let primary_row = primary
            .map(|group| {
                system_proc_row_text(
                    group,
                    focused,
                    proc_name_w,
                    proc_bar_w,
                    val_w,
                    max_group_mem,
                )
            })
            .unwrap_or_else(|| "no process data".to_string());
        let primary_line = if focused {
            pad_right(&primary_row, inner_w)
        } else {
            overlay_text(&base_grid, &primary_row)
        };
        lines.push(Line::from(format!("│{}│", primary_line)));
        lines.push(Line::from(format!(
            "│{}│",
            overlay_text(
                &base_grid,
                &secondary
                    .map(|group| {
                        system_proc_row_text(
                            group,
                            false,
                            proc_name_w,
                            proc_bar_w,
                            val_w,
                            max_group_mem,
                        )
                    })
                    .unwrap_or_default(),
            )
        )));

        let tail_w = inner_w.min(2);
        let bottom = format!(
            "╰{}{}╯",
            "▪".repeat(inner_w.saturating_sub(tail_w)),
            "─".repeat(tail_w),
        );
        lines.push(Line::from(Span::styled(
            bottom,
            Style::default().fg(border_color),
        )));
    } else {
        lines.push(Line::from(format!("│{}│", " ".repeat(inner_w))));
        lines.push(Line::from(format!("│{}│", " ".repeat(inner_w))));
        lines.push(Line::from(format!("│{}│", " ".repeat(inner_w))));
        lines.push(Line::from(format!("│{}│", " ".repeat(inner_w))));
        lines.push(Line::from(format!("│{}│", " ".repeat(inner_w))));
        lines.push(Line::from(format!("│{}│", " ".repeat(inner_w))));
        lines.push(Line::from(Span::styled(
            format!("╰{}╯", "─".repeat(inner_w)),
            Style::default().fg(border_color),
        )));
    }

    frame.render_widget(Paragraph::new(lines), area);
}

fn render_agents_panel(frame: &mut Frame, area: Rect, state: &AppState, panel_width: usize) {
    let block = panel_block(
        &agents_title(state.data.as_ref()),
        state.focus == FocusPane::Agents,
        AGENTS_FOCUS,
    );
    let mut lines = Vec::new();
    let mut anchor_line = None;

    if let Some(data) = &state.data {
        let expanded = state.fullscreen == Some(FocusPane::Agents);
        let panel_w = if expanded {
            area.width.saturating_sub(4) as usize
        } else {
            panel_width
        };
        let session_w = 24usize.min(11usize.max(11 + panel_w.saturating_sub(50) / 2));
        let project_w = 20usize.min(12usize.max(12 + panel_w.saturating_sub(50) / 3));
        let bar_w_mag = panel_w
            .saturating_sub(2 + session_w + project_w + 13)
            .min(50);
        let mini_name_w = 20usize.min(14usize.max(14 + panel_w.saturating_sub(40) / 2));
        let bar_w_mini = panel_w.saturating_sub(mini_name_w + 7);
        let max_mem = data
            .sessions
            .iter()
            .map(|session| session.total_mem)
            .max()
            .unwrap_or(1)
            .max(1);

        if data.sessions.is_empty() {
            lines.push(Line::from("no tmux-backed agent sessions"));
        } else {
            if expanded {
                lines.push(Line::from(""));
                let mut header = vec![
                    Span::styled(
                        format!("{:<width$}", "  session", width = session_w + 2),
                        Style::default().fg(FG_SUBTLE),
                    ),
                    Span::styled(
                        format!("{:<width$}", "project", width = project_w),
                        Style::default().fg(FG_SUBTLE),
                    ),
                    Span::styled(format!("{:>3} ", "n"), Style::default().fg(FG_SUBTLE)),
                    Span::styled(format!("{:>6} ", "mem"), Style::default().fg(FG_SUBTLE)),
                ];
                if bar_w_mag >= 4 {
                    header.push(Span::styled("usage", Style::default().fg(FG_SUBTLE)));
                }
                lines.push(Line::from(header));
            } else {
                lines.push(Line::from(""));
                lines.push(Line::from(vec![
                    Span::styled(
                        truncate_pad("  session", mini_name_w),
                        Style::default().fg(FG_SUBTLE),
                    ),
                    Span::styled(
                        format!(" {:<width$}", "usage", width = bar_w_mini),
                        Style::default().fg(FG_SUBTLE),
                    ),
                    Span::styled(format!("{:>6}", "mem"), Style::default().fg(FG_SUBTLE)),
                ]));
            }

            for (index, session) in data.sessions.iter().enumerate() {
                let selected = state.focus == FocusPane::Agents && state.selected_index == index;
                if selected {
                    anchor_line = Some(lines.len());
                }
                let row_style = if selected {
                    Style::default().bg(SELECT_BG)
                } else {
                    Style::default()
                };
                let color = if selected {
                    FG_TEXT
                } else {
                    agent_mem_color(session.total_mem as f64 / max_mem as f64, session.total_mem)
                };

                if expanded {
                    let total_agents = session.instances + session.codex_instances;
                    let mut spans = vec![
                        Span::styled(
                            format!(
                                "{}{}",
                                if selected { "▸ " } else { "  " },
                                truncate_pad(&session.name, session_w)
                            ),
                            row_style.fg(FG_TEXT),
                        ),
                        Span::styled(
                            truncate_pad(&session.project, project_w),
                            row_style.fg(FG_MUTED),
                        ),
                        Span::styled(format!("{:>3} ", total_agents), row_style.fg(FG_MUTED)),
                        Span::styled(
                            format!("{:>6} ", fmt_mb(session.total_mem)),
                            row_style.fg(color),
                        ),
                    ];
                    if bar_w_mag >= 4 {
                        spans.extend(bar_spans(
                            session.total_mem as f64 / max_mem as f64,
                            bar_w_mag,
                            color,
                            GRID_DIM,
                            row_style,
                        ));
                    }
                    lines.push(Line::from(spans));
                } else {
                    let name = slice_text(&session.name, mini_name_w.saturating_sub(3));
                    let mut spans = vec![Span::styled(
                        format!(
                            "{}{}",
                            if selected { "▸ " } else { "  " },
                            format!("{:<width$}", name, width = mini_name_w.saturating_sub(2))
                        ),
                        row_style.fg(if selected { FG_TEXT } else { FG_TEXT }),
                    )];
                    if bar_w_mini >= 4 {
                        spans.push(Span::styled(" ", row_style.fg(BORDER_DIM)));
                        spans.extend(bar_spans(
                            session.total_mem as f64 / max_mem as f64,
                            bar_w_mini,
                            color,
                            GRID_DIM,
                            row_style,
                        ));
                    }
                    spans.push(Span::styled(
                        format!("{:>6}", fmt_mb(session.total_mem)),
                        row_style.fg(color),
                    ));
                    lines.push(Line::from(spans));
                }

                if expanded
                    || (state.focus == FocusPane::Agents && state.expanded_index == Some(index))
                {
                    lines.push(Line::from(vec![
                        Span::styled("    project  ", Style::default().fg(FG_SUBTLE)),
                        Span::styled(
                            slice_text(&session.project, 10usize.max(panel_w.saturating_sub(15))),
                            Style::default().fg(FG_MUTED),
                        ),
                    ]));
                    if session.instances > 0 {
                        lines.push(Line::from(vec![
                            Span::styled("    claude   ", Style::default().fg(FG_SUBTLE)),
                            Span::styled(
                                format!("{}x", session.instances),
                                Style::default().fg(AGENTS_FOCUS),
                            ),
                        ]));
                    }
                    if session.codex_instances > 0 {
                        lines.push(Line::from(vec![
                            Span::styled("    codex    ", Style::default().fg(FG_SUBTLE)),
                            Span::styled(
                                format!("{}x", session.codex_instances),
                                Style::default().fg(DOCKER_FOCUS),
                            ),
                        ]));
                    }
                    if session.sidecars > 0 {
                        lines.push(Line::from(vec![
                            Span::styled("    mcp      ", Style::default().fg(FG_SUBTLE)),
                            Span::styled(
                                format!("{}x", session.sidecars),
                                Style::default().fg(FG_SUBTLE),
                            ),
                        ]));
                    }
                    lines.push(Line::from(vec![
                        Span::styled("    mem      ", Style::default().fg(FG_SUBTLE)),
                        Span::styled(fmt_mb(session.total_mem), Style::default().fg(color)),
                    ]));
                }
            }
        }
    }

    let scroll = paragraph_scroll(anchor_line, lines.len(), inner_height(area));
    frame.render_widget(
        Paragraph::new(lines)
            .block(block)
            .wrap(Wrap { trim: false })
            .scroll((scroll, 0)),
        area,
    );
}

fn render_dev_panel(frame: &mut Frame, area: Rect, state: &AppState, panel_width: usize) {
    let block = panel_block(
        &dev_title(state.data.as_ref()),
        state.focus == FocusPane::Dev,
        DEV_FOCUS,
    );
    let mut lines = Vec::new();
    let mut anchor_line = None;

    if let Some(data) = &state.data {
        let expanded = state.fullscreen == Some(FocusPane::Dev);
        let groups = dev_groups(data);
        let panel_w = if expanded {
            area.width.saturating_sub(4) as usize
        } else {
            panel_width
        };
        let service_w = 24usize.min(14usize.max(14 + panel_w.saturating_sub(50) / 3));
        let bar_w_mag = panel_w.saturating_sub(2 + service_w + 6).min(50);
        let mini_label_w = 22usize.min(15usize.max(15 + panel_w.saturating_sub(40) / 2));
        let bar_w_mini = panel_w.saturating_sub(mini_label_w + 7);
        let max_group_mem = groups
            .iter()
            .map(|group| group.total_mem)
            .max()
            .unwrap_or(1)
            .max(1);

        if groups.is_empty() {
            lines.push(Line::from("no dev processes"));
        } else {
            lines.push(Line::from(""));
            if expanded {
                let mut header = vec![Span::styled(
                    format!("{:<width$}", "  service", width = service_w + 2),
                    Style::default().fg(FG_SUBTLE),
                )];
                if bar_w_mag >= 4 {
                    header.push(Span::styled(
                        format!("{:<width$}", "usage", width = bar_w_mag + 1),
                        Style::default().fg(FG_SUBTLE),
                    ));
                }
                header.push(Span::styled(
                    format!("{:>5}", "mem"),
                    Style::default().fg(FG_SUBTLE),
                ));
                lines.push(Line::from(header));

                for (index, group) in groups.iter().enumerate() {
                    let selected = state.focus == FocusPane::Dev && state.selected_index == index;
                    if selected {
                        anchor_line = Some(lines.len());
                    }
                    let row_style = if selected {
                        Style::default().bg(SELECT_BG)
                    } else {
                        Style::default()
                    };
                    let color = dev_mem_color(group.total_mem);
                    let raw_label = if group.total_count > 1 {
                        format!("{} ×{}", group.label, group.total_count)
                    } else {
                        group.label.clone()
                    };
                    let mut group_spans = vec![Span::styled(
                        format!(
                            "{}{}",
                            if selected { "▸ " } else { "  " },
                            truncate_pad(&raw_label, service_w)
                        ),
                        row_style.fg(FG_TEXT),
                    )];
                    if bar_w_mag >= 4 {
                        group_spans.extend(bar_spans(
                            group.total_mem as f64 / max_group_mem as f64,
                            bar_w_mag,
                            color,
                            GRID_DIM,
                            row_style,
                        ));
                        group_spans.push(Span::styled(" ", row_style.fg(BORDER_DIM)));
                    }
                    group_spans.push(Span::styled(
                        format!("{:>5}", fmt_mb(group.total_mem)),
                        row_style.fg(color),
                    ));
                    lines.push(Line::from(group_spans));

                    let max_session_mem = group
                        .sessions
                        .iter()
                        .map(|session| session.mem)
                        .max()
                        .unwrap_or(1)
                        .max(1);
                    for session in &group.sessions {
                        let raw_label = if session.count > 1 {
                            format!("    {} ×{}", session.service, session.count)
                        } else {
                            format!("    {}", session.service)
                        };
                        let session_color = dev_mem_color(session.mem);
                        let mut detail_spans = vec![Span::styled(
                            truncate_pad(&raw_label, service_w + 2),
                            Style::default().fg(FG_MUTED),
                        )];
                        if bar_w_mag >= 4 {
                            detail_spans.extend(bar_spans(
                                session.mem as f64 / max_session_mem as f64,
                                bar_w_mag,
                                session_color,
                                GRID_DIM,
                                Style::default(),
                            ));
                            detail_spans.push(Span::styled(" ", Style::default().fg(BORDER_DIM)));
                        }
                        detail_spans.push(Span::styled(
                            format!("{:>5}", fmt_mb(session.mem)),
                            Style::default().fg(session_color),
                        ));
                        lines.push(Line::from(detail_spans));
                    }
                }
            } else {
                lines.push(Line::from(vec![
                    Span::styled(
                        truncate_pad("  service", mini_label_w),
                        Style::default().fg(FG_SUBTLE),
                    ),
                    Span::styled(
                        format!(" {:<width$}", "usage", width = bar_w_mini),
                        Style::default().fg(FG_SUBTLE),
                    ),
                    Span::styled(format!("{:>6}", "mem"), Style::default().fg(FG_SUBTLE)),
                ]));

                for (index, group) in groups.iter().enumerate() {
                    let selected = state.focus == FocusPane::Dev && state.selected_index == index;
                    if selected {
                        anchor_line = Some(lines.len());
                    }
                    let row_style = if selected {
                        Style::default().bg(SELECT_BG)
                    } else {
                        Style::default()
                    };
                    let color = if selected {
                        FG_TEXT
                    } else {
                        dev_mem_color(group.total_mem)
                    };
                    let raw_label = if group.total_count > 1 {
                        format!("{} ×{}", group.label, group.total_count)
                    } else {
                        group.label.clone()
                    };
                    let mut spans = vec![Span::styled(
                        format!(
                            "{}{}",
                            if selected { "▸ " } else { "  " },
                            truncate_pad(&raw_label, mini_label_w.saturating_sub(2))
                        ),
                        row_style.fg(FG_TEXT),
                    )];
                    if bar_w_mini >= 4 {
                        spans.push(Span::styled(" ", row_style.fg(BORDER_DIM)));
                        spans.extend(bar_spans(
                            group.total_mem as f64 / max_group_mem as f64,
                            bar_w_mini,
                            color,
                            GRID_DIM,
                            row_style,
                        ));
                    }
                    spans.push(Span::styled(
                        format!("{:>6}", fmt_mb(group.total_mem)),
                        row_style.fg(color),
                    ));
                    lines.push(Line::from(spans));

                    if state.focus == FocusPane::Dev && state.expanded_index == Some(index) {
                        let max_session_mem = group
                            .sessions
                            .iter()
                            .map(|session| session.mem)
                            .max()
                            .unwrap_or(1)
                            .max(1);
                        for session in &group.sessions {
                            let raw_label = if session.count > 1 {
                                format!("    {} ×{}", session.service, session.count)
                            } else {
                                format!("    {}", session.service)
                            };
                            let session_color = dev_mem_color(session.mem);
                            let mut detail_spans = vec![Span::styled(
                                truncate_pad(&raw_label, mini_label_w),
                                Style::default().fg(TITLE_DIM),
                            )];
                            if bar_w_mini >= 4 {
                                detail_spans.push(Span::styled(" ", Style::default().fg(GRID_DIM)));
                                detail_spans.extend(bar_spans(
                                    session.mem as f64 / max_session_mem as f64,
                                    bar_w_mini,
                                    session_color,
                                    GRID_DIM,
                                    Style::default(),
                                ));
                            }
                            detail_spans.push(Span::styled(
                                format!("{:>6}", fmt_mb(session.mem)),
                                Style::default().fg(session_color),
                            ));
                            lines.push(Line::from(detail_spans));
                        }
                    }
                }
            }
        }
    }

    let scroll = paragraph_scroll(anchor_line, lines.len(), inner_height(area));
    frame.render_widget(
        Paragraph::new(lines)
            .block(block)
            .wrap(Wrap { trim: false })
            .scroll((scroll, 0)),
        area,
    );
}

fn render_docker_panel(frame: &mut Frame, area: Rect, state: &AppState, panel_width: usize) {
    let block = panel_block(
        &docker_title(state.data.as_ref()),
        state.focus == FocusPane::Docker,
        DOCKER_FOCUS,
    );
    let mut lines = Vec::new();
    let mut anchor_line = None;

    if let Some(data) = &state.data {
        let expanded = state.fullscreen == Some(FocusPane::Docker);
        let panel_w = if expanded {
            area.width.saturating_sub(4) as usize
        } else {
            panel_width
        };
        let container_w = if expanded {
            50usize.min(28usize.max(28 + panel_w.saturating_sub(60) / 2))
        } else {
            36usize.min(20usize.max(20 + panel_w.saturating_sub(50) / 2))
        };
        let bar_w = panel_w.saturating_sub(container_w + 7);

        if data.docker.colima_alloc != "N/A" {
            let ratio = docker_vm_ratio(&data.docker);
            let vm_color = if ratio > 0.8 {
                ERROR
            } else if ratio > 0.6 {
                DEV_FOCUS
            } else {
                DOCKER_FOCUS
            };
            lines.push(Line::from(""));
            let mut vm_spans = vec![
                Span::styled(format!("{:<6}", "  VM"), Style::default().fg(FG_SUBTLE)),
                Span::styled(fmt_mb(data.docker.vm_actual), Style::default().fg(FG_TEXT)),
                Span::styled(" / ", Style::default().fg(FG_SUBTLE)),
                Span::styled(
                    data.docker.colima_alloc.clone(),
                    Style::default().fg(FG_MUTED),
                ),
                Span::styled(" ", Style::default().fg(FG_SUBTLE)),
            ];
            if bar_w >= 4 {
                vm_spans.extend(bar_spans(
                    ratio,
                    bar_w.min(14),
                    vm_color,
                    GRID_DIM,
                    Style::default(),
                ));
            }
            lines.push(Line::from(vm_spans));
            lines.push(Line::from(""));
        }

        if data.docker.containers.is_empty() {
            lines.push(Line::from("no running containers"));
        } else {
            lines.push(Line::from(vec![
                Span::styled(
                    truncate_pad("  container", container_w),
                    Style::default().fg(FG_SUBTLE),
                ),
                Span::styled(
                    format!(" {:<width$}", "usage", width = bar_w),
                    Style::default().fg(FG_SUBTLE),
                ),
                Span::styled(format!("{:>6}", "mem"), Style::default().fg(FG_SUBTLE)),
            ]));

            let max_mem = data
                .docker
                .containers
                .iter()
                .map(|container| parse_docker_mem_used(&container.mem))
                .fold(1.0f64, f64::max);

            for (index, container) in data.docker.containers.iter().enumerate() {
                let selected = state.focus == FocusPane::Docker && state.selected_index == index;
                if selected {
                    anchor_line = Some(lines.len());
                }
                let row_style = if selected {
                    Style::default().bg(SELECT_BG)
                } else {
                    Style::default()
                };
                let mem_used = parse_docker_mem_used(&container.mem);
                let color = if selected {
                    FG_TEXT
                } else {
                    docker_mem_color(mem_used)
                };
                let label = docker_label(container, container_w, selected);
                let mut spans = vec![Span::styled(
                    label,
                    row_style.fg(if selected { FG_TEXT } else { FG_TEXT }),
                )];
                if bar_w >= 4 {
                    spans.push(Span::styled(" ", row_style.fg(BORDER_DIM)));
                    spans.extend(bar_spans(
                        mem_used / max_mem.max(1.0),
                        bar_w,
                        color,
                        GRID_DIM,
                        row_style,
                    ));
                }
                spans.push(Span::styled(
                    format!("{:>6}", fmt_mb(mem_used.round() as u64)),
                    row_style.fg(color),
                ));
                lines.push(Line::from(spans));

                let show_details = expanded
                    || (state.focus == FocusPane::Docker && state.expanded_index == Some(index));
                if show_details {
                    lines.extend(docker_detail_lines(container, color, panel_w));
                }
            }
        }
    }

    let scroll = paragraph_scroll(anchor_line, lines.len(), inner_height(area));
    frame.render_widget(
        Paragraph::new(lines)
            .block(block)
            .wrap(Wrap { trim: false })
            .scroll((scroll, 0)),
        area,
    );
}

fn render_buddy_panel(frame: &mut Frame, area: Rect, state: &AppState) {
    let block = panel_block("Prince Edmund", false, BORDER_DIM);
    let panel_w = area.width.saturating_sub(4) as usize;
    let elapsed = buddy_elapsed(state);
    let sprite = buddy_sprite(state.data.as_ref(), elapsed);
    let bubble = build_buddy_bubble(
        &buddy_quip(state.data.as_ref(), elapsed),
        panel_w.saturating_sub(12 + 5).max(12),
    );
    let total_h = sprite.len().max(bubble.len());
    let sprite_off = (total_h.saturating_sub(sprite.len())) / 2;
    let bubble_off = (total_h.saturating_sub(bubble.len())) / 2;
    let mut lines = Vec::new();

    for index in 0..total_h {
        let sprite_line = if index >= sprite_off && index - sprite_off < sprite.len() {
            sprite[index - sprite_off].clone()
        } else {
            " ".repeat(12)
        };
        let bubble_line = if index >= bubble_off && index - bubble_off < bubble.len() {
            bubble[index - bubble_off].clone()
        } else {
            String::new()
        };
        lines.push(Line::from(vec![
            Span::styled(
                sprite_line,
                Style::default().fg(buddy_sprite_color(state.data.as_ref(), elapsed)),
            ),
            Span::styled(
                bubble_line,
                Style::default().fg(Color::Rgb(0x91, 0x98, 0xa1)),
            ),
        ]));
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(block)
            .wrap(Wrap { trim: false }),
        area,
    );
}

fn render_status_bar(frame: &mut Frame, area: Rect, state: &AppState) {
    if area.width < 100 {
        render_status_bar_compact(frame, area, state);
        return;
    }

    let mut spans = vec![
        Span::styled("lazymem", Style::default().fg(SYS_FOCUS)),
        Span::styled(" │ ", Style::default().fg(BORDER_DIM)),
    ];

    if state.loading {
        spans.push(Span::styled("⠋", Style::default().fg(DEV_FOCUS)));
        spans.push(Span::styled(" syncing", Style::default().fg(FG_MUTED)));
    } else {
        spans.push(Span::styled("●", Style::default().fg(AGENTS_FOCUS)));
        spans.push(Span::styled(" live", Style::default().fg(FG_MUTED)));
    }
    spans.push(Span::styled(" │ ", Style::default().fg(BORDER_DIM)));

    if let Some(data) = &state.data {
        spans.push(Span::styled(
            format!(
                "{}x {}",
                data.total_instances,
                fmt_mb(data.total_claude_mem)
            ),
            Style::default().fg(FG_TEXT),
        ));
        spans.push(Span::styled(" │ ", Style::default().fg(BORDER_DIM)));
        if data.anomalies.is_empty() {
            spans.push(Span::styled("✓", Style::default().fg(AGENTS_FOCUS)));
        } else {
            spans.push(Span::styled(
                format!("⚠  {}", data.anomalies.len()),
                Style::default().fg(ERROR),
            ));
        }
        spans.push(Span::styled(" │ ", Style::default().fg(BORDER_DIM)));
        spans.push(Span::styled(
            focus_key(state.focus),
            Style::default().fg(focus_color(state.focus)),
        ));
        spans.push(Span::styled(" │ ", Style::default().fg(BORDER_DIM)));
    }

    if state.copied_until.is_some() {
        spans.push(Span::styled("✓ copied", Style::default().fg(AGENTS_FOCUS)));
        spans.push(Span::styled(" │ ", Style::default().fg(BORDER_DIM)));
    }

    spans.extend(key_hint("r", "fresh"));
    spans.push(Span::raw(" "));
    spans.extend(key_hint("Tab", "cycle"));
    spans.push(Span::raw(" "));
    spans.extend(key_hint("1-4", "focus"));
    spans.push(Span::raw(" "));
    spans.extend(key_hint("j/k", "nav"));
    spans.push(Span::raw(" "));
    spans.extend(key_hint("g", "full"));
    spans.push(Span::raw(" "));
    spans.extend(key_hint("c", "copy"));
    spans.push(Span::raw(" "));
    spans.extend(key_hint("?", "help"));
    spans.push(Span::raw(" "));
    spans.extend(key_hint("q", "quit"));

    push_span_padding(&mut spans, area.width as usize);
    frame.render_widget(Clear, area);
    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}

fn render_status_bar_compact(frame: &mut Frame, area: Rect, state: &AppState) {
    let live = if state.loading {
        "⠋ syncing"
    } else {
        "● live"
    };
    let totals = state
        .data
        .as_ref()
        .map(|data| {
            format!(
                "{}x {}",
                data.total_instances,
                fmt_mb(data.total_claude_mem)
            )
        })
        .unwrap_or_default();
    let alerts = state
        .data
        .as_ref()
        .map(|data| {
            if data.anomalies.is_empty() {
                "✓".to_string()
            } else {
                format!("⚠  {}", data.anomalies.len())
            }
        })
        .unwrap_or_default();
    let alert_count = state
        .data
        .as_ref()
        .map(|data| data.anomalies.len())
        .unwrap_or(0);
    let copied = if state.copied_until.is_some() {
        "│✓ copy"
    } else {
        ""
    };
    let mut line = match state.focus {
        FocusPane::Sys => format!(
            "lazyme│ {live}│{totals}│ {alerts}│sys {copied}│ rfreshTab cycle1-4focusj/k navg fullc copy?helpq quit"
        ),
        FocusPane::Agents => format!(
            "lazyme│ {live}│{totals}│⚠⚠ {alert_count}│ agents{copied}│r freshTabcycle1-4     j/k navg fullc copy? helpqqui"
        ),
        FocusPane::Dev => format!(
            "lazyme│ {live}│{totals}│ {alerts}│dev {copied}│ rfreshTab cycle1-4focusj/k navg fullc copy?helpq quit"
        ),
        FocusPane::Docker => format!(
            "lazyme│ {live}│{totals}│⚠⚠ {alert_count}│ docker{copied}│r freshTabcycle1-4     j/k navg fullc copy? helpqqui"
        ),
    };
    line = pad_right(&line, area.width as usize);
    frame.render_widget(Clear, area);
    frame.render_widget(Paragraph::new(Line::from(line)), area);
}

fn render_help_screen(frame: &mut Frame) {
    let area = centered_rect(58, 34, frame.area());
    frame.render_widget(Clear, area);
    let block = Block::default()
        .title(" help ")
        .title_alignment(ratatui::layout::Alignment::Center)
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(SYS_FOCUS))
        .style(Style::default().fg(FG_TEXT));
    let divider = pad_right(&"─".repeat(48), 56);
    let text = Paragraph::new(vec![
        Line::from(divider.clone()),
        Line::from(""),
        Line::from(pad_right("r         refresh data", 56)),
        Line::from(""),
        Line::from(pad_right(
            "Tab       cycle focus  sys → agents → dev → docker",
            56,
        )),
        Line::from(""),
        Line::from(pad_right("1–4       jump to panel directly", 56)),
        Line::from(""),
        Line::from(pad_right(
            "j / ↓     navigate down within focused panel",
            56,
        )),
        Line::from(""),
        Line::from(pad_right("k / ↑     navigate up within focused panel", 56)),
        Line::from(""),
        Line::from(pad_right(
            "g         fullscreen focused panel  (g or Esc to exit)",
            56,
        )),
        Line::from(""),
        Line::from(pad_right("?         toggle this help", 56)),
        Line::from(""),
        Line::from(pad_right("Esc       exit fullscreen or close help", 56)),
        Line::from(""),
        Line::from(pad_right("q         quit", 56)),
        Line::from(""),
        Line::from(""),
        Line::from(divider),
        Line::from(""),
        Line::from(pad_right("panels:", 56)),
        Line::from(pad_right("sys", 56)),
        Line::from(pad_right("agents", 56)),
        Line::from(pad_right("dev", 56)),
        Line::from(pad_right("docker", 56)),
        Line::from(""),
        Line::from(pad_right("focused panel expands, others compress", 56)),
        Line::from(""),
        Line::from(pad_right("? or Esc to close", 56)),
    ])
    .block(block)
    .wrap(Wrap { trim: false });
    frame.render_widget(text, area);
}

fn render_fullscreen_footer(frame: &mut Frame, area: Rect) {
    let line = Line::from(Span::styled(
        "exit fullscreen",
        Style::default().fg(BORDER_DIM),
    ));
    frame.render_widget(Clear, area);
    frame.render_widget(
        Paragraph::new(line).style(Style::default().fg(FG_TEXT)),
        area,
    );
}

fn panel_block(title: &str, focused: bool, color: Color) -> Block<'static> {
    let border_color = if focused { color } else { BORDER_DIM };
    Block::default()
        .title(format!("─ {title} "))
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(border_color))
        .style(Style::default().fg(FG_TEXT))
}

fn focus_color(focus: FocusPane) -> Color {
    match focus {
        FocusPane::Sys => SYS_FOCUS,
        FocusPane::Agents => AGENTS_FOCUS,
        FocusPane::Dev => DEV_FOCUS,
        FocusPane::Docker => DOCKER_FOCUS,
    }
}

fn focus_key(focus: FocusPane) -> &'static str {
    match focus {
        FocusPane::Sys => "sys",
        FocusPane::Agents => "agents",
        FocusPane::Dev => "dev",
        FocusPane::Docker => "docker",
    }
}

fn docker_detail_lines(
    container: &crate::state::DockerContainer,
    mem_color: Color,
    panel_w: usize,
) -> Vec<Line<'static>> {
    let detail_w = panel_w.saturating_sub(11).max(10);
    let mut lines = vec![Line::from(vec![
        Span::styled("  name   ", Style::default().fg(FG_SUBTLE)),
        Span::styled(
            slice_text(&container.name, detail_w),
            Style::default().fg(FG_TEXT),
        ),
    ])];

    if let Some(image) = container.image.as_deref() {
        if !image.is_empty() {
            lines.push(Line::from(vec![
                Span::styled("  image  ", Style::default().fg(FG_SUBTLE)),
                Span::styled(slice_text(image, detail_w), Style::default().fg(FG_MUTED)),
            ]));
        }
    }

    lines.push(Line::from(vec![
        Span::styled("  cpu    ", Style::default().fg(FG_SUBTLE)),
        Span::styled(
            container.cpu.trim().to_string(),
            Style::default().fg(FG_MUTED),
        ),
        Span::styled("   mem   ", Style::default().fg(FG_SUBTLE)),
        Span::styled(
            container.mem.trim().to_string(),
            Style::default().fg(mem_color),
        ),
    ]));

    lines
}

fn key_hint<'a>(key: &'a str, desc: &'a str) -> Vec<Span<'a>> {
    vec![
        Span::styled(key, Style::default().fg(Color::Rgb(0x4d, 0x55, 0x66))),
        Span::styled(format!(" {desc}"), Style::default().fg(FG_MUTED)),
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BuddyMood {
    Chill,
    Wary,
    Alarmed,
    Crisis,
}

fn buddy_sprite_color(data: Option<&AuditData>, _elapsed: std::time::Duration) -> Color {
    match buddy_state(data).0 {
        BuddyMood::Chill | BuddyMood::Wary => DEV_FOCUS,
        BuddyMood::Alarmed => Color::Rgb(0xf0, 0x88, 0x3e),
        BuddyMood::Crisis => ERROR,
    }
}

fn buddy_eye(data: Option<&AuditData>, elapsed: std::time::Duration) -> char {
    if buddy_frame_hint(elapsed) == -1 {
        return '-';
    }

    match buddy_state(data).0 {
        BuddyMood::Chill => '*',
        BuddyMood::Wary => 'o',
        BuddyMood::Alarmed => 'O',
        BuddyMood::Crisis => 'x',
    }
}

fn buddy_sprite(data: Option<&AuditData>, elapsed: std::time::Duration) -> Vec<String> {
    let eye = buddy_eye(data, elapsed);
    match buddy_frame_hint(elapsed) {
        1 => vec![
            "   \\^^^/    ".to_string(),
            "  .------.  ".to_string(),
            format!(" ( {eye}    {eye} ) "),
            " (  .__>  ) ".to_string(),
            "  `------´  ".to_string(),
        ],
        2 => vec![
            "   \\^^^/ o  ".to_string(),
            "  .------.  ".to_string(),
            format!(" ( {eye}    {eye} ) "),
            " (  .__.  ) ".to_string(),
            "  `------´| ".to_string(),
        ],
        _ => vec![
            "   \\^^^/    ".to_string(),
            "  .------.  ".to_string(),
            format!(" ( {eye}    {eye} ) "),
            " (  .__.  ) ".to_string(),
            "  `------´  ".to_string(),
        ],
    }
}

fn buddy_quip(data: Option<&AuditData>, elapsed: std::time::Duration) -> String {
    let (_, pool) = buddy_state(data);
    let idx = if deterministic_buddy() {
        0
    } else {
        ((elapsed.as_millis() / 20_000) as usize) % pool.len()
    };
    pool[idx].clone()
}

fn buddy_frame_hint(elapsed: std::time::Duration) -> i32 {
    const IDLE_SEQ: [i32; 15] = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
    if deterministic_buddy() {
        0
    } else {
        IDLE_SEQ[((elapsed.as_millis() / 500) as usize) % IDLE_SEQ.len()]
    }
}

fn buddy_elapsed(state: &AppState) -> std::time::Duration {
    if deterministic_buddy() {
        std::time::Duration::ZERO
    } else {
        state.started_at.elapsed()
    }
}

fn memory_pct(used_mb: u64, total_mb: u64) -> u64 {
    if total_mb == 0 {
        0
    } else {
        ((used_mb as f64 / total_mb as f64) * 100.0).round() as u64
    }
}

fn deterministic_buddy() -> bool {
    std::env::var("LAZYMEM_DETERMINISTIC_BUDDY").is_ok_and(|value| value == "1")
        || std::env::var_os("LAZYMEM_FIXTURE").is_some()
        || std::env::var("LAZYMEM_BENCHMARK").is_ok_and(|value| value == "1")
}

fn buddy_state(data: Option<&AuditData>) -> (BuddyMood, Vec<String>) {
    let Some(data) = data else {
        return (
            BuddyMood::Chill,
            vec!["Booting up. Adjusting crown. Calibrating cunning...".to_string()],
        );
    };

    let mood = calc_buddy_mood(data);
    let mut observations = Vec::new();
    observations.extend(observe_ram(data));
    observations.extend(observe_swap(data));
    observations.extend(observe_compressor(data));
    observations.extend(observe_sessions(data));
    observations.extend(observe_agents(data));
    observations.extend(observe_docker(data));
    observations.extend(observe_processes(data));
    observations.extend(observe_anomalies(data));

    let filler = vec![
        "I sit here, a prince among processes, watching bytes like a digital river.".to_string(),
        "*adjusts crown, stares at memory graphs, sighs regally*".to_string(),
        "Another cycle, another chance to deploy my legendary cunning. Any moment now.".to_string(),
        "The realm is quiet. I shall use this time to scheme. Cunningly.".to_string(),
        "Waiting. Watching. Occasionally judging your process management. Royally.".to_string(),
        "I could be conquering kingdoms but instead I'm watching your RSS values.".to_string(),
        "A prince reduced to monitoring malloc. What would father say.".to_string(),
        "Somewhere, Baldrick is having a worse day than your memory. Probably.".to_string(),
        "All systems nominal. A phrase I find deeply unsatisfying.".to_string(),
        "Everything's fine. Which historically means something is about to go wrong.".to_string(),
    ];

    let pool = if observations.is_empty() {
        filler
    } else {
        let mut pool = observations;
        pool.extend(filler.into_iter().take(3));
        pool
    };

    (mood, pool)
}

fn calc_buddy_mood(data: &AuditData) -> BuddyMood {
    let ram_pct = memory_pct(data.system.used_mb, data.system.total_mb);
    let has_heavy_swap =
        data.system.swap.as_ref().is_some_and(|swap| {
            parse_float_prefix(&swap.used) > parse_float_prefix(&swap.total) * 0.5
        });
    let error_count = data
        .anomalies
        .iter()
        .filter(|anomaly| matches!(anomaly.severity, crate::state::AnomalySeverity::Error))
        .count();

    if ram_pct > 90 || has_heavy_swap || error_count > 0 {
        BuddyMood::Crisis
    } else if ram_pct > 75 || data.total_instances > 6 {
        BuddyMood::Alarmed
    } else if ram_pct > 50 || data.total_instances > 3 {
        BuddyMood::Wary
    } else {
        BuddyMood::Chill
    }
}

fn observe_ram(data: &AuditData) -> Vec<String> {
    let ram_pct = memory_pct(data.system.used_mb, data.system.total_mb);
    let used = fmt_mb(data.system.used_mb);
    let total = fmt_mb(data.system.total_mb);

    if ram_pct > 90 {
        vec![
            format!("RAM at {ram_pct}%. My cunning plan: PANIC. Backup plan: ALSO PANIC."),
            format!("{used} of {total} used. The OOM killer is warming up. I can feel it."),
            format!("{ram_pct}% RAM. We're past cunning plans and into blind prayer territory."),
        ]
    } else if ram_pct > 75 {
        vec![
            format!("RAM at {ram_pct}%. I have a cunning plan involving the kill command."),
            format!(
                "{used} of {total}. Your memory has the structural integrity of a wet biscuit."
            ),
            format!("{ram_pct}% used. Even Baldrick would say 'that's a bit much, my lord'."),
        ]
    } else if ram_pct > 50 {
        vec![
            format!("RAM at {ram_pct}%. Not dire, but I'm keeping one eye on the exits."),
            format!("{used} of {total}. Usage is climbing like my anxiety."),
            format!(
                "{ram_pct}% memory used. The sensible thing would be to close something. You won't."
            ),
        ]
    } else {
        vec![
            format!("RAM at {ram_pct}%. The kingdom is at peace. Suspiciously so."),
            format!("{used} of {total}. Plenty of headroom. I'm almost bored."),
            format!(
                "{ram_pct}% used. Your memory management is... adequate. Don't let it go to your head."
            ),
        ]
    }
}

fn observe_swap(data: &AuditData) -> Vec<String> {
    let Some(swap) = &data.system.swap else {
        return Vec::new();
    };
    let used = parse_float_prefix(&swap.used);
    if used <= 0.0 {
        return Vec::new();
    }
    let total = parse_float_prefix(&swap.total);
    if used > total * 0.5 {
        return vec![
            format!(
                "Swap is {} used. The disk is doing RAM's job. Peasant work.",
                swap.used
            ),
            format!("Heavy swap at {}. Your SSD is weeping quietly.", swap.used),
        ];
    }
    if used > 1024.0 {
        return vec![format!(
            "{} in swap. macOS hoarding as usual, but keep an eye on it.",
            swap.used
        )];
    }
    Vec::new()
}

fn observe_compressor(data: &AuditData) -> Vec<String> {
    let ratio = data.system.comp_mb as f64 / data.system.total_mb.max(1) as f64;
    if ratio < 0.1 {
        return Vec::new();
    }
    let comp = fmt_mb(data.system.comp_mb);
    if ratio > 0.2 {
        vec![
            format!(
                "Compressor holding {comp}. Your RAM is being squeezed like a tax collector's heart."
            ),
            format!("{comp} compressed. The kernel is playing Tetris with your pages, and losing."),
        ]
    } else {
        vec![format!(
            "{comp} in compressor. macOS is quietly rearranging the furniture."
        )]
    }
}

fn observe_sessions(data: &AuditData) -> Vec<String> {
    if data.sessions.is_empty() {
        return Vec::new();
    }

    let mut sessions = data.sessions.clone();
    sessions.sort_by(|left, right| right.total_mem.cmp(&left.total_mem));
    let top = &sessions[0];
    let top_mem = fmt_mb(top.total_mem);
    let mut out = Vec::new();

    if top.total_mem > 500 {
        out.push(format!(
            "\"{}\" is devouring {top_mem}. I'd call it gluttonous, but I've met Henry VIII.",
            top.name
        ));
        out.push(format!(
            "Session \"{}\" at {top_mem}. That's not a session, that's a siege.",
            top.name
        ));
    } else if top.total_mem > 100 {
        out.push(format!(
            "\"{}\" using {top_mem}. Modest by royal standards, but I'm watching.",
            top.name
        ));
    }

    if data.sessions.len() >= 3 {
        let names = sessions
            .iter()
            .take(3)
            .map(|session| format!("\"{}\"", session.name))
            .collect::<Vec<_>>()
            .join(", ");
        out.push(format!(
            "{} sessions running: {names}. A full court, and twice as noisy.",
            data.sessions.len()
        ));
        out.push(format!(
            "Sessions {names} competing for RAM like nobles at a feast."
        ));
    } else if data.sessions.len() == 2 {
        out.push(format!(
            "Two sessions: \"{}\" and \"{}\". A duel, essentially.",
            sessions[0].name, sessions[1].name
        ));
    }

    if top.instances > 3 {
        out.push(format!(
            "\"{}\" has {} agents. That's not multitasking, that's a riot.",
            top.name, top.instances
        ));
    }

    out
}

fn observe_agents(data: &AuditData) -> Vec<String> {
    let count = data.total_instances;
    if count <= 1 {
        return Vec::new();
    }
    let mem = fmt_mb(data.total_claude_mem);
    if count > 6 {
        vec![
            format!(
                "{count} agents consuming {mem}. I have more minions than I had at Bosworth Field."
            ),
            format!("{count} Claude instances. Each one convinced it's the protagonist. Classic."),
        ]
    } else if count > 3 {
        vec![
            format!("{count} agents using {mem}. A respectable retinue. Perhaps too respectable."),
            format!("{count} Claude agents. Democracy in action. RAM in crisis."),
        ]
    } else {
        vec![format!(
            "{count} agents sharing {mem}. A small court, but cunning."
        )]
    }
}

fn observe_docker(data: &AuditData) -> Vec<String> {
    let docker = &data.docker;
    if docker.containers.is_empty() && docker.vm_actual == 0 {
        return Vec::new();
    }

    let mut out = Vec::new();
    let container_mem = docker
        .containers
        .iter()
        .map(|container| parse_docker_mem_used(&container.mem))
        .sum::<f64>();

    if !docker.containers.is_empty() {
        let mut containers = docker.containers.clone();
        containers.sort_by(|left, right| {
            parse_docker_mem_used(&right.mem)
                .partial_cmp(&parse_docker_mem_used(&left.mem))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let top = &containers[0];
        let top_mem = parse_docker_mem_used(&top.mem);
        if top_mem > 200.0 {
            out.push(format!(
                "Container \"{}\" eating {}. Living like a king in its little box.",
                top.name,
                fmt_mb(top_mem.round() as u64)
            ));
        }
        if docker.containers.len() > 3 {
            out.push(format!(
                "{} containers running. A bustling port. An expensive port.",
                docker.containers.len()
            ));
        }
    }

    if docker.vm_actual > 500 && container_mem < docker.vm_actual as f64 * 0.3 {
        out.push(format!(
            "Colima VM has {} allocated for {} of actual use. Royal waste.",
            docker.colima_alloc,
            fmt_mb(container_mem.round() as u64)
        ));
        out.push("Your VM allocation would embarrass the entire Tudor treasury.".to_string());
    }

    out
}

fn observe_processes(data: &AuditData) -> Vec<String> {
    let Some(hog) = data.top_procs.first() else {
        return Vec::new();
    };

    let mut out = Vec::new();
    let name = hog.cmd.rsplit('/').next().unwrap_or(&hog.cmd);
    let mem = fmt_mb(hog.mem_mb);

    if hog.mem_mb > 2000 {
        out.push(format!(
            "\"{name}\" at {mem}. That process has the appetite of a Tudor monarch."
        ));
        out.push(format!(
            "{mem} to \"{name}\". What is it DOING in there? Hosting a coronation?"
        ));
    } else if hog.mem_mb > 800 {
        out.push(format!(
            "\"{name}\" leading the pack at {mem}. I'd investigate, but I'm a prince, not a detective."
        ));
    } else if hog.mem_mb > 300 {
        out.push(format!(
            "Top process: \"{name}\" at {mem}. Unremarkable. I expected more drama."
        ));
    }

    let heavy = data
        .top_procs
        .iter()
        .filter(|proc_| proc_.mem_mb > 500)
        .collect::<Vec<_>>();
    if heavy.len() >= 3 {
        let names = heavy
            .iter()
            .take(3)
            .map(|proc_| {
                proc_
                    .cmd
                    .rsplit('/')
                    .next()
                    .unwrap_or(&proc_.cmd)
                    .to_string()
            })
            .collect::<Vec<_>>()
            .join(", ");
        out.push(format!(
            "{} processes over 500M: {names}. A consortium of gluttony.",
            heavy.len()
        ));
    }

    out
}

fn observe_anomalies(data: &AuditData) -> Vec<String> {
    let mut out = Vec::new();
    for anomaly in &data.anomalies {
        match anomaly.severity {
            crate::state::AnomalySeverity::Error => out.push(format!(
                "ALERT: \"{}\" - I had a cunning plan for this! ...it's gone.",
                anomaly.text
            )),
            crate::state::AnomalySeverity::Warning => out.push(format!(
                "Warning spotted: \"{}\" *adjusts crown nervously*",
                anomaly.text
            )),
            crate::state::AnomalySeverity::Info => {}
        }
    }
    out
}

fn wrap_buddy_text(text: &str, max_width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in text.split_whitespace() {
        if !line.is_empty() && line.len() + word.len() + 1 > max_width {
            lines.push(line);
            line = word.to_string();
        } else if line.is_empty() {
            line = word.to_string();
        } else {
            line.push(' ');
            line.push_str(word);
        }
    }
    if !line.is_empty() {
        lines.push(line);
    }
    lines
}

fn build_buddy_bubble(text: &str, max_width: usize) -> Vec<String> {
    let wrapped = wrap_buddy_text(text, max_width);
    let width = wrapped
        .iter()
        .map(|line| line.len())
        .max()
        .unwrap_or(max_width)
        .max(max_width);
    let mut lines = Vec::new();
    lines.push(format!(" .{}.", "-".repeat(width + 2)));
    lines.push(format!(
        "<  {:width$}  |",
        wrapped.first().cloned().unwrap_or_default(),
        width = width
    ));
    for line in wrapped.iter().skip(1) {
        lines.push(format!("|  {:width$}  |", line, width = width));
    }
    lines.push(format!(" '{}'", "-".repeat(width + 2)));
    lines
}

fn fmt_mb(mb: u64) -> String {
    if mb >= 1024 {
        return format!("{:.1}G", mb as f64 / 1024.0);
    }
    format!("{mb}M")
}

fn centered_rect(width: u16, height: u16, area: Rect) -> Rect {
    let [vertical] = Layout::vertical([Constraint::Length(height)])
        .flex(Flex::Center)
        .areas(area);
    let [horizontal] = Layout::horizontal([Constraint::Length(width)])
        .flex(Flex::Center)
        .areas(vertical);
    horizontal
}

fn dashboard_panel_width(total_width: u16) -> usize {
    match breakpoint(total_width) {
        Breakpoint::Narrow => usize::from(total_width.saturating_sub(4)).max(20),
        Breakpoint::Medium => usize::from(total_width / 2).saturating_sub(4).max(20),
        Breakpoint::Wide => usize::from(total_width / 3).saturating_sub(4).max(20),
    }
}

fn system_title(data: Option<&AuditData>) -> String {
    let Some(data) = data else {
        return "[1] sys".to_string();
    };
    let pct = ((data.system.used_mb as f64 / data.system.total_mb.max(1) as f64) * 100.0).round();
    format!(
        "[1] sys  {}/{} · {:.0}%",
        fmt_mb(data.system.used_mb),
        fmt_mb(data.system.total_mb),
        pct
    )
}

fn agents_title(data: Option<&AuditData>) -> String {
    let Some(data) = data else {
        return "[2] agents".to_string();
    };

    let claude = data
        .sessions
        .iter()
        .map(|session| session.instances)
        .sum::<u64>();
    let codex = data
        .sessions
        .iter()
        .map(|session| session.codex_instances)
        .sum::<u64>();
    let mut parts = vec![format!("[2] agents  {}", fmt_mb(data.total_claude_mem))];
    if claude > 0 {
        parts.push(format!("claude {claude}x"));
    }
    if codex > 0 {
        parts.push(format!("codex {codex}x"));
    }
    parts.join("  ")
}

fn dev_title(data: Option<&AuditData>) -> String {
    let Some(data) = data else {
        return "[3] dev".to_string();
    };
    let groups = dev_groups(data);
    if groups.is_empty() {
        return "[3] dev".to_string();
    }

    format!(
        "[3] dev  {} · {}",
        groups.len(),
        fmt_mb(groups.iter().map(|group| group.total_mem).sum())
    )
}

fn docker_title(data: Option<&AuditData>) -> String {
    let Some(data) = data else {
        return "[4] docker".to_string();
    };

    let vm_str = if data.docker.colima_alloc != "N/A" {
        format!("VM {}", data.docker.colima_alloc)
    } else {
        "no VM".to_string()
    };

    if data.docker.containers.is_empty() {
        return format!("[4] docker  {}", vm_str);
    }

    format!(
        "[4] docker  {} · {} container{}",
        vm_str,
        data.docker.containers.len(),
        if data.docker.containers.len() == 1 {
            ""
        } else {
            "s"
        }
    )
}

#[derive(Debug, Clone)]
struct SystemProcGroup {
    name: String,
    total_mb: u64,
    procs: Vec<TopProc>,
}

fn system_proc_groups(data: &AuditData) -> Vec<SystemProcGroup> {
    let covered = data
        .processes
        .iter()
        .map(|process| process.pid.clone())
        .collect::<HashSet<_>>();
    let mut groups = HashMap::<String, Vec<TopProc>>::new();

    for proc_ in &data.top_procs {
        if proc_.cmd.trim().is_empty()
            || covered.contains(&proc_.pid)
            || proc_.args.contains("com.apple.Virtu")
            || proc_.args.contains(".agent-browser/")
        {
            continue;
        }
        groups
            .entry(proc_.cmd.clone())
            .or_default()
            .push(proc_.clone());
    }

    let mut values = groups
        .into_iter()
        .map(|(name, mut procs)| {
            procs.sort_by(|left, right| right.mem_mb.cmp(&left.mem_mb));
            let total_mb = procs.iter().map(|proc_| proc_.mem_mb).sum();
            SystemProcGroup {
                name,
                total_mb,
                procs,
            }
        })
        .collect::<Vec<_>>();
    values.sort_by(|left, right| {
        right
            .total_mb
            .cmp(&left.total_mb)
            .then_with(|| left.name.cmp(&right.name))
    });
    values
}

fn system_proc_total_count(data: &AuditData) -> usize {
    system_proc_groups(data)
        .iter()
        .map(|group| group.procs.len())
        .sum()
}

fn system_memory_lines(data: &AuditData, mem_bar_w: usize, val_w: usize) -> Vec<Line<'static>> {
    let total_mb = data.system.total_mb.max(1) as f64;
    let mut lines = vec![
        memory_bar_line(
            "app",
            data.system.app_mb,
            data.system.app_mb as f64 / total_mb,
            SYS_FOCUS,
            mem_bar_w,
            val_w,
        ),
        memory_bar_line(
            "wired",
            data.system.wired_mb,
            data.system.wired_mb as f64 / total_mb,
            FG_SUBTLE,
            mem_bar_w,
            val_w,
        ),
        memory_bar_line(
            "comp",
            data.system.comp_mb,
            data.system.comp_mb as f64 / total_mb,
            DEV_FOCUS,
            mem_bar_w,
            val_w,
        ),
        memory_bar_line(
            "cached",
            data.system.cached_mb,
            data.system.cached_mb as f64 / total_mb,
            BORDER_DIM,
            mem_bar_w,
            val_w,
        ),
        memory_bar_line(
            "free",
            data.system.free_mb,
            data.system.free_mb as f64 / total_mb,
            Color::Rgb(0x2d, 0x33, 0x3b),
            mem_bar_w,
            val_w,
        ),
    ];

    if swap_total_mb(&data.system) > 0.0 {
        let swap_pct = swap_pct(&data.system);
        let swap_color = if swap_pct > 0.5 { DEV_FOCUS } else { FG_SUBTLE };
        lines.push(memory_bar_line_str(
            "swap",
            swap_val_str(&data.system),
            swap_pct,
            swap_color,
            mem_bar_w,
            val_w,
        ));
    }

    lines
}

fn memory_bar_line(
    label: &str,
    value_mb: u64,
    pct: f64,
    color: Color,
    bar_w: usize,
    val_w: usize,
) -> Line<'static> {
    memory_bar_line_str(label, fmt_mb(value_mb), pct, color, bar_w, val_w)
}

fn memory_bar_line_str(
    label: &str,
    value: String,
    pct: f64,
    color: Color,
    bar_w: usize,
    val_w: usize,
) -> Line<'static> {
    let mut spans = vec![Span::styled(
        format!("{:<8}", format!("  {label}")),
        Style::default().fg(color),
    )];
    spans.extend(bar_spans(pct, bar_w, color, GRID_DIM, Style::default()));
    spans.push(Span::styled(
        format!("{:>width$}", value, width = val_w),
        Style::default().fg(color),
    ));
    Line::from(spans)
}

fn bar_spans(
    pct: f64,
    width: usize,
    fg: Color,
    empty_fg: Color,
    style: Style,
) -> Vec<Span<'static>> {
    let clamped = pct.clamp(0.0, 1.0);
    let filled = (clamped * width as f64).round() as usize;
    let empty = width.saturating_sub(filled);
    vec![
        Span::styled("▪".repeat(filled), style.fg(fg)),
        Span::styled(" ".repeat(empty), style.fg(empty_fg)),
    ]
}

fn proc_color(mb: u64, total_mb: u64) -> Color {
    let pct = mb as f64 / total_mb.max(1) as f64;
    if pct > 0.025 {
        ERROR
    } else if pct > 0.010 {
        DEV_FOCUS
    } else if pct > 0.003 {
        FG_TEXT
    } else {
        FG_MUTED
    }
}

fn digit_color(pct: f64) -> Color {
    if pct > 0.90 {
        ERROR
    } else if pct > 0.75 {
        DEV_FOCUS
    } else {
        AGENTS_FOCUS
    }
}

fn dot_matrix_row_spans(
    label: &str,
    row: usize,
    width: usize,
    pct: f64,
    left_margin: usize,
    ref_width: usize,
) -> Vec<Span<'static>> {
    let glyph_w = glyph_width(label);
    let show_digits = glyph_w + 2 <= width;
    let offset = if show_digits {
        (ref_width as isize - glyph_w as isize) / 2 - left_margin as isize
    } else {
        0
    };
    let line = if show_digits {
        rasterize_line(label, row)
    } else {
        Vec::new()
    };

    let mut runs = Vec::<(Color, usize)>::new();
    for col in 0..width {
        let local_col = col as isize - offset;
        let is_digit = show_digits
            && local_col >= 0
            && (local_col as usize) < line.len()
            && line[local_col as usize];
        let color = if is_digit { digit_color(pct) } else { GRID_DIM };
        if let Some((current_color, count)) = runs.last_mut() {
            if *current_color == color {
                *count += 1;
                continue;
            }
        }
        runs.push((color, 1));
    }

    runs.into_iter()
        .map(|(color, count)| Span::styled("▪".repeat(count), Style::default().fg(color)))
        .collect()
}

fn glyph_width(text: &str) -> usize {
    let len = text.chars().count();
    if len == 0 { 0 } else { len * 5 + (len - 1) * 2 }
}

fn rasterize_line(text: &str, row: usize) -> Vec<bool> {
    let mut out = Vec::new();
    for (index, ch) in text.chars().enumerate() {
        if index > 0 {
            out.extend(std::iter::repeat_n(false, 2));
        }
        let mask = dot_font(ch)[row];
        for bit in (0..5).rev() {
            out.push(mask & (1 << bit) != 0);
        }
    }
    out
}

fn dot_font(ch: char) -> [u8; 7] {
    match ch {
        '0' => [14, 17, 17, 17, 17, 17, 14],
        '1' => [4, 12, 4, 4, 4, 4, 14],
        '2' => [14, 17, 1, 6, 8, 16, 31],
        '3' => [30, 1, 1, 14, 1, 1, 30],
        '4' => [17, 17, 17, 31, 1, 1, 1],
        '5' => [31, 16, 16, 30, 1, 1, 30],
        '6' => [14, 16, 16, 30, 17, 17, 14],
        '7' => [31, 1, 2, 4, 4, 4, 4],
        '8' => [14, 17, 17, 14, 17, 17, 14],
        '9' => [14, 17, 17, 15, 1, 1, 14],
        _ => [0; 7],
    }
}

fn swap_total_mb(system: &crate::state::SystemInfo) -> f64 {
    system
        .swap
        .as_ref()
        .map(|swap| parse_swap_mb(&swap.total))
        .unwrap_or(0.0)
}

fn swap_pct(system: &crate::state::SystemInfo) -> f64 {
    let total = swap_total_mb(system);
    if total <= 0.0 {
        0.0
    } else {
        system
            .swap
            .as_ref()
            .map(|swap| parse_swap_mb(&swap.used) / total)
            .unwrap_or(0.0)
    }
}

fn swap_val_str(system: &crate::state::SystemInfo) -> String {
    let used = system
        .swap
        .as_ref()
        .map(|swap| fmt_mb(parse_swap_mb(&swap.used).round() as u64))
        .unwrap_or_else(|| "0M".to_string());
    let total = system
        .swap
        .as_ref()
        .map(|swap| fmt_mb(parse_swap_mb(&swap.total).round() as u64))
        .unwrap_or_else(|| "0M".to_string());
    format!("{used}/{total}")
}

fn parse_swap_mb(value: &str) -> f64 {
    let number = value
        .trim_end_matches(|ch: char| ch.is_ascii_alphabetic())
        .parse::<f64>()
        .unwrap_or(0.0);
    if value.to_ascii_uppercase().contains('G') {
        number * 1024.0
    } else {
        number
    }
}

fn parse_float_prefix(value: &str) -> f64 {
    value
        .chars()
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.')
        .collect::<String>()
        .parse::<f64>()
        .unwrap_or(0.0)
}

fn truncate_pad(text: &str, width: usize) -> String {
    format!("{:<width$}", slice_text(text, width), width = width)
}

fn pad_right(text: &str, width: usize) -> String {
    format!("{:<width$}", slice_text(text, width), width = width)
}

fn push_span_padding(spans: &mut Vec<Span<'static>>, width: usize) {
    let used = spans
        .iter()
        .map(|span| span.content.chars().count())
        .sum::<usize>();
    if used < width {
        spans.push(Span::raw(" ".repeat(width - used)));
    }
}

fn inner_height(area: Rect) -> usize {
    area.height.saturating_sub(2) as usize
}

fn paragraph_scroll(anchor_line: Option<usize>, total_lines: usize, inner_height: usize) -> u16 {
    if inner_height == 0 || total_lines <= inner_height {
        return 0;
    }

    let anchor = anchor_line.unwrap_or(0);
    let desired = anchor.saturating_sub(inner_height / 2);
    desired.min(total_lines.saturating_sub(inner_height)) as u16
}

fn overlay_text(base: &str, overlay: &str) -> String {
    let mut chars = base.chars().collect::<Vec<_>>();
    for (index, ch) in overlay.chars().enumerate() {
        if index >= chars.len() {
            break;
        }
        if ch != ' ' {
            chars[index] = ch;
        }
    }
    chars.into_iter().collect()
}

fn system_proc_row_text(
    group: &SystemProcGroup,
    selected: bool,
    proc_name_w: usize,
    proc_bar_w: usize,
    val_w: usize,
    max_group_mem: u64,
) -> String {
    let marker = if selected { "▸ " } else { "  " };
    let raw_label = if group.procs.len() > 1 {
        format!("{} ×{}", group.name, group.procs.len())
    } else {
        group.name.clone()
    };
    let label = truncate_pad(&raw_label, proc_name_w);
    let bar = "▪".repeat(
        ((group.total_mb as f64 / max_group_mem.max(1) as f64) * proc_bar_w as f64).round()
            as usize,
    );
    let bar = format!("{bar:<width$}", width = proc_bar_w);
    format!(
        "{marker}{label} {bar}{:>width$}",
        fmt_mb(group.total_mb),
        width = val_w,
    )
}

fn slice_text(text: &str, width: usize) -> String {
    text.chars().take(width).collect()
}

#[derive(Debug, Clone)]
struct DevSession {
    service: String,
    count: usize,
    mem: u64,
}

#[derive(Debug, Clone)]
struct DevGroup {
    label: String,
    total_count: usize,
    total_mem: u64,
    sessions: Vec<DevSession>,
}

fn dev_groups(data: &AuditData) -> Vec<DevGroup> {
    let mut tty_to_session = HashMap::<String, String>::new();
    let mut path_to_session = HashMap::<String, String>::new();
    for pane in &data.tmux {
        tty_to_session.insert(pane.tty.replace("/dev/", ""), pane.session.clone());
        if let Some(folder) = pane
            .path
            .split('/')
            .filter(|part| !part.is_empty())
            .next_back()
        {
            if !folder.is_empty() {
                path_to_session.insert(folder.to_string(), pane.session.clone());
            }
        }
    }

    let mut by_label = BTreeMap::<String, Vec<DevSession>>::new();
    for process in &data.processes {
        if is_dev_sidecar(&process.args) || process.mem <= 20 {
            continue;
        }

        let in_tmux = tty_to_session.contains_key(&process.tty);
        let is_background = process.tty == "??";
        if !in_tmux && !is_background {
            continue;
        }

        let label = classify_dev_process(&process.cmd, &process.args);
        if is_background && !in_tmux && !is_known_dev_type(&label) {
            continue;
        }

        let folder = extract_service(&process.args);
        let service = tty_to_session
            .get(&process.tty)
            .cloned()
            .or_else(|| path_to_session.get(&folder).cloned())
            .unwrap_or_else(|| {
                if folder.is_empty() && is_background {
                    "background".to_string()
                } else {
                    folder
                }
            });

        let sessions = by_label.entry(label).or_default();
        if let Some(entry) = sessions.iter_mut().find(|entry| entry.service == service) {
            entry.count += 1;
            entry.mem += process.mem;
        } else {
            sessions.push(DevSession {
                service,
                count: 1,
                mem: process.mem,
            });
        }
    }

    let mut groups = by_label
        .into_iter()
        .map(|(label, sessions)| {
            let mut sessions = sessions;
            sessions.sort_by(|left, right| right.mem.cmp(&left.mem));
            DevGroup {
                label,
                total_count: sessions.iter().map(|session| session.count).sum(),
                total_mem: sessions.iter().map(|session| session.mem).sum(),
                sessions,
            }
        })
        .collect::<Vec<_>>();

    groups.sort_by(|left, right| right.total_mem.cmp(&left.total_mem));
    groups.truncate(12);
    groups
}

fn agent_mem_color(pct: f64, mb: u64) -> Color {
    if pct > 0.75 || mb > 2500 {
        ERROR
    } else if pct > 0.40 || mb > 800 {
        DEV_FOCUS
    } else {
        AGENTS_FOCUS
    }
}

fn dev_mem_color(mb: u64) -> Color {
    if mb > 1000 {
        ERROR
    } else if mb > 400 {
        DEV_FOCUS
    } else {
        FG_MUTED
    }
}

fn parse_docker_mem_used(mem: &str) -> f64 {
    let used = mem.split('/').next().unwrap_or(mem).trim();
    let numeric = used
        .chars()
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.')
        .collect::<String>();
    let number = numeric.parse::<f64>().unwrap_or(0.0);
    let upper = used.to_ascii_uppercase();
    if upper.contains("GIB") || upper.contains("GB") {
        number * 1024.0
    } else if upper.contains("MIB") || upper.contains("MB") {
        number
    } else if upper.contains("KIB") || upper.contains("KB") {
        number / 1024.0
    } else {
        number
    }
}

fn docker_mem_color(mb: f64) -> Color {
    if mb > 1000.0 {
        ERROR
    } else if mb > 400.0 {
        DEV_FOCUS
    } else {
        FG_MUTED
    }
}

fn docker_vm_ratio(docker: &crate::state::DockerInfo) -> f64 {
    if docker.colima_alloc == "N/A" {
        return 0.0;
    }
    let alloc = parse_docker_mem_used(&docker.colima_alloc);
    if alloc <= 0.0 {
        0.0
    } else {
        docker.vm_actual as f64 / alloc
    }
}

fn docker_label(container: &crate::state::DockerContainer, width: usize, selected: bool) -> String {
    if selected {
        return format!(
            "{}",
            format!("▸ {}", slice_text(&container.name, width.saturating_sub(3)))
                .chars()
                .take(width)
                .collect::<String>()
        )
        .chars()
        .chain(std::iter::repeat(' '))
        .take(width)
        .collect();
    }

    let image = container.image.as_deref().unwrap_or("");
    let image_name = image
        .split(':')
        .next()
        .unwrap_or("")
        .rsplit('/')
        .next()
        .unwrap_or("");
    let image_tag = image.split(':').nth(1).unwrap_or("");
    let show_image = !image.is_empty()
        && image_name != container.name
        && image_name != container.name.split('-').next().unwrap_or("");

    if show_image {
        let label = format!(
            "  {} [{}{}]",
            slice_text(&container.name, width.saturating_sub(14)),
            slice_text(image_name, 8),
            if !image_tag.is_empty() && image_tag != "latest" {
                format!(":{}", slice_text(image_tag, 4))
            } else {
                String::new()
            }
        );
        return truncate_pad(&slice_text(&label, width.saturating_sub(1)), width);
    }

    truncate_pad(
        &format!("  {}", slice_text(&container.name, width.saturating_sub(3))),
        width,
    )
}

fn is_dev_sidecar(args: &str) -> bool {
    args.contains("qmd mcp")
}

fn is_known_dev_type(label: &str) -> bool {
    matches!(
        label,
        "claude"
            | "codex-mcp"
            | "codex"
            | "next"
            | "vite"
            | "tsx"
            | "postcss"
            | "pnpm"
            | "tailwind-lsp"
            | "ts-lsp"
            | "python"
            | "surf-cli"
            | "qmd"
            | "telegram"
            | "nvim"
    )
}

fn classify_dev_process(cmd: &str, args: &str) -> String {
    if is_claude(cmd) {
        "claude".to_string()
    } else if args.contains("codex") && args.contains("mcp-server") {
        "codex-mcp".to_string()
    } else if is_codex_agent(cmd, args) {
        "codex".to_string()
    } else if args.contains("next") {
        "next".to_string()
    } else if args.contains("vite") {
        "vite".to_string()
    } else if args.contains("tailwindcss-language") {
        "tailwind-lsp".to_string()
    } else if args.contains("typescript-language") {
        "ts-lsp".to_string()
    } else if args.contains("tsx") {
        "tsx".to_string()
    } else if args.contains("postcss") {
        "postcss".to_string()
    } else if args.contains("pnpm") {
        "pnpm".to_string()
    } else if args.contains("python") || cmd.contains("python") {
        "python".to_string()
    } else if args.contains("surf-cli") {
        "surf-cli".to_string()
    } else if args.contains("qmd") && args.contains("--http") {
        "qmd".to_string()
    } else if args.contains("telegram") {
        "telegram".to_string()
    } else if cmd.contains("nvim") || args.contains("nvim") {
        "nvim".to_string()
    } else {
        cmd.rsplit('/').next().unwrap_or(cmd).to_string()
    }
}

fn extract_service(args: &str) -> String {
    if args.is_empty() {
        return String::new();
    }

    let candidate = if let Some(index) = args.find("node_modules") {
        &args[..index]
    } else {
        args
    };

    for token in candidate.split_whitespace().rev() {
        if !token.starts_with('/') {
            continue;
        }
        if token.contains("/.local/state/nvim/sessions/") {
            continue;
        }
        let parts = token
            .split('/')
            .filter(|part| !part.is_empty() && !part.starts_with('.') && *part != "node_modules")
            .collect::<Vec<_>>();
        if parts.len() >= 2 {
            return parts[parts.len() - 1].to_string();
        }
    }

    String::new()
}
