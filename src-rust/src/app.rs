use std::io;
use std::time::Duration;

use anyhow::Result;
use crossterm::cursor::{Hide, Show};
use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use crossterm::execute;
use crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;

use crate::collector::{collect_all, load_fixture_from_env};
use crate::state::{AppState, FocusPane};
use crate::ui;

const MIN_SPLASH_DURATION: Duration = Duration::from_millis(300);

pub async fn run() -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, Hide)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    terminal.clear()?;

    let result = run_loop(&mut terminal).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), Show, LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

async fn run_loop(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> Result<()> {
    let mut state = AppState::new();
    terminal.draw(|frame| ui::render(frame, &state))?;
    refresh_data(terminal, &mut state).await;

    loop {
        terminal.draw(|frame| ui::render(frame, &state))?;
        if state.should_quit {
            break;
        }

        if !event::poll(Duration::from_millis(200))? {
            continue;
        }

        let Event::Key(key) = event::read()? else {
            continue;
        };
        if key.kind != KeyEventKind::Press {
            continue;
        }

        match key.code {
            KeyCode::Char('q') => state.should_quit = true,
            KeyCode::Char('?') => state.show_help = !state.show_help,
            KeyCode::Tab => {
                if !state.show_help {
                    state.cycle_focus();
                }
            }
            KeyCode::Char('1') if !state.show_help => state.set_focus(FocusPane::Sys),
            KeyCode::Char('2') if !state.show_help => state.set_focus(FocusPane::Agents),
            KeyCode::Char('3') if !state.show_help => state.set_focus(FocusPane::Dev),
            KeyCode::Char('4') if !state.show_help => state.set_focus(FocusPane::Docker),
            KeyCode::Char('j') | KeyCode::Down if !state.show_help => state.navigate_down(),
            KeyCode::Char('k') | KeyCode::Up if !state.show_help => state.navigate_up(),
            KeyCode::Enter if !state.show_help => state.toggle_expand(),
            KeyCode::Char('g') if !state.show_help => state.toggle_fullscreen(),
            KeyCode::Char('c') if !state.show_help => {
                state.status_message =
                    Some("snapshot clipboard wiring lands in Phase 5".to_string())
            }
            KeyCode::Char('r') if !state.show_help => refresh_data(terminal, &mut state).await,
            KeyCode::Esc => {
                if state.show_help {
                    state.show_help = false;
                } else if state.fullscreen.is_some() {
                    state.exit_fullscreen();
                }
            }
            _ => {}
        }
    }

    Ok(())
}

async fn refresh_data(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>, state: &mut AppState) {
    state.loading = true;
    state.status_message = Some("refreshing...".to_string());
    terminal.draw(|frame| ui::render(frame, state)).ok();

    let load_result = load_data().await;
    let elapsed = state.started_at.elapsed();
    if elapsed < MIN_SPLASH_DURATION {
        tokio::time::sleep(MIN_SPLASH_DURATION - elapsed).await;
    }

    match load_result {
        Ok(data) => {
            state.data = Some(data);
            state.error_message = None;
            state.status_message = Some(if std::env::var_os("LAZYMEM_FIXTURE").is_some() {
                "fixture data".to_string()
            } else {
                "live collector data".to_string()
            });
        }
        Err(error) => {
            state.error_message = Some(error.to_string());
            state.status_message = Some("collector error".to_string());
        }
    }

    state.loading = false;
}

async fn load_data() -> Result<crate::state::AuditData> {
    if let Some(data) = load_fixture_from_env()? {
        return Ok(data);
    }

    collect_all().await
}
