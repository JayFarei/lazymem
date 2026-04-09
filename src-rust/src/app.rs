use std::io;
use std::sync::Arc;
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
use tokio::task::JoinHandle;

use crate::bench::report::BenchmarkRuntime;
use crate::collector::{
    Wave1Data, Wave2Data, build_audit_data, collect_wave1, docker, load_fixture_from_env, processes,
};
use crate::state::{AppState, DockerInfo, FocusPane};
use crate::ui;

const MIN_SPLASH_DURATION: Duration = Duration::from_millis(300);
const POLL_INTERVAL: Duration = Duration::from_millis(200);

pub async fn run(benchmark: Arc<BenchmarkRuntime>) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, Hide)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;
    terminal.clear()?;

    let result = run_loop(&mut terminal, benchmark).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), Show, LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

async fn run_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    benchmark: Arc<BenchmarkRuntime>,
) -> Result<()> {
    let mut state = AppState::new();
    let mut refresh_count = 0usize;
    let mut benchmark_exit_deadline = None;
    let mut pending_docker = None;
    terminal.draw(|frame| ui::render(frame, &state))?;
    refresh_data(
        terminal,
        &mut state,
        &benchmark,
        &mut refresh_count,
        &mut benchmark_exit_deadline,
        &mut pending_docker,
    )
    .await?;

    loop {
        if let Some(handle) = pending_docker.as_ref() {
            if handle.is_finished() {
                if let Ok(Ok(docker_info)) = pending_docker
                    .take()
                    .expect("finished docker handle should exist")
                    .await
                {
                    apply_docker_update(&mut state, docker_info);
                }
            }
        }

        terminal.draw(|frame| ui::render(frame, &state))?;
        if state.should_quit {
            break;
        }

        if let Some(deadline) = benchmark_exit_deadline {
            if std::time::Instant::now() >= deadline {
                if let Some(handle) = pending_docker.take() {
                    handle.abort();
                }
                benchmark.mark_idle();
                benchmark.flush().await?;
                state.should_quit = true;
                continue;
            }
        }

        if !event::poll(next_poll_timeout(benchmark_exit_deadline))? {
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
            KeyCode::Char('r') if !state.show_help => {
                refresh_data(
                    terminal,
                    &mut state,
                    &benchmark,
                    &mut refresh_count,
                    &mut benchmark_exit_deadline,
                    &mut pending_docker,
                )
                .await?
            }
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

async fn refresh_data(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    state: &mut AppState,
    benchmark: &Arc<BenchmarkRuntime>,
    refresh_count: &mut usize,
    benchmark_exit_deadline: &mut Option<std::time::Instant>,
    pending_docker: &mut Option<JoinHandle<Result<DockerInfo>>>,
) -> Result<()> {
    if let Some(handle) = pending_docker.take() {
        handle.abort();
    }

    state.loading = true;
    state.status_message = Some("refreshing...".to_string());
    terminal.draw(|frame| ui::render(frame, state)).ok();

    if let Some(data) = load_fixture_from_env()? {
        let elapsed = state.started_at.elapsed();
        if elapsed < MIN_SPLASH_DURATION {
            tokio::time::sleep(MIN_SPLASH_DURATION - elapsed).await;
        }
        state.data = Some(data);
        state.error_message = None;
        state.status_message = Some("fixture data".to_string());
        state.loading = false;
        benchmark.mark_core_ready();
        if benchmark.mark_full_ready() {
            *benchmark_exit_deadline =
                Some(std::time::Instant::now() + Duration::from_millis(benchmark.idle_wait_ms()));
        }
        return Ok(());
    }

    let wave1 = collect_wave1().await?;
    let current_docker = state
        .data
        .as_ref()
        .map(|data| data.docker.clone())
        .unwrap_or_else(empty_docker);
    state.data = Some(build_audit_data(
        wave1.clone(),
        Wave2Data {
            processes: Vec::new(),
            docker: current_docker.clone(),
        },
    ));
    let elapsed = state.started_at.elapsed();
    if elapsed < MIN_SPLASH_DURATION {
        tokio::time::sleep(MIN_SPLASH_DURATION - elapsed).await;
    }
    state.error_message = None;
    state.status_message = Some("live collector data".to_string());
    state.loading = false;
    benchmark.mark_core_ready();

    let collected_processes = processes::collect_processes().await?;
    state.data = Some(build_audit_data(
        wave1,
        Wave2Data {
            processes: collected_processes,
            docker: current_docker,
        },
    ));
    state.error_message = None;
    state.status_message = Some("live collector data".to_string());
    if benchmark.mark_full_ready() {
        *benchmark_exit_deadline =
            Some(std::time::Instant::now() + Duration::from_millis(benchmark.idle_wait_ms()));
    }

    *refresh_count += 1;
    let run_docker = *refresh_count == 1 || *refresh_count % 3 == 1;
    if run_docker {
        *pending_docker = Some(tokio::spawn(async { docker::collect_docker().await }));
    }

    Ok(())
}

fn empty_docker() -> DockerInfo {
    DockerInfo {
        containers: Vec::new(),
        colima_alloc: "N/A".to_string(),
        vm_actual: 0,
    }
}

fn apply_docker_update(state: &mut AppState, docker_info: DockerInfo) {
    let Some(data) = state.data.as_ref() else {
        return;
    };

    let wave1 = Wave1Data {
        system: data.system.clone(),
        top_procs: data.top_procs.clone(),
        tmux: data.tmux.clone(),
    };
    let wave2 = Wave2Data {
        processes: data.processes.clone(),
        docker: docker_info,
    };

    state.data = Some(build_audit_data(wave1, wave2));
    state.error_message = None;
    state.status_message = Some("live collector data".to_string());
}

fn next_poll_timeout(deadline: Option<std::time::Instant>) -> Duration {
    match deadline {
        Some(deadline) => deadline
            .saturating_duration_since(std::time::Instant::now())
            .min(POLL_INTERVAL),
        None => POLL_INTERVAL,
    }
}
