use std::fs;
use std::path::PathBuf;

use lazymem_rs::collector::docker::{
    parse_colima_alloc, parse_docker_containers, parse_docker_vm_actual,
};
use lazymem_rs::collector::processes::{parse_processes_output, parse_top_procs_output};
use lazymem_rs::collector::sessions::build_sessions;
use lazymem_rs::collector::system::parse_system_info;
use lazymem_rs::collector::tmux::parse_tmux_panes_output;
use lazymem_rs::state::{
    AnomalySeverity, DockerContainer, ProcessInfo, SwapInfo, SystemInfo, TmuxPane,
};

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../src/core/__fixtures__/collector")
        .join(name);
    fs::read_to_string(path).expect("fixture should exist")
}

#[test]
fn parse_system_info_matches_typescript_fixture_expectations() {
    let system = parse_system_info(
        &fixture("vm_stat.txt"),
        &fixture("memsize.txt"),
        &fixture("swapusage.txt"),
    );

    assert_eq!(
        system,
        SystemInfo {
            total_mb: 16384,
            app_mb: 184,
            wired_mb: 32,
            comp_mb: 16,
            cached_mb: 128,
            free_mb: 48,
            used_mb: 232,
            swap: Some(SwapInfo {
                total: "3.00G".to_string(),
                used: "1.25G".to_string(),
                free: "1.75G".to_string(),
            }),
        }
    );
}

#[test]
fn parse_top_procs_output_derives_names_memory_and_sorting() {
    let top_procs = parse_top_procs_output(&fixture("ps_top_procs.txt"));

    assert_eq!(top_procs.len(), 3);
    assert_eq!(
        top_procs
            .iter()
            .map(|proc| proc.cmd.as_str())
            .collect::<Vec<_>>(),
        vec!["python3", "Slack", "node"]
    );
    assert_eq!(
        top_procs.iter().map(|proc| proc.mem_mb).collect::<Vec<_>>(),
        vec![2048, 1024, 500]
    );
    assert_eq!(
        top_procs
            .iter()
            .map(|proc| proc.mem.as_str())
            .collect::<Vec<_>>(),
        vec!["2.0G", "1.0G", "500M"]
    );
}

#[test]
fn parse_tmux_panes_output_parses_tab_separated_rows() {
    assert_eq!(
        parse_tmux_panes_output(&fixture("tmux_list_panes.txt")),
        vec![
            TmuxPane {
                session: "work".to_string(),
                pane: "0.0".to_string(),
                tty: "/dev/ttys001".to_string(),
                cmd: "zsh".to_string(),
                path: "/Users/me/project".to_string(),
            },
            TmuxPane {
                session: "pair".to_string(),
                pane: "1.2".to_string(),
                tty: "/dev/ttys003".to_string(),
                cmd: "bun".to_string(),
                path: "/Users/me/another".to_string(),
            },
        ]
    );
}

#[test]
fn parse_processes_output_filters_interesting_processes_and_truncates_args() {
    let processes = parse_processes_output(&fixture("ps_processes.txt"));

    assert_eq!(processes.len(), 3);
    assert_eq!(
        processes
            .iter()
            .map(|proc| proc.cmd.as_str())
            .collect::<Vec<_>>(),
        vec!["claude", "node", "bun"]
    );
    assert_eq!(
        processes.iter().map(|proc| proc.mem).collect::<Vec<_>>(),
        vec![500, 250, 63]
    );
    assert_eq!(processes[2].args.chars().count(), 120);
}

#[test]
fn parse_docker_containers_joins_stats_and_ps_output() {
    assert_eq!(
        parse_docker_containers(&fixture("docker_stats.txt"), &fixture("docker_ps.txt")),
        vec![
            DockerContainer {
                name: "api".to_string(),
                mem: "512MiB / 8GiB".to_string(),
                cpu: "23.4%".to_string(),
                image: Some("ghcr.io/acme/api:latest".to_string()),
            },
            DockerContainer {
                name: "db".to_string(),
                mem: "1.25GiB / 8GiB".to_string(),
                cpu: "101.2%".to_string(),
                image: Some("postgres:16".to_string()),
            },
        ]
    );
}

#[test]
fn parse_colima_alloc_extracts_memory_column() {
    assert_eq!(parse_colima_alloc(&fixture("colima_list.txt")), "8GiB");
}

#[test]
fn parse_docker_vm_actual_reads_virtualization_rss_in_mb() {
    assert_eq!(parse_docker_vm_actual(&fixture("ps_vm.txt")), 1024);
}

#[test]
fn build_sessions_matches_tmux_tty_mapping_rules() {
    let processes = vec![
        ProcessInfo {
            pid: "123".to_string(),
            tty: "ttys001".to_string(),
            mem: 500,
            cmd: "claude".to_string(),
            args: "/usr/local/bin/claude chat".to_string(),
        },
        ProcessInfo {
            pid: "456".to_string(),
            tty: "ttys003".to_string(),
            mem: 63,
            cmd: "bun".to_string(),
            args: "bun run dev".to_string(),
        },
        ProcessInfo {
            pid: "789".to_string(),
            tty: "ttys003".to_string(),
            mem: 128,
            cmd: "node".to_string(),
            args: "/usr/local/bin/node codex-agent".to_string(),
        },
    ];
    let tmux = parse_tmux_panes_output(&fixture("tmux_list_panes.txt"));
    let built = build_sessions(&processes, &tmux);

    assert_eq!(built.sessions.len(), 2);
    assert_eq!(built.sessions[0].name, "work");
    assert_eq!(built.sessions[0].instances, 1);
    assert_eq!(built.sessions[0].codex_instances, 0);
    assert_eq!(built.sessions[0].total_mem, 500);
    assert_eq!(built.sessions[1].name, "pair");
    assert_eq!(built.sessions[1].instances, 0);
    assert_eq!(built.sessions[1].codex_instances, 1);
    assert_eq!(built.total_instances, 2);
    assert_eq!(built.total_claude_mem, 691);
    assert!(built.anomalies.is_empty());
}

#[test]
fn build_sessions_flags_high_agent_counts_as_warnings_or_errors() {
    let tmux = vec![TmuxPane {
        session: "work".to_string(),
        pane: "0.0".to_string(),
        tty: "/dev/ttys001".to_string(),
        cmd: "zsh".to_string(),
        path: "/Users/me/project".to_string(),
    }];
    let processes = (0..5)
        .map(|index| ProcessInfo {
            pid: index.to_string(),
            tty: "ttys001".to_string(),
            mem: 100,
            cmd: "claude".to_string(),
            args: "claude chat".to_string(),
        })
        .collect::<Vec<_>>();

    let built = build_sessions(&processes, &tmux);

    assert_eq!(built.anomalies.len(), 1);
    assert_eq!(built.anomalies[0].severity, AnomalySeverity::Error);
    assert_eq!(built.anomalies[0].text, "work: 5c+0x agents (500M)");
}
