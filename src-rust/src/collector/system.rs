use anyhow::Result;

use crate::collector::run_command;
use crate::state::{SwapInfo, SystemInfo};

pub async fn collect_system() -> Result<SystemInfo> {
    let (vmstat_out, memsize_out, swap_out) = tokio::join!(
        run_command(&["vm_stat"]),
        run_command(&["sysctl", "-n", "hw.memsize"]),
        run_command(&["sysctl", "-n", "vm.swapusage"]),
    );

    Ok(parse_system_info(&vmstat_out?, &memsize_out?, &swap_out?))
}

pub fn parse_system_info(vmstat_out: &str, memsize_out: &str, swap_out: &str) -> SystemInfo {
    let page_size = find_digits_after(vmstat_out, "page size of ").unwrap_or(16384);

    let free_pages = pages(vmstat_out, "Pages free");
    let spec_pages = pages(vmstat_out, "Pages speculative");
    let wired_pages = pages(vmstat_out, "Pages wired down");
    let comp_pages = pages(vmstat_out, "Pages occupied by compressor");
    let purgeable_pages = pages(vmstat_out, "Pages purgeable");
    let file_backed_pages = pages(vmstat_out, "File-backed pages");
    let anonymous_pages = pages(vmstat_out, "Anonymous pages");

    let total_mb = to_mb(memsize_out.trim().parse::<u64>().unwrap_or(0));
    let app_mb = pages_to_mb(anonymous_pages.saturating_sub(purgeable_pages), page_size);
    let wired_mb = pages_to_mb(wired_pages, page_size);
    let comp_mb = pages_to_mb(comp_pages, page_size);
    let cached_mb = pages_to_mb(file_backed_pages, page_size);
    let free_mb = pages_to_mb(free_pages.saturating_sub(spec_pages), page_size);
    let used_mb = app_mb + wired_mb + comp_mb;

    let swap = parse_swap(swap_out);

    SystemInfo {
        total_mb,
        app_mb,
        wired_mb,
        comp_mb,
        cached_mb,
        free_mb,
        used_mb,
        swap,
    }
}

fn pages(vmstat_out: &str, label: &str) -> u64 {
    vmstat_out
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with(label) {
                return None;
            }

            let (_, value) = trimmed.split_once(':')?;
            let digits: String = value
                .trim()
                .chars()
                .take_while(|ch| ch.is_ascii_digit())
                .collect();
            digits.parse::<u64>().ok()
        })
        .unwrap_or(0)
}

fn parse_swap(raw: &str) -> Option<SwapInfo> {
    let total = assignment_value(raw, "total")?;
    let used = assignment_value(raw, "used")?;
    let free = assignment_value(raw, "free")?;

    Some(SwapInfo { total, used, free })
}

fn assignment_value(raw: &str, label: &str) -> Option<String> {
    let mut words = raw.split_whitespace();
    while let Some(word) = words.next() {
        if word != label {
            continue;
        }

        if words.next()? != "=" {
            continue;
        }

        return words.next().map(ToString::to_string);
    }

    None
}

fn find_digits_after(haystack: &str, needle: &str) -> Option<u64> {
    let start = haystack.find(needle)? + needle.len();
    let digits: String = haystack[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    digits.parse::<u64>().ok()
}

fn pages_to_mb(pages: u64, page_size: u64) -> u64 {
    ((pages as f64 * page_size as f64) / (1024.0 * 1024.0)).round() as u64
}

fn to_mb(bytes: u64) -> u64 {
    (bytes as f64 / (1024.0 * 1024.0)).round() as u64
}
