use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use lazymem_rs::app;
use lazymem_rs::bench::report::{BenchmarkRuntime, init_from_env};
use lazymem_rs::collector::{
    Wave2Data, build_audit_data, collect_all, collect_wave1, load_fixture_from_env, processes,
};
use lazymem_rs::state::DockerInfo;

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let benchmark = init_from_env(&args);

    if args.iter().any(|arg| arg == "--version" || arg == "-v") {
        println!("lazymem v{}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    if args.iter().any(|arg| arg == "--collect-debug") {
        let audit_data = collect_all().await?;
        println!("{}", serde_json::to_string_pretty(&audit_data)?);
        return Ok(());
    }

    if benchmark.enabled() {
        run_benchmark_mode(benchmark).await?;
        return Ok(());
    }

    app::run().await?;
    Ok(())
}

async fn run_benchmark_mode(benchmark: Arc<BenchmarkRuntime>) -> Result<()> {
    let mode = std::env::var("LAZYMEM_BENCHMARK_MODE").unwrap_or_else(|_| "default".to_string());

    match mode.as_str() {
        "shell" => {
            benchmark.mark_core_ready();
            benchmark.mark_full_ready();
        }
        _ => {
            if let Some(_data) = load_fixture_from_env()? {
                benchmark.mark_core_ready();
                benchmark.mark_full_ready();
                tokio::time::sleep(Duration::from_millis(benchmark.idle_wait_ms())).await;
                benchmark.mark_idle();
                benchmark.flush().await?;
                return Ok(());
            }

            let wave1 = collect_wave1().await?;
            benchmark.mark_core_ready();
            let wave2 = Wave2Data {
                processes: processes::collect_processes().await?,
                docker: empty_docker(),
            };
            let _audit_data = build_audit_data(wave1, wave2);
            benchmark.mark_full_ready();
        }
    }

    tokio::time::sleep(Duration::from_millis(benchmark.idle_wait_ms())).await;
    benchmark.mark_idle();
    benchmark.flush().await?;
    Ok(())
}

fn empty_docker() -> DockerInfo {
    DockerInfo {
        containers: Vec::new(),
        colima_alloc: "N/A".to_string(),
        vm_actual: 0,
    }
}
