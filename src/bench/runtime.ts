interface MemorySample {
  rssMB: number;
  heapTotalMB: number;
  heapUsedMB: number;
  externalMB: number;
  arrayBuffersMB: number;
}

interface PhaseSnapshot {
  elapsedMs: number;
  epochMs: number;
  memory: MemorySample;
}

interface CommandSample {
  command: string;
  durationMs: number;
  exitCode: number;
  outputBytes: number;
}

interface CommandAggregate {
  command: string;
  count: number;
  totalMs: number;
  maxMs: number;
  failures: number;
}

interface BenchmarkReport {
  version: 1;
  pid: number;
  argv: string[];
  platform: NodeJS.Platform;
  bunVersion: string;
  idleWaitMs: number;
  phases: {
    processStart: PhaseSnapshot;
    coreReady?: PhaseSnapshot;
    fullReady?: PhaseSnapshot;
    idle?: PhaseSnapshot;
  };
  memory: {
    peakRssMB: number;
  };
  commands: {
    count: number;
    totalDurationMs: number;
    aggregates: CommandAggregate[];
    samples: CommandSample[];
  };
}

const enabled = process.env.LAZYMEM_BENCHMARK === "1";
const idleWaitMs = parsePositiveInt(process.env.LAZYMEM_BENCHMARK_IDLE_MS, 2500);
const outputPath = process.env.LAZYMEM_BENCHMARK_OUT;
const SAMPLE_INTERVAL_MS = 50;

const startedAt = performance.now();
const startedAtEpochMs = Date.now();
let peakRssMB = 0;
let sampler: ReturnType<typeof setInterval> | undefined;
let flushed = false;

const phases: BenchmarkReport["phases"] = enabled
  ? { processStart: capturePhase() }
  : { processStart: emptyPhase() };
const commandAggregates = new Map<string, CommandAggregate>();
const commandSamples: CommandSample[] = [];

if (enabled) {
  peakRssMB = phases.processStart.memory.rssMB;
  sampler = setInterval(() => {
    peakRssMB = Math.max(peakRssMB, captureMemory().rssMB);
  }, SAMPLE_INTERVAL_MS);
}

export const benchmark = {
  enabled,
  idleWaitMs,
  startedAtEpochMs,
  markCoreReady() {
    return markPhase("coreReady");
  },
  markFullReady() {
    return markPhase("fullReady");
  },
  markIdle() {
    return markPhase("idle");
  },
  recordCommand(cmd: string[], durationMs: number, exitCode: number, outputBytes: number) {
    if (!enabled) return;

    const command = cmd.join(" ");
    const sample: CommandSample = {
      command,
      durationMs: round(durationMs),
      exitCode,
      outputBytes,
    };
    commandSamples.push(sample);

    const aggregate = commandAggregates.get(command) ?? {
      command,
      count: 0,
      totalMs: 0,
      maxMs: 0,
      failures: 0,
    };
    aggregate.count += 1;
    aggregate.totalMs += sample.durationMs;
    aggregate.maxMs = Math.max(aggregate.maxMs, sample.durationMs);
    if (exitCode !== 0) aggregate.failures += 1;
    commandAggregates.set(command, aggregate);
  },
  async flush() {
    if (!enabled || flushed) return;
    flushed = true;

    if (sampler) clearInterval(sampler);
    peakRssMB = Math.max(peakRssMB, captureMemory().rssMB);

    const totalDurationMs = commandSamples.reduce((sum, sample) => sum + sample.durationMs, 0);
    const report: BenchmarkReport = {
      version: 1,
      pid: process.pid,
      argv: process.argv.slice(2),
      platform: process.platform,
      bunVersion: Bun.version,
      idleWaitMs,
      phases,
      memory: {
        peakRssMB: round(peakRssMB),
      },
      commands: {
        count: commandSamples.length,
        totalDurationMs: round(totalDurationMs),
        aggregates: [...commandAggregates.values()]
          .map((aggregate) => ({
            ...aggregate,
            totalMs: round(aggregate.totalMs),
            maxMs: round(aggregate.maxMs),
          }))
          .sort((a, b) => b.totalMs - a.totalMs),
        samples: commandSamples,
      },
    };

    const payload = JSON.stringify(report, null, 2);
    if (outputPath) {
      await Bun.write(outputPath, payload);
      return;
    }

    process.stderr.write(`${payload}\n`);
  },
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function captureMemory(): MemorySample {
  const usage = process.memoryUsage();
  return {
    rssMB: toMB(usage.rss),
    heapTotalMB: toMB(usage.heapTotal),
    heapUsedMB: toMB(usage.heapUsed),
    externalMB: toMB(usage.external),
    arrayBuffersMB: toMB(usage.arrayBuffers),
  };
}

function capturePhase(): PhaseSnapshot {
  return {
    elapsedMs: round(performance.now() - startedAt),
    epochMs: Date.now(),
    memory: captureMemory(),
  };
}

function emptyPhase(): PhaseSnapshot {
  return {
    elapsedMs: 0,
    epochMs: 0,
    memory: {
      rssMB: 0,
      heapTotalMB: 0,
      heapUsedMB: 0,
      externalMB: 0,
      arrayBuffersMB: 0,
    },
  };
}

function markPhase(name: Exclude<keyof BenchmarkReport["phases"], "processStart">): boolean {
  if (!enabled || phases[name]) return false;
  phases[name] = capturePhase();
  peakRssMB = Math.max(peakRssMB, phases[name]!.memory.rssMB);
  return true;
}

function toMB(bytes: number): number {
  return round(bytes / (1024 * 1024));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
