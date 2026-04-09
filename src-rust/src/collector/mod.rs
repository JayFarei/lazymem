use std::time::Instant;
use std::{fs, path::Path};

use anyhow::{Context, Result, bail};
use tokio::process::Command;

use crate::bench::report;
use crate::state::{Anomaly, AnomalySeverity, AuditData};

pub mod docker;
pub mod processes;
pub mod sessions;
pub mod snapshot;
pub mod system;
pub mod tmux;

#[derive(Debug, Clone)]
pub struct Wave1Data {
    pub system: crate::state::SystemInfo,
    pub top_procs: Vec<crate::state::TopProc>,
    pub tmux: Vec<crate::state::TmuxPane>,
}

#[derive(Debug, Clone)]
pub struct Wave2Data {
    pub processes: Vec<crate::state::ProcessInfo>,
    pub docker: crate::state::DockerInfo,
}

pub async fn collect_all() -> Result<AuditData> {
    let wave1 = collect_wave1().await?;
    let wave2 = collect_wave2().await?;
    Ok(build_audit_data(wave1, wave2))
}

pub fn load_fixture(path: impl AsRef<Path>) -> Result<AuditData> {
    let bytes = fs::read(path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub fn load_fixture_from_env() -> Result<Option<AuditData>> {
    let Some(path) = std::env::var_os("LAZYMEM_FIXTURE") else {
        return Ok(None);
    };
    load_fixture(path).map(Some)
}

pub async fn collect_wave1() -> Result<Wave1Data> {
    let (system, tmux, top_procs) = tokio::join!(
        system::collect_system(),
        tmux::collect_tmux(),
        processes::collect_top_procs(),
    );

    Ok(Wave1Data {
        system: system?,
        top_procs: top_procs?,
        tmux: tmux?,
    })
}

pub async fn collect_wave2() -> Result<Wave2Data> {
    let (processes, docker) =
        tokio::join!(processes::collect_processes(), docker::collect_docker(),);

    Ok(Wave2Data {
        processes: processes?,
        docker: docker?,
    })
}

pub fn build_audit_data(wave1: Wave1Data, wave2: Wave2Data) -> AuditData {
    let Wave1Data {
        system,
        top_procs,
        tmux,
    } = wave1;
    let Wave2Data { processes, docker } = wave2;

    let mut session_data = sessions::build_sessions(&processes, &tmux);
    let container_mem: f64 = docker
        .containers
        .iter()
        .map(|container| parse_leading_float(&container.mem))
        .sum();

    if docker.vm_actual > 500 && container_mem < docker.vm_actual as f64 * 0.2 {
        session_data.anomalies.push(Anomaly {
            text: format!(
                "Colima VM {} for {}MiB containers",
                docker.colima_alloc,
                container_mem.round() as u64
            ),
            severity: AnomalySeverity::Warning,
        });
    }

    AuditData {
        system,
        top_procs,
        tmux,
        processes,
        docker,
        sessions: session_data.sessions,
        anomalies: session_data.anomalies,
        total_instances: session_data.total_instances,
        total_claude_mem: session_data.total_claude_mem,
        my_tty: "unknown".to_string(),
    }
}

pub(crate) async fn run_command(command: &[&str]) -> Result<String> {
    let Some((program, args)) = command.split_first() else {
        bail!("empty command");
    };

    let started_at = Instant::now();
    let output = Command::new(program)
        .args(args)
        .output()
        .await
        .with_context(|| format!("failed to spawn {}", command.join(" ")))?;
    report::record_command(
        command,
        started_at.elapsed(),
        output.status.code().unwrap_or(-1),
        output.stdout.len(),
    );

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            bail!(
                "command `{}` failed with status {}",
                command.join(" "),
                output.status
            );
        }

        bail!(
            "command `{}` failed with status {}: {}",
            command.join(" "),
            output.status,
            stderr
        );
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn parse_leading_float(raw: &str) -> f64 {
    let numeric: String = raw
        .chars()
        .skip_while(|ch| !ch.is_ascii_digit() && *ch != '.')
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.')
        .collect();

    numeric.parse().unwrap_or(0.0)
}
