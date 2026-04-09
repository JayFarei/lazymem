use anyhow::Result;

use crate::collector::run_command;
use crate::state::{ProcessInfo, TopProc};

pub async fn collect_top_procs() -> Result<Vec<TopProc>> {
    let output = run_command(&["ps", "-eo", "pid,rss,args"]).await?;
    Ok(parse_top_procs_output(&output))
}

pub async fn collect_processes() -> Result<Vec<ProcessInfo>> {
    let output = run_command(&["ps", "-eo", "pid,tty,rss,comm,args"]).await?;
    Ok(parse_processes_output(&output))
}

pub fn extract_proc_name(args: &str) -> String {
    if let Some(app_end) = args.find(".app/") {
        let prefix = &args[..app_end];
        if let Some(start) = prefix.rfind('/') {
            return prefix[start + 1..].to_string();
        }
    }

    let first_word = args.split_whitespace().next().unwrap_or_default();
    if first_word.contains('/') {
        return first_word
            .rsplit('/')
            .next()
            .unwrap_or(first_word)
            .to_string();
    }

    first_word.to_string()
}

pub fn parse_top_procs_output(output: &str) -> Vec<TopProc> {
    let mut processes: Vec<TopProc> = output
        .lines()
        .filter_map(split_three_columns)
        .filter_map(|(pid, rss_str, args)| {
            if !pid.chars().all(|ch| ch.is_ascii_digit()) {
                return None;
            }

            let rss_kb = rss_str.parse::<u64>().ok()?;
            let mem_mb = (rss_kb as f64 / 1024.0).round() as u64;
            Some(TopProc {
                pid: pid.to_string(),
                cmd: extract_proc_name(args),
                mem: fmt_mb(mem_mb),
                mem_mb,
                args: args.to_string(),
            })
        })
        .collect();

    processes.sort_by(|left, right| right.mem_mb.cmp(&left.mem_mb));
    processes.truncate(80);
    processes
}

pub fn parse_processes_output(output: &str) -> Vec<ProcessInfo> {
    output
        .lines()
        .filter_map(split_five_columns)
        .filter_map(|(pid, tty, rss_str, cmd, args)| {
            if !pid.chars().all(|ch| ch.is_ascii_digit()) {
                return None;
            }

            if !interesting_cmd(cmd) && !interesting_args(args) {
                return None;
            }

            let mem = (rss_str.parse::<u64>().ok()? as f64 / 1024.0).round() as u64;
            Some(ProcessInfo {
                pid: pid.to_string(),
                tty: tty.to_string(),
                mem,
                cmd: cmd.to_string(),
                args: truncate(args, 120),
            })
        })
        .collect()
}

fn split_three_columns(line: &str) -> Option<(&str, &str, &str)> {
    let trimmed = line.trim();
    let first_break = trimmed.find(char::is_whitespace)?;
    let first = &trimmed[..first_break];
    let rest = trimmed[first_break..].trim_start();
    let second_break = rest.find(char::is_whitespace)?;
    let second = &rest[..second_break];
    let third = rest[second_break..].trim_start();
    if third.is_empty() {
        return None;
    }

    Some((first, second, third))
}

fn split_five_columns(line: &str) -> Option<(&str, &str, &str, &str, &str)> {
    let trimmed = line.trim();
    let (first, rest) = take_column(trimmed)?;
    let (second, rest) = take_column(rest)?;
    let (third, rest) = take_column(rest)?;
    let (fourth, rest) = take_column(rest)?;
    if rest.is_empty() {
        return None;
    }

    Some((first, second, third, fourth, rest))
}

fn take_column(input: &str) -> Option<(&str, &str)> {
    let trimmed = input.trim_start();
    let split_at = trimmed.find(char::is_whitespace)?;
    let column = &trimmed[..split_at];
    let rest = trimmed[split_at..].trim_start();
    Some((column, rest))
}

fn interesting_cmd(cmd: &str) -> bool {
    matches!(
        cmd,
        "claude" | "node" | "next-server" | "bun" | "npm" | "python" | "nvim"
    ) || cmd.contains("claude")
}

fn interesting_args(args: &str) -> bool {
    [
        "claude", "node", "next", "vite", "tsx", "postcss", "pnpm", "nvim",
    ]
    .iter()
    .any(|needle| args.contains(needle))
}

fn truncate(raw: &str, max_chars: usize) -> String {
    raw.chars().take(max_chars).collect()
}

fn fmt_mb(mb: u64) -> String {
    if mb >= 1024 {
        return format!("{:.1}G", mb as f64 / 1024.0);
    }

    format!("{mb}M")
}
