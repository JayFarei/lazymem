import { render } from "@opentui/solid";
import { App } from "./tui/App";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  console.log(`lazymem v${pkg.version}`);
  process.exit(0);
}

render(() => <App />);
