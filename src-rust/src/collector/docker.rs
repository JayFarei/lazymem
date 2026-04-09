use anyhow::Result;

use crate::collector::run_command;
use crate::state::{DockerContainer, DockerInfo};

pub async fn collect_docker() -> Result<DockerInfo> {
    let mut containers = Vec::new();
    let mut colima_alloc = "N/A".to_string();
    let mut vm_actual = 0;

    let (stats_out, ps_out) = tokio::join!(
        run_command(&[
            "docker",
            "stats",
            "--no-stream",
            "--format",
            "{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}",
        ]),
        run_command(&["docker", "ps", "--format", "{{.Names}}\t{{.Image}}"]),
    );

    if let (Ok(stats_out), Ok(ps_out)) = (stats_out, ps_out) {
        containers = parse_docker_containers(&stats_out, &ps_out);
    }

    if let Ok(output) = run_command(&["colima", "list"]).await {
        colima_alloc = parse_colima_alloc(&output);
    }

    if let Ok(output) = run_command(&["ps", "-eo", "pid,rss,comm"]).await {
        vm_actual = parse_docker_vm_actual(&output);
    }

    Ok(DockerInfo {
        containers,
        colima_alloc,
        vm_actual,
    })
}

pub fn parse_docker_containers(stats_out: &str, ps_out: &str) -> Vec<DockerContainer> {
    let image_map = ps_out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, '\t');
            let name = parts.next()?.trim();
            let image = parts.next()?.trim();
            if name.is_empty() || image.is_empty() {
                return None;
            }

            Some((name.to_string(), image.to_string()))
        })
        .collect::<std::collections::HashMap<_, _>>();

    stats_out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let name = parts.next()?.trim();
            let mem = parts.next()?.trim();
            let cpu = parts.next()?.trim();
            if name.is_empty() || mem.is_empty() || cpu.is_empty() {
                return None;
            }

            Some(DockerContainer {
                name: name.to_string(),
                mem: mem.to_string(),
                cpu: cpu.to_string(),
                image: image_map.get(name).cloned(),
            })
        })
        .collect()
}

pub fn parse_colima_alloc(output: &str) -> String {
    output
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .and_then(|line| line.split_whitespace().nth(4))
        .unwrap_or("N/A")
        .to_string()
}

pub fn parse_docker_vm_actual(output: &str) -> u64 {
    output
        .lines()
        .find(|line| line.contains("com.apple.Virtua"))
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|rss| rss.parse::<u64>().ok())
        .map(|rss_kb| (rss_kb as f64 / 1024.0).round() as u64)
        .unwrap_or(0)
}
