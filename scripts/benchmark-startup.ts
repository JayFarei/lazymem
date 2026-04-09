import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type MetricKey =
  | "cliToCoreReadyMs"
  | "cliToFullReadyMs"
  | "rssAtFullReadyMB"
  | "rssAfterIdleMB"
  | "peakRssMB";

interface Objectives {
  version: 1;
  defaults: {
    warmupRuns: number;
    measuredRuns: number;
    idleWaitMs: number;
  };
  budgets: Record<MetricKey, number>;
  stretch?: Partial<Record<MetricKey, number>>;
}

interface BenchmarkPhase {
  elapsedMs: number;
  epochMs: number;
  memory: {
    rssMB: number;
    heapTotalMB: number;
    heapUsedMB: number;
    externalMB: number;
    arrayBuffersMB: number;
  };
}

interface BenchmarkAggregate {
  command: string;
  count: number;
  totalMs: number;
  maxMs: number;
  failures: number;
}

interface BenchmarkReport {
  version: 1;
  pid: number;
  platform: string;
  bunVersion: string;
  idleWaitMs: number;
  phases: {
    processStart: BenchmarkPhase;
    coreReady?: BenchmarkPhase;
    fullReady?: BenchmarkPhase;
    idle?: BenchmarkPhase;
  };
  memory: {
    peakRssMB: number;
  };
  commands: {
    count: number;
    totalDurationMs: number;
    aggregates: BenchmarkAggregate[];
  };
}

interface RunResult {
  label: string;
  cliToCoreReadyMs: number;
  cliToFullReadyMs: number;
  processToCoreReadyMs: number;
  processToFullReadyMs: number;
  rssAtCoreReadyMB: number;
  rssAtFullReadyMB: number;
  rssAfterIdleMB: number;
  peakRssMB: number;
  commandTotalMs: number;
  commandAggregates: BenchmarkAggregate[];
}

interface SummaryStats {
  min: number;
  median: number;
  mean: number;
  max: number;
}

interface MetricSummary {
  metric: MetricKey;
  stats: SummaryStats;
  budget: number;
  stretch?: number;
  deltaFromBudget: number;
  pass: boolean;
}

interface Summary {
  benchmarkMode: string;
  generatedAt: string;
  repoRoot: string;
  warmupRuns: number;
  measuredRuns: number;
  idleWaitMs: number;
  budgets: Objectives["budgets"];
  stretch?: Objectives["stretch"];
  metrics: MetricSummary[];
  topCommands: Array<{
    command: string;
    avgTotalMs: number;
    maxMs: number;
    failures: number;
  }>;
  runs: RunResult[];
}

const METRICS: MetricKey[] = [
  "cliToCoreReadyMs",
  "cliToFullReadyMs",
  "rssAtFullReadyMB",
  "rssAfterIdleMB",
  "peakRssMB",
];

async function main() {
  const repoRoot = resolve(import.meta.dir, "..");
  const objectives = await Bun.file(resolve(repoRoot, "bench/objectives.json")).json<Objectives>();
  const args = parseArgs(process.argv.slice(2), objectives);
  const benchmarkMode = process.env.LAZYMEM_BENCHMARK_MODE ?? "default";
  const artifactDir = resolve(repoRoot, "benchmarks/results");
  await mkdir(artifactDir, { recursive: true });

  const tempDir = await mkdtemp(join(tmpdir(), "lazymem-bench-"));
  const warmups: RunResult[] = [];
  const runs: RunResult[] = [];

  try {
    for (let index = 0; index < args.warmupRuns; index += 1) {
      warmups.push(await runOnce({
        repoRoot,
        idleWaitMs: args.idleWaitMs,
        tempDir,
        label: `warmup-${index + 1}`,
      }));
    }

    for (let index = 0; index < args.measuredRuns; index += 1) {
      runs.push(await runOnce({
        repoRoot,
        idleWaitMs: args.idleWaitMs,
        tempDir,
        label: `run-${index + 1}`,
      }));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  if (runs.length === 0) {
    throw new Error("benchmark requires at least one measured run");
  }

  const summary = buildSummary({
    benchmarkMode,
    repoRoot,
    objectives,
    warmupRuns: warmups.length,
    measuredRuns: runs.length,
    idleWaitMs: args.idleWaitMs,
    runs,
  });

  const timestamp = isoTimestamp(new Date());
  const latestFile = benchmarkMode === "default" ? "latest.json" : `latest-${benchmarkMode}.json`;
  const historyFile = benchmarkMode === "default"
    ? `startup-${timestamp}.json`
    : `startup-${benchmarkMode}-${timestamp}.json`;
  const latestPath = resolve(artifactDir, latestFile);
  const historyPath = resolve(artifactDir, historyFile);
  const payload = JSON.stringify(summary, null, 2);

  await Bun.write(latestPath, payload);
  await Bun.write(historyPath, payload);

  printSummary(summary, historyPath);
  if (args.printJson) {
    console.log(payload);
  }
}

function parseArgs(argv: string[], objectives: Objectives) {
  let warmupRuns = objectives.defaults.warmupRuns;
  let measuredRuns = objectives.defaults.measuredRuns;
  let idleWaitMs = objectives.defaults.idleWaitMs;
  let printJson = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--warmups":
        warmupRuns = parseNumberArg(arg, argv[++index]);
        break;
      case "--runs":
        measuredRuns = parseNumberArg(arg, argv[++index]);
        break;
      case "--idle-ms":
        idleWaitMs = parseNumberArg(arg, argv[++index]);
        break;
      case "--json":
        printJson = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { warmupRuns, measuredRuns, idleWaitMs, printJson };
}

function parseNumberArg(flag: string, raw: string | undefined): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} expects a non-negative integer`);
  }
  return value;
}

async function runOnce(input: {
  repoRoot: string;
  idleWaitMs: number;
  tempDir: string;
  label: string;
}): Promise<RunResult> {
  const reportPath = join(input.tempDir, `${input.label}.json`);
  const cliStartedAt = Date.now();
  const benchmarkBin = process.env.LAZYMEM_BENCHMARK_BIN ?? "./bin/lazymem";
  const proc = Bun.spawn(
    ["/usr/bin/script", "-q", "/dev/null", benchmarkBin],
    {
      cwd: input.repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        TERM: process.env.TERM ?? "xterm-256color",
        LAZYMEM_BENCHMARK: "1",
        LAZYMEM_BENCHMARK_OUT: reportPath,
        LAZYMEM_BENCHMARK_IDLE_MS: String(input.idleWaitMs),
      },
    },
  );

  const stdoutPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("");
  const stderrPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("");
  const [exitCode, stdout, stderr] = await Promise.all([proc.exited, stdoutPromise, stderrPromise]);

  if (exitCode !== 0) {
    throw new Error([
      `benchmark run failed: ${input.label}`,
      `exit code: ${exitCode}`,
      stdout.trim(),
      stderr.trim(),
    ].filter(Boolean).join("\n"));
  }

  const file = Bun.file(reportPath);
  if (!(await file.exists())) {
    throw new Error(`benchmark report missing for ${input.label}`);
  }

  const report = await file.json<BenchmarkReport>();
  const coreReady = requirePhase(report, "coreReady");
  const fullReady = requirePhase(report, "fullReady");
  const idle = requirePhase(report, "idle");

  return {
    label: input.label,
    cliToCoreReadyMs: round(coreReady.epochMs - cliStartedAt),
    cliToFullReadyMs: round(fullReady.epochMs - cliStartedAt),
    processToCoreReadyMs: coreReady.elapsedMs,
    processToFullReadyMs: fullReady.elapsedMs,
    rssAtCoreReadyMB: coreReady.memory.rssMB,
    rssAtFullReadyMB: fullReady.memory.rssMB,
    rssAfterIdleMB: idle.memory.rssMB,
    peakRssMB: report.memory.peakRssMB,
    commandTotalMs: report.commands.totalDurationMs,
    commandAggregates: report.commands.aggregates,
  };
}

function requirePhase(report: BenchmarkReport, phase: "coreReady" | "fullReady" | "idle"): BenchmarkPhase {
  const value = report.phases[phase];
  if (!value) {
    throw new Error(`benchmark report missing ${phase} phase`);
  }
  return value;
}

function buildSummary(input: {
  benchmarkMode: string;
  repoRoot: string;
  objectives: Objectives;
  warmupRuns: number;
  measuredRuns: number;
  idleWaitMs: number;
  runs: RunResult[];
}): Summary {
  const metrics = METRICS.map((metric) => {
    const values = input.runs.map((run) => run[metric]);
    const stats = summarize(values);
    const budget = input.objectives.budgets[metric];
    return {
      metric,
      stats,
      budget,
      stretch: input.objectives.stretch?.[metric],
      deltaFromBudget: round(stats.median - budget),
      pass: stats.median <= budget,
    };
  });

  const commandMap = new Map<string, { totalMs: number; maxMs: number; failures: number }>();
  for (const run of input.runs) {
    for (const aggregate of run.commandAggregates) {
      const entry = commandMap.get(aggregate.command) ?? { totalMs: 0, maxMs: 0, failures: 0 };
      entry.totalMs += aggregate.totalMs;
      entry.maxMs = Math.max(entry.maxMs, aggregate.maxMs);
      entry.failures += aggregate.failures;
      commandMap.set(aggregate.command, entry);
    }
  }

  const topCommands = [...commandMap.entries()]
    .map(([command, stats]) => ({
      command,
      avgTotalMs: round(stats.totalMs / input.runs.length),
      maxMs: round(stats.maxMs),
      failures: stats.failures,
    }))
    .sort((a, b) => b.avgTotalMs - a.avgTotalMs)
    .slice(0, 8);

  return {
    benchmarkMode: input.benchmarkMode,
    generatedAt: new Date().toISOString(),
    repoRoot: input.repoRoot,
    warmupRuns: input.warmupRuns,
    measuredRuns: input.measuredRuns,
    idleWaitMs: input.idleWaitMs,
    budgets: input.objectives.budgets,
    stretch: input.objectives.stretch,
    metrics,
    topCommands,
    runs: input.runs,
  };
}

function summarize(values: number[]): SummaryStats {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    min: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    mean: round(total / sorted.length),
    max: round(sorted[sorted.length - 1]),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function printSummary(summary: Summary, historyPath: string) {
  console.log("lazymem startup benchmark");
  console.log(`mode: ${summary.benchmarkMode}`);
  console.log(`warmups: ${summary.warmupRuns}  measured: ${summary.measuredRuns}  idle wait: ${summary.idleWaitMs}ms`);
  console.log("");

  for (const metric of summary.metrics) {
    const budgetStatus = metric.pass ? "PASS" : "MISS";
    const stretch = metric.stretch != null ? `  stretch <= ${metric.stretch}` : "";
    const direction = metric.deltaFromBudget <= 0 ? "" : "+";
    console.log(
      `${budgetStatus} ${padMetric(metric.metric)} median ${padValue(metric.stats.median)}  budget <= ${padValue(metric.budget)}${stretch}  delta ${direction}${metric.deltaFromBudget}`,
    );
  }

  console.log("");
  console.log("top command cost (avg total ms/run)");
  for (const command of summary.topCommands) {
    console.log(`  ${padValue(command.avgTotalMs)}  ${command.command}`);
  }

  console.log("");
  console.log(`saved: ${historyPath}`);
}

function padMetric(metric: string): string {
  return metric.padEnd(18);
}

function padValue(value: number): string {
  return value.toFixed(1).padStart(7);
}

function isoTimestamp(date: Date): string {
  return date.toISOString().replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

await main();
