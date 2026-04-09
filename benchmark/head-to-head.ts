import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

type MetricKey =
  | "cliToCoreReadyMs"
  | "cliToFullReadyMs"
  | "rssAtFullReadyMB"
  | "rssAfterIdleMB"
  | "peakRssMB";

interface Summary {
  benchmarkMode: string;
  generatedAt: string;
  warmupRuns: number;
  measuredRuns: number;
  idleWaitMs: number;
  metrics: Array<{
    metric: MetricKey;
    stats: {
      median: number;
    };
    budget: number;
  }>;
}

interface Variant {
  label: string;
  mode: string;
  bin: string;
  latestPath: string;
}

const METRICS: MetricKey[] = [
  "cliToCoreReadyMs",
  "cliToFullReadyMs",
  "rssAtFullReadyMB",
  "rssAfterIdleMB",
  "peakRssMB",
];
const BENCHMARK_DIR = import.meta.dir;
const REPO_ROOT = resolve(BENCHMARK_DIR, "..");
const RESULTS_DIR = resolve(BENCHMARK_DIR, "results");

const VARIANTS: [Variant, Variant] = [
  {
    label: "OpenTUI",
    mode: "opentui",
    bin: "./bin/lazymem",
    latestPath: "results/latest-opentui.json",
  },
  {
    label: "RatatUI",
    mode: "ratatui",
    bin: "./bin/lazymem-rs",
    latestPath: "results/latest-ratatui.json",
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(RESULTS_DIR, { recursive: true });

  for (const variant of VARIANTS) {
    await runVariant(variant, args);
  }

  const [base, head] = await Promise.all(
    VARIANTS.map((variant) => readSummary(resolve(BENCHMARK_DIR, variant.latestPath))),
  );

  const table = buildMarkdownTable(VARIANTS[0], base, VARIANTS[1], head);
  const latestPath = resolve(RESULTS_DIR, "latest-head-to-head.md");
  const historyPath = resolve(RESULTS_DIR, `head-to-head-${isoTimestamp(new Date())}.md`);
  await Bun.write(latestPath, table);
  await Bun.write(historyPath, table);

  console.log("");
  console.log(table);
  console.log("");
  console.log(`saved: ${historyPath}`);
}

function parseArgs(argv: string[]) {
  let warmups: number | undefined;
  let runs: number | undefined;
  let idleMs: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--warmups":
        warmups = parseNumberArg(arg, argv[++index]);
        break;
      case "--runs":
        runs = parseNumberArg(arg, argv[++index]);
        break;
      case "--idle-ms":
        idleMs = parseNumberArg(arg, argv[++index]);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { warmups, runs, idleMs };
}

function parseNumberArg(flag: string, raw: string | undefined): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} expects a non-negative integer`);
  }
  return value;
}

async function runVariant(
  variant: Variant,
  args: ReturnType<typeof parseArgs>,
) {
  const command = [process.execPath, "run", "benchmark/startup.ts"];
  if (args.warmups != null) {
    command.push("--warmups", String(args.warmups));
  }
  if (args.runs != null) {
    command.push("--runs", String(args.runs));
  }
  if (args.idleMs != null) {
    command.push("--idle-ms", String(args.idleMs));
  }

  console.log(`==> ${variant.label} (${variant.bin})`);
  const proc = Bun.spawn(command, {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      LAZYMEM_BENCHMARK_MODE: variant.mode,
      LAZYMEM_BENCHMARK_BIN: variant.bin,
    },
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${variant.label} benchmark failed with exit code ${exitCode}`);
  }
}

async function readSummary(path: string): Promise<Summary> {
  return Bun.file(path).json();
}

function buildMarkdownTable(
  baseVariant: Variant,
  base: Summary,
  headVariant: Variant,
  head: Summary,
): string {
  const lines = [
    `# Startup Benchmark: ${baseVariant.label} vs ${headVariant.label}`,
    "",
    "Lower is better for every metric in this table.",
    "",
    `- ${baseVariant.label}: \`${base.benchmarkMode}\` generated ${base.generatedAt}`,
    `- ${headVariant.label}: \`${head.benchmarkMode}\` generated ${head.generatedAt}`,
    `- Runs: ${base.measuredRuns} measured, ${base.warmupRuns} warmup, idle wait ${base.idleWaitMs}ms`,
    "",
    `| Metric | Budget | ${baseVariant.label} median | ${headVariant.label} median | ${headVariant.label} - ${baseVariant.label} | Winner |`,
    "| --- | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const metric of METRICS) {
    const baseEntry = lookupMetric(base, metric);
    const headEntry = lookupMetric(head, metric);
    const delta = round(headEntry.stats.median - baseEntry.stats.median);
    const pct = baseEntry.stats.median === 0
      ? 0
      : round((delta / baseEntry.stats.median) * 100);
    lines.push(
      `| ${metricLabel(metric)} | ${formatMetric(metric, baseEntry.budget)} | ${formatMetric(metric, baseEntry.stats.median)} | ${formatMetric(metric, headEntry.stats.median)} | ${formatSignedMetric(metric, delta)} (${formatSignedPercent(pct)}) | ${winner(baseEntry.stats.median, headEntry.stats.median, baseVariant.label, headVariant.label)} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function lookupMetric(summary: Summary, metric: MetricKey) {
  const item = summary.metrics.find((entry) => entry.metric === metric);
  if (!item) {
    throw new Error(`missing metric ${metric} in ${summary.benchmarkMode}`);
  }
  return item;
}

function metricLabel(metric: MetricKey): string {
  switch (metric) {
    case "cliToCoreReadyMs":
      return "CLI -> core ready";
    case "cliToFullReadyMs":
      return "CLI -> full ready";
    case "rssAtFullReadyMB":
      return "RSS at full ready";
    case "rssAfterIdleMB":
      return "RSS after idle";
    case "peakRssMB":
      return "Peak RSS";
  }
}

function formatMetric(metric: MetricKey, value: number): string {
  const suffix = metric.endsWith("Ms") ? " ms" : " MB";
  return `${formatNumber(value)}${suffix}`;
}

function formatSignedMetric(metric: MetricKey, value: number): string {
  const suffix = metric.endsWith("Ms") ? " ms" : " MB";
  return `${formatSignedNumber(value)}${suffix}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatSignedNumber(value: number): string {
  if (value === 0) return formatNumber(value);
  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))}`;
}

function formatSignedPercent(value: number): string {
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))}%`;
}

function winner(base: number, head: number, baseLabel: string, headLabel: string): string {
  if (base === head) return "Tie";
  return head < base ? headLabel : baseLabel;
}

function isoTimestamp(date: Date): string {
  return date.toISOString().replace(/[:]/g, "-").replace(/\.\d+Z$/, "Z");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

await main();
