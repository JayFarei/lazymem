use std::collections::{BTreeMap, HashMap};

use crate::state::{Anomaly, AnomalySeverity, ProcessInfo, SessionSummary, TmuxPane};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionBuild {
    pub sessions: Vec<SessionSummary>,
    pub anomalies: Vec<Anomaly>,
    pub total_instances: u64,
    pub total_claude_mem: u64,
}

pub fn is_sidecar(args: &str) -> bool {
    args.contains("qmd mcp")
        || (args.contains("codex") && (args.contains("mcp-server") || args.contains("codex exec")))
}

pub fn is_claude(cmd: &str) -> bool {
    cmd == "claude" || cmd.contains("claude")
}

pub fn is_codex_agent(cmd: &str, args: &str) -> bool {
    !is_claude(cmd) && !is_sidecar(args) && args.to_lowercase().contains("codex")
}

pub fn build_sessions(processes: &[ProcessInfo], tmux: &[TmuxPane]) -> SessionBuild {
    let tty_map: HashMap<String, (&str, &str)> = tmux
        .iter()
        .map(|pane| {
            (
                pane.tty.replace("/dev/", ""),
                (pane.session.as_str(), pane.path.as_str()),
            )
        })
        .collect();

    let mut session_map: BTreeMap<String, SessionAccumulator> = BTreeMap::new();
    for process in processes {
        if process.tty == "??" || process.tty.is_empty() {
            continue;
        }

        let Some((session_name, path)) = tty_map.get(&process.tty).copied() else {
            continue;
        };

        let entry = session_map
            .entry(session_name.to_string())
            .or_insert_with(|| SessionAccumulator {
                project: String::new(),
                claudes: 0,
                codex: 0,
                sidecars: 0,
                mem: 0,
            });

        if entry.project.is_empty() {
            entry.project = project_from_path(path);
        }

        entry.mem += process.mem;
        if is_claude(&process.cmd) {
            entry.claudes += 1;
        } else if is_codex_agent(&process.cmd, &process.args) {
            entry.codex += 1;
        } else if is_sidecar(&process.args) {
            entry.sidecars += 1;
        }
    }

    let mut sessions: Vec<SessionSummary> = session_map
        .into_iter()
        .map(|(name, value)| SessionSummary {
            name,
            project: value.project,
            instances: value.claudes,
            codex_instances: value.codex,
            sidecars: value.sidecars,
            total_mem: value.mem,
        })
        .filter(|session| session.instances > 0 || session.codex_instances > 0)
        .collect();

    sessions.sort_by(|left, right| {
        right
            .total_mem
            .cmp(&left.total_mem)
            .then_with(|| left.name.cmp(&right.name))
    });

    let anomalies = sessions
        .iter()
        .filter_map(|session| {
            let total = session.instances + session.codex_instances;
            let severity = if total > 4 {
                Some(AnomalySeverity::Error)
            } else if total >= 3 {
                Some(AnomalySeverity::Warning)
            } else {
                None
            }?;

            Some(Anomaly {
                text: format!(
                    "{}: {}c+{}x agents ({})",
                    session.name,
                    session.instances,
                    session.codex_instances,
                    fmt_mb(session.total_mem)
                ),
                severity,
            })
        })
        .collect::<Vec<_>>();

    let total_instances = sessions
        .iter()
        .map(|session| session.instances + session.codex_instances)
        .sum();
    let total_claude_mem = sessions.iter().map(|session| session.total_mem).sum();

    SessionBuild {
        sessions,
        anomalies,
        total_instances,
        total_claude_mem,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SessionAccumulator {
    project: String,
    claudes: u64,
    codex: u64,
    sidecars: u64,
    mem: u64,
}

fn project_from_path(path: &str) -> String {
    path.trim_end_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .next_back()
        .unwrap_or(path)
        .to_string()
}

fn fmt_mb(mb: u64) -> String {
    if mb >= 1024 {
        return format!("{:.1}G", mb as f64 / 1024.0);
    }

    format!("{mb}M")
}
