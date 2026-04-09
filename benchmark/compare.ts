import { basename, resolve } from "node:path";

type MetricKey =
  | "cliToCoreReadyMs"
  | "cliToFullReadyMs"
  | "rssAtFullReadyMB"
  | "rssAfterIdleMB"
  | "peakRssMB";

interface Summary {
  benchmarkMode?: string;
  generatedAt?: string;
  metrics: Array<{
    metric: MetricKey;
    stats: {
      median: number;
    };
  }>;
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
const DEFAULT_HEAD_PATH = resolve(BENCHMARK_DIR, "results/latest.json");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [base, head] = await Promise.all([
    readSummary(args.base),
    readSummary(args.head),
  ]);

  console.log(`base: ${args.base}`);
  console.log(`head: ${args.head}`);
  if (base.generatedAt) console.log(`base generated: ${base.generatedAt}`);
  if (head.generatedAt) console.log(`head generated: ${head.generatedAt}`);
  console.log("");

  for (const metric of METRICS) {
    const baseMedian = lookupMedian(base, metric);
    const headMedian = lookupMedian(head, metric);
    const delta = round(headMedian - baseMedian);
    const pct = baseMedian === 0 ? 0 : round((delta / baseMedian) * 100);
    console.log(
      `${metric.padEnd(18)}  base=${format(baseMedian).padStart(7)}  head=${format(headMedian).padStart(7)}  delta=${formatSigned(delta).padStart(8)}  pct=${formatSigned(pct)}%`,
    );
  }
}

function parseArgs(argv: string[]) {
  let base = "";
  let head = DEFAULT_HEAD_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--base":
        base = resolve(REPO_ROOT, argv[++index] ?? "");
        break;
      case "--head":
        head = resolve(REPO_ROOT, argv[++index] ?? "");
        break;
      default:
        if (!base) {
          base = resolve(REPO_ROOT, arg);
        } else {
          head = resolve(REPO_ROOT, arg);
        }
        break;
    }
  }

  if (!base) {
    throw new Error(`usage: bun run benchmark:compare -- --base <file> [--head <file>]\nhead defaults to ${basename(head)}`);
  }

  return { base, head };
}

async function readSummary(path: string): Promise<Summary> {
  return Bun.file(path).json();
}

function lookupMedian(summary: Summary, metric: MetricKey): number {
  const item = summary.metrics.find((entry) => entry.metric === metric);
  if (!item) {
    throw new Error(`missing metric ${metric}`);
  }
  return item.stats.median;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function format(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatSigned(value: number): string {
  const abs = format(Math.abs(value));
  if (value === 0) return abs;
  return `${value > 0 ? "+" : "-"}${abs}`;
}

await main();
