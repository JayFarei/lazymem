use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::io::Write;
use std::process::{Command, Stdio};

use anyhow::{Context, Result, bail};

use crate::collector::sessions::{is_claude, is_codex_agent, is_sidecar};
use crate::state::{AuditData, FocusPane, ProcessInfo, TopProc};

pub fn serialize_snapshot(data: &AuditData, focus: FocusPane) -> String {
    let mut lines = Vec::new();
    let ts = iso_timestamp();

    lines.push("LAZYMEM SNAPSHOT".to_string());
    lines.push(format!("ts: {ts}"));
    lines.push(format!("focus: {}", focus_name(focus)));
    lines.push(String::new());

    lines.push("[RAM]".to_string());
    lines.push(format!(
        "total: {}  used: {}  app: {}  wired: {}  comp: {}  cached: {}  free: {}",
        data.system.total_mb,
        data.system.used_mb,
        data.system.app_mb,
        data.system.wired_mb,
        data.system.comp_mb,
        data.system.cached_mb,
        data.system.free_mb
    ));
    if let Some(swap) = &data.system.swap {
        lines.push(format!(
            "swap_used: {}  swap_total: {}",
            swap.used, swap.total
        ));
    }
    lines.push(String::new());

    let tty_to_session = data
        .tmux
        .iter()
        .map(|pane| (pane.tty.replace("/dev/", ""), pane.session.as_str()))
        .collect::<HashMap<_, _>>();

    let mut session_procs = BTreeMap::<String, Vec<ProcessInfo>>::new();
    for process in &data.processes {
        if process.tty == "??" || process.tty.is_empty() {
            continue;
        }
        let Some(session) = tty_to_session.get(&process.tty) else {
            continue;
        };
        if !is_claude(&process.cmd)
            && !is_codex_agent(&process.cmd, &process.args)
            && !is_sidecar(&process.args)
        {
            continue;
        }
        session_procs
            .entry((*session).to_string())
            .or_default()
            .push(process.clone());
    }

    lines.push("[AGENTS]".to_string());
    for session in &data.sessions {
        lines.push(format!(
            "session: {}  project: {}  claude: {}  codex: {}  sidecars: {}  mem: {}",
            session.name,
            session.project,
            session.instances,
            session.codex_instances,
            session.sidecars,
            session.total_mem
        ));
        if let Some(processes) = session_procs.get(&session.name) {
            let mut processes = processes.clone();
            processes.sort_by(|left, right| right.mem.cmp(&left.mem));
            for process in processes {
                lines.push(format!(
                    "  pid: {}  tty: {}  mem: {}  cmd: {}  args: {}",
                    process.pid, process.tty, process.mem, process.cmd, process.args
                ));
            }
        }
    }
    lines.push(String::new());

    lines.push("[DEV]".to_string());
    for group in dev_groups(data) {
        lines.push(format!(
            "group: {}  count: {}  mem: {}",
            group.label, group.count, group.total_mem
        ));
        for process in group.processes {
            lines.push(format!(
                "  pid: {}  tty: {}  mem: {}  cmd: {}  args: {}",
                process.pid, process.tty, process.mem, process.cmd, process.args
            ));
        }
    }
    lines.push(String::new());

    lines.push("[DOCKER]".to_string());
    lines.push(format!(
        "vm_actual: {}  vm_alloc: {}",
        data.docker.vm_actual, data.docker.colima_alloc
    ));
    for container in &data.docker.containers {
        let image = container
            .image
            .as_ref()
            .map(|image| format!("  image: {image}"))
            .unwrap_or_default();
        lines.push(format!(
            "container: {}  mem: {}  cpu: {}{}",
            container.name, container.mem, container.cpu, image
        ));
    }
    lines.push(String::new());

    let covered_pids = data
        .processes
        .iter()
        .map(|process| process.pid.clone())
        .collect::<BTreeSet<_>>();
    let mut proc_groups = BTreeMap::<String, Vec<TopProc>>::new();
    for proc_ in &data.top_procs {
        if proc_.cmd.trim().is_empty()
            || covered_pids.contains(&proc_.pid)
            || proc_.args.contains("com.apple.Virtu")
            || proc_.args.contains(".agent-browser/")
        {
            continue;
        }
        proc_groups
            .entry(proc_.cmd.clone())
            .or_default()
            .push(proc_.clone());
    }

    lines.push("[PROCS]".to_string());
    let mut grouped = proc_groups
        .into_iter()
        .map(|(name, procs)| {
            let total_mem = procs.iter().map(|proc_| proc_.mem_mb).sum::<u64>();
            (name, procs, total_mem)
        })
        .collect::<Vec<_>>();
    grouped.sort_by(|left, right| right.2.cmp(&left.2).then_with(|| left.0.cmp(&right.0)));
    for (name, procs, total_mem) in grouped {
        let pids = procs
            .iter()
            .map(|proc_| proc_.pid.as_str())
            .collect::<Vec<_>>()
            .join(",");
        lines.push(format!(
            "proc: {}  count: {}  mem: {}  pids: {}",
            name,
            procs.len(),
            total_mem,
            pids
        ));
    }
    lines.push(String::new());

    if !data.anomalies.is_empty() {
        lines.push("[ALERTS]".to_string());
        for anomaly in &data.anomalies {
            lines.push(format!(
                "{}: {}",
                severity_name(&anomaly.severity),
                anomaly.text
            ));
        }
        lines.push(String::new());
    }

    lines.push("[TMUX]".to_string());
    for pane in &data.tmux {
        lines.push(format!(
            "pane: {}  tty: {}  path: {}",
            pane.session, pane.tty, pane.path
        ));
    }

    lines.join("\n")
}

pub fn copy_to_clipboard(text: &str) -> Result<()> {
    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .context("failed to spawn pbcopy")?;

    let Some(mut stdin) = child.stdin.take() else {
        bail!("pbcopy stdin unavailable");
    };
    stdin
        .write_all(text.as_bytes())
        .context("failed to write snapshot to pbcopy")?;
    drop(stdin);

    let status = child.wait().context("failed to wait for pbcopy")?;
    if !status.success() {
        bail!("pbcopy exited with status {status}");
    }

    Ok(())
}

#[derive(Debug, Clone)]
struct DevGroup {
    label: String,
    count: usize,
    total_mem: u64,
    processes: Vec<ProcessInfo>,
}

fn dev_groups(data: &AuditData) -> Vec<DevGroup> {
    let mut groups = BTreeMap::<String, Vec<ProcessInfo>>::new();
    for process in &data.processes {
        if is_sidecar(&process.args) || process.mem <= 20 {
            continue;
        }
        groups
            .entry(classify_dev(&process.cmd, &process.args))
            .or_default()
            .push(process.clone());
    }

    let mut grouped = groups
        .into_iter()
        .map(|(label, mut processes)| {
            processes.sort_by(|left, right| right.mem.cmp(&left.mem));
            let total_mem = processes.iter().map(|process| process.mem).sum::<u64>();
            DevGroup {
                label,
                count: processes.len(),
                total_mem,
                processes,
            }
        })
        .collect::<Vec<_>>();
    grouped.sort_by(|left, right| {
        right
            .total_mem
            .cmp(&left.total_mem)
            .then_with(|| left.label.cmp(&right.label))
    });
    grouped
}

fn classify_dev(cmd: &str, args: &str) -> String {
    if cmd == "claude" || cmd.contains("claude") {
        return "claude".to_string();
    }
    if args.contains("codex") && args.contains("mcp-server") {
        return "codex-mcp".to_string();
    }
    if args.to_lowercase().contains("codex") {
        return "codex".to_string();
    }
    if args.contains("next") {
        return "next".to_string();
    }
    if args.contains("vite") {
        return "vite".to_string();
    }
    if args.contains("tailwindcss-language") {
        return "tailwind-lsp".to_string();
    }
    if args.contains("typescript-language") {
        return "ts-lsp".to_string();
    }
    if args.contains("tsx") {
        return "tsx".to_string();
    }
    if args.contains("postcss") {
        return "postcss".to_string();
    }
    if args.contains("pnpm") {
        return "pnpm".to_string();
    }
    if args.contains("python") || cmd.contains("python") {
        return "python".to_string();
    }
    if args.contains("surf-cli") {
        return "surf-cli".to_string();
    }
    if args.contains("qmd") && args.contains("--http") {
        return "qmd".to_string();
    }
    if args.contains("telegram") {
        return "telegram".to_string();
    }
    if cmd.contains("nvim") || args.contains("nvim") {
        return "nvim".to_string();
    }
    cmd.rsplit('/').next().unwrap_or(cmd).to_string()
}

fn focus_name(focus: FocusPane) -> &'static str {
    match focus {
        FocusPane::Sys => "sys",
        FocusPane::Agents => "agents",
        FocusPane::Dev => "dev",
        FocusPane::Docker => "docker",
    }
}

fn severity_name(severity: &crate::state::AnomalySeverity) -> &'static str {
    match severity {
        crate::state::AnomalySeverity::Error => "error",
        crate::state::AnomalySeverity::Warning => "warning",
        crate::state::AnomalySeverity::Info => "info",
    }
}

fn iso_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let days = seconds.div_euclid(86_400);
    let secs_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}")
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year, m, d)
}
