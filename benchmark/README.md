# Benchmark

This folder is the single home for the OpenTUI vs RatatUI benchmark tooling, tracked budgets, tracked scorecard, and generated reports.

## Layout

- `startup.ts` runs one implementation through the real PTY harness and writes a JSON summary.
- `head-to-head.ts` runs OpenTUI and RatatUI back-to-back and writes the markdown comparison table.
- `compare.ts` prints metric deltas between two JSON summaries.
- `objectives.json` defines the default run counts and metric budgets.
- `scoreboard.json` keeps the accepted and diagnostic benchmark results in git.
- `results/` holds generated benchmark artifacts and is intentionally ignored by git.

The two artifacts that matter most are:

- `report.md`
- `results/latest-head-to-head.md`
- `results/latest-opentui.json` and `results/latest-ratatui.json`

## Commands

```sh
bun run benchmark:startup
bun run benchmark:startup:quick
bun run benchmark:compare -- --base benchmark/results/<older>.json --head benchmark/results/<newer>.json
bun run benchmark:head-to-head
```

## Scope

The benchmark runtime code stays next to each implementation:

- TypeScript runtime hooks live in `src/bench/`
- Rust runtime hooks live in `src-rust/src/bench/`

That split is intentional. This folder is for the harness, budgets, scorecards, and generated reports, not for implementation-specific runtime code.
