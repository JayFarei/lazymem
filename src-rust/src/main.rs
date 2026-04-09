use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use lazymem_rs::app;
use lazymem_rs::bench::report::{BenchmarkRuntime, init_from_env};
use lazymem_rs::collector::collect_all;

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

    let mode = std::env::var("LAZYMEM_BENCHMARK_MODE").unwrap_or_else(|_| "default".to_string());
    if benchmark.enabled() && mode == "shell" {
        run_shell_benchmark_mode(benchmark).await?;
        return Ok(());
    }

    app::run(benchmark).await?;
    Ok(())
}

async fn run_shell_benchmark_mode(benchmark: Arc<BenchmarkRuntime>) -> Result<()> {
    benchmark.mark_core_ready();
    benchmark.mark_full_ready();
    tokio::time::sleep(Duration::from_millis(benchmark.idle_wait_ms())).await;
    benchmark.mark_idle();
    benchmark.flush().await?;
    Ok(())
}
