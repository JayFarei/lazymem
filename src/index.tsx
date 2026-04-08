import { render } from "@opentui/solid";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  console.log(`lazymem v${pkg.version}`);
  process.exit(0);
}

const benchmarkMode = process.env.LAZYMEM_BENCHMARK === "1"
  ? (process.env.LAZYMEM_BENCHMARK_MODE ?? "default")
  : "default";

const { App } = benchmarkMode === "shell"
  ? await import("./tui/BenchmarkShellApp")
  : benchmarkMode.startsWith("system-isolated")
    ? await import("./tui/BenchmarkSystemApp")
    : await import("./tui/App");

render(() => <App />);
