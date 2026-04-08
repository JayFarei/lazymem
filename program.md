# lazymem Optimization Program

## Goal

Make `lazymem` open faster and reduce its own memory footprint toward a practical budget of `60-70 MB` RSS without regressing the existing dashboard features.

This program treats `70 MB idle RSS` as the primary budget and `60 MB` as stretch. The current baseline is far above that, so the first iterations are designed to answer whether the present `Bun + OpenTUI + Solid` shape can realistically hit the target.

## Source Of Truth

- Harness command: `bun run benchmark:startup`
- Quick check: `bun run benchmark:startup:quick`
- Comparison command: `bun run benchmark:compare -- --base <older.json> --head <newer.json>`
- Machine-readable budgets: `bench/objectives.json`
- Latest result: `benchmarks/results/latest.json`
- Tracked scorecard: `bench/scoreboard.json`

The harness launches the real `./bin/lazymem` entrypoint under a PTY, records startup phases, samples RSS, captures command timings, and writes a JSON summary.

## Baseline

Baseline captured on `2026-04-08` with `1` warmup run, `5` measured runs, and `2500 ms` idle settle time:

| Metric | Median | Budget | Status |
| --- | ---: | ---: | --- |
| `cliToCoreReadyMs` | `387 ms` | `<= 900 ms` | pass |
| `cliToFullReadyMs` | `2668 ms` | `<= 1600 ms` | miss |
| `rssAtFullReadyMB` | `216.6 MB` | `<= 75 MB` | miss |
| `rssAfterIdleMB` | `233.4 MB` | `<= 70 MB` | miss |
| `peakRssMB` | `233.4 MB` | `<= 85 MB` | miss |

Observed hotspots from the same run set:

- `docker stats --no-stream ...`: `1806.5 ms` average per run
- `colima list`: `242.4 ms`
- `ps -eo pid,tty,rss,comm,args`: `206.3 ms`

Important reading of the baseline:

- First meaningful paint is already fast enough. The user-visible delay is mostly the second wave.
- RSS is already roughly `204 MB` by core-ready, before the slow Docker/Colima work finishes.
- That means the memory goal will not be reached by collector deferral alone. We need to measure the renderer/app floor early and be ready to cut scope or architecture if the floor is too high.

## Operating Model

Work in two tracks after the first shell-floor measurement:

- `Latency track`: optimize default-path startup behavior that users directly feel, such as collector deferral and startup scheduling.
- `Memory-floor track`: measure whether the current `Bun + OpenTUI + Solid` stack can realistically hit the `60-70 MB` idle target before spending time on small default-path RSS tweaks.

Decision gate after the shell-floor benchmark:

- If shell-only idle RSS is more than `40 MB` above the idle budget, treat the rest of the campaign as partly architectural.
- In that case, continue taking clear default-path latency wins, but do not spend many iterations on small RSS changes unless a diagnostic measurement points to a large likely gain.

## Optimization Objectives

Primary objectives:

- `cliToCoreReadyMs <= 900 ms` median
- `cliToFullReadyMs <= 1600 ms` median
- `rssAtFullReadyMB <= 75 MB` median
- `rssAfterIdleMB <= 70 MB` median
- `peakRssMB <= 85 MB` median

Stretch objectives:

- `cliToFullReadyMs <= 1200 ms` median
- `rssAfterIdleMB <= 60 MB` median

Guardrails:

- Keep the current four-panel feature set unless an iteration explicitly introduces a feature flag or lazy mode.
- Keep keyboard interaction and snapshot export working.
- Do not accept an optimization unless it is measured with the harness.

## Artifact Policy

- `benchmarks/results/latest.json` always means the current accepted default baseline.
- Timestamped files in `benchmarks/results/` are candidate or historical artifacts.
- Important accepted baselines and diagnostic results must also be promoted into `bench/scoreboard.json` so they are tracked in git.

## Comparison Protocol

Every accepted default-path change should be compared against the previous accepted baseline with the same harness on the same machine:

1. Benchmark the previous accepted baseline.
2. Benchmark the candidate head.
3. Compare the two artifacts with `bun run benchmark:compare`.
4. Promote the new artifact to `benchmarks/results/latest.json` and `bench/scoreboard.json` only if the change is accepted.

## Iteration Rules

Each iteration must follow the same loop:

1. Make one tightly scoped optimization change.
2. Run `bun run benchmark:startup`.
3. Record the before/after delta from `benchmarks/results/latest.json`.
4. Keep the change only if it improves median `rssAfterIdleMB` by at least `5 MB`, or median `cliToFullReadyMs` by at least `100 ms`, without regressing `cliToCoreReadyMs` by more than `5%`.
5. If the measured delta is small, noisy, or conflicts with the hypothesis, rerun once before deciding.
6. If an iteration is diagnostic rather than reductive, it must produce a new measurement that narrows the next step.

Classify every iteration as one of:

- `default-path optimization`: intended to ship if the keep rule passes.
- `diagnostic instrumentation`: benchmark-only support code or measurement modes that explain where the real cost is.

## 10 Iteration Plan

| Iteration | Focus | Expected Outcome |
| --- | --- | --- |
| `1` | Add a shell-only benchmark mode that renders the frame without panels or collectors. | Establish the renderer/framework memory floor and decide whether `60-70 MB` is feasible in the current stack. |
| `2` | Add panel-gated benchmark modes: system-only, no-buddy, no-animations, no-docker. | Isolate which UI subtree is responsible for the jump from shell floor to `~204 MB` at core-ready. |
| `3` | Remove Docker and Colima from startup critical path. Load them lazily after first interaction or stale-while-revalidate in the background. | Cut `cliToFullReadyMs` sharply without touching first paint. |
| `4` | Collapse the three `ps` passes into one process snapshot and derive top-procs, dev-procs, and VM detection from it. | Reduce duplicated spawn cost, parsing work, and retained process data. |
| `5` | Minimize retained process payloads. Stop storing full `args` by default, cap row counts, and keep derived display strings instead of raw blobs where possible. | Lower steady-state RSS from large strings and duplicate arrays. |
| `6` | Normalize state so the app does not retain overlapping copies of process/session/top-proc data longer than needed. | Reduce live object count and duplicated memory across panels. |
| `7` | Lazy-mount non-focused panel bodies and mount expensive lists only when visible or expanded. | Bring core-ready RSS down by avoiding full tree realization at boot. |
| `8` | Replace per-component animation timers with a shared ticker, and make buddy/status animation optional or lower-frequency. | Cut timer churn and per-component reactive overhead. |
| `9` | Simplify render-time allocation hotspots: dot-matrix rows, process grouping, bubble text, and repeated array/string creation. | Reduce heap churn and lower the idle RSS plateau. |
| `10` | Decision gate. If idle RSS is still above `120 MB`, evaluate a structural move: minimal mode, feature flags, alternate renderer/runtime, or splitting slow/expensive panels out of the default boot path. | Either lock in a path to `70 MB`, or explicitly acknowledge that the current architecture has a higher floor. |

## What Success Looks Like

After 10 iterations, success means one of these is true:

- Median idle RSS is at or below `70 MB`, with full-ready at or below `1600 ms`.
- Or, the benchmark data proves the current architecture cannot reach that budget, and we have a measured decision to pursue a structural change instead of continuing with blind micro-optimizations.

## Immediate Next Move

Start with iteration `1`, not with collector tuning. The current data says the core-ready UI is already carrying most of the memory burden, so the first question is architectural floor, not command latency.
