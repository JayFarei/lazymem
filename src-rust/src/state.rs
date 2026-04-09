use std::collections::{HashMap, HashSet};
use std::time::Instant;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    #[serde(rename = "totalMB")]
    pub total_mb: u64,
    #[serde(rename = "appMB")]
    pub app_mb: u64,
    #[serde(rename = "wiredMB")]
    pub wired_mb: u64,
    #[serde(rename = "compMB")]
    pub comp_mb: u64,
    #[serde(rename = "cachedMB")]
    pub cached_mb: u64,
    #[serde(rename = "freeMB")]
    pub free_mb: u64,
    #[serde(rename = "usedMB")]
    pub used_mb: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swap: Option<SwapInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SwapInfo {
    pub total: String,
    pub used: String,
    pub free: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TopProc {
    pub pid: String,
    pub cmd: String,
    pub mem: String,
    #[serde(rename = "memMB")]
    pub mem_mb: u64,
    pub args: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TmuxPane {
    pub session: String,
    pub pane: String,
    pub tty: String,
    pub cmd: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcessInfo {
    pub pid: String,
    pub tty: String,
    pub mem: u64,
    pub cmd: String,
    pub args: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DockerContainer {
    pub name: String,
    pub mem: String,
    pub cpu: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfo {
    pub containers: Vec<DockerContainer>,
    pub colima_alloc: String,
    pub vm_actual: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub name: String,
    pub project: String,
    pub instances: u64,
    pub codex_instances: u64,
    pub sidecars: u64,
    pub total_mem: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Anomaly {
    pub text: String,
    pub severity: AnomalySeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AnomalySeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditData {
    pub system: SystemInfo,
    pub top_procs: Vec<TopProc>,
    pub tmux: Vec<TmuxPane>,
    pub processes: Vec<ProcessInfo>,
    pub docker: DockerInfo,
    pub sessions: Vec<SessionSummary>,
    pub anomalies: Vec<Anomaly>,
    pub total_instances: u64,
    pub total_claude_mem: u64,
    pub my_tty: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusPane {
    Sys,
    Agents,
    Dev,
    Docker,
}

impl FocusPane {
    pub const CYCLE: [FocusPane; 4] = [
        FocusPane::Sys,
        FocusPane::Agents,
        FocusPane::Dev,
        FocusPane::Docker,
    ];

    pub fn title(self) -> &'static str {
        match self {
            FocusPane::Sys => "System",
            FocusPane::Agents => "Agents",
            FocusPane::Dev => "Dev",
            FocusPane::Docker => "Docker",
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppState {
    pub started_at: Instant,
    pub data: Option<AuditData>,
    pub loading: bool,
    pub show_help: bool,
    pub focus: FocusPane,
    pub fullscreen: Option<FocusPane>,
    pub selected_index: usize,
    pub expanded_index: Option<usize>,
    pub should_quit: bool,
    pub copied_until: Option<Instant>,
    pub status_message: Option<String>,
    pub error_message: Option<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
            data: None,
            loading: true,
            show_help: false,
            focus: FocusPane::Sys,
            fullscreen: None,
            selected_index: 0,
            expanded_index: None,
            should_quit: false,
            copied_until: None,
            status_message: None,
            error_message: None,
        }
    }

    pub fn set_focus(&mut self, focus: FocusPane) {
        self.focus = focus;
        self.selected_index = 0;
        self.expanded_index = None;
        self.fullscreen = None;
    }

    pub fn cycle_focus(&mut self) {
        let current = Self::focus_index(self.focus);
        self.focus = FocusPane::CYCLE[(current + 1) % FocusPane::CYCLE.len()];
        self.selected_index = 0;
        self.expanded_index = None;
    }

    pub fn navigate_down(&mut self) {
        let max = self.focused_panel_size().saturating_sub(1);
        if self.selected_index < max {
            self.selected_index += 1;
            self.expanded_index = None;
        }
    }

    pub fn navigate_up(&mut self) {
        if self.selected_index > 0 {
            self.selected_index -= 1;
            self.expanded_index = None;
        }
    }

    pub fn toggle_expand(&mut self) {
        self.expanded_index = match self.expanded_index {
            Some(index) if index == self.selected_index => None,
            _ => Some(self.selected_index),
        };
    }

    pub fn toggle_fullscreen(&mut self) {
        self.fullscreen = match self.fullscreen {
            Some(_) => None,
            None => Some(self.focus),
        };
    }

    pub fn exit_fullscreen(&mut self) {
        self.fullscreen = None;
    }

    pub fn focused_panel_size(&self) -> usize {
        let Some(data) = &self.data else {
            return 0;
        };

        match self.focus {
            FocusPane::Sys => {
                let covered = data
                    .processes
                    .iter()
                    .map(|process| process.pid.clone())
                    .collect::<HashSet<_>>();
                let mut groups = HashMap::<&str, usize>::new();
                for proc_ in &data.top_procs {
                    if proc_.cmd.trim().is_empty()
                        || covered.contains(&proc_.pid)
                        || proc_.args.contains("com.apple.Virtu")
                        || proc_.args.contains(".agent-browser/")
                    {
                        continue;
                    }
                    *groups.entry(proc_.cmd.as_str()).or_default() += 1;
                }
                groups.len()
            }
            FocusPane::Agents => data.sessions.len(),
            FocusPane::Dev => dev_panel_size(data),
            FocusPane::Docker => data.docker.containers.len(),
        }
    }

    fn focus_index(focus: FocusPane) -> usize {
        FocusPane::CYCLE
            .iter()
            .position(|pane| *pane == focus)
            .unwrap_or(0)
    }
}

fn dev_panel_size(data: &AuditData) -> usize {
    let tty_set = data
        .tmux
        .iter()
        .map(|pane| pane.tty.replace("/dev/", ""))
        .collect::<HashSet<_>>();
    let mut labels = HashSet::<String>::new();

    for process in &data.processes {
        if is_dev_sidecar(&process.args) || process.mem <= 20 {
            continue;
        }

        let in_tmux = tty_set.contains(&process.tty);
        let is_background = process.tty == "??";
        if !in_tmux && !is_background {
            continue;
        }

        let label = classify_dev_process(&process.cmd, &process.args);
        if is_background && !in_tmux && !is_known_dev_type(&label) {
            continue;
        }

        labels.insert(label);
    }

    labels.len().min(12)
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
    if cmd == "claude" || cmd.contains("claude") {
        "claude".to_string()
    } else if args.contains("codex") && args.contains("mcp-server") {
        "codex-mcp".to_string()
    } else if args.to_lowercase().contains("codex") {
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
        cmd.split('/').next_back().unwrap_or(cmd).to_string()
    }
}
