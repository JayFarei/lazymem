use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use serde::Serialize;
use tokio::task::JoinHandle;

static BENCHMARK: OnceLock<Arc<BenchmarkRuntime>> = OnceLock::new();
const SAMPLE_INTERVAL_MS: u64 = 50;

pub fn init_from_env(argv: &[String]) -> Arc<BenchmarkRuntime> {
    BENCHMARK
        .get_or_init(|| BenchmarkRuntime::from_env(argv))
        .clone()
}

pub fn record_command(command: &[&str], duration: Duration, exit_code: i32, output_bytes: usize) {
    if let Some(runtime) = BENCHMARK.get() {
        runtime.record_command(command, duration, exit_code, output_bytes);
    }
}

#[derive(Debug)]
pub struct BenchmarkRuntime {
    enabled: bool,
    idle_wait_ms: u64,
    output_path: Option<PathBuf>,
    argv: Vec<String>,
    started_at: Instant,
    peak_rss_tenths: AtomicU64,
    sampler_stop: AtomicBool,
    sampler_handle: Mutex<Option<JoinHandle<()>>>,
    state: Mutex<BenchmarkState>,
}

impl BenchmarkRuntime {
    fn from_env(argv: &[String]) -> Arc<Self> {
        let enabled = std::env::var("LAZYMEM_BENCHMARK").is_ok_and(|value| value == "1");
        let idle_wait_ms = parse_positive_int(
            std::env::var("LAZYMEM_BENCHMARK_IDLE_MS").ok().as_deref(),
            2500,
        );
        let output_path = std::env::var("LAZYMEM_BENCHMARK_OUT")
            .ok()
            .filter(|value| !value.is_empty())
            .map(PathBuf::from);

        let started_at = Instant::now();
        let process_start = if enabled {
            capture_phase(started_at)
        } else {
            empty_phase()
        };

        let runtime = Arc::new(Self {
            enabled,
            idle_wait_ms,
            output_path,
            argv: argv.to_vec(),
            started_at,
            peak_rss_tenths: AtomicU64::new(to_tenths(process_start.memory.rss_mb)),
            sampler_stop: AtomicBool::new(false),
            sampler_handle: Mutex::new(None),
            state: Mutex::new(BenchmarkState {
                phases: BenchmarkPhases {
                    process_start,
                    core_ready: None,
                    full_ready: None,
                    idle: None,
                },
                command_samples: Vec::new(),
                command_aggregates: HashMap::new(),
                flushed: false,
            }),
        });

        if enabled {
            let sampler_runtime = Arc::clone(&runtime);
            let handle = tokio::spawn(async move {
                while !sampler_runtime.sampler_stop.load(Ordering::Relaxed) {
                    tokio::time::sleep(Duration::from_millis(SAMPLE_INTERVAL_MS)).await;
                    let rss = current_rss_mb();
                    sampler_runtime.observe_peak_rss(rss);
                }
            });
            *runtime
                .sampler_handle
                .lock()
                .expect("sampler handle poisoned") = Some(handle);
        }

        runtime
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub fn idle_wait_ms(&self) -> u64 {
        self.idle_wait_ms
    }

    pub fn mark_core_ready(&self) -> bool {
        self.mark_phase(PhaseKind::CoreReady)
    }

    pub fn mark_full_ready(&self) -> bool {
        self.mark_phase(PhaseKind::FullReady)
    }

    pub fn mark_idle(&self) -> bool {
        self.mark_phase(PhaseKind::Idle)
    }

    pub fn record_command(
        &self,
        command: &[&str],
        duration: Duration,
        exit_code: i32,
        output_bytes: usize,
    ) {
        if !self.enabled {
            return;
        }

        let command_string = command.join(" ");
        let sample = CommandSample {
            command: command_string.clone(),
            duration_ms: round(duration.as_secs_f64() * 1000.0),
            exit_code,
            output_bytes,
        };

        let mut state = self.state.lock().expect("benchmark state poisoned");
        state.command_samples.push(sample.clone());

        let aggregate = state
            .command_aggregates
            .entry(command_string.clone())
            .or_insert_with(|| CommandAggregate {
                command: command_string,
                count: 0,
                total_ms: 0.0,
                max_ms: 0.0,
                failures: 0,
            });
        aggregate.count += 1;
        aggregate.total_ms = round(aggregate.total_ms + sample.duration_ms);
        aggregate.max_ms = aggregate.max_ms.max(sample.duration_ms);
        if exit_code != 0 {
            aggregate.failures += 1;
        }
    }

    pub async fn flush(&self) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        {
            let mut state = self.state.lock().expect("benchmark state poisoned");
            if state.flushed {
                return Ok(());
            }
            state.flushed = true;
        }

        self.sampler_stop.store(true, Ordering::Relaxed);
        let handle = self
            .sampler_handle
            .lock()
            .expect("sampler handle poisoned")
            .take();
        if let Some(handle) = handle {
            let _ = handle.await;
        }

        self.observe_peak_rss(current_rss_mb());
        let report = self.build_report();
        let payload = serde_json::to_string_pretty(&report)?;

        if let Some(path) = &self.output_path {
            std::fs::write(path, payload)?;
        } else {
            eprintln!("{payload}");
        }

        Ok(())
    }

    fn mark_phase(&self, phase: PhaseKind) -> bool {
        if !self.enabled {
            return false;
        }

        let snapshot = capture_phase(self.started_at);
        self.observe_peak_rss(snapshot.memory.rss_mb);

        let mut state = self.state.lock().expect("benchmark state poisoned");
        match phase {
            PhaseKind::CoreReady => {
                if state.phases.core_ready.is_some() {
                    return false;
                }
                state.phases.core_ready = Some(snapshot);
            }
            PhaseKind::FullReady => {
                if state.phases.full_ready.is_some() {
                    return false;
                }
                state.phases.full_ready = Some(snapshot);
            }
            PhaseKind::Idle => {
                if state.phases.idle.is_some() {
                    return false;
                }
                state.phases.idle = Some(snapshot);
            }
        }

        true
    }

    fn observe_peak_rss(&self, rss_mb: f64) {
        let observed = to_tenths(rss_mb);
        let mut current = self.peak_rss_tenths.load(Ordering::Relaxed);
        while observed > current {
            match self.peak_rss_tenths.compare_exchange_weak(
                current,
                observed,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(next) => current = next,
            }
        }
    }

    fn build_report(&self) -> BenchmarkReport {
        let state = self.state.lock().expect("benchmark state poisoned");
        let total_duration_ms = round(
            state
                .command_samples
                .iter()
                .map(|sample| sample.duration_ms)
                .sum::<f64>(),
        );
        let mut aggregates = state
            .command_aggregates
            .values()
            .cloned()
            .collect::<Vec<_>>();
        aggregates.sort_by(|left, right| right.total_ms.total_cmp(&left.total_ms));

        BenchmarkReport {
            version: 1,
            pid: std::process::id(),
            argv: self.argv.clone(),
            platform: std::env::consts::OS.to_string(),
            bun_version: "rust".to_string(),
            idle_wait_ms: self.idle_wait_ms,
            phases: state.phases.clone(),
            memory: PeakMemory {
                peak_rss_mb: from_tenths(self.peak_rss_tenths.load(Ordering::Relaxed)),
            },
            commands: CommandSection {
                count: state.command_samples.len(),
                total_duration_ms,
                aggregates,
                samples: state.command_samples.clone(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemorySample {
    #[serde(rename = "rssMB")]
    rss_mb: f64,
    #[serde(rename = "heapTotalMB")]
    heap_total_mb: f64,
    #[serde(rename = "heapUsedMB")]
    heap_used_mb: f64,
    #[serde(rename = "externalMB")]
    external_mb: f64,
    #[serde(rename = "arrayBuffersMB")]
    array_buffers_mb: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhaseSnapshot {
    elapsed_ms: f64,
    epoch_ms: u64,
    memory: MemorySample,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandSample {
    command: String,
    duration_ms: f64,
    exit_code: i32,
    output_bytes: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandAggregate {
    command: String,
    count: usize,
    total_ms: f64,
    max_ms: f64,
    failures: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkReport {
    version: u8,
    pid: u32,
    argv: Vec<String>,
    platform: String,
    bun_version: String,
    idle_wait_ms: u64,
    phases: BenchmarkPhases,
    memory: PeakMemory,
    commands: CommandSection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkPhases {
    process_start: PhaseSnapshot,
    #[serde(skip_serializing_if = "Option::is_none")]
    core_ready: Option<PhaseSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    full_ready: Option<PhaseSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    idle: Option<PhaseSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PeakMemory {
    #[serde(rename = "peakRssMB")]
    peak_rss_mb: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandSection {
    count: usize,
    total_duration_ms: f64,
    aggregates: Vec<CommandAggregate>,
    samples: Vec<CommandSample>,
}

#[derive(Debug)]
struct BenchmarkState {
    phases: BenchmarkPhases,
    command_samples: Vec<CommandSample>,
    command_aggregates: HashMap<String, CommandAggregate>,
    flushed: bool,
}

#[derive(Debug, Clone, Copy)]
enum PhaseKind {
    CoreReady,
    FullReady,
    Idle,
}

fn capture_phase(started_at: Instant) -> PhaseSnapshot {
    PhaseSnapshot {
        elapsed_ms: round(started_at.elapsed().as_secs_f64() * 1000.0),
        epoch_ms: epoch_ms(),
        memory: capture_memory(),
    }
}

fn empty_phase() -> PhaseSnapshot {
    PhaseSnapshot {
        elapsed_ms: 0.0,
        epoch_ms: 0,
        memory: MemorySample {
            rss_mb: 0.0,
            heap_total_mb: 0.0,
            heap_used_mb: 0.0,
            external_mb: 0.0,
            array_buffers_mb: 0.0,
        },
    }
}

fn capture_memory() -> MemorySample {
    MemorySample {
        rss_mb: current_rss_mb(),
        heap_total_mb: 0.0,
        heap_used_mb: 0.0,
        external_mb: 0.0,
        array_buffers_mb: 0.0,
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn current_rss_mb() -> f64 {
    let mut info = std::mem::MaybeUninit::<libc::mach_task_basic_info_data_t>::zeroed();
    let mut count = libc::MACH_TASK_BASIC_INFO_COUNT;

    let result = unsafe {
        libc::task_info(
            libc::mach_task_self(),
            libc::MACH_TASK_BASIC_INFO,
            info.as_mut_ptr() as libc::task_info_t,
            &mut count,
        )
    };

    if result != libc::KERN_SUCCESS {
        return 0.0;
    }

    let info = unsafe { info.assume_init() };
    round(info.resident_size as f64 / (1024.0 * 1024.0))
}

#[cfg(not(target_os = "macos"))]
fn current_rss_mb() -> f64 {
    0.0
}

fn parse_positive_int(raw: Option<&str>, fallback: u64) -> u64 {
    raw.and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_millis() as u64
}

fn to_tenths(value: f64) -> u64 {
    (value * 10.0).round() as u64
}

fn from_tenths(value: u64) -> f64 {
    value as f64 / 10.0
}

fn round(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
