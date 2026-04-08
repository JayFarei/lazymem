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

async function main() {
  const repoRoot = resolve(import.meta.dir, "..");
  const args = parseArgs(process.argv.slice(2), repoRoot);
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

function parseArgs(argv: string[], repoRoot: string) {
  let base = "";
  let head = resolve(repoRoot, "benchmarks/results/latest.json");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--base":
        base = resolve(argv[++index] ?? "");
        break;
      case "--head":
        head = resolve(argv[++index] ?? "");
        break;
      default:
        if (!base) {
          base = resolve(arg);
        } else {
          head = resolve(arg);
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
